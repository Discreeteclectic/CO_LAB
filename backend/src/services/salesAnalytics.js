const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

class SalesAnalyticsService {
  constructor() {
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.cache = new Map();
  }

  // Get comprehensive sales overview
  async getSalesOverview(dateFrom, dateTo, filters = {}) {
    try {
      const cacheKey = `sales_overview_${dateFrom}_${dateTo}_${JSON.stringify(filters)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const whereClause = this.buildWhereClause(dateFrom, dateTo, filters);

      // Parallel queries for performance
      const [
        totalRevenue,
        totalOrders,
        totalContracts,
        totalCalculations,
        avgOrderValue,
        conversionRates,
        topProducts,
        topClients,
        profitabilityMetrics
      ] = await Promise.all([
        this.getTotalRevenue(whereClause),
        this.getTotalOrders(whereClause),
        this.getTotalContracts(whereClause),
        this.getTotalCalculations(whereClause),
        this.getAverageOrderValue(whereClause),
        this.getConversionRates(whereClause),
        this.getTopProducts(whereClause, 10),
        this.getTopClients(whereClause, 10),
        this.getProfitabilityMetrics(whereClause)
      ]);

      const overview = {
        summary: {
          totalRevenue: totalRevenue || 0,
          totalOrders: totalOrders || 0,
          totalContracts: totalContracts || 0,
          totalCalculations: totalCalculations || 0,
          averageOrderValue: avgOrderValue || 0,
          period: { from: dateFrom, to: dateTo },
          generatedAt: new Date().toISOString()
        },
        conversionRates,
        topProducts,
        topClients,
        profitability: profitabilityMetrics,
        trends: await this.getSalesTrends(dateFrom, dateTo, filters)
      };

      this.setCache(cacheKey, overview);
      return overview;

    } catch (error) {
      logger.error('Failed to get sales overview', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo,
        filters
      });
      throw error;
    }
  }

  // Get detailed revenue analytics
  async getRevenueAnalytics(dateFrom, dateTo, groupBy = 'day') {
    try {
      const cacheKey = `revenue_analytics_${dateFrom}_${dateTo}_${groupBy}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      let groupQuery;
      let dateFormat;

      switch (groupBy) {
        case 'hour':
          groupQuery = "DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00')";
          dateFormat = '%Y-%m-%d %H:00:00';
          break;
        case 'day':
          groupQuery = "DATE_FORMAT(createdAt, '%Y-%m-%d')";
          dateFormat = '%Y-%m-%d';
          break;
        case 'week':
          groupQuery = "DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d')";
          dateFormat = '%Y-%m-%d';
          break;
        case 'month':
          groupQuery = "DATE_FORMAT(createdAt, '%Y-%m-01')";
          dateFormat = '%Y-%m';
          break;
        case 'quarter':
          groupQuery = "CONCAT(YEAR(createdAt), '-Q', QUARTER(createdAt))";
          dateFormat = 'YYYY-Q';
          break;
        default:
          groupQuery = "DATE_FORMAT(createdAt, '%Y-%m-%d')";
          dateFormat = '%Y-%m-%d';
      }

      // Revenue from orders
      const orderRevenue = await prisma.$queryRaw`
        SELECT 
          ${groupQuery} as period,
          SUM(totalAmount) as revenue,
          COUNT(*) as orderCount,
          AVG(totalAmount) as avgOrderValue
        FROM \`Order\`
        WHERE createdAt >= ${new Date(dateFrom)} 
          AND createdAt <= ${new Date(dateTo)}
          AND status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
        GROUP BY ${groupQuery}
        ORDER BY period
      `;

      // Revenue from contracts
      const contractRevenue = await prisma.$queryRaw`
        SELECT 
          ${groupQuery} as period,
          SUM(totalAmount) as revenue,
          COUNT(*) as contractCount
        FROM Contract
        WHERE createdAt >= ${new Date(dateFrom)} 
          AND createdAt <= ${new Date(dateTo)}
          AND status IN ('ACTIVE', 'COMPLETED', 'SIGNED')
        GROUP BY ${groupQuery}
        ORDER BY period
      `;

      const analytics = {
        orderRevenue: orderRevenue.map(row => ({
          period: row.period,
          revenue: parseFloat(row.revenue || 0),
          orderCount: parseInt(row.orderCount || 0),
          avgOrderValue: parseFloat(row.avgOrderValue || 0)
        })),
        contractRevenue: contractRevenue.map(row => ({
          period: row.period,
          revenue: parseFloat(row.revenue || 0),
          contractCount: parseInt(row.contractCount || 0)
        })),
        groupBy,
        dateFormat,
        generatedAt: new Date().toISOString()
      };

      // Combine and calculate totals
      analytics.combinedRevenue = this.combineRevenueStreams(analytics.orderRevenue, analytics.contractRevenue);
      analytics.totals = this.calculateRevenueTotals(analytics.combinedRevenue);

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get revenue analytics', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo,
        groupBy
      });
      throw error;
    }
  }

  // Get product performance analytics
  async getProductAnalytics(dateFrom, dateTo, limit = 20) {
    try {
      const cacheKey = `product_analytics_${dateFrom}_${dateTo}_${limit}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const productPerformance = await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.category,
          p.price,
          COUNT(oi.id) as totalSold,
          SUM(oi.quantity) as totalQuantity,
          SUM(oi.totalPrice) as totalRevenue,
          AVG(oi.totalPrice) as avgSalePrice,
          COUNT(DISTINCT o.clientId) as uniqueClients,
          MIN(o.createdAt) as firstSale,
          MAX(o.createdAt) as lastSale
        FROM Product p
        LEFT JOIN OrderItem oi ON p.id = oi.productId
        LEFT JOIN \`Order\` o ON oi.orderId = o.id
        WHERE o.createdAt >= ${new Date(dateFrom)} 
          AND o.createdAt <= ${new Date(dateTo)}
          AND o.status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
        GROUP BY p.id, p.name, p.category, p.price
        HAVING totalSold > 0
        ORDER BY totalRevenue DESC
        LIMIT ${limit}
      `;

      // Get product profitability if calculation data exists
      const productProfitability = await this.getProductProfitability(dateFrom, dateTo);

      const analytics = {
        products: productPerformance.map(product => ({
          id: product.id,
          name: product.name,
          category: product.category || 'Uncategorized',
          basePrice: parseFloat(product.price || 0),
          performance: {
            totalSold: parseInt(product.totalSold || 0),
            totalQuantity: parseInt(product.totalQuantity || 0),
            totalRevenue: parseFloat(product.totalRevenue || 0),
            avgSalePrice: parseFloat(product.avgSalePrice || 0),
            uniqueClients: parseInt(product.uniqueClients || 0),
            firstSale: product.firstSale,
            lastSale: product.lastSale
          },
          profitability: productProfitability[product.name] || null
        })),
        summary: {
          totalProducts: productPerformance.length,
          totalRevenue: productPerformance.reduce((sum, p) => sum + parseFloat(p.totalRevenue || 0), 0),
          totalQuantitySold: productPerformance.reduce((sum, p) => sum + parseInt(p.totalQuantity || 0), 0),
          avgRevenuePerProduct: productPerformance.length > 0 
            ? productPerformance.reduce((sum, p) => sum + parseFloat(p.totalRevenue || 0), 0) / productPerformance.length 
            : 0
        },
        categories: await this.getCategoryPerformance(dateFrom, dateTo),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get product analytics', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo
      });
      throw error;
    }
  }

  // Get client analytics and segmentation
  async getClientAnalytics(dateFrom, dateTo, limit = 20) {
    try {
      const cacheKey = `client_analytics_${dateFrom}_${dateTo}_${limit}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const clientPerformance = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          c.email,
          c.phone,
          c.inn,
          COUNT(DISTINCT o.id) as totalOrders,
          COUNT(DISTINCT ct.id) as totalContracts,
          SUM(o.totalAmount) as totalOrderRevenue,
          SUM(ct.totalAmount) as totalContractRevenue,
          AVG(o.totalAmount) as avgOrderValue,
          MIN(o.createdAt) as firstOrder,
          MAX(o.createdAt) as lastOrder,
          DATEDIFF(MAX(o.createdAt), MIN(o.createdAt)) as customerLifespanDays
        FROM Client c
        LEFT JOIN \`Order\` o ON c.id = o.clientId 
          AND o.createdAt >= ${new Date(dateFrom)} 
          AND o.createdAt <= ${new Date(dateTo)}
        LEFT JOIN Contract ct ON c.id = ct.clientId 
          AND ct.createdAt >= ${new Date(dateFrom)} 
          AND ct.createdAt <= ${new Date(dateTo)}
        WHERE (o.id IS NOT NULL OR ct.id IS NOT NULL)
        GROUP BY c.id, c.name, c.email, c.phone, c.inn
        ORDER BY (COALESCE(totalOrderRevenue, 0) + COALESCE(totalContractRevenue, 0)) DESC
        LIMIT ${limit}
      `;

      // Calculate client segments
      const segments = this.segmentClients(clientPerformance);

      const analytics = {
        clients: clientPerformance.map(client => ({
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          inn: client.inn,
          metrics: {
            totalOrders: parseInt(client.totalOrders || 0),
            totalContracts: parseInt(client.totalContracts || 0),
            totalOrderRevenue: parseFloat(client.totalOrderRevenue || 0),
            totalContractRevenue: parseFloat(client.totalContractRevenue || 0),
            totalRevenue: parseFloat(client.totalOrderRevenue || 0) + parseFloat(client.totalContractRevenue || 0),
            avgOrderValue: parseFloat(client.avgOrderValue || 0),
            customerLifespanDays: parseInt(client.customerLifespanDays || 0),
            firstOrder: client.firstOrder,
            lastOrder: client.lastOrder
          },
          segment: this.getClientSegment(client, segments.thresholds)
        })),
        segmentation: segments,
        cohortAnalysis: await this.getCohortAnalysis(dateFrom, dateTo),
        churnAnalysis: await this.getChurnAnalysis(dateTo),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get client analytics', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo
      });
      throw error;
    }
  }

  // Get manager performance analytics
  async getManagerAnalytics(dateFrom, dateTo) {
    try {
      const cacheKey = `manager_analytics_${dateFrom}_${dateTo}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Get managers with their performance
      const managerPerformance = await prisma.$queryRaw`
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(DISTINCT o.id) as totalOrders,
          COUNT(DISTINCT ct.id) as totalContracts,
          COUNT(DISTINCT calc.id) as totalCalculations,
          SUM(o.totalAmount) as totalOrderRevenue,
          SUM(ct.totalAmount) as totalContractRevenue,
          COUNT(DISTINCT o.clientId) as uniqueClients,
          AVG(o.totalAmount) as avgOrderValue,
          COUNT(DISTINCT d.id) as totalDialogues,
          COUNT(DISTINCT msg.id) as totalMessages
        FROM User u
        LEFT JOIN \`Order\` o ON u.id = o.userId 
          AND o.createdAt >= ${new Date(dateFrom)} 
          AND o.createdAt <= ${new Date(dateTo)}
        LEFT JOIN Contract ct ON u.id = ct.userId 
          AND ct.createdAt >= ${new Date(dateFrom)} 
          AND ct.createdAt <= ${new Date(dateTo)}
        LEFT JOIN Calculation calc ON u.id = calc.userId 
          AND calc.createdAt >= ${new Date(dateFrom)} 
          AND calc.createdAt <= ${new Date(dateTo)}
        LEFT JOIN Dialogue d ON u.id = d.managerId 
          AND d.createdAt >= ${new Date(dateFrom)} 
          AND d.createdAt <= ${new Date(dateTo)}
        LEFT JOIN Message msg ON u.id = msg.senderId 
          AND msg.createdAt >= ${new Date(dateFrom)} 
          AND msg.createdAt <= ${new Date(dateTo)}
        WHERE u.role IN ('MANAGER', 'ADMIN', 'SALES')
        GROUP BY u.id, u.name, u.email
        ORDER BY (COALESCE(totalOrderRevenue, 0) + COALESCE(totalContractRevenue, 0)) DESC
      `;

      const analytics = {
        managers: managerPerformance.map(manager => ({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          performance: {
            totalOrders: parseInt(manager.totalOrders || 0),
            totalContracts: parseInt(manager.totalContracts || 0),
            totalCalculations: parseInt(manager.totalCalculations || 0),
            totalOrderRevenue: parseFloat(manager.totalOrderRevenue || 0),
            totalContractRevenue: parseFloat(manager.totalContractRevenue || 0),
            totalRevenue: parseFloat(manager.totalOrderRevenue || 0) + parseFloat(manager.totalContractRevenue || 0),
            uniqueClients: parseInt(manager.uniqueClients || 0),
            avgOrderValue: parseFloat(manager.avgOrderValue || 0),
            totalDialogues: parseInt(manager.totalDialogues || 0),
            totalMessages: parseInt(manager.totalMessages || 0)
          },
          efficiency: {
            revenuePerOrder: (parseInt(manager.totalOrders || 0) > 0) 
              ? parseFloat(manager.totalOrderRevenue || 0) / parseInt(manager.totalOrders || 0)
              : 0,
            clientsPerManager: parseInt(manager.uniqueClients || 0),
            communicationActivity: parseInt(manager.totalMessages || 0),
            conversionRate: this.calculateManagerConversionRate(manager)
          }
        })),
        summary: {
          totalManagers: managerPerformance.length,
          totalRevenue: managerPerformance.reduce((sum, m) => 
            sum + parseFloat(m.totalOrderRevenue || 0) + parseFloat(m.totalContractRevenue || 0), 0),
          avgRevenuePerManager: managerPerformance.length > 0 
            ? managerPerformance.reduce((sum, m) => 
                sum + parseFloat(m.totalOrderRevenue || 0) + parseFloat(m.totalContractRevenue || 0), 0) / managerPerformance.length
            : 0
        },
        rankings: this.calculateManagerRankings(managerPerformance),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get manager analytics', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo
      });
      throw error;
    }
  }

  // Get sales funnel analytics
  async getSalesFunnelAnalytics(dateFrom, dateTo) {
    try {
      const cacheKey = `sales_funnel_${dateFrom}_${dateTo}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const [
        totalCalculations,
        calculationsWithClient,
        quotationsSent,
        ordersCreated,
        ordersCompleted,
        contractsSigned
      ] = await Promise.all([
        prisma.calculation.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            }
          }
        }),
        prisma.calculation.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            },
            clientId: { not: null }
          }
        }),
        // Assuming calculations with certain criteria are "quotations sent"
        prisma.calculation.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            },
            clientId: { not: null },
            totalSaleAmount: { gt: 0 }
          }
        }),
        prisma.order.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            }
          }
        }),
        prisma.order.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            },
            status: 'COMPLETED'
          }
        }),
        prisma.contract.count({
          where: {
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            },
            status: 'SIGNED'
          }
        })
      ]);

      const funnel = [
        {
          stage: 'Calculations Created',
          count: totalCalculations,
          percentage: 100,
          description: 'Initial interest/calculations made'
        },
        {
          stage: 'Client Identified',
          count: calculationsWithClient,
          percentage: totalCalculations > 0 ? (calculationsWithClient / totalCalculations * 100).toFixed(1) : 0,
          description: 'Calculations linked to clients'
        },
        {
          stage: 'Quotations Sent',
          count: quotationsSent,
          percentage: totalCalculations > 0 ? (quotationsSent / totalCalculations * 100).toFixed(1) : 0,
          description: 'Formal quotes provided'
        },
        {
          stage: 'Orders Created',
          count: ordersCreated,
          percentage: totalCalculations > 0 ? (ordersCreated / totalCalculations * 100).toFixed(1) : 0,
          description: 'Orders placed by clients'
        },
        {
          stage: 'Orders Completed',
          count: ordersCompleted,
          percentage: totalCalculations > 0 ? (ordersCompleted / totalCalculations * 100).toFixed(1) : 0,
          description: 'Successfully completed orders'
        },
        {
          stage: 'Contracts Signed',
          count: contractsSigned,
          percentage: totalCalculations > 0 ? (contractsSigned / totalCalculations * 100).toFixed(1) : 0,
          description: 'Formal contracts executed'
        }
      ];

      const analytics = {
        funnel,
        conversionRates: {
          calculationToClient: calculationsWithClient / Math.max(totalCalculations, 1),
          clientToQuotation: quotationsSent / Math.max(calculationsWithClient, 1),
          quotationToOrder: ordersCreated / Math.max(quotationsSent, 1),
          orderToCompletion: ordersCompleted / Math.max(ordersCreated, 1),
          overallConversion: ordersCompleted / Math.max(totalCalculations, 1)
        },
        dropOffAnalysis: this.calculateDropOffRates(funnel),
        recommendations: this.generateFunnelRecommendations(funnel),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get sales funnel analytics', {
        error: error.message,
        stack: error.stack,
        dateFrom,
        dateTo
      });
      throw error;
    }
  }

  // Helper methods
  buildWhereClause(dateFrom, dateTo, filters) {
    const where = {
      createdAt: {
        gte: new Date(dateFrom),
        lte: new Date(dateTo)
      }
    };

    if (filters.managerId) {
      where.userId = filters.managerId;
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    return where;
  }

  async getTotalRevenue(whereClause) {
    const orderRevenue = await prisma.order.aggregate({
      where: {
        ...whereClause,
        status: { in: ['COMPLETED', 'SHIPPED', 'DELIVERED'] }
      },
      _sum: { totalAmount: true }
    });

    const contractRevenue = await prisma.contract.aggregate({
      where: {
        ...whereClause,
        status: { in: ['ACTIVE', 'COMPLETED', 'SIGNED'] }
      },
      _sum: { totalAmount: true }
    });

    return (orderRevenue._sum.totalAmount || 0) + (contractRevenue._sum.totalAmount || 0);
  }

  async getTotalOrders(whereClause) {
    return await prisma.order.count({ where: whereClause });
  }

  async getTotalContracts(whereClause) {
    return await prisma.contract.count({ where: whereClause });
  }

  async getTotalCalculations(whereClause) {
    return await prisma.calculation.count({ where: whereClause });
  }

  async getAverageOrderValue(whereClause) {
    const result = await prisma.order.aggregate({
      where: whereClause,
      _avg: { totalAmount: true }
    });
    return result._avg.totalAmount || 0;
  }

  async getConversionRates(whereClause) {
    const calculations = await this.getTotalCalculations(whereClause);
    const orders = await this.getTotalOrders(whereClause);
    const contracts = await this.getTotalContracts(whereClause);

    return {
      calculationToOrder: calculations > 0 ? (orders / calculations * 100).toFixed(1) : 0,
      calculationToContract: calculations > 0 ? (contracts / calculations * 100).toFixed(1) : 0,
      overall: calculations > 0 ? ((orders + contracts) / calculations * 100).toFixed(1) : 0
    };
  }

  // Cache management
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  // Additional helper methods implementation
  async getSalesTrends(dateFrom, dateTo, filters) {
    try {
      // Get revenue data for trend analysis
      const revenueData = await this.getRevenueAnalytics(dateFrom, dateTo, 'day');
      const revenues = revenueData.combinedRevenue.map(day => day.totalRevenue);
      
      if (revenues.length === 0) {
        return { trend: 'no-data', growthRate: 0, seasonality: 'unknown' };
      }

      // Calculate growth trend
      const firstHalf = revenues.slice(0, Math.floor(revenues.length / 2));
      const secondHalf = revenues.slice(Math.floor(revenues.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
      
      const growthRate = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg * 100) : 0;

      return {
        trend: growthRate > 5 ? 'positive' : growthRate < -5 ? 'negative' : 'stable',
        growthRate: parseFloat(growthRate.toFixed(2)),
        seasonality: this.detectSeasonality(revenues)
      };
    } catch (error) {
      logger.error('Failed to get sales trends', { error: error.message });
      return { trend: 'error', growthRate: 0, seasonality: 'unknown' };
    }
  }

  async getTopProducts(whereClause, limit) {
    try {
      const products = await prisma.$queryRaw`
        SELECT 
          p.id,
          p.name,
          p.category,
          COUNT(oi.id) as salesCount,
          SUM(oi.totalPrice) as totalRevenue,
          SUM(oi.quantity) as totalQuantity
        FROM Product p
        JOIN OrderItem oi ON p.id = oi.productId
        JOIN \`Order\` o ON oi.orderId = o.id
        WHERE o.createdAt >= ${whereClause.createdAt.gte}
          AND o.createdAt <= ${whereClause.createdAt.lte}
          AND o.status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
        GROUP BY p.id, p.name, p.category
        ORDER BY totalRevenue DESC
        LIMIT ${limit}
      `;

      return products.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category || 'Uncategorized',
        salesCount: parseInt(product.salesCount || 0),
        totalRevenue: parseFloat(product.totalRevenue || 0),
        totalQuantity: parseInt(product.totalQuantity || 0)
      }));
    } catch (error) {
      logger.error('Failed to get top products', { error: error.message });
      return [];
    }
  }

  async getTopClients(whereClause, limit) {
    try {
      const clients = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          c.email,
          COUNT(DISTINCT o.id) as orderCount,
          COUNT(DISTINCT ct.id) as contractCount,
          SUM(COALESCE(o.totalAmount, 0)) as orderRevenue,
          SUM(COALESCE(ct.totalAmount, 0)) as contractRevenue,
          (SUM(COALESCE(o.totalAmount, 0)) + SUM(COALESCE(ct.totalAmount, 0))) as totalRevenue
        FROM Client c
        LEFT JOIN \`Order\` o ON c.id = o.clientId 
          AND o.createdAt >= ${whereClause.createdAt.gte}
          AND o.createdAt <= ${whereClause.createdAt.lte}
        LEFT JOIN Contract ct ON c.id = ct.clientId 
          AND ct.createdAt >= ${whereClause.createdAt.gte}
          AND ct.createdAt <= ${whereClause.createdAt.lte}
        GROUP BY c.id, c.name, c.email
        HAVING totalRevenue > 0
        ORDER BY totalRevenue DESC
        LIMIT ${limit}
      `;

      return clients.map(client => ({
        id: client.id,
        name: client.name,
        email: client.email,
        orderCount: parseInt(client.orderCount || 0),
        contractCount: parseInt(client.contractCount || 0),
        totalRevenue: parseFloat(client.totalRevenue || 0)
      }));
    } catch (error) {
      logger.error('Failed to get top clients', { error: error.message });
      return [];
    }
  }

  async getProfitabilityMetrics(whereClause) {
    try {
      // Get calculations with profitability data
      const calculations = await prisma.calculation.findMany({
        where: whereClause,
        select: {
          totalSaleAmount: true,
          totalCostBreakdown: true,
          grossProfit: true,
          netProfit: true,
          profitabilityPercent: true
        }
      });

      if (calculations.length === 0) {
        return { grossMargin: 0, netMargin: 0, roi: 0, calculationsAnalyzed: 0 };
      }

      const totalRevenue = calculations.reduce((sum, calc) => sum + (calc.totalSaleAmount || 0), 0);
      const totalCost = calculations.reduce((sum, calc) => sum + (calc.totalCostBreakdown || 0), 0);
      const totalGrossProfit = calculations.reduce((sum, calc) => sum + (calc.grossProfit || 0), 0);
      const totalNetProfit = calculations.reduce((sum, calc) => sum + (calc.netProfit || 0), 0);

      return {
        grossMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue * 100) : 0,
        netMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue * 100) : 0,
        roi: totalCost > 0 ? (totalNetProfit / totalCost * 100) : 0,
        calculationsAnalyzed: calculations.length,
        totalRevenue,
        totalCost,
        totalGrossProfit,
        totalNetProfit
      };
    } catch (error) {
      logger.error('Failed to get profitability metrics', { error: error.message });
      return { grossMargin: 0, netMargin: 0, roi: 0, calculationsAnalyzed: 0 };
    }
  }

  // Helper methods for complex calculations
  detectSeasonality(revenues) {
    if (revenues.length < 7) return 'insufficient-data';
    
    const variance = this.calculateVariance(revenues);
    const mean = revenues.reduce((sum, val) => sum + val, 0) / revenues.length;
    const coefficientOfVariation = mean > 0 ? (Math.sqrt(variance) / mean) : 0;
    
    if (coefficientOfVariation > 0.5) return 'high-variance';
    if (coefficientOfVariation > 0.2) return 'seasonal';
    return 'stable';
  }

  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    return squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
  }

  combineRevenueStreams(orderRevenue, contractRevenue) {
    const combined = new Map();
    
    orderRevenue.forEach(entry => {
      combined.set(entry.period, {
        period: entry.period,
        orderRevenue: entry.revenue,
        contractRevenue: 0,
        totalRevenue: entry.revenue,
        orderCount: entry.orderCount,
        contractCount: 0
      });
    });

    contractRevenue.forEach(entry => {
      if (combined.has(entry.period)) {
        const existing = combined.get(entry.period);
        existing.contractRevenue = entry.revenue;
        existing.totalRevenue += entry.revenue;
        existing.contractCount = entry.contractCount;
      } else {
        combined.set(entry.period, {
          period: entry.period,
          orderRevenue: 0,
          contractRevenue: entry.revenue,
          totalRevenue: entry.revenue,
          orderCount: 0,
          contractCount: entry.contractCount
        });
      }
    });

    return Array.from(combined.values()).sort((a, b) => a.period.localeCompare(b.period));
  }

  calculateRevenueTotals(combinedRevenue) {
    return combinedRevenue.reduce((totals, entry) => ({
      totalRevenue: totals.totalRevenue + entry.totalRevenue,
      totalOrderRevenue: totals.totalOrderRevenue + entry.orderRevenue,
      totalContractRevenue: totals.totalContractRevenue + entry.contractRevenue,
      totalOrders: totals.totalOrders + entry.orderCount,
      totalContracts: totals.totalContracts + entry.contractCount
    }), {
      totalRevenue: 0,
      totalOrderRevenue: 0,
      totalContractRevenue: 0,
      totalOrders: 0,
      totalContracts: 0
    });
  }

  // Client segmentation methods
  segmentClients(clientPerformance) {
    const revenues = clientPerformance.map(c => 
      parseFloat(c.totalOrderRevenue || 0) + parseFloat(c.totalContractRevenue || 0)
    ).filter(r => r > 0).sort((a, b) => b - a);

    if (revenues.length === 0) {
      return {
        segments: { VIP: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
        thresholds: { VIP: 0, HIGH: 0, MEDIUM: 0 }
      };
    }

    const total = revenues.length;
    const vipThreshold = revenues[Math.floor(total * 0.1)] || revenues[0]; // Top 10%
    const highThreshold = revenues[Math.floor(total * 0.3)] || revenues[0]; // Top 30%
    const mediumThreshold = revenues[Math.floor(total * 0.7)] || revenues[revenues.length - 1]; // Top 70%

    const segments = {
      VIP: revenues.filter(r => r >= vipThreshold).length,
      HIGH: revenues.filter(r => r >= highThreshold && r < vipThreshold).length,
      MEDIUM: revenues.filter(r => r >= mediumThreshold && r < highThreshold).length,
      LOW: revenues.filter(r => r < mediumThreshold).length
    };

    return {
      segments,
      thresholds: { VIP: vipThreshold, HIGH: highThreshold, MEDIUM: mediumThreshold }
    };
  }

  getClientSegment(client, thresholds) {
    const totalRevenue = parseFloat(client.totalOrderRevenue || 0) + parseFloat(client.totalContractRevenue || 0);
    
    if (totalRevenue >= thresholds.VIP) return 'VIP';
    if (totalRevenue >= thresholds.HIGH) return 'HIGH';
    if (totalRevenue >= thresholds.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  calculateManagerConversionRate(manager) {
    const calculations = parseInt(manager.totalCalculations || 0);
    const orders = parseInt(manager.totalOrders || 0);
    const contracts = parseInt(manager.totalContracts || 0);
    
    return calculations > 0 ? ((orders + contracts) / calculations * 100).toFixed(1) : 0;
  }

  calculateManagerRankings(managerPerformance) {
    const sortedByRevenue = [...managerPerformance]
      .sort((a, b) => (parseFloat(b.totalOrderRevenue || 0) + parseFloat(b.totalContractRevenue || 0)) - 
                      (parseFloat(a.totalOrderRevenue || 0) + parseFloat(a.totalContractRevenue || 0)));
    
    const sortedByClients = [...managerPerformance]
      .sort((a, b) => parseInt(b.uniqueClients || 0) - parseInt(a.uniqueClients || 0));

    return {
      byRevenue: sortedByRevenue.slice(0, 5).map((manager, index) => ({
        rank: index + 1,
        managerId: manager.id,
        name: manager.name,
        revenue: parseFloat(manager.totalOrderRevenue || 0) + parseFloat(manager.totalContractRevenue || 0)
      })),
      byClientCount: sortedByClients.slice(0, 5).map((manager, index) => ({
        rank: index + 1,
        managerId: manager.id,
        name: manager.name,
        uniqueClients: parseInt(manager.uniqueClients || 0)
      }))
    };
  }

  calculateDropOffRates(funnel) {
    const dropOffRates = [];
    
    for (let i = 1; i < funnel.length; i++) {
      const previous = funnel[i - 1];
      const current = funnel[i];
      const dropOff = previous.count - current.count;
      const dropOffRate = previous.count > 0 ? (dropOff / previous.count * 100).toFixed(1) : 0;
      
      dropOffRates.push({
        fromStage: previous.stage,
        toStage: current.stage,
        lost: dropOff,
        dropOffRate: parseFloat(dropOffRate)
      });
    }
    
    return dropOffRates;
  }

  generateFunnelRecommendations(funnel) {
    const recommendations = [];
    const dropOffRates = this.calculateDropOffRates(funnel);
    
    // Find highest drop-off stage
    const highestDropOff = dropOffRates.reduce((max, current) => 
      current.dropOffRate > max.dropOffRate ? current : max, dropOffRates[0] || { dropOffRate: 0 });
    
    if (highestDropOff.dropOffRate > 50) {
      recommendations.push({
        priority: 'high',
        stage: highestDropOff.fromStage,
        issue: 'High drop-off rate detected',
        recommendation: `Focus on improving conversion between ${highestDropOff.fromStage} and ${highestDropOff.toStage}`,
        impact: 'Could increase overall conversion by up to ' + (highestDropOff.dropOffRate * 0.3).toFixed(1) + '%'
      });
    }

    // Overall low conversion
    if (funnel.length > 0 && parseFloat(funnel[funnel.length - 1].percentage) < 10) {
      recommendations.push({
        priority: 'medium',
        stage: 'Overall Process',
        issue: 'Low overall conversion rate',
        recommendation: 'Review entire sales process for optimization opportunities',
        impact: 'Systematic improvements could double conversion rates'
      });
    }

    return recommendations;
  }

  async getCohortAnalysis(dateFrom, dateTo) {
    // Simplified cohort analysis - would be more complex in production
    try {
      const cohorts = await prisma.$queryRaw`
        SELECT 
          DATE_FORMAT(MIN(o.createdAt), '%Y-%m') as cohort,
          COUNT(DISTINCT c.id) as newClients,
          SUM(o.totalAmount) as cohortRevenue
        FROM Client c
        JOIN \`Order\` o ON c.id = o.clientId
        WHERE o.createdAt >= ${new Date(dateFrom)}
          AND o.createdAt <= ${new Date(dateTo)}
        GROUP BY cohort
        ORDER BY cohort
      `;

      return cohorts.map(cohort => ({
        cohort: cohort.cohort,
        newClients: parseInt(cohort.newClients || 0),
        revenue: parseFloat(cohort.cohortRevenue || 0)
      }));
    } catch (error) {
      logger.error('Failed to get cohort analysis', { error: error.message });
      return [];
    }
  }

  async getChurnAnalysis(dateTo) {
    // Simple churn analysis based on last order date
    try {
      const thirtyDaysAgo = new Date(dateTo);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const churnData = await prisma.$queryRaw`
        SELECT 
          COUNT(DISTINCT c.id) as totalClients,
          COUNT(DISTINCT CASE WHEN o.createdAt >= ${thirtyDaysAgo} THEN c.id END) as activeClients,
          COUNT(DISTINCT CASE WHEN o.createdAt < ${thirtyDaysAgo} THEN c.id END) as inactiveClients
        FROM Client c
        LEFT JOIN \`Order\` o ON c.id = o.clientId
        WHERE c.createdAt <= ${new Date(dateTo)}
      `;

      const data = churnData[0] || {};
      const totalClients = parseInt(data.totalClients || 0);
      const activeClients = parseInt(data.activeClients || 0);
      const inactiveClients = parseInt(data.inactiveClients || 0);

      return {
        totalClients,
        activeClients,
        inactiveClients,
        churnRate: totalClients > 0 ? (inactiveClients / totalClients * 100).toFixed(1) : 0,
        retentionRate: totalClients > 0 ? (activeClients / totalClients * 100).toFixed(1) : 0
      };
    } catch (error) {
      logger.error('Failed to get churn analysis', { error: error.message });
      return {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        churnRate: 0,
        retentionRate: 0
      };
    }
  }

  async getProductProfitability(dateFrom, dateTo) {
    try {
      const productProfit = await prisma.$queryRaw`
        SELECT 
          calc.productName,
          AVG(calc.profitabilityPercent) as avgProfitability,
          SUM(calc.grossProfit) as totalGrossProfit,
          SUM(calc.netProfit) as totalNetProfit,
          COUNT(*) as calculationCount
        FROM Calculation calc
        WHERE calc.createdAt >= ${new Date(dateFrom)}
          AND calc.createdAt <= ${new Date(dateTo)}
          AND calc.productName IS NOT NULL
          AND calc.profitabilityPercent IS NOT NULL
        GROUP BY calc.productName
        ORDER BY avgProfitability DESC
      `;

      const profitabilityMap = {};
      productProfit.forEach(product => {
        profitabilityMap[product.productName] = {
          avgProfitability: parseFloat(product.avgProfitability || 0),
          totalGrossProfit: parseFloat(product.totalGrossProfit || 0),
          totalNetProfit: parseFloat(product.totalNetProfit || 0),
          calculationCount: parseInt(product.calculationCount || 0)
        };
      });

      return profitabilityMap;
    } catch (error) {
      logger.error('Failed to get product profitability', { error: error.message });
      return {};
    }
  }

  async getCategoryPerformance(dateFrom, dateTo) {
    try {
      const categories = await prisma.$queryRaw`
        SELECT 
          COALESCE(p.category, 'Uncategorized') as category,
          COUNT(DISTINCT p.id) as productCount,
          SUM(oi.totalPrice) as categoryRevenue,
          SUM(oi.quantity) as totalQuantitySold
        FROM Product p
        LEFT JOIN OrderItem oi ON p.id = oi.productId
        LEFT JOIN \`Order\` o ON oi.orderId = o.id
        WHERE o.createdAt >= ${new Date(dateFrom)}
          AND o.createdAt <= ${new Date(dateTo)}
          AND o.status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
        GROUP BY p.category
        ORDER BY categoryRevenue DESC
      `;

      return categories.map(category => ({
        name: category.category,
        productCount: parseInt(category.productCount || 0),
        revenue: parseFloat(category.categoryRevenue || 0),
        quantitySold: parseInt(category.totalQuantitySold || 0)
      }));
    } catch (error) {
      logger.error('Failed to get category performance', { error: error.message });
      return [];
    }
  }
}

// Singleton instance
const salesAnalyticsService = new SalesAnalyticsService();

module.exports = salesAnalyticsService;