const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, calculationCreateSchema, calculationUpdateSchema } = require('../middleware/validation');
const reminderService = require('../services/reminderService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all calculations
router.get('/', async (req, res, next) => {
  try {
    const { clientId, search, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user.id;

    let where = { userId };

    if (clientId) {
      where.clientId = clientId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { client: { name: { contains: search } } },
        { client: { inn: { contains: search } } },
        { items: { some: { name: { contains: search } } } }
      ];
    }

    const [calculations, total] = await Promise.all([
      prisma.calculation.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          client: {
            select: { id: true, name: true }
          },
          items: {
            select: { name: true, finalPrice: true }
          },
          _count: {
            select: { items: true, files: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.calculation.count({ where })
    ]);

    res.json({
      calculations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get calculation by ID
router.get('/:id', async (req, res, next) => {
  try {
    const calculation = await prisma.calculation.findUnique({
      where: { 
        id: req.params.id,
        userId: req.user.id // Ensure user can only access their calculations
      },
      include: {
        client: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, unit: true }
            }
          }
        },
        files: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    res.json(calculation);
  } catch (error) {
    next(error);
  }
});

// Helper function to calculate profitability metrics
function calculateProfitabilityMetrics(data) {
  const {
    gasCost = 0,
    cylinderCost = 0,
    preparationCost = 0,
    logisticsCost = 0,
    workersCost = 0,
    kickbacksCost = 0,
    pricePerUnit = 0,
    quantity = 0,
    vatPercent = 12,
    incomeTaxPercent = 20
  } = data;

  // Calculate totals according to customer requirements
  const totalCostBreakdown = gasCost + cylinderCost + preparationCost + logisticsCost + workersCost + kickbacksCost;
  const totalSaleAmount = pricePerUnit * quantity;
  const grossProfit = totalSaleAmount - totalCostBreakdown;
  const vatAmount = grossProfit * (vatPercent / 100);
  const incomeTaxAmount = grossProfit * (incomeTaxPercent / 100);
  const netProfit = grossProfit - vatAmount - incomeTaxAmount;
  const profitabilityPercent = totalCostBreakdown > 0 ? (netProfit / totalCostBreakdown) * 100 : 0;

  return {
    totalCostBreakdown,
    totalSaleAmount,
    grossProfit,
    vatAmount,
    incomeTaxAmount,
    netProfit,
    profitabilityPercent
  };
}

// Create calculation
router.post('/', validate(calculationCreateSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { items, ...calculationData } = req.body;

    const result = await prisma.$transaction(async (prisma) => {
      let totalCost = 0;
      let processedItems = [];

      // Handle legacy items-based calculation for backward compatibility
      if (items && items.length > 0) {
        // Calculate totals using legacy algorithm
        const totalBaseCost = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
        
        // Calculate each item's final price based on the legacy algorithm
        processedItems = items.map(item => {
          const itemShare = (item.cost * item.quantity) / totalBaseCost;
          const itemTransport = calculationData.transportCost * itemShare;
          
          const brokerFee = (item.cost + itemTransport / item.quantity) * (calculationData.brokerPercent / 100) * item.quantity;
          const dutyAmount = (item.cost + itemTransport / item.quantity + brokerFee / item.quantity) * (item.duty / 100) * item.quantity;
          const itemCertification = calculationData.certificationCost * itemShare;
          const itemCustoms = calculationData.customsCost * itemShare;
          
          const itemTotalCost = (item.cost * item.quantity) + itemTransport + brokerFee + dutyAmount + itemCertification + itemCustoms;
          const vatAmount = itemTotalCost * (calculationData.vatPercent / 100);
          const costWithVat = itemTotalCost + vatAmount;
          const quattroMarginAmount = costWithVat * (calculationData.quattroMargin / 100);
          const finalPrice = costWithVat + quattroMarginAmount;
          
          return {
            ...item,
            finalPrice: finalPrice
          };
        });

        totalCost = processedItems.reduce((sum, item) => sum + item.finalPrice, 0);
      }

      // Calculate new profitability metrics
      const profitabilityMetrics = calculateProfitabilityMetrics(calculationData);

      // Create calculation
      const calculation = await prisma.calculation.create({
        data: {
          ...calculationData,
          ...profitabilityMetrics,
          userId,
          totalCost
        }
      });

      // Create calculation items if they exist (legacy support)
      if (processedItems.length > 0) {
        await prisma.calculationItem.createMany({
          data: processedItems.map(item => ({
            calculationId: calculation.id,
            productId: item.productId || null,
            name: item.name,
            cost: item.cost,
            duty: item.duty,
            quantity: item.quantity,
            finalPrice: item.finalPrice
          }))
        });
      }

      return calculation;
    });

    res.status(201).json({
      message: 'Calculation created successfully',
      calculation: result
    });
  } catch (error) {
    next(error);
  }
});

// Update calculation
router.put('/:id', validate(calculationUpdateSchema), async (req, res, next) => {
  try {
    const calculationId = req.params.id;
    const userId = req.user.id;
    const { items, ...calculationData } = req.body;

    const result = await prisma.$transaction(async (prisma) => {
      // Verify ownership
      const existingCalculation = await prisma.calculation.findUnique({
        where: { id: calculationId, userId }
      });

      if (!existingCalculation) {
        throw new Error('Calculation not found');
      }

      // Recalculate if items are provided (legacy support)
      let totalCost = existingCalculation.totalCost;
      
      if (items) {
        const totalBaseCost = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
        
        const processedItems = items.map(item => {
          const itemShare = (item.cost * item.quantity) / totalBaseCost;
          const itemTransport = (calculationData.transportCost || existingCalculation.transportCost) * itemShare;
          
          const brokerFee = (item.cost + itemTransport / item.quantity) * ((calculationData.brokerPercent || existingCalculation.brokerPercent) / 100) * item.quantity;
          const dutyAmount = (item.cost + itemTransport / item.quantity + brokerFee / item.quantity) * (item.duty / 100) * item.quantity;
          const itemCertification = (calculationData.certificationCost || existingCalculation.certificationCost) * itemShare;
          const itemCustoms = (calculationData.customsCost || existingCalculation.customsCost) * itemShare;
          
          const itemTotalCost = (item.cost * item.quantity) + itemTransport + brokerFee + dutyAmount + itemCertification + itemCustoms;
          const vatAmount = itemTotalCost * ((calculationData.vatPercent || existingCalculation.vatPercent) / 100);
          const costWithVat = itemTotalCost + vatAmount;
          const quattroMarginAmount = costWithVat * ((calculationData.quattroMargin || existingCalculation.quattroMargin) / 100);
          const finalPrice = costWithVat + quattroMarginAmount;
          
          return {
            ...item,
            finalPrice: finalPrice
          };
        });

        totalCost = processedItems.reduce((sum, item) => sum + item.finalPrice, 0);

        // Delete existing items
        await prisma.calculationItem.deleteMany({
          where: { calculationId }
        });

        // Create new items
        await prisma.calculationItem.createMany({
          data: processedItems.map(item => ({
            calculationId,
            productId: item.productId || null,
            name: item.name,
            cost: item.cost,
            duty: item.duty,
            quantity: item.quantity,
            finalPrice: item.finalPrice
          }))
        });
      }

      // Merge existing and new data for profitability calculations
      const mergedData = {
        ...existingCalculation,
        ...calculationData
      };

      // Calculate new profitability metrics
      const profitabilityMetrics = calculateProfitabilityMetrics(mergedData);

      // Update calculation
      const calculation = await prisma.calculation.update({
        where: { id: calculationId },
        data: {
          ...calculationData,
          ...profitabilityMetrics,
          totalCost
        }
      });

      return calculation;
    });

    res.json({
      message: 'Calculation updated successfully',
      calculation: result
    });
  } catch (error) {
    next(error);
  }
});

// Delete calculation
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.calculation.delete({
      where: { 
        id: req.params.id,
        userId: req.user.id
      }
    });

    res.json({ message: 'Calculation deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Duplicate calculation
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const originalId = req.params.id;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (prisma) => {
      // Get original calculation with items
      const original = await prisma.calculation.findUnique({
        where: { id: originalId, userId },
        include: { items: true }
      });

      if (!original) {
        throw new Error('Original calculation not found');
      }

      // Create duplicate calculation
      const duplicate = await prisma.calculation.create({
        data: {
          userId,
          clientId: original.clientId,
          name: `${original.name} (копия)`,
          brokerPercent: original.brokerPercent,
          transportCost: original.transportCost,
          certificationCost: original.certificationCost,
          customsCost: original.customsCost,
          vatPercent: original.vatPercent,
          quattroMargin: original.quattroMargin,
          totalCost: original.totalCost
        }
      });

      // Duplicate items
      if (original.items.length > 0) {
        await prisma.calculationItem.createMany({
          data: original.items.map(item => ({
            calculationId: duplicate.id,
            productId: item.productId,
            name: item.name,
            cost: item.cost,
            duty: item.duty,
            quantity: item.quantity,
            finalPrice: item.finalPrice
          }))
        });
      }

      return duplicate;
    });

    res.status(201).json({
      message: 'Calculation duplicated successfully',
      calculation: result
    });
  } catch (error) {
    next(error);
  }
});

// Get calculation statistics
router.get('/stats/overview', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [
      totalCalculations,
      totalValue,
      recentCalculations,
      topClients
    ] = await Promise.all([
      prisma.calculation.count({ where: { userId } }),
      
      prisma.calculation.aggregate({
        where: { userId },
        _sum: { totalCost: true }
      }),
      
      prisma.calculation.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      }),

      prisma.calculation.groupBy({
        by: ['clientId'],
        where: { 
          userId,
          clientId: { not: null }
        },
        _count: { clientId: true },
        _sum: { totalCost: true },
        orderBy: { _count: { clientId: 'desc' } },
        take: 5
      })
    ]);

    // Get client names for top clients
    const clientIds = topClients.map(tc => tc.clientId).filter(Boolean);
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true }
    });

    const topClientsWithNames = topClients.map(tc => ({
      ...tc,
      clientName: clients.find(c => c.id === tc.clientId)?.name || 'Unknown'
    }));

    res.json({
      totalCalculations,
      totalValue: totalValue._sum.totalCost || 0,
      recentCalculations,
      topClients: topClientsWithNames
    });
  } catch (error) {
    next(error);
  }
});

// Export calculation data (for Excel)
router.get('/:id/export', async (req, res, next) => {
  try {
    const calculation = await prisma.calculation.findUnique({
      where: { 
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        client: true,
        items: true,
        user: {
          select: { name: true, email: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    // Format data for Excel export
    const exportData = {
      calculation: {
        id: calculation.id,
        name: calculation.name,
        client: calculation.client?.name,
        createdAt: calculation.createdAt,
        createdBy: calculation.user.name,
        
        // Company information
        sellingCompany: calculation.sellingCompany,
        organizationINN: calculation.organizationINN,
        organizationName: calculation.organizationName,
        responsibleManager: calculation.responsibleManager,
        
        // Sales information
        productName: calculation.productName,
        pricePerUnit: calculation.pricePerUnit,
        quantity: calculation.quantity,
        totalSaleAmount: calculation.totalSaleAmount,
        
        // Legacy parameters for backward compatibility
        parameters: {
          brokerPercent: calculation.brokerPercent,
          transportCost: calculation.transportCost,
          certificationCost: calculation.certificationCost,
          customsCost: calculation.customsCost,
          vatPercent: calculation.vatPercent,
          quattroMargin: calculation.quattroMargin
        }
      },
      
      // Detailed cost breakdown
      costBreakdown: {
        gasCost: calculation.gasCost || 0,
        cylinderCost: calculation.cylinderCost || 0,
        preparationCost: calculation.preparationCost || 0,
        logisticsCost: calculation.logisticsCost || 0,
        workersCost: calculation.workersCost || 0,
        kickbacksCost: calculation.kickbacksCost || 0,
        totalCostBreakdown: calculation.totalCostBreakdown || 0
      },
      
      // Profitability analysis
      profitability: {
        grossProfit: calculation.grossProfit || 0,
        vatAmount: calculation.vatAmount || 0,
        incomeTaxAmount: calculation.incomeTaxAmount || 0,
        netProfit: calculation.netProfit || 0,
        profitabilityPercent: calculation.profitabilityPercent || 0
      },
      
      // Legacy items for backward compatibility
      items: calculation.items.map(item => ({
        name: item.name,
        cost: item.cost,
        duty: item.duty,
        quantity: item.quantity,
        finalPrice: item.finalPrice
      })),
      
      totals: {
        totalBaseCost: calculation.items.reduce((sum, item) => sum + (item.cost * item.quantity), 0),
        totalFinalPrice: calculation.totalCost
      }
    };

    res.json(exportData);
  } catch (error) {
    next(error);
  }
});

// Calculate profitability analysis endpoint
router.post('/profitability-analysis', validate(calculationCreateSchema), async (req, res, next) => {
  try {
    const {
      gasCost = 0,
      cylinderCost = 0,
      preparationCost = 0,
      logisticsCost = 0,
      workersCost = 0,
      kickbacksCost = 0,
      pricePerUnit = 0,
      quantity = 0,
      vatPercent = 12,
      incomeTaxPercent = 20
    } = req.body;

    // Calculate profitability metrics without saving to database
    const profitabilityMetrics = calculateProfitabilityMetrics(req.body);

    // Add additional analysis
    const analysis = {
      ...profitabilityMetrics,
      costStructure: {
        gasCost: { amount: gasCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (gasCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 },
        cylinderCost: { amount: cylinderCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (cylinderCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 },
        preparationCost: { amount: preparationCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (preparationCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 },
        logisticsCost: { amount: logisticsCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (logisticsCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 },
        workersCost: { amount: workersCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (workersCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 },
        kickbacksCost: { amount: kickbacksCost, percentage: profitabilityMetrics.totalCostBreakdown > 0 ? (kickbacksCost / profitabilityMetrics.totalCostBreakdown) * 100 : 0 }
      },
      margins: {
        grossMarginPercent: profitabilityMetrics.totalSaleAmount > 0 ? (profitabilityMetrics.grossProfit / profitabilityMetrics.totalSaleAmount) * 100 : 0,
        netMarginPercent: profitabilityMetrics.totalSaleAmount > 0 ? (profitabilityMetrics.netProfit / profitabilityMetrics.totalSaleAmount) * 100 : 0
      },
      breakEvenAnalysis: {
        breakEvenQuantity: pricePerUnit > 0 ? profitabilityMetrics.totalCostBreakdown / pricePerUnit : 0,
        currentQuantity: quantity,
        profitPerUnit: pricePerUnit > 0 ? profitabilityMetrics.netProfit / quantity : 0
      }
    };

    res.json({
      analysis,
      inputs: {
        costBreakdown: { gasCost, cylinderCost, preparationCost, logisticsCost, workersCost, kickbacksCost },
        sales: { pricePerUnit, quantity },
        taxes: { vatPercent, incomeTaxPercent }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Send calculation as КП (commercial proposal) and activate reminders
router.post('/:id/send-proposal', async (req, res, next) => {
  try {
    const calculationId = req.params.id;
    const userId = req.user.id;

    // Verify calculation belongs to user
    const calculation = await prisma.calculation.findUnique({
      where: { 
        id: calculationId, 
        userId 
      },
      include: {
        client: {
          select: { id: true, name: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    if (calculation.status === 'КП_ОТПРАВЛЕНО') {
      return res.status(400).json({ 
        error: 'КП уже отправлено для этого расчета',
        sentDate: calculation.sentDate 
      });
    }

    // Create follow-up reminders
    const reminder = await reminderService.scheduleFollowUpReminders(
      calculationId,
      userId
    );

    // The reminder service already updates the calculation status
    // Get updated calculation
    const updatedCalculation = await prisma.calculation.findUnique({
      where: { id: calculationId },
      include: {
        client: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      message: 'КП отправлено и напоминания активированы',
      calculation: updatedCalculation,
      reminder: {
        id: reminder.id,
        nextReminderDate: reminder.scheduledDate,
        frequency: reminder.frequency
      }
    });

  } catch (error) {
    next(error);
  }
});

// Complete КП follow-up (client responded or deal closed)
router.post('/:id/complete-follow-up', async (req, res, next) => {
  try {
    const calculationId = req.params.id;
    const userId = req.user.id;
    const { status, notes } = req.body; // status: ACCEPTED, REJECTED

    // Verify calculation belongs to user
    const calculation = await prisma.calculation.findUnique({
      where: { 
        id: calculationId, 
        userId 
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    // Update calculation status and deactivate reminders
    const updatedCalculation = await prisma.calculation.update({
      where: { id: calculationId },
      data: {
        status: status || 'COMPLETED',
        reminderActive: false,
        nextReminderDate: null
      }
    });

    // Cancel any active reminders for this calculation
    const activeReminders = await prisma.reminder.findMany({
      where: {
        relatedId: calculationId,
        relatedType: 'CALCULATION',
        status: 'PENDING'
      }
    });

    for (const reminder of activeReminders) {
      await reminderService.cancelReminder(reminder.id, userId);
    }

    // Create a completion notification
    const clientName = calculation.client?.name || 'Клиент';
    await prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        title: `КП "${calculation.name}" завершено`,
        content: `КП для клиента ${clientName} завершено со статусом: ${status || 'COMPLETED'}${notes ? `. Заметки: ${notes}` : ''}`,
        relatedId: calculationId,
        relatedType: 'CALCULATION'
      }
    });

    res.json({
      message: 'Отслеживание КП завершено',
      calculation: updatedCalculation,
      cancelledReminders: activeReminders.length
    });

  } catch (error) {
    next(error);
  }
});

// Get КП tracking status
router.get('/:id/tracking-status', async (req, res, next) => {
  try {
    const calculationId = req.params.id;
    const userId = req.user.id;

    const calculation = await prisma.calculation.findUnique({
      where: { 
        id: calculationId, 
        userId 
      },
      include: {
        reminders: {
          where: {
            status: { in: ['PENDING', 'SENT'] }
          },
          orderBy: {
            scheduledDate: 'asc'
          }
        },
        client: {
          select: { id: true, name: true }
        }
      }
    });

    if (!calculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    const trackingInfo = {
      calculation: {
        id: calculation.id,
        name: calculation.name,
        status: calculation.status,
        sentDate: calculation.sentDate,
        reminderActive: calculation.reminderActive,
        nextReminderDate: calculation.nextReminderDate,
        client: calculation.client
      },
      activeReminders: calculation.reminders.map(reminder => ({
        id: reminder.id,
        title: reminder.title,
        reminderType: reminder.reminderType,
        scheduledDate: reminder.scheduledDate,
        sentCount: reminder.sentCount,
        maxReminders: reminder.maxReminders,
        status: reminder.status
      }))
    };

    res.json(trackingInfo);

  } catch (error) {
    next(error);
  }
});

module.exports = router;