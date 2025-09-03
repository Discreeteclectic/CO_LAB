const express = require('express');
const salesAnalyticsService = require('../services/salesAnalytics');
const managerAnalyticsService = require('../services/managerAnalytics');
const { logger, logBusinessEvent } = require('../utils/logger');
const { cacheManager, cacheMiddleware } = require('../utils/cache');
const { optimizedQueries } = require('../utils/database-optimization');
const Joi = require('joi');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const dateRangeSchema = Joi.object({
  dateFrom: Joi.date().required(),
  dateTo: Joi.date().min(Joi.ref('dateFrom')).required(),
  managerId: Joi.string().optional(),
  clientId: Joi.string().optional(),
  status: Joi.string().optional(),
  groupBy: Joi.string().valid('hour', 'day', 'week', 'month', 'quarter').default('day'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  page: Joi.number().integer().min(1).default(1),
  sortBy: Joi.string().valid('date', 'revenue', 'orders', 'clients').default('date'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const analyticsParamsSchema = Joi.object({
  dateFrom: Joi.date().required(),
  dateTo: Joi.date().min(Joi.ref('dateFrom')).required(),
  filters: Joi.object({
    managerId: Joi.string().optional(),
    clientId: Joi.string().optional(),
    status: Joi.string().optional(),
    category: Joi.string().optional()
  }).optional()
});

// GET /api/analytics/overview - Comprehensive sales overview
router.get('/overview', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo, filters = {} } = req.query;

    const overview = await salesAnalyticsService.getSalesOverview(
      new Date(dateFrom),
      new Date(dateTo),
      filters
    );

    logBusinessEvent('analytics_overview_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      filtersApplied: Object.keys(filters).length,
      dataPoints: overview.summary
    });

    res.json({
      message: 'Sales overview analytics generated successfully',
      data: overview,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        filters,
        cacheStatus: 'fresh',
        generatedAt: overview.summary.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get sales overview analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/revenue - Detailed revenue analytics
router.get('/revenue', validate(dateRangeSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo, groupBy } = req.query;

    const revenueAnalytics = await salesAnalyticsService.getRevenueAnalytics(
      new Date(dateFrom),
      new Date(dateTo),
      groupBy
    );

    logBusinessEvent('revenue_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      groupBy,
      totalRevenue: revenueAnalytics.totals?.totalRevenue || 0
    });

    res.json({
      message: 'Revenue analytics generated successfully',
      data: revenueAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        groupBy,
        dataPoints: revenueAnalytics.combinedRevenue?.length || 0,
        generatedAt: revenueAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get revenue analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/products - Product performance analytics
router.get('/products', validate(dateRangeSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo, limit } = req.query;

    const productAnalytics = await salesAnalyticsService.getProductAnalytics(
      new Date(dateFrom),
      new Date(dateTo),
      parseInt(limit)
    );

    logBusinessEvent('product_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      limit: parseInt(limit),
      productsAnalyzed: productAnalytics.products.length,
      totalRevenue: productAnalytics.summary.totalRevenue
    });

    res.json({
      message: 'Product analytics generated successfully',
      data: productAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        limit: parseInt(limit),
        productsCount: productAnalytics.products.length,
        generatedAt: productAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get product analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/clients - Client analytics and segmentation
router.get('/clients', validate(dateRangeSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo, limit } = req.query;

    const clientAnalytics = await salesAnalyticsService.getClientAnalytics(
      new Date(dateFrom),
      new Date(dateTo),
      parseInt(limit)
    );

    logBusinessEvent('client_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      limit: parseInt(limit),
      clientsAnalyzed: clientAnalytics.clients.length,
      segments: Object.keys(clientAnalytics.segmentation?.segments || {})
    });

    res.json({
      message: 'Client analytics generated successfully',
      data: clientAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        limit: parseInt(limit),
        clientsCount: clientAnalytics.clients.length,
        generatedAt: clientAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get client analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/managers - Manager performance analytics
router.get('/managers', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const managerAnalytics = await salesAnalyticsService.getManagerAnalytics(
      new Date(dateFrom),
      new Date(dateTo)
    );

    logBusinessEvent('manager_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      managersAnalyzed: managerAnalytics.managers.length,
      totalRevenue: managerAnalytics.summary.totalRevenue
    });

    res.json({
      message: 'Manager analytics generated successfully',
      data: managerAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        managersCount: managerAnalytics.managers.length,
        generatedAt: managerAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get manager analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/funnel - Sales funnel analytics
router.get('/funnel', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const funnelAnalytics = await salesAnalyticsService.getSalesFunnelAnalytics(
      new Date(dateFrom),
      new Date(dateTo)
    );

    logBusinessEvent('funnel_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      overallConversion: funnelAnalytics.conversionRates.overallConversion,
      funnelStages: funnelAnalytics.funnel.length
    });

    res.json({
      message: 'Sales funnel analytics generated successfully',
      data: funnelAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        stagesCount: funnelAnalytics.funnel.length,
        overallConversionRate: funnelAnalytics.conversionRates.overallConversion,
        generatedAt: funnelAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get sales funnel analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/dashboard - Executive dashboard with key metrics
router.get('/dashboard', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { dateFrom, dateTo, filters = {} } = req.query;

    // Get multiple analytics in parallel for performance
    const [
      overview,
      revenueAnalytics,
      funnelAnalytics,
      managerAnalytics
    ] = await Promise.all([
      salesAnalyticsService.getSalesOverview(new Date(dateFrom), new Date(dateTo), filters),
      salesAnalyticsService.getRevenueAnalytics(new Date(dateFrom), new Date(dateTo), 'day'),
      salesAnalyticsService.getSalesFunnelAnalytics(new Date(dateFrom), new Date(dateTo)),
      salesAnalyticsService.getManagerAnalytics(new Date(dateFrom), new Date(dateTo))
    ]);

    const dashboard = {
      executiveSummary: {
        totalRevenue: overview.summary.totalRevenue,
        totalOrders: overview.summary.totalOrders,
        averageOrderValue: overview.summary.averageOrderValue,
        conversionRate: funnelAnalytics.conversionRates.overallConversion,
        topPerformingManager: managerAnalytics.managers[0]?.name || 'N/A',
        growthTrend: overview.trends?.trend || 'stable'
      },
      kpis: {
        revenue: {
          current: overview.summary.totalRevenue,
          trend: overview.trends?.growthRate || 0,
          target: overview.summary.totalRevenue * 1.2 // 20% growth target
        },
        orders: {
          current: overview.summary.totalOrders,
          conversionRate: funnelAnalytics.conversionRates.overallConversion,
          averageValue: overview.summary.averageOrderValue
        },
        managers: {
          totalActive: managerAnalytics.managers.length,
          avgRevenuePerManager: managerAnalytics.summary.avgRevenuePerManager,
          topPerformer: managerAnalytics.managers[0] || null
        }
      },
      charts: {
        revenueTimeline: revenueAnalytics.combinedRevenue || [],
        salesFunnel: funnelAnalytics.funnel,
        topProducts: overview.topProducts?.slice(0, 5) || [],
        topClients: overview.topClients?.slice(0, 5) || []
      },
      alerts: this.generateDashboardAlerts(overview, funnelAnalytics, managerAnalytics),
      generatedAt: new Date().toISOString()
    };

    logBusinessEvent('dashboard_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      totalRevenue: dashboard.executiveSummary.totalRevenue,
      totalOrders: dashboard.executiveSummary.totalOrders,
      managersCount: dashboard.kpis.managers.totalActive
    });

    res.json({
      message: 'Executive dashboard generated successfully',
      data: dashboard,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        filters,
        componentsLoaded: ['overview', 'revenue', 'funnel', 'managers'],
        generatedAt: dashboard.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get dashboard analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// POST /api/analytics/custom - Custom analytics query
router.post('/custom', async (req, res, next) => {
  try {
    const { metrics, dateFrom, dateTo, filters, groupBy } = req.body;

    if (!metrics || !Array.isArray(metrics)) {
      return res.status(400).json({
        error: 'Metrics array is required',
        validMetrics: ['revenue', 'orders', 'clients', 'products', 'managers', 'conversion']
      });
    }

    const customAnalytics = {};

    // Execute requested metrics
    for (const metric of metrics) {
      switch (metric) {
        case 'revenue':
          customAnalytics.revenue = await salesAnalyticsService.getRevenueAnalytics(
            new Date(dateFrom), new Date(dateTo), groupBy || 'day'
          );
          break;
        case 'products':
          customAnalytics.products = await salesAnalyticsService.getProductAnalytics(
            new Date(dateFrom), new Date(dateTo), 10
          );
          break;
        case 'clients':
          customAnalytics.clients = await salesAnalyticsService.getClientAnalytics(
            new Date(dateFrom), new Date(dateTo), 10
          );
          break;
        case 'managers':
          customAnalytics.managers = await salesAnalyticsService.getManagerAnalytics(
            new Date(dateFrom), new Date(dateTo)
          );
          break;
        case 'funnel':
          customAnalytics.funnel = await salesAnalyticsService.getSalesFunnelAnalytics(
            new Date(dateFrom), new Date(dateTo)
          );
          break;
        default:
          customAnalytics[metric] = { error: `Unknown metric: ${metric}` };
      }
    }

    logBusinessEvent('custom_analytics_requested', req, {
      dateRange: { from: dateFrom, to: dateTo },
      metricsRequested: metrics,
      filtersApplied: Object.keys(filters || {}).length
    });

    res.json({
      message: 'Custom analytics generated successfully',
      data: customAnalytics,
      meta: {
        dateRange: { from: dateFrom, to: dateTo },
        metrics: metrics,
        filters: filters || {},
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get custom analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      body: req.body
    });
    next(error);
  }
});

// DELETE /api/analytics/cache - Clear analytics cache (admin only)
router.delete('/cache', async (req, res, next) => {
  try {
    // Check admin permissions
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Admin privileges required to clear analytics cache'
      });
    }

    salesAnalyticsService.clearCache();

    logBusinessEvent('analytics_cache_cleared', req, {
      clearedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Analytics cache cleared successfully',
      clearedAt: new Date().toISOString(),
      clearedBy: {
        userId: req.user.id,
        name: req.user.name || req.user.email
      }
    });

  } catch (error) {
    logger.error('Failed to clear analytics cache', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// GET /api/analytics/manager/:managerId - Individual manager analytics with important notes
router.get('/manager/:managerId', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { dateFrom, dateTo, filters = {} } = req.query;

    // Check if user can access this manager's data (security check)
    if (req.user.role !== 'ADMIN' && req.user.id !== managerId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own analytics or you must be an admin.'
      });
    }

    const managerAnalytics = await managerAnalyticsService.getManagerAnalytics(
      managerId,
      new Date(dateFrom),
      new Date(dateTo),
      true // Include important notes
    );

    logBusinessEvent('individual_manager_analytics_requested', req, {
      managerId,
      dateRange: { from: dateFrom, to: dateTo },
      includeNotes: true,
      totalRevenue: managerAnalytics.performance?.totalRevenue || 0
    });

    res.json({
      message: 'Individual manager analytics generated successfully',
      data: managerAnalytics,
      meta: {
        managerId,
        dateRange: { from: dateFrom, to: dateTo },
        includesImportantNotes: true,
        generatedAt: managerAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get individual manager analytics', {
      error: error.message,
      stack: error.stack,
      managerId: req.params.managerId,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/manager/:managerId/notes - Get only important notes for a manager
router.get('/manager/:managerId/notes', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    // Check if user can access this manager's data
    if (req.user.role !== 'ADMIN' && req.user.id !== managerId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own notes or you must be an admin.'
      });
    }

    const importantNotes = await managerAnalyticsService.getImportantNotes(
      managerId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    logBusinessEvent('manager_important_notes_requested', req, {
      managerId,
      dateRange: { from: dateFrom, to: dateTo },
      notesCount: importantNotes.totalNotes,
      importantCount: importantNotes.importantNotes?.length || 0
    });

    res.json({
      message: 'Manager important notes retrieved successfully',
      data: importantNotes,
      meta: {
        managerId,
        dateRange: { from: dateFrom, to: dateTo },
        totalNotes: importantNotes.totalNotes,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get manager important notes', {
      error: error.message,
      stack: error.stack,
      managerId: req.params.managerId,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/manager/:managerId/performance - Get detailed performance metrics for a manager
router.get('/manager/:managerId/performance', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    // Check access permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== managerId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own performance or you must be an admin.'
      });
    }

    const performanceMetrics = await managerAnalyticsService.getPerformanceMetrics(
      managerId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    const efficiencyMetrics = await managerAnalyticsService.getEfficiencyMetrics(
      managerId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    const clientFeedback = await managerAnalyticsService.getClientFeedback(
      managerId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    const detailedPerformance = {
      performanceMetrics,
      efficiencyMetrics,
      clientFeedback,
      summary: {
        overallRating: managerAnalyticsService.calculateOverallRating(
          performanceMetrics,
          { relationshipScore: 75 }, // Default relationship score
          efficiencyMetrics
        ),
        recommendations: managerAnalyticsService.generateRecommendations(
          performanceMetrics,
          { overview: { pendingTasks: 5, completedTasks: 15 } }, // Mock workload
          efficiencyMetrics
        )
      },
      generatedAt: new Date().toISOString()
    };

    logBusinessEvent('manager_detailed_performance_requested', req, {
      managerId,
      dateRange: { from: dateFrom, to: dateTo },
      overallRating: detailedPerformance.summary.overallRating.rating,
      recommendationsCount: detailedPerformance.summary.recommendations.length
    });

    res.json({
      message: 'Detailed manager performance analytics generated successfully',
      data: detailedPerformance,
      meta: {
        managerId,
        dateRange: { from: dateFrom, to: dateTo },
        componentsLoaded: ['performance', 'efficiency', 'clientFeedback'],
        generatedAt: detailedPerformance.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get detailed manager performance', {
      error: error.message,
      stack: error.stack,
      managerId: req.params.managerId,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/manager/:managerId/workload - Get workload analysis for a manager
router.get('/manager/:managerId/workload', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    // Check access permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== managerId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own workload or you must be an admin.'
      });
    }

    const workloadAnalysis = await managerAnalyticsService.getWorkloadAnalysis(
      managerId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    logBusinessEvent('manager_workload_analysis_requested', req, {
      managerId,
      dateRange: { from: dateFrom, to: dateTo },
      totalTasks: workloadAnalysis.overview.totalTasks,
      workloadLevel: workloadAnalysis.workloadLevel,
      pendingTasks: workloadAnalysis.overview.pendingTasks
    });

    res.json({
      message: 'Manager workload analysis generated successfully',
      data: workloadAnalysis,
      meta: {
        managerId,
        dateRange: { from: dateFrom, to: dateTo },
        workloadLevel: workloadAnalysis.workloadLevel,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get manager workload analysis', {
      error: error.message,
      stack: error.stack,
      managerId: req.params.managerId,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// GET /api/analytics/manager/:managerId/communication - Get communication analytics for a manager
router.get('/manager/:managerId/communication', validate(analyticsParamsSchema, 'query'), async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    // Check access permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== managerId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own communication analytics or you must be an admin.'
      });
    }

    const [dialogueActivity, clientInteractions] = await Promise.all([
      managerAnalyticsService.getDialogueActivity(managerId, new Date(dateFrom), new Date(dateTo)),
      managerAnalyticsService.getClientInteractions(managerId, new Date(dateFrom), new Date(dateTo))
    ]);

    const communicationAnalytics = {
      dialogueActivity,
      clientInteractions,
      summary: {
        totalClients: clientInteractions.clients.total,
        totalDialogues: dialogueActivity.overview.totalDialogues,
        responseQuality: dialogueActivity.responseTime.responseQuality,
        relationshipScore: clientInteractions.relationshipScore
      },
      generatedAt: new Date().toISOString()
    };

    logBusinessEvent('manager_communication_analytics_requested', req, {
      managerId,
      dateRange: { from: dateFrom, to: dateTo },
      totalDialogues: dialogueActivity.overview.totalDialogues,
      responseQuality: dialogueActivity.responseTime.responseQuality,
      totalClients: clientInteractions.clients.total
    });

    res.json({
      message: 'Manager communication analytics generated successfully',
      data: communicationAnalytics,
      meta: {
        managerId,
        dateRange: { from: dateFrom, to: dateTo },
        componentsLoaded: ['dialogue', 'clientInteractions'],
        generatedAt: communicationAnalytics.generatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to get manager communication analytics', {
      error: error.message,
      stack: error.stack,
      managerId: req.params.managerId,
      userId: req.user.id,
      query: req.query
    });
    next(error);
  }
});

// DELETE /api/analytics/manager/cache - Clear manager analytics cache (admin only)
router.delete('/manager/cache', async (req, res, next) => {
  try {
    // Check admin permissions
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Admin privileges required to clear manager analytics cache'
      });
    }

    managerAnalyticsService.clearCache();

    logBusinessEvent('manager_analytics_cache_cleared', req, {
      clearedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Manager analytics cache cleared successfully',
      clearedAt: new Date().toISOString(),
      clearedBy: {
        userId: req.user.id,
        name: req.user.name || req.user.email
      }
    });

  } catch (error) {
    logger.error('Failed to clear manager analytics cache', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    next(error);
  }
});

// Helper function to generate dashboard alerts
function generateDashboardAlerts(overview, funnelAnalytics, managerAnalytics) {
  const alerts = [];

  // Low conversion rate alert
  if (funnelAnalytics.conversionRates.overallConversion < 0.1) {
    alerts.push({
      type: 'warning',
      title: 'Low Conversion Rate',
      message: `Overall conversion rate is ${(funnelAnalytics.conversionRates.overallConversion * 100).toFixed(1)}%, consider reviewing sales process`,
      priority: 'medium'
    });
  }

  // No revenue alert
  if (overview.summary.totalRevenue === 0) {
    alerts.push({
      type: 'error',
      title: 'No Revenue',
      message: 'No revenue generated in the selected period',
      priority: 'high'
    });
  }

  // Low manager activity
  const activeManagers = managerAnalytics.managers.filter(m => m.performance.totalRevenue > 0);
  if (activeManagers.length < managerAnalytics.managers.length / 2) {
    alerts.push({
      type: 'info',
      title: 'Manager Activity',
      message: `${activeManagers.length} of ${managerAnalytics.managers.length} managers are actively generating revenue`,
      priority: 'low'
    });
  }

  return alerts;
}

// GET /api/analytics/revenue/optimized - Optimized revenue analytics with pagination
router.get('/revenue/optimized', 
  cacheMiddleware('revenue-optimized', 300), // Cache for 5 minutes
  validate(dateRangeSchema, 'query'), 
  async (req, res, next) => {
    try {
      const { dateFrom, dateTo, page, limit, sortBy, sortOrder, managerId } = req.query;
      
      // Use optimized query if available
      const optimizedData = await cacheManager.wrap(
        cacheManager.generateKey('revenue-optimized', dateFrom, dateTo, page, limit, managerId),
        async () => {
          if (optimizedQueries && optimizedQueries.getRevenueByPeriod) {
            return await optimizedQueries.getRevenueByPeriod(
              new Date(dateFrom), 
              new Date(dateTo), 
              'day'
            );
          } else {
            // Fallback to regular service
            return await salesAnalyticsService.getRevenueAnalytics(
              new Date(dateFrom),
              new Date(dateTo),
              'day'
            );
          }
        },
        300 // 5 minutes TTL
      );

      // Implement pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedData = optimizedData.slice(startIndex, endIndex);

      const response = {
        message: 'Optimized revenue analytics retrieved successfully',
        data: paginatedData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: optimizedData.length,
          totalPages: Math.ceil(optimizedData.length / limit),
          hasNext: endIndex < optimizedData.length,
          hasPrev: page > 1
        },
        meta: {
          dateRange: { from: dateFrom, to: dateTo },
          optimized: true,
          cached: true,
          generatedAt: new Date().toISOString()
        }
      };

      res.setHeader('X-Total-Count', optimizedData.length);
      res.setHeader('X-Page', page);
      res.setHeader('X-Per-Page', limit);
      
      res.json(response);

    } catch (error) {
      logger.error('Failed to get optimized revenue analytics', {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        query: req.query
      });
      next(error);
    }
  }
);

// GET /api/analytics/clients/top - Optimized top clients with caching
router.get('/clients/top',
  cacheMiddleware('top-clients', 600), // Cache for 10 minutes
  validate(dateRangeSchema, 'query'),
  async (req, res, next) => {
    try {
      const { dateFrom, dateTo, limit = 10 } = req.query;
      
      const topClients = await cacheManager.wrap(
        cacheManager.generateKey('top-clients', dateFrom, dateTo, limit),
        async () => {
          if (optimizedQueries && optimizedQueries.getTopClients) {
            return await optimizedQueries.getTopClients(
              parseInt(limit),
              new Date(dateFrom),
              new Date(dateTo)
            );
          } else {
            // Fallback to regular service
            const clientAnalytics = await salesAnalyticsService.getClientAnalytics(
              new Date(dateFrom),
              new Date(dateTo),
              parseInt(limit)
            );
            return clientAnalytics.topClients || [];
          }
        },
        600 // 10 minutes TTL
      );

      res.json({
        message: 'Top clients retrieved successfully',
        data: topClients,
        meta: {
          dateRange: { from: dateFrom, to: dateTo },
          limit: parseInt(limit),
          optimized: true,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to get top clients', {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        query: req.query
      });
      next(error);
    }
  }
);

// GET /api/analytics/performance/summary - High-performance summary endpoint
router.get('/performance/summary',
  cacheMiddleware('performance-summary', 180), // Cache for 3 minutes
  validate(dateRangeSchema, 'query'),
  async (req, res, next) => {
    try {
      const { dateFrom, dateTo, managerId } = req.query;
      
      const performanceSummary = await cacheManager.wrap(
        cacheManager.generateKey('performance-summary', dateFrom, dateTo, managerId),
        async () => {
          // Run multiple queries in parallel for better performance
          const [revenueData, managerPerformance, clientMetrics] = await Promise.all([
            optimizedQueries?.getRevenueByPeriod ? 
              optimizedQueries.getRevenueByPeriod(new Date(dateFrom), new Date(dateTo), 'day') :
              salesAnalyticsService.getRevenueAnalytics(new Date(dateFrom), new Date(dateTo), 'day'),
            
            managerId && optimizedQueries?.getManagerPerformance ?
              optimizedQueries.getManagerPerformance(managerId, new Date(dateFrom), new Date(dateTo)) :
              null,
              
            optimizedQueries?.getTopClients ?
              optimizedQueries.getTopClients(5, new Date(dateFrom), new Date(dateTo)) :
              []
          ]);

          return {
            revenue: {
              total: revenueData.reduce((sum, item) => sum + (item.revenue || 0), 0),
              daily: revenueData,
              trend: revenueData.length > 1 ? 
                ((revenueData[revenueData.length - 1]?.revenue || 0) - (revenueData[0]?.revenue || 0)) / (revenueData[0]?.revenue || 1) * 100 : 0
            },
            manager: managerPerformance ? managerPerformance[0] : null,
            topClients: clientMetrics.slice(0, 3),
            generatedAt: new Date().toISOString()
          };
        },
        180 // 3 minutes TTL
      );

      res.json({
        message: 'Performance summary retrieved successfully',
        data: performanceSummary,
        meta: {
          dateRange: { from: dateFrom, to: dateTo },
          managerId,
          optimized: true,
          fast: true,
          generatedAt: performanceSummary.generatedAt
        }
      });

    } catch (error) {
      logger.error('Failed to get performance summary', {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        query: req.query
      });
      next(error);
    }
  }
);

module.exports = router;