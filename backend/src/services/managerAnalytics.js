const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

class ManagerAnalyticsService {
  constructor() {
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    this.cache = new Map();
  }

  // Get comprehensive manager analytics with important notes
  async getManagerAnalytics(managerId, dateFrom, dateTo, includeNotes = true) {
    try {
      const cacheKey = `manager_${managerId}_${dateFrom}_${dateTo}_${includeNotes}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Get basic manager info
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true
        }
      });

      if (!manager) {
        throw new Error('Manager not found');
      }

      const [
        performanceMetrics,
        clientInteractions,
        importantNotes,
        dialogueActivity,
        workloadAnalysis,
        efficiencyMetrics,
        clientFeedback
      ] = await Promise.all([
        this.getPerformanceMetrics(managerId, dateFrom, dateTo),
        this.getClientInteractions(managerId, dateFrom, dateTo),
        includeNotes ? this.getImportantNotes(managerId, dateFrom, dateTo) : Promise.resolve([]),
        this.getDialogueActivity(managerId, dateFrom, dateTo),
        this.getWorkloadAnalysis(managerId, dateFrom, dateTo),
        this.getEfficiencyMetrics(managerId, dateFrom, dateTo),
        this.getClientFeedback(managerId, dateFrom, dateTo)
      ]);

      const analytics = {
        manager: {
          id: manager.id,
          name: manager.name,
          email: manager.email,
          role: manager.role,
          experience: this.calculateExperience(manager.createdAt),
          workingSince: manager.createdAt
        },
        period: { from: dateFrom, to: dateTo },
        performance: performanceMetrics,
        clientRelations: clientInteractions,
        importantNotes: importantNotes,
        communication: dialogueActivity,
        workload: workloadAnalysis,
        efficiency: efficiencyMetrics,
        clientFeedback: clientFeedback,
        overallRating: this.calculateOverallRating(performanceMetrics, clientInteractions, efficiencyMetrics),
        recommendations: this.generateRecommendations(performanceMetrics, workloadAnalysis, efficiencyMetrics),
        generatedAt: new Date().toISOString()
      };

      this.setCache(cacheKey, analytics);
      return analytics;

    } catch (error) {
      logger.error('Failed to get manager analytics', {
        error: error.message,
        stack: error.stack,
        managerId,
        dateFrom,
        dateTo
      });
      throw error;
    }
  }

  // Get performance metrics for manager
  async getPerformanceMetrics(managerId, dateFrom, dateTo) {
    try {
      const [orders, contracts, calculations, revenue] = await Promise.all([
        // Orders performance
        prisma.$queryRaw`
          SELECT 
            COUNT(*) as totalOrders,
            COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completedOrders,
            COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelledOrders,
            AVG(totalAmount) as avgOrderValue,
            SUM(CASE WHEN status = 'COMPLETED' THEN totalAmount ELSE 0 END) as completedRevenue
          FROM \`Order\`
          WHERE userId = ${managerId}
            AND createdAt >= ${new Date(dateFrom)}
            AND createdAt <= ${new Date(dateTo)}
        `,

        // Contracts performance
        prisma.$queryRaw`
          SELECT 
            COUNT(*) as totalContracts,
            COUNT(CASE WHEN status = 'SIGNED' THEN 1 END) as signedContracts,
            COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelledContracts,
            AVG(totalAmount) as avgContractValue,
            SUM(CASE WHEN status = 'SIGNED' THEN totalAmount ELSE 0 END) as contractRevenue
          FROM Contract
          WHERE userId = ${managerId}
            AND createdAt >= ${new Date(dateFrom)}
            AND createdAt <= ${new Date(dateTo)}
        `,

        // Calculations activity
        prisma.calculation.count({
          where: {
            userId: managerId,
            createdAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo)
            }
          }
        }),

        // Total revenue calculation
        this.calculateManagerRevenue(managerId, dateFrom, dateTo)
      ]);

      const orderData = orders[0] || {};
      const contractData = contracts[0] || {};

      return {
        orders: {
          total: parseInt(orderData.totalOrders || 0),
          completed: parseInt(orderData.completedOrders || 0),
          cancelled: parseInt(orderData.cancelledOrders || 0),
          avgValue: parseFloat(orderData.avgOrderValue || 0),
          completedRevenue: parseFloat(orderData.completedRevenue || 0),
          completionRate: orderData.totalOrders > 0 
            ? (parseInt(orderData.completedOrders || 0) / parseInt(orderData.totalOrders || 0) * 100).toFixed(1)
            : 0
        },
        contracts: {
          total: parseInt(contractData.totalContracts || 0),
          signed: parseInt(contractData.signedContracts || 0),
          cancelled: parseInt(contractData.cancelledContracts || 0),
          avgValue: parseFloat(contractData.avgContractValue || 0),
          revenue: parseFloat(contractData.contractRevenue || 0),
          signatureRate: contractData.totalContracts > 0
            ? (parseInt(contractData.signedContracts || 0) / parseInt(contractData.totalContracts || 0) * 100).toFixed(1)
            : 0
        },
        calculations: calculations || 0,
        totalRevenue: revenue.totalRevenue,
        conversionRate: calculations > 0 
          ? ((parseInt(orderData.totalOrders || 0) + parseInt(contractData.totalContracts || 0)) / calculations * 100).toFixed(1)
          : 0,
        productivity: this.calculateProductivity(orderData, contractData, calculations),
        targets: this.getManagerTargets(managerId, dateFrom, dateTo)
      };

    } catch (error) {
      logger.error('Failed to get performance metrics', { error: error.message, managerId });
      return this.getEmptyPerformanceMetrics();
    }
  }

  // Get client interactions and relationship data
  async getClientInteractions(managerId, dateFrom, dateTo) {
    try {
      const [clientStats, dialogues, recentInteractions] = await Promise.all([
        // Client statistics
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT c.id) as totalClients,
            COUNT(DISTINCT CASE WHEN o.createdAt >= ${new Date(dateFrom)} THEN c.id END) as activeClients,
            COUNT(DISTINCT CASE WHEN c.createdAt >= ${new Date(dateFrom)} THEN c.id END) as newClients,
            AVG(client_revenue.revenue) as avgClientRevenue
          FROM Client c
          LEFT JOIN \`Order\` o ON c.id = o.clientId
          LEFT JOIN (
            SELECT clientId, SUM(totalAmount) as revenue 
            FROM \`Order\` 
            WHERE userId = ${managerId} AND status = 'COMPLETED'
            GROUP BY clientId
          ) client_revenue ON c.id = client_revenue.clientId
          WHERE EXISTS (
            SELECT 1 FROM \`Order\` WHERE clientId = c.id AND userId = ${managerId}
          )
        `,

        // Dialogue activity
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT d.id) as totalDialogues,
            COUNT(DISTINCT d.clientId) as clientsWithDialogues,
            COUNT(m.id) as totalMessages,
            COUNT(CASE WHEN m.priority = 'HIGH' THEN 1 END) as highPriorityMessages,
            AVG(CASE WHEN d.status = 'RESOLVED' THEN 
              TIMESTAMPDIFF(HOUR, d.createdAt, d.updatedAt) 
            END) as avgResolutionTime
          FROM Dialogue d
          LEFT JOIN Message m ON d.id = m.dialogueId
          WHERE d.managerId = ${managerId}
            AND d.createdAt >= ${new Date(dateFrom)}
            AND d.createdAt <= ${new Date(dateTo)}
        `,

        // Recent client interactions
        this.getRecentClientInteractions(managerId, dateFrom, dateTo, 10)
      ]);

      const clientData = clientStats[0] || {};
      const dialogueData = dialogues[0] || {};

      return {
        clients: {
          total: parseInt(clientData.totalClients || 0),
          active: parseInt(clientData.activeClients || 0),
          new: parseInt(clientData.newClients || 0),
          avgRevenue: parseFloat(clientData.avgClientRevenue || 0),
          retentionRate: clientData.totalClients > 0 
            ? (parseInt(clientData.activeClients || 0) / parseInt(clientData.totalClients || 0) * 100).toFixed(1)
            : 0
        },
        communication: {
          totalDialogues: parseInt(dialogueData.totalDialogues || 0),
          clientsWithDialogues: parseInt(dialogueData.clientsWithDialogues || 0),
          totalMessages: parseInt(dialogueData.totalMessages || 0),
          highPriorityMessages: parseInt(dialogueData.highPriorityMessages || 0),
          avgResolutionTime: parseFloat(dialogueData.avgResolutionTime || 0),
          communicationRate: clientData.totalClients > 0 
            ? (parseInt(dialogueData.clientsWithDialogues || 0) / parseInt(clientData.totalClients || 0) * 100).toFixed(1)
            : 0
        },
        recentInteractions: recentInteractions,
        relationshipScore: this.calculateRelationshipScore(clientData, dialogueData)
      };

    } catch (error) {
      logger.error('Failed to get client interactions', { error: error.message, managerId });
      return this.getEmptyClientInteractions();
    }
  }

  // Get important notes and annotations
  async getImportantNotes(managerId, dateFrom, dateTo) {
    try {
      // Check for notes in various places
      const [
        clientNotes,
        orderNotes, 
        contractNotes,
        dialogueNotes,
        calculationNotes
      ] = await Promise.all([
        // Client-related important notes
        prisma.$queryRaw`
          SELECT 
            'CLIENT' as type,
            c.id as entityId,
            c.name as entityName,
            c.description as note,
            c.updatedAt as noteDate,
            'Client information' as category
          FROM Client c
          WHERE EXISTS (
            SELECT 1 FROM \`Order\` WHERE clientId = c.id AND userId = ${managerId}
          )
          AND c.description IS NOT NULL 
          AND c.description != ''
          AND c.updatedAt >= ${new Date(dateFrom)}
          AND c.updatedAt <= ${new Date(dateTo)}
        `,

        // Order notes
        prisma.$queryRaw`
          SELECT 
            'ORDER' as type,
            o.id as entityId,
            CONCAT('Order #', o.id) as entityName,
            o.notes as note,
            o.updatedAt as noteDate,
            'Order notes' as category
          FROM \`Order\` o
          WHERE o.userId = ${managerId}
          AND o.notes IS NOT NULL 
          AND o.notes != ''
          AND o.updatedAt >= ${new Date(dateFrom)}
          AND o.updatedAt <= ${new Date(dateTo)}
        `,

        // Contract notes
        prisma.$queryRaw`
          SELECT 
            'CONTRACT' as type,
            ct.id as entityId,
            CONCAT('Contract ', ct.contractNumber) as entityName,
            ct.description as note,
            ct.updatedAt as noteDate,
            'Contract details' as category
          FROM Contract ct
          WHERE ct.userId = ${managerId}
          AND ct.description IS NOT NULL 
          AND ct.description != ''
          AND ct.updatedAt >= ${new Date(dateFrom)}
          AND ct.updatedAt <= ${new Date(dateTo)}
        `,

        // Important dialogue messages
        prisma.$queryRaw`
          SELECT 
            'DIALOGUE' as type,
            d.id as entityId,
            CONCAT('Dialogue with ', c.name) as entityName,
            m.content as note,
            m.createdAt as noteDate,
            'Important message' as category
          FROM Dialogue d
          JOIN Message m ON d.id = m.dialogueId
          JOIN Client c ON d.clientId = c.id
          WHERE d.managerId = ${managerId}
          AND m.priority IN ('HIGH', 'URGENT')
          AND m.createdAt >= ${new Date(dateFrom)}
          AND m.createdAt <= ${new Date(dateTo)}
          ORDER BY m.createdAt DESC
          LIMIT 20
        `,

        // Calculation notes
        prisma.$queryRaw`
          SELECT 
            'CALCULATION' as type,
            calc.id as entityId,
            calc.name as entityName,
            calc.notes as note,
            calc.updatedAt as noteDate,
            'Calculation notes' as category
          FROM Calculation calc
          WHERE calc.userId = ${managerId}
          AND calc.notes IS NOT NULL 
          AND calc.notes != ''
          AND calc.updatedAt >= ${new Date(dateFrom)}
          AND calc.updatedAt <= ${new Date(dateTo)}
        `
      ]);

      // Combine all notes
      const allNotes = [
        ...clientNotes,
        ...orderNotes,
        ...contractNotes,
        ...dialogueNotes,
        ...calculationNotes
      ];

      // Sort by date and analyze importance
      const processedNotes = allNotes
        .map(note => ({
          type: note.type,
          entityId: note.entityId,
          entityName: note.entityName,
          note: note.note,
          noteDate: note.noteDate,
          category: note.category,
          importance: this.analyzeNoteImportance(note.note),
          sentiment: this.analyzeNoteSentiment(note.note),
          tags: this.extractNoteTags(note.note)
        }))
        .sort((a, b) => new Date(b.noteDate) - new Date(a.noteDate))
        .slice(0, 50); // Limit to 50 most recent notes

      return {
        totalNotes: processedNotes.length,
        notesByType: this.groupNotesByType(processedNotes),
        notesByImportance: this.groupNotesByImportance(processedNotes),
        notesByCategory: this.groupNotesByCategory(processedNotes),
        recentNotes: processedNotes.slice(0, 10),
        importantNotes: processedNotes.filter(note => note.importance === 'HIGH'),
        sentimentAnalysis: this.analyzeSentimentDistribution(processedNotes),
        commonTags: this.getCommonTags(processedNotes),
        notesTimeline: this.createNotesTimeline(processedNotes)
      };

    } catch (error) {
      logger.error('Failed to get important notes', { error: error.message, managerId });
      return { totalNotes: 0, recentNotes: [], importantNotes: [] };
    }
  }

  // Get dialogue and communication activity
  async getDialogueActivity(managerId, dateFrom, dateTo) {
    try {
      const [activityStats, responseTime, messagePatterns] = await Promise.all([
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT d.id) as totalDialogues,
            COUNT(DISTINCT d.clientId) as uniqueClients,
            COUNT(m.id) as totalMessages,
            COUNT(CASE WHEN m.senderId = ${managerId} THEN 1 END) as sentMessages,
            COUNT(CASE WHEN m.senderId != ${managerId} THEN 1 END) as receivedMessages,
            AVG(CASE WHEN m.senderId = ${managerId} THEN LENGTH(m.content) END) as avgMessageLength,
            COUNT(CASE WHEN m.priority = 'HIGH' THEN 1 END) as highPriorityCount,
            COUNT(CASE WHEN m.priority = 'URGENT' THEN 1 END) as urgentCount
          FROM Dialogue d
          LEFT JOIN Message m ON d.id = m.dialogueId
          WHERE d.managerId = ${managerId}
            AND d.createdAt >= ${new Date(dateFrom)}
            AND d.createdAt <= ${new Date(dateTo)}
        `,

        this.calculateResponseTime(managerId, dateFrom, dateTo),
        this.analyzeMessagePatterns(managerId, dateFrom, dateTo)
      ]);

      const stats = activityStats[0] || {};

      return {
        overview: {
          totalDialogues: parseInt(stats.totalDialogues || 0),
          uniqueClients: parseInt(stats.uniqueClients || 0),
          totalMessages: parseInt(stats.totalMessages || 0),
          sentMessages: parseInt(stats.sentMessages || 0),
          receivedMessages: parseInt(stats.receivedMessages || 0),
          avgMessageLength: parseFloat(stats.avgMessageLength || 0),
          responseRatio: stats.receivedMessages > 0 
            ? (parseInt(stats.sentMessages || 0) / parseInt(stats.receivedMessages || 0)).toFixed(2)
            : 0
        },
        priorities: {
          normal: parseInt(stats.totalMessages || 0) - parseInt(stats.highPriorityCount || 0) - parseInt(stats.urgentCount || 0),
          high: parseInt(stats.highPriorityCount || 0),
          urgent: parseInt(stats.urgentCount || 0)
        },
        responseTime: responseTime,
        patterns: messagePatterns,
        efficiency: {
          dialoguesPerClient: stats.uniqueClients > 0 
            ? (parseInt(stats.totalDialogues || 0) / parseInt(stats.uniqueClients || 0)).toFixed(1)
            : 0,
          messagesPerDialogue: stats.totalDialogues > 0 
            ? (parseInt(stats.totalMessages || 0) / parseInt(stats.totalDialogues || 0)).toFixed(1)
            : 0
        }
      };

    } catch (error) {
      logger.error('Failed to get dialogue activity', { error: error.message, managerId });
      return this.getEmptyDialogueActivity();
    }
  }

  // Get workload analysis
  async getWorkloadAnalysis(managerId, dateFrom, dateTo) {
    try {
      const daysDiff = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24));
      
      const [workloadData, timeDistribution] = await Promise.all([
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT o.id) as totalOrders,
            COUNT(DISTINCT ct.id) as totalContracts,
            COUNT(DISTINCT calc.id) as totalCalculations,
            COUNT(DISTINCT d.id) as totalDialogues,
            COUNT(DISTINCT c.id) as totalClients,
            SUM(CASE WHEN o.status = 'PENDING' THEN 1 ELSE 0 END) as pendingOrders,
            SUM(CASE WHEN ct.status = 'DRAFT' THEN 1 ELSE 0 END) as draftContracts,
            SUM(CASE WHEN d.status = 'OPEN' THEN 1 ELSE 0 END) as openDialogues
          FROM (SELECT ${managerId} as userId) mgr
          LEFT JOIN \`Order\` o ON mgr.userId = o.userId 
            AND o.createdAt >= ${new Date(dateFrom)} 
            AND o.createdAt <= ${new Date(dateTo)}
          LEFT JOIN Contract ct ON mgr.userId = ct.userId 
            AND ct.createdAt >= ${new Date(dateFrom)} 
            AND ct.createdAt <= ${new Date(dateTo)}
          LEFT JOIN Calculation calc ON mgr.userId = calc.userId 
            AND calc.createdAt >= ${new Date(dateFrom)} 
            AND calc.createdAt <= ${new Date(dateTo)}
          LEFT JOIN Dialogue d ON mgr.userId = d.managerId 
            AND d.createdAt >= ${new Date(dateFrom)} 
            AND d.createdAt <= ${new Date(dateTo)}
          LEFT JOIN Client c ON c.id IN (
            SELECT DISTINCT clientId FROM \`Order\` WHERE userId = mgr.userId
            UNION 
            SELECT DISTINCT clientId FROM Contract WHERE userId = mgr.userId
          )
        `,

        this.getTimeDistributionAnalysis(managerId, dateFrom, dateTo)
      ]);

      const workload = workloadData[0] || {};
      
      const totalTasks = parseInt(workload.totalOrders || 0) + 
                        parseInt(workload.totalContracts || 0) + 
                        parseInt(workload.totalCalculations || 0) + 
                        parseInt(workload.totalDialogues || 0);

      const pendingTasks = parseInt(workload.pendingOrders || 0) + 
                          parseInt(workload.draftContracts || 0) + 
                          parseInt(workload.openDialogues || 0);

      return {
        overview: {
          totalTasks: totalTasks,
          completedTasks: totalTasks - pendingTasks,
          pendingTasks: pendingTasks,
          tasksPerDay: daysDiff > 0 ? (totalTasks / daysDiff).toFixed(1) : 0,
          completionRate: totalTasks > 0 ? ((totalTasks - pendingTasks) / totalTasks * 100).toFixed(1) : 0
        },
        breakdown: {
          orders: {
            total: parseInt(workload.totalOrders || 0),
            pending: parseInt(workload.pendingOrders || 0)
          },
          contracts: {
            total: parseInt(workload.totalContracts || 0),
            drafts: parseInt(workload.draftContracts || 0)
          },
          calculations: {
            total: parseInt(workload.totalCalculations || 0)
          },
          dialogues: {
            total: parseInt(workload.totalDialogues || 0),
            open: parseInt(workload.openDialogues || 0)
          },
          clients: {
            total: parseInt(workload.totalClients || 0)
          }
        },
        timeDistribution: timeDistribution,
        workloadLevel: this.assessWorkloadLevel(totalTasks, daysDiff),
        recommendations: this.generateWorkloadRecommendations(workload, totalTasks, daysDiff)
      };

    } catch (error) {
      logger.error('Failed to get workload analysis', { error: error.message, managerId });
      return this.getEmptyWorkloadAnalysis();
    }
  }

  // Helper methods for calculations and analysis
  calculateExperience(createdAt) {
    const now = new Date();
    const start = new Date(createdAt);
    const diffMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    
    if (diffMonths < 12) {
      return `${diffMonths} месяцев`;
    } else {
      const years = Math.floor(diffMonths / 12);
      const months = diffMonths % 12;
      return `${years} лет${months > 0 ? ` ${months} мес.` : ''}`;
    }
  }

  analyzeNoteImportance(note) {
    const highImportanceKeywords = [
      'срочно', 'важно', 'критически', 'проблема', 'жалоба', 'недовольство',
      'urgent', 'important', 'critical', 'problem', 'complaint', 'issue'
    ];
    
    const mediumImportanceKeywords = [
      'вопрос', 'уточнить', 'обсудить', 'рассмотреть', 'планы', 'предложение',
      'question', 'clarify', 'discuss', 'consider', 'plans', 'proposal'
    ];
    
    const noteText = note.toLowerCase();
    
    if (highImportanceKeywords.some(keyword => noteText.includes(keyword))) {
      return 'HIGH';
    } else if (mediumImportanceKeywords.some(keyword => noteText.includes(keyword))) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  analyzeNoteSentiment(note) {
    const positiveKeywords = [
      'отлично', 'хорошо', 'спасибо', 'доволен', 'удачно', 'успешно',
      'excellent', 'good', 'thanks', 'satisfied', 'successful'
    ];
    
    const negativeKeywords = [
      'плохо', 'проблема', 'ошибка', 'недоволен', 'жалоба', 'неудача',
      'bad', 'problem', 'error', 'dissatisfied', 'complaint', 'failure'
    ];
    
    const noteText = note.toLowerCase();
    
    const positiveCount = positiveKeywords.filter(keyword => noteText.includes(keyword)).length;
    const negativeCount = negativeKeywords.filter(keyword => noteText.includes(keyword)).length;
    
    if (positiveCount > negativeCount) return 'POSITIVE';
    if (negativeCount > positiveCount) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  extractNoteTags(note) {
    const commonTags = [
      'цена', 'доставка', 'качество', 'сроки', 'оплата', 'договор',
      'price', 'delivery', 'quality', 'timeline', 'payment', 'contract'
    ];
    
    const noteText = note.toLowerCase();
    return commonTags.filter(tag => noteText.includes(tag));
  }

  // Cache management methods
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

  // Calculate manager revenue across all sources
  async calculateManagerRevenue(managerId, dateFrom, dateTo) {
    try {
      const [orderRevenue, contractRevenue] = await Promise.all([
        prisma.$queryRaw`
          SELECT 
            SUM(CASE WHEN status = 'COMPLETED' THEN totalAmount ELSE 0 END) as completedRevenue,
            COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completedOrders
          FROM \`Order\`
          WHERE userId = ${managerId}
            AND createdAt >= ${new Date(dateFrom)}
            AND createdAt <= ${new Date(dateTo)}
        `,
        
        prisma.$queryRaw`
          SELECT 
            SUM(CASE WHEN status = 'SIGNED' THEN totalAmount ELSE 0 END) as contractRevenue,
            COUNT(CASE WHEN status = 'SIGNED' THEN 1 END) as signedContracts
          FROM Contract
          WHERE userId = ${managerId}
            AND createdAt >= ${new Date(dateFrom)}
            AND createdAt <= ${new Date(dateTo)}
        `
      ]);

      const orderData = orderRevenue[0] || {};
      const contractData = contractRevenue[0] || {};

      return {
        totalRevenue: (parseFloat(orderData.completedRevenue || 0) + parseFloat(contractData.contractRevenue || 0)),
        orderRevenue: parseFloat(orderData.completedRevenue || 0),
        contractRevenue: parseFloat(contractData.contractRevenue || 0),
        completedOrders: parseInt(orderData.completedOrders || 0),
        signedContracts: parseInt(contractData.signedContracts || 0)
      };

    } catch (error) {
      logger.error('Failed to calculate manager revenue', { error: error.message, managerId });
      return { totalRevenue: 0, orderRevenue: 0, contractRevenue: 0, completedOrders: 0, signedContracts: 0 };
    }
  }

  calculateProductivity(orderData, contractData, calculations) {
    const totalTasks = parseInt(orderData.totalOrders || 0) + 
                      parseInt(contractData.totalContracts || 0) + 
                      parseInt(calculations || 0);
    
    const completedTasks = parseInt(orderData.completedOrders || 0) + 
                          parseInt(contractData.signedContracts || 0);

    const productivity = totalTasks > 0 ? (completedTasks / totalTasks) : 0;

    if (productivity >= 0.8) return 'HIGH';
    if (productivity >= 0.6) return 'MEDIUM';
    if (productivity >= 0.3) return 'LOW';
    return 'VERY_LOW';
  }

  getManagerTargets(managerId, dateFrom, dateTo) {
    // В реальной системе это может быть конфигурируемо или храниться в БД
    const daysDiff = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24));
    const monthlyTargets = {
      revenue: 250000, // 250к рублей в месяц
      orders: 30,      // 30 заказов в месяц
      contracts: 8     // 8 договоров в месяц
    };

    // Пропорциональное масштабирование по периоду
    const scaleFactor = daysDiff / 30;

    return {
      revenue: Math.round(monthlyTargets.revenue * scaleFactor),
      orders: Math.round(monthlyTargets.orders * scaleFactor),
      contracts: Math.round(monthlyTargets.contracts * scaleFactor),
      period: `${daysDiff} дней`
    };
  }

  // Get recent client interactions for relationship tracking
  async getRecentClientInteractions(managerId, dateFrom, dateTo, limit = 10) {
    try {
      const interactions = await prisma.$queryRaw`
        SELECT DISTINCT
          c.id as clientId,
          c.name as clientName,
          c.email as clientEmail,
          c.phone as clientPhone,
          MAX(o.createdAt) as lastOrderDate,
          MAX(ct.createdAt) as lastContractDate,
          MAX(d.updatedAt) as lastDialogueDate,
          COUNT(DISTINCT o.id) as totalOrders,
          COUNT(DISTINCT ct.id) as totalContracts,
          SUM(CASE WHEN o.status = 'COMPLETED' THEN o.totalAmount ELSE 0 END) as totalRevenue
        FROM Client c
        LEFT JOIN \`Order\` o ON c.id = o.clientId AND o.userId = ${managerId}
        LEFT JOIN Contract ct ON c.id = ct.clientId AND ct.userId = ${managerId}  
        LEFT JOIN Dialogue d ON c.id = d.clientId AND d.managerId = ${managerId}
        WHERE (
          o.createdAt >= ${new Date(dateFrom)} OR 
          ct.createdAt >= ${new Date(dateFrom)} OR 
          d.createdAt >= ${new Date(dateFrom)}
        )
        GROUP BY c.id, c.name, c.email, c.phone
        ORDER BY GREATEST(
          IFNULL(MAX(o.createdAt), '1970-01-01'),
          IFNULL(MAX(ct.createdAt), '1970-01-01'),
          IFNULL(MAX(d.updatedAt), '1970-01-01')
        ) DESC
        LIMIT ${limit}
      `;

      return interactions.map(interaction => ({
        clientId: interaction.clientId,
        clientName: interaction.clientName,
        clientEmail: interaction.clientEmail,
        clientPhone: interaction.clientPhone,
        lastContact: this.getLatestDate(
          interaction.lastOrderDate,
          interaction.lastContractDate,
          interaction.lastDialogueDate
        ),
        totalOrders: parseInt(interaction.totalOrders || 0),
        totalContracts: parseInt(interaction.totalContracts || 0),
        totalRevenue: parseFloat(interaction.totalRevenue || 0),
        relationshipStrength: this.calculateRelationshipStrength(interaction)
      }));

    } catch (error) {
      logger.error('Failed to get recent client interactions', { error: error.message, managerId });
      return [];
    }
  }

  // Calculate response time metrics
  async calculateResponseTime(managerId, dateFrom, dateTo) {
    try {
      const responseTimeData = await prisma.$queryRaw`
        SELECT 
          AVG(TIMESTAMPDIFF(MINUTE, 
            LAG(m.createdAt) OVER (PARTITION BY m.dialogueId ORDER BY m.createdAt),
            m.createdAt
          )) as avgResponseMinutes,
          MIN(TIMESTAMPDIFF(MINUTE, 
            LAG(m.createdAt) OVER (PARTITION BY m.dialogueId ORDER BY m.createdAt),
            m.createdAt
          )) as fastestResponseMinutes,
          MAX(TIMESTAMPDIFF(MINUTE, 
            LAG(m.createdAt) OVER (PARTITION BY m.dialogueId ORDER BY m.createdAt),
            m.createdAt
          )) as slowestResponseMinutes
        FROM Message m
        JOIN Dialogue d ON m.dialogueId = d.id
        WHERE d.managerId = ${managerId}
          AND m.senderId = ${managerId}
          AND m.createdAt >= ${new Date(dateFrom)}
          AND m.createdAt <= ${new Date(dateTo)}
      `;

      const data = responseTimeData[0] || {};
      
      return {
        avgResponseTime: parseFloat(data.avgResponseMinutes || 0),
        fastestResponse: parseFloat(data.fastestResponseMinutes || 0),
        slowestResponse: parseFloat(data.slowestResponseMinutes || 0),
        responseQuality: this.assessResponseQuality(parseFloat(data.avgResponseMinutes || 0))
      };

    } catch (error) {
      logger.error('Failed to calculate response time', { error: error.message, managerId });
      return { avgResponseTime: 0, fastestResponse: 0, slowestResponse: 0, responseQuality: 'UNKNOWN' };
    }
  }

  // Analyze message patterns for communication insights
  async analyzeMessagePatterns(managerId, dateFrom, dateTo) {
    try {
      const patternData = await prisma.$queryRaw`
        SELECT 
          HOUR(m.createdAt) as messageHour,
          DAYOFWEEK(m.createdAt) as dayOfWeek,
          COUNT(*) as messageCount,
          AVG(LENGTH(m.content)) as avgMessageLength,
          COUNT(CASE WHEN m.priority = 'HIGH' THEN 1 END) as highPriorityCount
        FROM Message m
        JOIN Dialogue d ON m.dialogueId = d.id
        WHERE d.managerId = ${managerId}
          AND m.senderId = ${managerId}
          AND m.createdAt >= ${new Date(dateFrom)}
          AND m.createdAt <= ${new Date(dateTo)}
        GROUP BY HOUR(m.createdAt), DAYOFWEEK(m.createdAt)
        ORDER BY messageCount DESC
      `;

      // Найти наиболее активные часы и дни
      const peakHour = patternData.reduce((peak, current) => 
        current.messageCount > (peak?.messageCount || 0) ? current : peak, null
      );

      const totalMessages = patternData.reduce((sum, pattern) => sum + parseInt(pattern.messageCount), 0);

      return {
        totalAnalyzed: totalMessages,
        peakActivity: {
          hour: peakHour?.messageHour || 9,
          dayOfWeek: peakHour?.dayOfWeek || 2, // Monday = 2
          messageCount: peakHour?.messageCount || 0
        },
        communicationStyle: {
          avgMessageLength: patternData.reduce((sum, p) => sum + parseFloat(p.avgMessageLength || 0), 0) / (patternData.length || 1),
          preferredTimes: patternData.slice(0, 3).map(p => ({ hour: p.messageHour, count: p.messageCount })),
          urgencyRate: totalMessages > 0 ? 
            (patternData.reduce((sum, p) => sum + parseInt(p.highPriorityCount || 0), 0) / totalMessages * 100).toFixed(1) 
            : 0
        }
      };

    } catch (error) {
      logger.error('Failed to analyze message patterns', { error: error.message, managerId });
      return { totalAnalyzed: 0, peakActivity: {}, communicationStyle: {} };
    }
  }

  // Get time distribution analysis
  async getTimeDistributionAnalysis(managerId, dateFrom, dateTo) {
    try {
      const timeData = await prisma.$queryRaw`
        SELECT 
          'orders' as activityType,
          DATE(createdAt) as activityDate,
          COUNT(*) as activityCount
        FROM \`Order\`
        WHERE userId = ${managerId}
          AND createdAt >= ${new Date(dateFrom)}
          AND createdAt <= ${new Date(dateTo)}
        GROUP BY DATE(createdAt)
        
        UNION ALL
        
        SELECT 
          'contracts' as activityType,
          DATE(createdAt) as activityDate,
          COUNT(*) as activityCount
        FROM Contract
        WHERE userId = ${managerId}
          AND createdAt >= ${new Date(dateFrom)}
          AND createdAt <= ${new Date(dateTo)}
        GROUP BY DATE(createdAt)
        
        UNION ALL
        
        SELECT 
          'calculations' as activityType,
          DATE(createdAt) as activityDate,
          COUNT(*) as activityCount
        FROM Calculation
        WHERE userId = ${managerId}
          AND createdAt >= ${new Date(dateFrom)}
          AND createdAt <= ${new Date(dateTo)}
        GROUP BY DATE(createdAt)
        
        ORDER BY activityDate DESC
      `;

      // Группировка по дням
      const dailyDistribution = {};
      timeData.forEach(item => {
        const date = item.activityDate.toISOString().split('T')[0];
        if (!dailyDistribution[date]) {
          dailyDistribution[date] = { orders: 0, contracts: 0, calculations: 0, total: 0 };
        }
        dailyDistribution[date][item.activityType] = parseInt(item.activityCount);
        dailyDistribution[date].total += parseInt(item.activityCount);
      });

      return {
        dailyBreakdown: Object.entries(dailyDistribution)
          .map(([date, activities]) => ({ date, ...activities }))
          .slice(0, 30), // Последние 30 дней
        summary: {
          totalActiveDays: Object.keys(dailyDistribution).length,
          avgActivitiesPerDay: Object.values(dailyDistribution).reduce((sum, day) => sum + day.total, 0) / (Object.keys(dailyDistribution).length || 1),
          mostActiveDay: Object.entries(dailyDistribution).reduce((max, [date, activities]) => 
            activities.total > (max?.activities?.total || 0) ? { date, activities } : max, null
          )
        }
      };

    } catch (error) {
      logger.error('Failed to get time distribution analysis', { error: error.message, managerId });
      return { dailyBreakdown: [], summary: {} };
    }
  }

  // Get efficiency metrics
  async getEfficiencyMetrics(managerId, dateFrom, dateTo) {
    try {
      const [taskMetrics, timeMetrics] = await Promise.all([
        // Метрики выполнения задач
        prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT o.id) as totalTasks,
            COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END) as completedTasks,
            AVG(CASE WHEN o.status = 'COMPLETED' THEN 
              TIMESTAMPDIFF(HOUR, o.createdAt, o.updatedAt) 
            END) as avgCompletionTime,
            MIN(CASE WHEN o.status = 'COMPLETED' THEN 
              TIMESTAMPDIFF(HOUR, o.createdAt, o.updatedAt) 
            END) as fastestCompletion,
            MAX(CASE WHEN o.status = 'COMPLETED' THEN 
              TIMESTAMPDIFF(HOUR, o.createdAt, o.updatedAt) 
            END) as slowestCompletion
          FROM \`Order\` o
          WHERE o.userId = ${managerId}
            AND o.createdAt >= ${new Date(dateFrom)}
            AND o.createdAt <= ${new Date(dateTo)}
        `,

        // Метрики времени ответа на сообщения
        this.calculateResponseTime(managerId, dateFrom, dateTo)
      ]);

      const taskData = taskMetrics[0] || {};
      const totalTasks = parseInt(taskData.totalTasks || 0);
      const completedTasks = parseInt(taskData.completedTasks || 0);

      return {
        taskEfficiency: {
          completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0,
          avgCompletionTime: parseFloat(taskData.avgCompletionTime || 0),
          fastestCompletion: parseFloat(taskData.fastestCompletion || 0),
          slowestCompletion: parseFloat(taskData.slowestCompletion || 0),
          efficiencyRating: this.calculateEfficiencyRating(totalTasks, completedTasks, parseFloat(taskData.avgCompletionTime || 0))
        },
        communicationEfficiency: {
          ...timeMetrics,
          rating: timeMetrics.responseQuality
        },
        overallEfficiency: this.calculateOverallEfficiency(
          totalTasks > 0 ? completedTasks / totalTasks : 0,
          timeMetrics.avgResponseTime
        )
      };

    } catch (error) {
      logger.error('Failed to get efficiency metrics', { error: error.message, managerId });
      return {
        taskEfficiency: { completionRate: 0, avgCompletionTime: 0, efficiencyRating: 'LOW' },
        communicationEfficiency: { avgResponseTime: 0, rating: 'UNKNOWN' },
        overallEfficiency: 'LOW'
      };
    }
  }

  // Get client feedback and satisfaction metrics
  async getClientFeedback(managerId, dateFrom, dateTo) {
    try {
      // В данном случае используем косвенные показатели удовлетворенности
      const feedbackData = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.name,
          COUNT(DISTINCT o.id) as totalOrders,
          COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END) as completedOrders,
          COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END) as cancelledOrders,
          MAX(o.createdAt) as lastOrderDate,
          COUNT(DISTINCT d.id) as dialogueCount,
          COUNT(CASE WHEN m.priority = 'URGENT' THEN 1 END) as urgentMessages
        FROM Client c
        LEFT JOIN \`Order\` o ON c.id = o.clientId AND o.userId = ${managerId}
        LEFT JOIN Dialogue d ON c.id = d.clientId AND d.managerId = ${managerId}
        LEFT JOIN Message m ON d.id = m.dialogueId
        WHERE (
          o.createdAt >= ${new Date(dateFrom)} OR 
          d.createdAt >= ${new Date(dateFrom)}
        )
        GROUP BY c.id, c.name
        HAVING COUNT(DISTINCT o.id) > 0
      `;

      const clientSatisfaction = feedbackData.map(client => {
        const completionRate = client.totalOrders > 0 ? (client.completedOrders / client.totalOrders) : 0;
        const cancellationRate = client.totalOrders > 0 ? (client.cancelledOrders / client.totalOrders) : 0;
        const urgencyRate = client.dialogueCount > 0 ? (client.urgentMessages / client.dialogueCount) : 0;

        return {
          clientId: client.id,
          clientName: client.name,
          satisfactionScore: this.calculateSatisfactionScore(completionRate, cancellationRate, urgencyRate),
          metrics: {
            completionRate: (completionRate * 100).toFixed(1),
            cancellationRate: (cancellationRate * 100).toFixed(1),
            urgencyRate: (urgencyRate * 100).toFixed(1),
            totalOrders: client.totalOrders,
            lastOrderDate: client.lastOrderDate
          }
        };
      });

      const avgSatisfaction = clientSatisfaction.length > 0 
        ? clientSatisfaction.reduce((sum, c) => sum + c.satisfactionScore, 0) / clientSatisfaction.length
        : 0;

      return {
        averageSatisfaction: parseFloat(avgSatisfaction.toFixed(1)),
        clientFeedback: clientSatisfaction,
        satisfactionDistribution: {
          high: clientSatisfaction.filter(c => c.satisfactionScore >= 80).length,
          medium: clientSatisfaction.filter(c => c.satisfactionScore >= 60 && c.satisfactionScore < 80).length,
          low: clientSatisfaction.filter(c => c.satisfactionScore < 60).length
        },
        totalClientsAnalyzed: clientSatisfaction.length
      };

    } catch (error) {
      logger.error('Failed to get client feedback', { error: error.message, managerId });
      return {
        averageSatisfaction: 0,
        clientFeedback: [],
        satisfactionDistribution: { high: 0, medium: 0, low: 0 },
        totalClientsAnalyzed: 0
      };
    }
  }

  // Helper methods for calculations and analysis
  getLatestDate(...dates) {
    const validDates = dates.filter(date => date && date !== '1970-01-01');
    if (validDates.length === 0) return null;
    return validDates.reduce((latest, current) => 
      new Date(current) > new Date(latest) ? current : latest
    );
  }

  calculateRelationshipStrength(interaction) {
    let strength = 50; // Base score
    
    // Активность заказов
    if (interaction.totalOrders > 0) strength += Math.min(interaction.totalOrders * 5, 25);
    
    // Контракты (более высокий вес)
    if (interaction.totalContracts > 0) strength += Math.min(interaction.totalContracts * 10, 30);
    
    // Доходность клиента
    if (interaction.totalRevenue > 50000) strength += 15;
    else if (interaction.totalRevenue > 10000) strength += 10;
    else if (interaction.totalRevenue > 0) strength += 5;
    
    return Math.min(strength, 100);
  }

  assessResponseQuality(avgResponseMinutes) {
    if (avgResponseMinutes <= 60) return 'EXCELLENT'; // 1 час
    if (avgResponseMinutes <= 240) return 'GOOD';     // 4 часа  
    if (avgResponseMinutes <= 480) return 'AVERAGE';  // 8 часов
    if (avgResponseMinutes <= 1440) return 'SLOW';    // 24 часа
    return 'VERY_SLOW';
  }

  calculateEfficiencyRating(totalTasks, completedTasks, avgCompletionTime) {
    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
    
    let rating = 0;
    
    // Оценка по проценту выполнения
    if (completionRate >= 0.9) rating += 40;
    else if (completionRate >= 0.8) rating += 35;
    else if (completionRate >= 0.7) rating += 30;
    else if (completionRate >= 0.6) rating += 25;
    else rating += completionRate * 40;
    
    // Оценка по времени выполнения (меньше = лучше)
    if (avgCompletionTime <= 24) rating += 30;      // 1 день
    else if (avgCompletionTime <= 72) rating += 25; // 3 дня
    else if (avgCompletionTime <= 168) rating += 20; // 1 неделя
    else rating += 10;
    
    // Объем работы
    if (totalTasks >= 20) rating += 30;
    else if (totalTasks >= 10) rating += 25;
    else if (totalTasks >= 5) rating += 20;
    else rating += totalTasks * 4;
    
    if (rating >= 85) return 'EXCELLENT';
    if (rating >= 70) return 'HIGH';
    if (rating >= 55) return 'MEDIUM';
    if (rating >= 40) return 'LOW';
    return 'VERY_LOW';
  }

  calculateOverallEfficiency(taskCompletionRate, avgResponseTime) {
    const taskScore = taskCompletionRate * 60;
    const responseScore = avgResponseTime <= 60 ? 40 : 
                         avgResponseTime <= 240 ? 30 :
                         avgResponseTime <= 480 ? 20 : 10;
    
    const totalScore = taskScore + responseScore;
    
    if (totalScore >= 85) return 'EXCELLENT';
    if (totalScore >= 70) return 'HIGH';
    if (totalScore >= 55) return 'MEDIUM';
    return 'LOW';
  }

  calculateSatisfactionScore(completionRate, cancellationRate, urgencyRate) {
    let score = 100;
    
    // Высокий процент выполнения = хорошо
    score += (completionRate - 0.8) * 50;
    
    // Высокий процент отмен = плохо
    score -= cancellationRate * 100;
    
    // Много срочных сообщений = могут быть проблемы
    score -= urgencyRate * 30;
    
    return Math.max(0, Math.min(100, score));
  }

  calculateOverallRating(performance, clientRelations, efficiency) {
    const performanceScore = this.getPerformanceScore(performance);
    const relationshipScore = clientRelations.relationshipScore || 0;
    const efficiencyScore = this.getEfficiencyScore(efficiency.overallEfficiency);
    
    const overallScore = (performanceScore * 0.4 + relationshipScore * 0.3 + efficiencyScore * 0.3);
    
    if (overallScore >= 80) return { rating: 'EXCELLENT', score: overallScore.toFixed(1) };
    if (overallScore >= 65) return { rating: 'HIGH', score: overallScore.toFixed(1) };
    if (overallScore >= 50) return { rating: 'MEDIUM', score: overallScore.toFixed(1) };
    if (overallScore >= 35) return { rating: 'LOW', score: overallScore.toFixed(1) };
    return { rating: 'VERY_LOW', score: overallScore.toFixed(1) };
  }

  generateRecommendations(performance, workload, efficiency) {
    const recommendations = [];
    
    // Анализ производительности
    if (performance.conversionRate < 15) {
      recommendations.push({
        type: 'PERFORMANCE',
        priority: 'HIGH',
        title: 'Низкая конверсия',
        description: `Конверсия ${performance.conversionRate}% ниже среднего. Рекомендуется проанализировать процесс продаж и качество лидов.`,
        actions: ['Пересмотреть скрипты продаж', 'Проанализировать качество лидов', 'Пройти дополнительное обучение']
      });
    }
    
    // Анализ нагрузки
    if (workload.overview.pendingTasks > workload.overview.completedTasks) {
      recommendations.push({
        type: 'WORKLOAD',
        priority: 'MEDIUM',
        title: 'Высокая нагрузка',
        description: `${workload.overview.pendingTasks} незавершенных задач. Необходимо оптимизировать рабочий процесс.`,
        actions: ['Приоритизировать задачи', 'Делегировать часть работы', 'Использовать инструменты автоматизации']
      });
    }
    
    // Анализ эффективности
    if (efficiency.overallEfficiency === 'LOW' || efficiency.overallEfficiency === 'VERY_LOW') {
      recommendations.push({
        type: 'EFFICIENCY',
        priority: 'HIGH',
        title: 'Низкая эффективность',
        description: 'Общая эффективность ниже нормы. Требуется анализ рабочих процессов.',
        actions: ['Оптимизировать время ответа', 'Улучшить процесс выполнения задач', 'Пересмотреть рабочие приоритеты']
      });
    }
    
    // Положительные рекомендации
    if (performance.conversionRate > 25) {
      recommendations.push({
        type: 'RECOGNITION',
        priority: 'LOW',
        title: 'Отличная конверсия',
        description: `Конверсия ${performance.conversionRate}% выше среднего. Отличная работа!`,
        actions: ['Поделиться опытом с коллегами', 'Документировать успешные практики', 'Рассмотреть повышение целей']
      });
    }
    
    return recommendations;
  }

  getPerformanceScore(performance) {
    let score = 0;
    
    // Конверсия (30 баллов)
    const conversionRate = parseFloat(performance.conversionRate || 0);
    if (conversionRate >= 30) score += 30;
    else if (conversionRate >= 20) score += 25;
    else if (conversionRate >= 15) score += 20;
    else score += conversionRate;
    
    // Доходность (40 баллов)
    const revenue = performance.totalRevenue || 0;
    if (revenue >= 500000) score += 40;
    else if (revenue >= 250000) score += 35;
    else if (revenue >= 100000) score += 25;
    else score += revenue / 5000;
    
    // Завершенность заказов (30 баллов)
    const completionRate = parseFloat(performance.orders.completionRate || 0);
    if (completionRate >= 90) score += 30;
    else if (completionRate >= 80) score += 25;
    else if (completionRate >= 70) score += 20;
    else score += completionRate * 0.3;
    
    return Math.min(100, score);
  }

  getEfficiencyScore(efficiencyRating) {
    switch (efficiencyRating) {
      case 'EXCELLENT': return 100;
      case 'HIGH': return 80;
      case 'MEDIUM': return 60;
      case 'LOW': return 40;
      default: return 20;
    }
  }

  // Empty fallback methods for error handling
  getEmptyPerformanceMetrics() {
    return {
      orders: { total: 0, completed: 0, cancelled: 0, avgValue: 0, completedRevenue: 0, completionRate: 0 },
      contracts: { total: 0, signed: 0, cancelled: 0, avgValue: 0, revenue: 0, signatureRate: 0 },
      calculations: 0,
      totalRevenue: 0,
      conversionRate: 0,
      productivity: 'LOW',
      targets: { revenue: 0, orders: 0, contracts: 0 }
    };
  }

  getEmptyClientInteractions() {
    return {
      clients: { total: 0, active: 0, new: 0, avgRevenue: 0, retentionRate: 0 },
      communication: { totalDialogues: 0, clientsWithDialogues: 0, totalMessages: 0, highPriorityMessages: 0, avgResolutionTime: 0, communicationRate: 0 },
      recentInteractions: [],
      relationshipScore: 0
    };
  }

  getEmptyDialogueActivity() {
    return {
      overview: { totalDialogues: 0, uniqueClients: 0, totalMessages: 0, sentMessages: 0, receivedMessages: 0, avgMessageLength: 0, responseRatio: 0 },
      priorities: { normal: 0, high: 0, urgent: 0 },
      responseTime: { avgResponseTime: 0, fastestResponse: 0, slowestResponse: 0, responseQuality: 'UNKNOWN' },
      patterns: { totalAnalyzed: 0, peakActivity: {}, communicationStyle: {} },
      efficiency: { dialoguesPerClient: 0, messagesPerDialogue: 0 }
    };
  }

  getEmptyWorkloadAnalysis() {
    return {
      overview: { totalTasks: 0, completedTasks: 0, pendingTasks: 0, tasksPerDay: 0, completionRate: 0 },
      breakdown: { orders: { total: 0, pending: 0 }, contracts: { total: 0, drafts: 0 }, calculations: { total: 0 }, dialogues: { total: 0, open: 0 }, clients: { total: 0 } },
      timeDistribution: { dailyBreakdown: [], summary: {} },
      workloadLevel: 'LOW',
      recommendations: []
    };
  }

  assessWorkloadLevel(totalTasks, daysPeriod) {
    if (daysPeriod === 0) return 'UNKNOWN';
    
    const tasksPerDay = totalTasks / daysPeriod;
    
    if (tasksPerDay >= 8) return 'VERY_HIGH';
    if (tasksPerDay >= 5) return 'HIGH';
    if (tasksPerDay >= 3) return 'MEDIUM';
    if (tasksPerDay >= 1) return 'LOW';
    return 'VERY_LOW';
  }

  generateWorkloadRecommendations(workload, totalTasks, daysPeriod) {
    const recommendations = [];
    const tasksPerDay = daysPeriod > 0 ? totalTasks / daysPeriod : 0;
    
    if (tasksPerDay > 6) {
      recommendations.push({
        type: 'WORKLOAD_HIGH',
        priority: 'HIGH',
        message: 'Высокая нагрузка: более 6 задач в день. Рассмотрите возможность делегирования или переприоритизации.',
        suggestion: 'Оптимизировать рабочий процесс'
      });
    }
    
    if (parseInt(workload.pendingOrders || 0) > 10) {
      recommendations.push({
        type: 'PENDING_ORDERS',
        priority: 'MEDIUM',
        message: 'Большое количество незавершенных заказов. Необходимо ускорить обработку.',
        suggestion: 'Проанализировать узкие места в процессе'
      });
    }
    
    if (parseInt(workload.openDialogues || 0) > 5) {
      recommendations.push({
        type: 'OPEN_DIALOGUES',
        priority: 'MEDIUM',
        message: 'Много открытых диалогов требуют внимания.',
        suggestion: 'Уделить время активной коммуникации с клиентами'
      });
    }
    
    return recommendations;
  }

  // Group helper methods for note analysis
  groupNotesByType(notes) {
    return notes.reduce((groups, note) => {
      groups[note.type] = (groups[note.type] || 0) + 1;
      return groups;
    }, {});
  }

  groupNotesByImportance(notes) {
    return notes.reduce((groups, note) => {
      groups[note.importance] = (groups[note.importance] || 0) + 1;
      return groups;
    }, {});
  }

  groupNotesByCategory(notes) {
    return notes.reduce((groups, note) => {
      groups[note.category] = (groups[note.category] || 0) + 1;
      return groups;
    }, {});
  }

  analyzeSentimentDistribution(notes) {
    const total = notes.length;
    const sentiments = notes.reduce((counts, note) => {
      counts[note.sentiment] = (counts[note.sentiment] || 0) + 1;
      return counts;
    }, {});

    return {
      positive: ((sentiments.POSITIVE || 0) / total * 100).toFixed(1),
      neutral: ((sentiments.NEUTRAL || 0) / total * 100).toFixed(1),
      negative: ((sentiments.NEGATIVE || 0) / total * 100).toFixed(1),
      total: total
    };
  }

  getCommonTags(notes) {
    const allTags = notes.flatMap(note => note.tags || []);
    const tagCounts = allTags.reduce((counts, tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }

  createNotesTimeline(notes) {
    const timeline = {};
    notes.forEach(note => {
      const date = new Date(note.noteDate).toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(note);
    });

    return Object.entries(timeline)
      .sort(([a], [b]) => new Date(b) - new Date(a))
      .slice(0, 14) // Last 2 weeks
      .map(([date, dayNotes]) => ({
        date,
        count: dayNotes.length,
        importantCount: dayNotes.filter(note => note.importance === 'HIGH').length,
        categories: [...new Set(dayNotes.map(note => note.category))]
      }));
  }
}

// Singleton instance
const managerAnalyticsService = new ManagerAnalyticsService();

module.exports = managerAnalyticsService;