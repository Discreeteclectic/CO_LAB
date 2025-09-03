const express = require('express');
const { PrismaClient } = require('@prisma/client');
const openaiService = require('../services/openaiService');
const companyTemplatesService = require('../services/companyTemplates');
const competitiveProposalsService = require('../services/competitiveProposals');
const { logger, logBusinessEvent } = require('../utils/logger');
const Joi = require('joi');
const { validate } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const generateProposalSchema = Joi.object({
  calculationId: Joi.string().required(),
  companyId: Joi.string().valid('nova', 'co-lab').required(),
  language: Joi.string().valid('ru', 'uk').default('ru'),
  customRequirements: Joi.string().optional(),
  includeBreakdown: Joi.boolean().default(true)
});

const competitiveProposalSchema = Joi.object({
  calculationId: Joi.string().required(),
  companyId: Joi.string().valid('nova', 'co-lab').required(),
  markup: Joi.number().min(0).max(50).required(), // 0-50% markup
  language: Joi.string().valid('ru', 'uk').default('ru'),
  customRequirements: Joi.string().optional(),
  competitorPrices: Joi.array().items(Joi.number().positive()).optional(),
  marketPosition: Joi.string().valid('aggressive', 'balanced', 'premium').default('balanced')
});

const customizeProposalSchema = Joi.object({
  proposalText: Joi.string().required(),
  modifications: Joi.string().required(),
  companyId: Joi.string().valid('nova', 'co-lab').required(),
  language: Joi.string().valid('ru', 'uk').default('ru')
});

// POST /api/proposals/generate - Generate КП from calculation
router.post('/generate', validate(generateProposalSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { calculationId, companyId, language, customRequirements, includeBreakdown } = req.body;

    // Check if OpenAI service is available
    if (!openaiService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please check OpenAI API configuration.',
        code: 'AI_SERVICE_UNAVAILABLE'
      });
    }

    // Get calculation with all related data
    const calculation = await prisma.calculation.findUnique({
      where: {
        id: calculationId,
        userId // Ensure user owns the calculation
      },
      include: {
        client: {
          select: { id: true, name: true, contactPerson: true, email: true, phone: true }
        },
        items: true,
        user: {
          select: { name: true, email: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found or access denied' });
    }

    // Get company template
    const companyTemplate = companyTemplatesService.getTemplate(companyId);

    // Generate proposal using OpenAI
    const result = await openaiService.generateCommercialProposal(
      calculation,
      companyTemplate,
      {
        competitive: false,
        markup: 0,
        customRequirements,
        language,
        includeBreakdown
      }
    );

    // Log business event
    logBusinessEvent('proposal_generated', req, {
      calculationId,
      companyId,
      clientId: calculation.clientId,
      tokensUsed: result.metadata.tokensUsed,
      competitive: false
    });

    res.json({
      message: 'Commercial proposal generated successfully',
      proposal: {
        id: `prop_${Date.now()}`,
        calculationId,
        companyId,
        text: result.proposalText,
        metadata: result.metadata,
        createdAt: new Date().toISOString()
      },
      calculation: {
        id: calculation.id,
        name: calculation.name,
        client: calculation.client
      }
    });

  } catch (error) {
    logger.error('Failed to generate commercial proposal', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      calculationId: req.body.calculationId
    });
    next(error);
  }
});

// POST /api/proposals/competitive - Generate competitive КП
router.post('/competitive', validate(competitiveProposalSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { calculationId, companyId, markup, language, customRequirements, competitorPrices, marketPosition } = req.body;

    // Check if OpenAI service is available
    if (!openaiService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please check OpenAI API configuration.',
        code: 'AI_SERVICE_UNAVAILABLE'
      });
    }

    // Get calculation with all related data
    const calculation = await prisma.calculation.findUnique({
      where: {
        id: calculationId,
        userId
      },
      include: {
        client: {
          select: { id: true, name: true, contactPerson: true, email: true, phone: true }
        },
        items: true,
        user: {
          select: { name: true, email: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found or access denied' });
    }

    // Get company template
    const companyTemplate = companyTemplatesService.getTemplate(companyId);

    // Validate markup
    const markupValidation = competitiveProposalsService.validateMarkup(markup);
    if (!markupValidation.valid) {
      return res.status(400).json({
        error: 'Invalid markup parameters',
        details: markupValidation.errors
      });
    }

    // Calculate pricing and competitive positioning
    const originalPrice = calculation.totalSaleAmount || calculation.totalCost || 0;
    const competitivePositioning = competitiveProposalsService.generateCompetitivePositioning(
      companyId, 
      markup, 
      originalPrice
    );

    // Generate market analysis if competitor prices provided
    let marketAnalysis = null;
    if (competitorPrices && competitorPrices.length > 0) {
      marketAnalysis = competitiveProposalsService.generateComparisonTable(originalPrice, competitorPrices);
    }

    // Generate competitive proposal using OpenAI
    const enhancedCustomRequirements = buildEnhancedRequirements(
      customRequirements,
      competitivePositioning,
      marketPosition,
      marketAnalysis
    );

    const result = await openaiService.generateCommercialProposal(
      calculation,
      companyTemplate,
      {
        competitive: true,
        markup,
        customRequirements: enhancedCustomRequirements,
        language,
        competitivePositioning
      }
    );

    const adjustedPrice = competitivePositioning.pricing.adjusted;
    const priceDifference = competitivePositioning.pricing.difference;

    // Log business event
    logBusinessEvent('competitive_proposal_generated', req, {
      calculationId,
      companyId,
      clientId: calculation.clientId,
      markup,
      originalPrice,
      adjustedPrice,
      tokensUsed: result.metadata.tokensUsed,
      competitive: true
    });

    res.json({
      message: 'Competitive commercial proposal generated successfully',
      proposal: {
        id: `comp_prop_${Date.now()}`,
        calculationId,
        companyId,
        text: result.proposalText,
        metadata: {
          ...result.metadata,
          competitive: true,
          markup,
          pricing: {
            original: originalPrice,
            adjusted: adjustedPrice,
            difference: priceDifference
          },
          competitivePositioning: competitivePositioning,
          marketPosition: marketPosition,
          marketAnalysis: marketAnalysis,
          strategyUsed: competitiveProposalsService.getMarkupStrategy(markup)
        },
        createdAt: new Date().toISOString()
      },
      calculation: {
        id: calculation.id,
        name: calculation.name,
        client: calculation.client
      }
    });

  } catch (error) {
    logger.error('Failed to generate competitive proposal', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      calculationId: req.body.calculationId
    });
    next(error);
  }
});

// GET /api/proposals/templates - Get company templates
router.get('/templates', async (req, res, next) => {
  try {
    const templates = companyTemplatesService.getAllTemplates();
    
    // Return only public information about templates
    const publicTemplates = templates.map(template => ({
      id: template.id,
      name: template.name,
      fullName: template.fullName,
      descriptionStyle: template.descriptionStyle,
      features: template.features,
      paymentTerms: template.paymentTerms,
      deliveryTerms: template.deliveryTerms,
      warranty: template.warranty
    }));

    res.json({
      templates: publicTemplates,
      count: publicTemplates.length
    });

  } catch (error) {
    logger.error('Failed to get company templates', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/proposals/templates/:companyId - Get specific company template
router.get('/templates/:companyId', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    
    const template = companyTemplatesService.getTemplate(companyId);
    
    // Return public template information
    res.json({
      template: {
        id: template.id,
        name: template.name,
        fullName: template.fullName,
        descriptionStyle: template.descriptionStyle,
        features: template.features,
        paymentTerms: template.paymentTerms,
        deliveryTerms: template.deliveryTerms,
        warranty: template.warranty,
        contacts: template.contacts.map(contact => ({
          name: contact.name,
          position: contact.position
          // Hide phone and email for security
        }))
      }
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    logger.error('Failed to get company template', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      companyId: req.params.companyId
    });
    next(error);
  }
});

// POST /api/proposals/customize - Customize generated КП
router.post('/customize', validate(customizeProposalSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { proposalText, modifications, companyId, language } = req.body;

    // Check if OpenAI service is available
    if (!openaiService.isAvailable()) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please check OpenAI API configuration.',
        code: 'AI_SERVICE_UNAVAILABLE'
      });
    }

    const companyTemplate = companyTemplatesService.getTemplate(companyId);

    // Create customization prompt
    const customizationPrompt = `
Вы получили коммерческое предложение от компании "${companyTemplate.name}":

ТЕКУЩЕЕ КП:
${proposalText}

ТРЕБУЕМЫЕ ИЗМЕНЕНИЯ:
${modifications}

Внесите указанные изменения в коммерческое предложение, сохранив профессиональный стиль и структуру. 
Убедитесь, что все изменения логичны и соответствуют стандартам деловой переписки.

Язык: ${language === 'ru' ? 'русский' : 'украинский'}

Выведите обновленное коммерческое предложение:`;

    const completion = await openaiService.client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: openaiService.getSystemPrompt(language)
        },
        {
          role: 'user',
          content: customizationPrompt
        }
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2500'),
      temperature: 0.5,
    });

    const customizedProposal = completion.choices[0]?.message?.content;

    if (!customizedProposal) {
      throw new Error('Failed to customize proposal');
    }

    // Log token usage
    logger.info('Proposal customization completed', {
      userId,
      companyId,
      tokensUsed: completion.usage.total_tokens,
      modificationsLength: modifications.length
    });

    res.json({
      message: 'Proposal customized successfully',
      customizedProposal: {
        id: `custom_prop_${Date.now()}`,
        text: customizedProposal,
        originalText: proposalText,
        modifications,
        companyId,
        metadata: {
          tokensUsed: completion.usage.total_tokens,
          model: completion.model,
          customizedAt: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Failed to customize proposal', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/proposals/usage - Get OpenAI usage statistics
router.get('/usage', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;
    
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    // Get usage statistics (this would be enhanced with database tracking)
    const usage = await openaiService.getUsageStatistics(userId, dateFrom, dateTo);

    res.json({
      usage,
      aiServiceAvailable: openaiService.isAvailable(),
      period: {
        from: dateFrom.toISOString(),
        to: dateTo.toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get usage statistics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/proposals/competitive/markups - Get available markup strategies
router.get('/competitive/markups', async (req, res, next) => {
  try {
    const markups = competitiveProposalsService.getAvailableMarkups();
    
    res.json({
      message: 'Available competitive markup strategies',
      markups,
      total: markups.length
    });

  } catch (error) {
    logger.error('Failed to get markup strategies', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/proposals/competitive/:companyId/advantages - Get company competitive advantages
router.get('/competitive/:companyId/advantages', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    
    if (!['nova', 'co-lab'].includes(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }
    
    const advantages = competitiveProposalsService.getCompanyAdvantages(companyId);
    
    if (!advantages) {
      return res.status(404).json({ error: 'Company advantages not found' });
    }
    
    res.json({
      companyId,
      advantages
    });

  } catch (error) {
    logger.error('Failed to get company advantages', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      companyId: req.params.companyId
    });
    next(error);
  }
});

// POST /api/proposals/competitive/pricing - Calculate competitive pricing scenarios
router.post('/competitive/pricing', async (req, res, next) => {
  try {
    const { originalPrice, markups, competitorPrices } = req.body;
    
    if (!originalPrice || originalPrice <= 0) {
      return res.status(400).json({ error: 'Valid original price is required' });
    }
    
    const pricingScenarios = competitiveProposalsService.calculateCompetitivePricing(
      originalPrice,
      markups || [5, 10, 15, 20]
    );
    
    let marketAnalysis = null;
    if (competitorPrices && competitorPrices.length > 0) {
      marketAnalysis = competitiveProposalsService.generateComparisonTable(originalPrice, competitorPrices);
    }
    
    res.json({
      originalPrice,
      pricingScenarios,
      marketAnalysis,
      recommendation: marketAnalysis?.recommendation || {
        markup: 10,
        reason: 'Стандартная рекомендация'
      }
    });

  } catch (error) {
    logger.error('Failed to calculate competitive pricing', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// POST /api/proposals/preview - Preview proposal without generating (for testing prompts)
router.post('/preview', async (req, res, next) => {
  try {
    const { calculationId, companyId, competitive = false, markup = 0 } = req.body;
    const userId = req.user.id;

    // Get calculation data
    const calculation = await prisma.calculation.findUnique({
      where: { id: calculationId, userId },
      include: { client: true, items: true }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    const companyTemplate = companyTemplatesService.getTemplate(companyId);

    // Build prompt without calling OpenAI
    const prompt = openaiService.buildProposalPrompt(calculation, companyTemplate, {
      competitive,
      markup,
      language: 'ru'
    });

    res.json({
      preview: {
        prompt,
        calculation: {
          id: calculation.id,
          name: calculation.name,
          totalAmount: calculation.totalSaleAmount || calculation.totalCost
        },
        company: {
          id: companyTemplate.id,
          name: companyTemplate.name
        },
        settings: {
          competitive,
          markup,
          estimatedTokens: await openaiService.estimateTokenUsage(prompt)
        }
      }
    });

  } catch (error) {
    logger.error('Failed to generate proposal preview', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// Helper function to build enhanced requirements for competitive proposals
function buildEnhancedRequirements(customRequirements, competitivePositioning, marketPosition, marketAnalysis) {
  let requirements = customRequirements || '';
  
  if (competitivePositioning) {
    requirements += `\n\nКонкурентное позиционирование: ${competitivePositioning.positioning}`;
    requirements += `\n\nКлючевые преимущества для выделения:\n${competitivePositioning.advantages.map(a => `• ${a}`).join('\n')}`;
    requirements += `\n\nОбоснование цены: ${competitivePositioning.justification}`;
  }
  
  if (marketAnalysis) {
    requirements += `\n\nАнализ рынка: У нас есть данные о ${marketAnalysis.competitorAnalysis.length} конкурентах. `;
    requirements += `Рекомендуемая позиция: ${marketAnalysis.recommendation.reason}`;
  }
  
  const positionStrategies = {
    aggressive: 'Подчеркните конкурентные преимущества и лучшее соотношение цены и качества',
    balanced: 'Сфокусируйтесь на балансе между ценой, качеством и сервисом',
    premium: 'Акцентируйте внимание на премиальном качестве и эксклюзивных услугах'
  };
  
  if (marketPosition && positionStrategies[marketPosition]) {
    requirements += `\n\nСтратегия позиционирования: ${positionStrategies[marketPosition]}`;
  }
  
  return requirements;
}

module.exports = router;