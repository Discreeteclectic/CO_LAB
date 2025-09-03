const OpenAI = require('openai');
const { logger } = require('../utils/logger');

class OpenAIService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.init();
  }

  init() {
    try {
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('OpenAI API key not provided, AI proposal generation will be disabled');
        return;
      }

      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      this.isInitialized = true;
      logger.info('OpenAI service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI service', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  isAvailable() {
    return this.isInitialized && this.client;
  }

  async generateCommercialProposal(calculationData, companyTemplate, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI service is not available');
    }

    try {
      const {
        competitive = false,
        markup = 0,
        customRequirements = '',
        language = 'ru'
      } = options;

      const prompt = this.buildProposalPrompt(calculationData, companyTemplate, {
        competitive,
        markup,
        customRequirements,
        language
      });

      logger.info('Generating commercial proposal with OpenAI', {
        calculationId: calculationData.id,
        company: companyTemplate.name,
        competitive,
        markup
      });

      const completion = await this.client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(language)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
        temperature: 0.7,
      });

      const proposalText = completion.choices[0]?.message?.content;
      
      if (!proposalText) {
        throw new Error('No proposal content generated');
      }

      // Log token usage for cost tracking
      logger.info('OpenAI API usage', {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        calculationId: calculationData.id
      });

      return {
        proposalText,
        metadata: {
          company: companyTemplate.name,
          competitive,
          markup,
          tokensUsed: completion.usage.total_tokens,
          model: completion.model,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Failed to generate commercial proposal', {
        error: error.message,
        stack: error.stack,
        calculationId: calculationData.id
      });
      
      if (error.status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please try again later.');
      } else if (error.status === 402) {
        throw new Error('OpenAI API quota exceeded. Please check your billing.');
      }
      
      throw error;
    }
  }

  buildProposalPrompt(calculationData, companyTemplate, options) {
    const { competitive, markup, customRequirements, language } = options;
    const companyTemplatesService = require('./companyTemplates');

    // Generate company-specific product description
    const productDescription = companyTemplatesService.generateProductDescription(
      calculationData.productName || 'Товар',
      calculationData.description,
      companyTemplate.id,
      { technical: true, benefits: true, applications: true }
    );

    let prompt = `Создайте профессиональное коммерческое предложение (КП) от компании "${companyTemplate.name}" на основе следующих данных:

ИНФОРМАЦИЯ О КОМПАНИИ:
- Название: ${companyTemplate.fullName}
- ИНН: ${companyTemplate.inn || 'Не указан'}
- Адрес: ${companyTemplate.address || 'Не указан'}
- Стиль описания: ${companyTemplate.descriptionStyle}
- Особенности: ${companyTemplate.features}
- Телефон: ${companyTemplate.phone || 'Не указан'}
- Email: ${companyTemplate.email || 'Не указан'}

ДАННЫЕ РАСЧЕТА:
- Название расчета: ${calculationData.name}
- Клиент: ${calculationData.client?.name || 'Не указан'}
- Продукт: ${calculationData.productName || 'Товар'}
- Цена за единицу: ${calculationData.pricePerUnit || 0} руб.
- Количество: ${calculationData.quantity || 0} шт.
- Общая сумма: ${calculationData.totalSaleAmount || calculationData.totalCost || 0} руб.

ДЕТАЛЬНОЕ ОПИСАНИЕ ПРОДУКТА:
${productDescription}

ДЕТАЛИЗАЦИЯ ЗАТРАТ:
- Стоимость газа: ${calculationData.gasCost || 0} руб.
- Стоимость баллонов: ${calculationData.cylinderCost || 0} руб.
- Подготовка товара: ${calculationData.preparationCost || 0} руб.
- Логистика: ${calculationData.logisticsCost || 0} руб.
- Грузчики: ${calculationData.workersCost || 0} руб.
- Откаты по сделке: ${calculationData.kickbacksCost || 0} руб.

ПОКАЗАТЕЛИ ПРИБЫЛЬНОСТИ:
- Общие затраты: ${calculationData.totalCostBreakdown || 0} руб.
- Валовая прибыль: ${calculationData.grossProfit || 0} руб.
- Чистая прибыль: ${calculationData.netProfit || 0} руб.
- Рентабельность: ${calculationData.profitabilityPercent || 0}%

УСЛОВИЯ ОПЛАТЫ И ДОСТАВКИ:
- Предоплата: ${companyTemplate.paymentTerms?.prepayment || 50}%
- Доплата при поставке: ${companyTemplate.paymentTerms?.shipmentPayment || 50}%
- Срок доплаты: ${companyTemplate.paymentTerms?.paymentDays || 14} дней
- Срок поставки: ${companyTemplate.deliveryTerms?.deliveryTime || '3-5 рабочих дней'}
- Гарантия: ${companyTemplate.warranty?.period || '12 месяцев'}`;

    if (competitive && markup > 0) {
      const adjustedPrice = (calculationData.totalSaleAmount || calculationData.totalCost || 0) * (1 + markup / 100);
      prompt += `

КОНКУРЕНТНОЕ ПРЕДЛОЖЕНИЕ:
- Это конкурентное предложение с наценкой ${markup}%
- Скорректированная цена: ${adjustedPrice.toFixed(2)} руб.
- Подчеркните конкурентные преимущества компании "${companyTemplate.name}"`;
    }

    if (customRequirements) {
      prompt += `

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ:
${customRequirements}`;
    }

    prompt += `

ТРЕБОВАНИЯ К КП:
1. Используйте профессиональный деловой стиль в соответствии со стилем компании "${companyTemplate.name}"
2. Включите все важные коммерческие условия
3. Используйте предоставленные условия поставки и оплаты
4. Структурируйте предложение логично и читабельно
5. Используйте детальное описание продукта выше (не дублируйте, а развивайте)
6. Включите контактную информацию из данных компании
7. Добавьте срок действия предложения (${companyTemplate.proposalTemplate?.validityPeriod || 30} дней)
8. Обязательно включите НДС и налоговые условия
9. Подчеркните уникальные преимущества компании "${companyTemplate.name}": ${companyTemplate.features}
10. Язык: ${language === 'ru' ? 'русский' : 'украинский'}
11. Используйте заголовок: "${companyTemplate.proposalTemplate?.header || 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ'}"

ВАЖНО: Создавайте уникальные описания, избегая повторения стандартных фраз. 
Каждое предложение должно отражать индивидуальность компании "${companyTemplate.name}".

Создайте готовое коммерческое предложение, которое можно сразу отправлять клиенту.`;

    return prompt;
  }

  getSystemPrompt(language) {
    if (language === 'uk') {
      return `Ви - професійний менеджер з продажу промислових товарів в Україні. 
Створюйте професійні комерційні пропозиції (КП) українською мовою.
Використовуйте ділову мову, включайте всі необхідні комерційні умови, умови поставки та оплати.
Форматуйте пропозицію зрозуміло та структуровано.`;
    }

    return `Вы - профессиональный менеджер по продажам промышленных товаров в России/СНГ. 
Создавайте профессиональные коммерческие предложения (КП) на русском языке.
Используйте деловой стиль, включайте все необходимые коммерческие условия, условия поставки и оплаты.
Форматируйте предложение четко и структурированно.`;
  }

  async estimateTokenUsage(text) {
    // Rough estimation: 1 token ≈ 4 characters for Russian text
    return Math.ceil(text.length / 4);
  }

  async getUsageStatistics(userId, dateFrom, dateTo) {
    // This would typically be stored in database
    // For now, return empty statistics
    return {
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      period: { from: dateFrom, to: dateTo }
    };
  }
}

// Singleton instance
const openaiService = new OpenAIService();

module.exports = openaiService;