const { logger } = require('../utils/logger');

class CompanyTemplatesService {
  constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  initializeTemplates() {
    // Nova company template
    this.templates.set('nova', {
      id: 'nova',
      name: 'Nova',
      fullName: 'ООО "Нова"',
      inn: '1234567890',
      address: 'г. Москва, ул. Промышленная, д. 15',
      phone: '+7 (495) 123-45-67',
      email: 'info@nova-company.ru',
      website: 'www.nova-company.ru',
      
      // Description style for products
      descriptionStyle: 'Технический и подробный стиль с акцентом на качество и надежность',
      
      // Company-specific features
      features: 'Высокое качество продукции, быстрая доставка, индивидуальный подход',
      
      // Payment terms
      paymentTerms: {
        prepayment: 50,
        shipmentPayment: 50,
        paymentDays: 14,
        currency: 'RUB'
      },
      
      // Delivery terms
      deliveryTerms: {
        deliveryTime: '3-5 рабочих дней',
        deliveryMethods: ['Самовывоз', 'Доставка транспортом компании', 'Транспортные компании'],
        freeDeliveryFrom: 50000
      },
      
      // Warranty and service
      warranty: {
        period: '12 месяцев',
        conditions: 'Гарантия на дефекты производителя'
      },
      
      // Contact persons
      contacts: [
        {
          name: 'Иванов Иван Иванович',
          position: 'Менеджер по продажам',
          phone: '+7 (495) 123-45-67',
          email: 'sales@nova-company.ru'
        }
      ],
      
      // Product-specific descriptions to avoid similarity
      productDescriptions: {
        'баллоны': {
          prefix: 'Промышленные газовые баллоны',
          features: 'сертифицированные по ГОСТ, с многоступенчатой системой контроля качества',
          advantages: 'Высокопрочная сталь, точная градуировка объема, длительный срок службы',
          applications: 'для промышленного применения, сварочных работ, медицинских целей'
        },
        'кислород': {
          prefix: 'Технический кислород промышленной чистоты',
          features: 'соответствует требованиям ГОСТ 5583-78, степень чистоты 99.5%',
          advantages: 'Стабильные параметры чистоты, надежная упаковка, контроль влажности',
          applications: 'металлургия, машиностроение, химическая промышленность'
        },
        'аргон': {
          prefix: 'Аргон высокой чистоты для сварочных процессов',
          features: 'чистота 99.998%, низкое содержание примесей кислорода и азота',
          advantages: 'Отличная защита сварочной ванны, минимальное разбрызгивание, качественный шов',
          applications: 'аргонодуговая сварка, плазменная резка, защитная атмосфера'
        },
        'углекислота': {
          prefix: 'Углекислый газ технического назначения',
          features: 'ГОСТ 8050-85, содержание CO2 не менее 99.8%',
          advantages: 'Стабильная подача, оптимальная скорость сварки, экономичность расхода',
          applications: 'полуавтоматическая сварка, газирование напитков, охлаждение'
        }
      },

      // Template for proposal formatting
      proposalTemplate: {
        header: `КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ
от компании ООО "Нова"`,
        footer: `С уважением,
Команда ООО "Нова"
Тел.: +7 (495) 123-45-67
Email: info@nova-company.ru
www.nova-company.ru`,
        validityPeriod: 30
      }
    });

    // CO-LAB company template
    this.templates.set('co-lab', {
      id: 'co-lab',
      name: 'CO-LAB',
      fullName: 'ООО "СО-ЛАБ"',
      inn: '0987654321',
      address: 'г. Санкт-Петербург, пр. Индустриальный, д. 28',
      phone: '+7 (812) 987-65-43',
      email: 'info@co-lab.ru',
      website: 'www.co-lab.ru',
      
      // Description style for products
      descriptionStyle: 'Инновационный подход с упором на современные технологии и эффективность',
      
      // Company-specific features
      features: 'Инновационные решения, гибкие условия сотрудничества, комплексный подход',
      
      // Payment terms
      paymentTerms: {
        prepayment: 30,
        shipmentPayment: 70,
        paymentDays: 10,
        currency: 'RUB'
      },
      
      // Delivery terms
      deliveryTerms: {
        deliveryTime: '2-4 рабочих дня',
        deliveryMethods: ['Курьерская доставка', 'Самовывоз', 'Логистические партнеры'],
        freeDeliveryFrom: 30000
      },
      
      // Warranty and service
      warranty: {
        period: '18 месяцев',
        conditions: 'Расширенная гарантия на все виды продукции'
      },
      
      // Contact persons
      contacts: [
        {
          name: 'Петрова Анна Сергеевна',
          position: 'Ведущий специалист по продажам',
          phone: '+7 (812) 987-65-43',
          email: 'a.petrova@co-lab.ru'
        }
      ],
      
      // Product-specific descriptions to avoid similarity
      productDescriptions: {
        'баллоны': {
          prefix: 'Инновационные газовые емкости последнего поколения',
          features: 'с усовершенствованной конструкцией вентилей и современными материалами',
          advantages: 'Легкий вес, эргономичный дизайн, увеличенный ресурс эксплуатации',
          applications: 'для высокотехнологичных процессов, точного машиностроения, научных исследований'
        },
        'кислород': {
          prefix: 'Кислород медицинской и технической чистоты',
          features: 'произведен по инновационной технологии криогенного разделения воздуха',
          advantages: 'Минимальное содержание примесей, оптимальная влажность, стабильная подача',
          applications: 'медицина, пищевая промышленность, водоочистка, аквакультура'
        },
        'аргон': {
          prefix: 'Ультрачистый аргон для прецизионной сварки',
          features: 'степень чистоты 99.999%, специальная очистка от углеводородов',
          advantages: 'Исключительное качество сварного соединения, отсутствие пор, идеальный внешний вид шва',
          applications: 'сварка нержавеющих сталей, титановых сплавов, алюминия в авиации'
        },
        'углекислота': {
          prefix: 'CO2 пищевого качества с расширенным применением',
          features: 'соответствует стандартам пищевой промышленности, без посторонних запахов',
          advantages: 'Универсальность применения, экологическая безопасность, точная дозировка',
          applications: 'пищевая индустрия, сварочные технологии, тепличные хозяйства'
        }
      },

      // Template for proposal formatting
      proposalTemplate: {
        header: `КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ
ООО "СО-ЛАБ" - Ваш надежный партнер`,
        footer: `Благодарим за рассмотрение нашего предложения!

ООО "СО-ЛАБ"
Телефон: +7 (812) 987-65-43
E-mail: info@co-lab.ru
Сайт: www.co-lab.ru`,
        validityPeriod: 21
      }
    });

    logger.info('Company templates initialized', {
      templateCount: this.templates.size,
      companies: Array.from(this.templates.keys())
    });
  }

  getAllTemplates() {
    return Array.from(this.templates.values());
  }

  getTemplate(companyId) {
    const template = this.templates.get(companyId);
    if (!template) {
      throw new Error(`Company template not found: ${companyId}`);
    }
    return template;
  }

  getTemplatesByIds(companyIds) {
    return companyIds
      .map(id => this.templates.get(id))
      .filter(template => template !== undefined);
  }

  // Create a customized product description based on company style
  generateProductDescription(productName, baseDescription, companyId, options = {}) {
    const template = this.getTemplate(companyId);
    const { technical = true, benefits = true, applications = true } = options;

    // Find matching product description
    const productKey = this.findProductKey(productName, template.productDescriptions);
    let description = baseDescription || productName;

    if (productKey && template.productDescriptions[productKey]) {
      const productDesc = template.productDescriptions[productKey];
      
      // Build comprehensive description
      description = `${productDesc.prefix}`;
      
      if (technical && productDesc.features) {
        description += `, ${productDesc.features}`;
      }
      
      if (benefits && productDesc.advantages) {
        description += `.\n\nПреимущества: ${productDesc.advantages}`;
      }
      
      if (applications && productDesc.applications) {
        description += `.\n\nОбласти применения: ${productDesc.applications}`;
      }
    } else {
      // Fallback to generic styling
      if (companyId === 'nova') {
        if (technical) {
          description += `\n\nТехнические характеристики соответствуют высоким стандартам качества компании Nova.`;
        }
        if (benefits) {
          description += `\nПреимущества: надежность, долговечность, проверенное качество.`;
        }
      } else if (companyId === 'co-lab') {
        if (technical) {
          description += `\n\nИнновационное решение от CO-LAB с применением современных технологий.`;
        }
        if (benefits) {
          description += `\nПреимущества: эффективность, инновационность, гибкость применения.`;
        }
      }
    }

    return description;
  }

  // Helper method to find product key by name
  findProductKey(productName, productDescriptions) {
    const name = productName.toLowerCase();
    
    // Check for direct matches or partial matches
    for (const key of Object.keys(productDescriptions)) {
      if (name.includes(key) || key.includes(name)) {
        return key;
      }
    }
    
    // Check for common gas names
    if (name.includes('кислород') || name.includes('o2')) return 'кислород';
    if (name.includes('аргон') || name.includes('ar')) return 'аргон';
    if (name.includes('углекислот') || name.includes('co2') || name.includes('углекисл')) return 'углекислота';
    if (name.includes('баллон')) return 'баллоны';
    
    return null;
  }

  // Generate company-specific pricing presentation
  formatPricing(pricing, companyId) {
    const template = this.getTemplate(companyId);
    const { paymentTerms, deliveryTerms } = template;

    return {
      ...pricing,
      paymentTerms: {
        description: `Предоплата ${paymentTerms.prepayment}%, остаток ${paymentTerms.shipmentPayment}% - в течение ${paymentTerms.paymentDays} дней после отгрузки`,
        prepayment: paymentTerms.prepayment,
        balance: paymentTerms.shipmentPayment,
        days: paymentTerms.paymentDays
      },
      deliveryTerms: {
        description: `Срок поставки: ${deliveryTerms.deliveryTime}`,
        time: deliveryTerms.deliveryTime,
        methods: deliveryTerms.deliveryMethods,
        freeFrom: deliveryTerms.freeDeliveryFrom
      },
      warranty: template.warranty
    };
  }

  // Add new template (for admin functionality)
  addTemplate(templateData) {
    const { id, name, ...template } = templateData;
    
    if (!id || !name) {
      throw new Error('Template ID and name are required');
    }

    if (this.templates.has(id)) {
      throw new Error(`Template with ID '${id}' already exists`);
    }

    this.templates.set(id, {
      id,
      name,
      ...template,
      createdAt: new Date().toISOString()
    });

    logger.info('New company template added', { id, name });
    return this.templates.get(id);
  }

  // Update existing template
  updateTemplate(id, updates) {
    if (!this.templates.has(id)) {
      throw new Error(`Template with ID '${id}' not found`);
    }

    const existingTemplate = this.templates.get(id);
    const updatedTemplate = {
      ...existingTemplate,
      ...updates,
      id, // Ensure ID cannot be changed
      updatedAt: new Date().toISOString()
    };

    this.templates.set(id, updatedTemplate);
    
    logger.info('Company template updated', { id, updates: Object.keys(updates) });
    return updatedTemplate;
  }

  // Remove template
  removeTemplate(id) {
    if (!this.templates.has(id)) {
      throw new Error(`Template with ID '${id}' not found`);
    }

    const removed = this.templates.get(id);
    this.templates.delete(id);
    
    logger.info('Company template removed', { id, name: removed.name });
    return removed;
  }

  // Validate template structure
  validateTemplate(templateData) {
    const required = ['id', 'name', 'fullName', 'descriptionStyle', 'features'];
    const missing = required.filter(field => !templateData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required template fields: ${missing.join(', ')}`);
    }

    return true;
  }
}

// Singleton instance
const companyTemplatesService = new CompanyTemplatesService();

module.exports = companyTemplatesService;