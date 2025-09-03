const { logger } = require('../utils/logger');

class CompetitiveProposalsService {
  constructor() {
    this.competitiveStrategies = this.initializeStrategies();
  }

  initializeStrategies() {
    return {
      // Standard competitive markups
      standard: {
        '5': {
          name: 'Минимальная наценка',
          markup: 5,
          strategy: 'Базовое конкурентное предложение с минимальным повышением цены',
          positioning: 'Мы предлагаем конкурентную цену с высоким качеством обслуживания'
        },
        '10': {
          name: 'Оптимальная наценка',
          markup: 10,
          strategy: 'Сбалансированное предложение с акцентом на качество и сервис',
          positioning: 'Наше предложение сочетает оптимальную цену с превосходным качеством продукции и профессиональным сервисом'
        },
        '15': {
          name: 'Премиальная наценка',
          markup: 15,
          strategy: 'Премиальное позиционирование с упором на эксклюзивность и дополнительные услуги',
          positioning: 'Мы предлагаем премиальный продукт с расширенным сервисом и индивидуальным подходом к каждому клиенту'
        },
        '20': {
          name: 'Максимальная наценка',
          markup: 20,
          strategy: 'Высококлассное предложение для требовательных клиентов',
          positioning: 'Эксклюзивное предложение для клиентов, ценящих максимальное качество и персональный подход'
        }
      },

      // Company-specific strategies
      nova: {
        positioning: 'Технологическое лидерство и проверенное качество',
        advantages: [
          'Многолетний опыт в отрасли',
          'Собственная система контроля качества',
          'Сертифицированная продукция по международным стандартам',
          'Техническая поддержка 24/7',
          'Гарантия качества от производителя'
        ],
        competitiveEdge: 'Мы обеспечиваем стабильное качество поставок благодаря отлаженной системе производства и контроля'
      },

      'co-lab': {
        positioning: 'Инновационные решения и гибкость в сотрудничестве',
        advantages: [
          'Современные технологические решения',
          'Индивидуальный подход к каждому проекту',
          'Быстрые сроки поставки',
          'Гибкие условия сотрудничества',
          'Инновационные продукты нового поколения'
        ],
        competitiveEdge: 'Мы предлагаем самые современные решения на рынке с максимальной гибкостью условий сотрудничества'
      }
    };
  }

  // Get available markup options
  getAvailableMarkups() {
    return Object.values(this.competitiveStrategies.standard);
  }

  // Get specific markup strategy
  getMarkupStrategy(markup) {
    const markupStr = markup.toString();
    return this.competitiveStrategies.standard[markupStr] || null;
  }

  // Get company-specific competitive advantages
  getCompanyAdvantages(companyId) {
    return this.competitiveStrategies[companyId] || null;
  }

  // Generate competitive positioning text
  generateCompetitivePositioning(companyId, markup, originalPrice) {
    const markupStrategy = this.getMarkupStrategy(markup);
    const companyStrategy = this.getCompanyAdvantages(companyId);
    
    if (!markupStrategy || !companyStrategy) {
      return null;
    }

    const adjustedPrice = originalPrice * (1 + markup / 100);
    const priceDifference = adjustedPrice - originalPrice;

    return {
      strategy: markupStrategy.strategy,
      positioning: companyStrategy.positioning,
      advantages: companyStrategy.advantages,
      competitiveEdge: companyStrategy.competitiveEdge,
      pricing: {
        original: originalPrice,
        adjusted: adjustedPrice,
        difference: priceDifference,
        markup: markup
      },
      justification: this.generatePriceJustification(markup, companyId)
    };
  }

  // Generate price justification for different markup levels
  generatePriceJustification(markup, companyId) {
    const companyStrategy = this.getCompanyAdvantages(companyId);
    
    if (markup <= 5) {
      return `Данная цена обеспечивает оптимальное соотношение цены и качества, 
              учитывая высокие стандарты ${companyStrategy?.positioning.toLowerCase()}.`;
    } else if (markup <= 10) {
      return `Цена отражает добавленную стоимость от нашего профессионального сервиса, 
              включая техническую поддержку и гарантийное обслуживание.`;
    } else if (markup <= 15) {
      return `Премиальная цена обоснована эксклюзивными преимуществами нашего предложения: 
              ${companyStrategy?.advantages.slice(0, 3).join(', ').toLowerCase()}.`;
    } else {
      return `Данная цена соответствует максимальному уровню качества и сервиса, 
              включая полный комплекс дополнительных услуг и персональное сопровождение проекта.`;
    }
  }

  // Calculate competitive pricing with different scenarios
  calculateCompetitivePricing(originalPrice, markups = [5, 10, 15, 20]) {
    return markups.map(markup => {
      const adjustedPrice = originalPrice * (1 + markup / 100);
      const strategy = this.getMarkupStrategy(markup);
      
      return {
        markup,
        originalPrice,
        adjustedPrice,
        difference: adjustedPrice - originalPrice,
        percentage: `+${markup}%`,
        strategy: strategy?.name || 'Пользовательская наценка',
        positioning: strategy?.positioning || 'Индивидуальное позиционирование'
      };
    });
  }

  // Generate competitive comparison table
  generateComparisonTable(originalPrice, competitorPrices = []) {
    const ourPrices = this.calculateCompetitivePricing(originalPrice);
    
    return {
      ourOptions: ourPrices,
      competitorAnalysis: competitorPrices.map((price, index) => ({
        competitor: `Конкурент ${index + 1}`,
        price,
        difference: price - originalPrice,
        percentage: ((price - originalPrice) / originalPrice * 100).toFixed(1) + '%',
        competitivePosition: price > originalPrice ? 'Дороже нас' : 'Дешевле нас'
      })),
      recommendation: this.getRecommendedMarkup(originalPrice, competitorPrices)
    };
  }

  // Get recommended markup based on competitive analysis
  getRecommendedMarkup(originalPrice, competitorPrices) {
    if (competitorPrices.length === 0) {
      return {
        markup: 10,
        reason: 'Стандартная рекомендация при отсутствии данных о конкурентах'
      };
    }

    const avgCompetitorPrice = competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length;
    const suggestedMarkup = Math.max(5, Math.min(20, ((avgCompetitorPrice - originalPrice) / originalPrice * 100) - 2));
    
    return {
      markup: Math.round(suggestedMarkup),
      reason: `Рекомендуется исходя из анализа ${competitorPrices.length} конкурентов (средняя цена: ${avgCompetitorPrice.toFixed(2)} руб.)`
    };
  }

  // Generate market positioning statement
  generateMarketPositioning(companyId, markup, marketData = {}) {
    const companyStrategy = this.getCompanyAdvantages(companyId);
    const markupStrategy = this.getMarkupStrategy(markup);
    
    let positioning = `${companyStrategy?.positioning || 'Качественные решения для бизнеса'}.\n\n`;
    
    positioning += `${markupStrategy?.positioning || 'Конкурентное предложение на рынке'}.\n\n`;
    
    if (companyStrategy?.advantages) {
      positioning += 'Ключевые преимущества:\n';
      companyStrategy.advantages.forEach(advantage => {
        positioning += `• ${advantage}\n`;
      });
    }
    
    if (companyStrategy?.competitiveEdge) {
      positioning += `\n${companyStrategy.competitiveEdge}`;
    }

    return positioning;
  }

  // Validate markup parameters
  validateMarkup(markup) {
    const errors = [];
    
    if (typeof markup !== 'number') {
      errors.push('Markup must be a number');
    }
    
    if (markup < 0) {
      errors.push('Markup cannot be negative');
    }
    
    if (markup > 50) {
      errors.push('Markup cannot exceed 50%');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Get competitive proposal metadata
  getProposalMetadata(companyId, markup, originalPrice) {
    const positioning = this.generateCompetitivePositioning(companyId, markup, originalPrice);
    const validation = this.validateMarkup(markup);
    
    return {
      competitive: true,
      markup,
      companyId,
      originalPrice,
      adjustedPrice: originalPrice * (1 + markup / 100),
      positioning,
      validation,
      generatedAt: new Date().toISOString()
    };
  }
}

// Singleton instance
const competitiveProposalsService = new CompetitiveProposalsService();

module.exports = competitiveProposalsService;