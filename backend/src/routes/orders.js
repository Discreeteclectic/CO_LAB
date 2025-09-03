const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate } = require('../middleware/validation');
const Joi = require('joi');

const router = express.Router();
const prisma = new PrismaClient();

// Схемы валидации
const orderCreateSchema = Joi.object({
  clientId: Joi.string().required(),
  orderDate: Joi.date().required(),
  notes: Joi.string().optional().allow('', null),
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().required(), // ID товара
      quantity: Joi.number().positive().required(),
      price: Joi.number().min(0).required()
    })
  ).min(1).required()
});

const orderUpdateSchema = Joi.object({
  clientId: Joi.string().optional(),
  orderDate: Joi.date().optional(),
  notes: Joi.string().optional().allow('', null),
  status: Joi.string().valid('CREATED', 'CALCULATION', 'PROPOSAL_SENT', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING', 'SHIPPED', 'CLOSED').optional(),
  calculationId: Joi.string().optional(),
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      quantity: Joi.number().positive().required(),
      price: Joi.number().min(0).required()
    })
  ).optional()
});

// Validation schema for calculation creation from order
const orderCalculationSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  gasCost: Joi.number().min(0).default(0),
  cylinderCost: Joi.number().min(0).default(0),
  preparationCost: Joi.number().min(0).default(0),
  logisticsCost: Joi.number().min(0).default(0),
  workersCost: Joi.number().min(0).default(0),
  kickbacksCost: Joi.number().min(0).default(0),
  pricePerUnit: Joi.number().min(0).optional(),
  quantity: Joi.number().min(0).optional(),
  sellingCompany: Joi.string().max(100).optional(),
  organizationINN: Joi.string().pattern(/^\d{9,12}$/).optional(),
  organizationName: Joi.string().max(200).optional(),
  responsibleManager: Joi.string().max(100).optional(),
  vatPercent: Joi.number().min(0).default(12),
  incomeTaxPercent: Joi.number().min(0).max(100).default(20)
});

// Validation schema for proposal response
const proposalResponseSchema = Joi.object({
  response: Joi.string().valid('ACCEPTED', 'REJECTED').required(),
  notes: Joi.string().max(1000).optional()
});

// Получить все заявки
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, status, dateFrom, dateTo, excludeClosed } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { number: { contains: search } },
        { client: { name: { contains: search } } },
        { client: { inn: { contains: search } } },
        { notes: { contains: search } },
        { totalAmount: { equals: parseFloat(search) || -1 } } // Поиск по сумме
      ];
    }

    // Логика фильтрации по статусу с учетом excludeClosed
    if (excludeClosed === 'true') {
      if (status && status !== 'CLOSED') {
        where.status = status;
      } else if (!status) {
        where.status = { not: 'CLOSED' };
      }
    } else if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.orderDate = {};
      if (dateFrom) {
        where.orderDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of day
        where.orderDate.lte = endDate;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true }
          },
          user: {
            select: { id: true, name: true }
          },
          items: {
            include: {
              product: {
                select: { name: true, unit: true }
              }
            }
          },
          _count: {
            select: { items: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.order.count({ where })
    ]);

    const pages = Math.ceil(total / limit);

    res.json({
      orders,
      pagination: {
        page,
        pages,
        total,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
});

// Получить заявку по ID
router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        user: {
          select: { id: true, name: true, email: true }
        },
        items: {
          include: {
            product: {
              select: { 
                id: true, 
                name: true, 
                unit: true, 
                code: true,
                warehouseItems: {
                  select: { quantity: true }
                }
              }
            }
          }
        },
        files: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
});

// Создать заявку
router.post('/', validate(orderCreateSchema), async (req, res, next) => {
  try {
    const { clientId, orderDate, notes, items } = req.body;
    const userId = req.user.id;

    // Генерируем номер заявки
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true }
    });

    let orderNumber = '1';
    if (lastOrder) {
      // Если номер старый формат (ORD-XXX), извлекаем номер
      if (lastOrder.number.startsWith('ORD-')) {
        const lastNumber = parseInt(lastOrder.number.split('-')[1]);
        orderNumber = String(lastNumber + 1);
      } else {
        // Новый формат - просто увеличиваем номер
        const lastNumber = parseInt(lastOrder.number);
        orderNumber = String(lastNumber + 1);
      }
    }

    // Проверяем наличие товаров на складе
    for (const item of items) {
      const warehouseItem = await prisma.warehouseItem.findUnique({
        where: { productId: item.id }
      });

      if (!warehouseItem || warehouseItem.quantity < item.quantity) {
        const product = await prisma.product.findUnique({
          where: { id: item.id },
          select: { name: true }
        });
        return res.status(400).json({
          error: `Недостаточно товара "${product?.name}" на складе. Доступно: ${warehouseItem?.quantity || 0}, запрашивается: ${item.quantity}`
        });
      }
    }

    // Вычисляем общую сумму
    let totalAmount = 0;
    const orderItemsData = items.map(item => {
      const total = item.quantity * item.price;
      totalAmount += total;
      return {
        productId: item.id,
        quantity: item.quantity,
        price: item.price,
        total
      };
    });

    // Создаем заявку в транзакции
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          number: orderNumber,
          userId,
          clientId,
          orderDate: new Date(orderDate),
          notes: notes || null,
          totalAmount,
          items: {
            create: orderItemsData
          }
        },
        include: {
          client: {
            select: { id: true, name: true }
          },
          user: {
            select: { id: true, name: true }
          },
          items: {
            include: {
              product: {
                select: { name: true, unit: true }
              }
            }
          },
          _count: {
            select: { items: true }
          }
        }
      });

      return newOrder;
    });

    res.status(201).json({
      message: 'Order created successfully',
      order
    });

  } catch (error) {
    next(error);
  }
});

// Обновить заявку
router.put('/:id', validate(orderUpdateSchema), async (req, res, next) => {
  try {
    const { clientId, orderDate, notes, status, items } = req.body;
    const orderId = req.params.id;

    // Проверяем существование заявки
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updateData = {};
    if (clientId) updateData.clientId = clientId;
    if (orderDate) updateData.orderDate = new Date(orderDate);
    if (notes !== undefined) updateData.notes = notes || null;
    if (status) updateData.status = status;

    // Если обновляются товары, пересчитываем сумму
    if (items) {
      let totalAmount = 0;
      const orderItemsData = items.map(item => {
        const total = item.quantity * item.price;
        totalAmount += total;
        return {
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
          total
        };
      });
      updateData.totalAmount = totalAmount;
    }

    const order = await prisma.$transaction(async (tx) => {
      // Если обновляются товары, удаляем старые и создаем новые
      if (items) {
        await tx.orderItem.deleteMany({
          where: { orderId }
        });

        await tx.orderItem.createMany({
          data: items.map(item => ({
            orderId,
            productId: item.id,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price
          }))
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
          client: {
            select: { id: true, name: true }
          },
          user: {
            select: { id: true, name: true }
          },
          items: {
            include: {
              product: {
                select: { name: true, unit: true }
              }
            }
          },
          _count: {
            select: { items: true }
          }
        }
      });

      return updatedOrder;
    });

    res.json({
      message: 'Order updated successfully',
      order
    });

  } catch (error) {
    next(error);
  }
});

// Удалить заявку
router.delete('/:id', async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await prisma.order.delete({
      where: { id: orderId }
    });

    res.json({ message: 'Order deleted successfully' });

  } catch (error) {
    next(error);
  }
});

// Helper function to validate workflow transitions
function validateStatusTransition(currentStatus, newStatus, hasCalculation = false) {
  const validTransitions = {
    'CREATED': ['CALCULATION'],
    'CALCULATION': hasCalculation ? ['PROPOSAL_SENT'] : [],
    'PROPOSAL_SENT': ['PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED'],
    'PROPOSAL_ACCEPTED': ['PAID', 'FOR_SHIPMENT_UNPAID'],
    'PROPOSAL_REJECTED': [], // Terminal state - can only be changed manually
    'PAID': ['PICKING'],
    'FOR_SHIPMENT_UNPAID': ['PICKING'],
    'PICKING': ['SHIPPED'],
    'SHIPPED': ['CLOSED'],
    'CLOSED': [] // Terminal state
  };

  const allowedStatuses = validTransitions[currentStatus] || [];
  return allowedStatuses.includes(newStatus);
}

// Get status transition requirements
function getStatusRequirements(newStatus) {
  const requirements = {
    'CALCULATION': { needsCalculation: false, description: 'Order ready for calculation creation' },
    'PROPOSAL_SENT': { needsCalculation: true, description: 'Order must have a calculation to send proposal' },
    'PROPOSAL_ACCEPTED': { needsCalculation: true, description: 'Proposal must be sent first' },
    'PROPOSAL_REJECTED': { needsCalculation: true, description: 'Proposal must be sent first' },
    'PAID': { needsCalculation: true, description: 'Proposal must be accepted first' },
    'FOR_SHIPMENT_UNPAID': { needsCalculation: true, description: 'Proposal must be accepted first' },
    'PICKING': { needsCalculation: true, description: 'Order must be paid or approved for unpaid shipment' },
    'SHIPPED': { needsCalculation: true, description: 'Order must be in picking status' },
    'CLOSED': { needsCalculation: true, description: 'Order must be shipped first' }
  };

  return requirements[newStatus] || { needsCalculation: false, description: 'No specific requirements' };
}

// Get valid transitions for a status
function getValidTransitions(currentStatus, hasCalculation = false) {
  const validTransitions = {
    'CREATED': ['CALCULATION'],
    'CALCULATION': hasCalculation ? ['PROPOSAL_SENT'] : [],
    'PROPOSAL_SENT': ['PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED'],
    'PROPOSAL_ACCEPTED': ['PAID', 'FOR_SHIPMENT_UNPAID'],
    'PROPOSAL_REJECTED': [], // Terminal state - can only be changed manually
    'PAID': ['PICKING'],
    'FOR_SHIPMENT_UNPAID': ['PICKING'],
    'PICKING': ['SHIPPED'],
    'SHIPPED': ['CLOSED'],
    'CLOSED': [] // Terminal state
  };

  return validTransitions[currentStatus] || [];
}

// Изменить статус заявки
router.patch('/:id/status', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status || !['CREATED', 'CALCULATION', 'PROPOSAL_SENT', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING', 'SHIPPED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        items: true,
        calculation: true
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Validate workflow transition
    const hasCalculation = !!existingOrder.calculation;
    if (!validateStatusTransition(existingOrder.status, status, hasCalculation)) {
      return res.status(400).json({ 
        error: 'Invalid status transition',
        message: `Cannot change status from ${existingOrder.status} to ${status}`,
        currentStatus: existingOrder.status,
        allowedStatuses: getValidTransitions(existingOrder.status, hasCalculation)
      });
    }

    // Check status requirements
    const requirements = getStatusRequirements(status);
    if (requirements.needsCalculation && !hasCalculation) {
      return res.status(400).json({
        error: 'Requirements not met',
        message: requirements.description,
        requirement: 'calculation'
      });
    }

    // При переходе в статус SHIPPED резервируем товары на складе
    if (status === 'SHIPPED' && existingOrder.status === 'PICKING') {
      await prisma.$transaction(async (tx) => {
        // Создаем транзакции списания для каждого товара
        for (const item of existingOrder.items) {
          await tx.transaction.create({
            data: {
              productId: item.productId,
              userId: req.user.id,
              type: 'SHIPMENT',
              quantity: -item.quantity, // Отрицательное значение для списания
              reason: `Отгрузка по заявке ${existingOrder.number}`
            }
          });

          // Обновляем количество на складе
          await tx.warehouseItem.update({
            where: { productId: item.productId },
            data: {
              quantity: { decrement: item.quantity }
            }
          });
        }

        // Обновляем статус заявки
        await tx.order.update({
          where: { id: orderId },
          data: { status }
        });
      });
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { status }
      });
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, unit: true } }
          }
        },
        _count: { select: { items: true } }
      }
    });

    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });

  } catch (error) {
    next(error);
  }
});

// Получить статистику заявок
router.get('/stats/overview', async (req, res, next) => {
  try {
    const [
      totalOrders,
      activeOrders,
      completedOrders,
      totalRevenue
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({
        where: {
          status: { in: ['CREATED', 'CALCULATION', 'PROPOSAL_SENT', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING', 'SHIPPED'] }
        }
      }),
      prisma.order.count({
        where: { status: 'CLOSED' }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: ['PROPOSAL_ACCEPTED', 'PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING', 'SHIPPED', 'CLOSED'] } }
      })
    ]);

    res.json({
      totalOrders,
      activeOrders,
      completedOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0
    });

  } catch (error) {
    next(error);
  }
});

// Получить заявки для склада (оплаченные и в отгрузку без оплаты)
router.get('/warehouse/pending', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: { in: ['PROPOSAL_ACCEPTED', 'PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING', 'SHIPPED'] } },
      include: {
        client: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ orders });

  } catch (error) {
    next(error);
  }
});

// Создать отгрузку
router.post('/:id/shipment', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { items, notes, fileIds } = req.body;
    const userId = req.user.id;

    // Проверяем существование заявки и её статус
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['PAID', 'FOR_SHIPMENT_UNPAID', 'PICKING'].includes(order.status)) {
      return res.status(400).json({ error: 'Order is not ready for shipment' });
    }

    if (order.shipment) {
      return res.status(400).json({ error: 'Order already has shipment data' });
    }

    // Создаём отгрузку в транзакции
    const shipment = await prisma.$transaction(async (tx) => {
      // Создаём отгрузку
      const newShipment = await tx.shipment.create({
        data: {
          orderId,
          userId,
          notes: notes || null
        }
      });

      // Создаём элементы отгрузки с серийными номерами
      for (const item of items) {
        const shipmentItem = await tx.shipmentItem.create({
          data: {
            shipmentId: newShipment.id,
            productId: item.productId,
            quantity: item.quantity
          }
        });

        // Создаём серийные номера
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          await tx.shipmentSerialNumber.createMany({
            data: item.serialNumbers.map(serialNumber => ({
              shipmentItemId: shipmentItem.id,
              serialNumber
            }))
          });
        }
      }

      // Привязываем файлы если есть
      if (fileIds && fileIds.length > 0) {
        await tx.shipmentFile.createMany({
          data: fileIds.map(fileId => ({
            shipmentId: newShipment.id,
            fileId
          }))
        });
      }

      // Обновляем статус заявки на SHIPPED
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'SHIPPED' }
      });

      return newShipment;
    });

    // Получаем полную отгрузку с данными
    const fullShipment = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      include: {
        items: {
          include: {
            product: { select: { name: true, unit: true } },
            serialNumbers: true
          }
        },
        files: true,
        user: { select: { name: true } }
      }
    });

    res.status(201).json({
      message: 'Shipment created successfully',
      shipment: fullShipment
    });

  } catch (error) {
    next(error);
  }
});

// Enhanced Order Management API Endpoints

// Create calculation for order
router.post('/:id/create-calculation', validate(orderCalculationSchema), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const calculationData = req.body;

    // Check if order exists and belongs to user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        client: true,
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow calculation creation for CREATED orders
    if (order.status !== 'CREATED') {
      return res.status(400).json({ error: 'Calculation can only be created for orders in CREATED status' });
    }

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

    // Create calculation with order relationship
    const result = await prisma.$transaction(async (tx) => {
      const profitabilityMetrics = calculateProfitabilityMetrics(calculationData);

      const calculation = await tx.calculation.create({
        data: {
          ...calculationData,
          ...profitabilityMetrics,
          userId,
          clientId: order.clientId,
          orderId: orderId,
          productName: calculationData.productName || order.items.map(item => item.product.name).join(', ')
        }
      });

      // Update order status and link to calculation
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CALCULATION',
          calculationId: calculation.id
        },
        include: {
          client: { select: { id: true, name: true } },
          calculation: true
        }
      });

      return { calculation, order: updatedOrder };
    });

    res.status(201).json({
      message: 'Calculation created successfully for order',
      calculation: result.calculation,
      order: result.order
    });

  } catch (error) {
    next(error);
  }
});

// Send КП to client (activates reminders)
router.post('/:id/send-proposal', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        client: true,
        calculation: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow proposal sending for orders with calculations
    if (!order.calculation) {
      return res.status(400).json({ error: 'Order must have a calculation before sending proposal' });
    }

    if (order.status !== 'CALCULATION') {
      return res.status(400).json({ error: 'Order must be in CALCULATION status to send proposal' });
    }

    // Import reminder service
    const reminderService = require('../services/reminderService');

    // Update order and calculation status, activate reminders
    const result = await prisma.$transaction(async (tx) => {
      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'PROPOSAL_SENT' }
      });

      // Update calculation status
      await tx.calculation.update({
        where: { id: order.calculation.id },
        data: {
          status: 'КП_ОТПРАВЛЕНО',
          sentDate: new Date(),
          reminderActive: true
        }
      });

      return updatedOrder;
    });

    // Create follow-up reminders
    const reminder = await reminderService.scheduleFollowUpReminders(
      order.calculation.id,
      userId
    );

    res.json({
      message: 'КП отправлено и напоминания активированы',
      order: result,
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

// Handle КП acceptance/rejection
router.put('/:id/proposal-response', validate(proposalResponseSchema), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const { response, notes } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        client: true,
        calculation: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (order.status !== 'PROPOSAL_SENT') {
      return res.status(400).json({ error: 'Order must be in PROPOSAL_SENT status' });
    }

    const newOrderStatus = response === 'ACCEPTED' ? 'PROPOSAL_ACCEPTED' : 'PROPOSAL_REJECTED';

    // Update order and calculation status
    const result = await prisma.$transaction(async (tx) => {
      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { 
          status: newOrderStatus,
          notes: notes ? (order.notes ? `${order.notes}\n\n[Ответ на КП]: ${notes}` : `[Ответ на КП]: ${notes}`) : order.notes
        },
        include: {
          client: { select: { id: true, name: true } },
          calculation: true
        }
      });

      // Update calculation status and deactivate reminders
      if (order.calculation) {
        await tx.calculation.update({
          where: { id: order.calculation.id },
          data: {
            status: response,
            reminderActive: false,
            nextReminderDate: null
          }
        });

        // Cancel active reminders
        await tx.reminder.updateMany({
          where: {
            relatedId: order.calculation.id,
            relatedType: 'CALCULATION',
            status: 'PENDING'
          },
          data: { status: 'CANCELLED' }
        });
      }

      return updatedOrder;
    });

    // Create completion notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        title: `КП по заявке ${order.number} ${response === 'ACCEPTED' ? 'принято' : 'отклонено'}`,
        content: `КП для заявки ${order.number} (клиент: ${order.client.name}) ${response === 'ACCEPTED' ? 'принято клиентом' : 'отклонено клиентом'}${notes ? `. Комментарий: ${notes}` : ''}`,
        relatedId: orderId,
        relatedType: 'ORDER'
      }
    });

    res.json({
      message: `КП ${response === 'ACCEPTED' ? 'принято' : 'отклонено'}`,
      order: result
    });

  } catch (error) {
    next(error);
  }
});

// Get order's calculation
router.get('/:id/calculation', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        calculation: {
          include: {
            items: true,
            files: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!order.calculation) {
      return res.status(404).json({ error: 'Order has no calculation' });
    }

    res.json({
      calculation: order.calculation
    });

  } catch (error) {
    next(error);
  }
});

// Create calculation copy
router.post('/:id/duplicate-calculation', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        calculation: {
          include: { items: true }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!order.calculation) {
      return res.status(400).json({ error: 'Order has no calculation to duplicate' });
    }

    // Create duplicate calculation
    const duplicateCalculation = await prisma.$transaction(async (tx) => {
      const original = order.calculation;
      
      const duplicate = await tx.calculation.create({
        data: {
          userId,
          clientId: original.clientId,
          orderId: orderId,
          name: `${original.name} (копия)`,
          brokerPercent: original.brokerPercent,
          transportCost: original.transportCost,
          certificationCost: original.certificationCost,
          customsCost: original.customsCost,
          vatPercent: original.vatPercent,
          quattroMargin: original.quattroMargin,
          gasCost: original.gasCost,
          cylinderCost: original.cylinderCost,
          preparationCost: original.preparationCost,
          logisticsCost: original.logisticsCost,
          workersCost: original.workersCost,
          kickbacksCost: original.kickbacksCost,
          productName: original.productName,
          pricePerUnit: original.pricePerUnit,
          quantity: original.quantity,
          totalSaleAmount: original.totalSaleAmount,
          sellingCompany: original.sellingCompany,
          organizationINN: original.organizationINN,
          organizationName: original.organizationName,
          responsibleManager: original.responsibleManager,
          totalCostBreakdown: original.totalCostBreakdown,
          grossProfit: original.grossProfit,
          vatAmount: original.vatAmount,
          incomeTaxAmount: original.incomeTaxAmount,
          netProfit: original.netProfit,
          profitabilityPercent: original.profitabilityPercent,
          totalCost: original.totalCost
        }
      });

      // Duplicate items if any
      if (original.items.length > 0) {
        await tx.calculationItem.createMany({
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
      calculation: duplicateCalculation
    });

  } catch (error) {
    next(error);
  }
});

// Get valid status transitions for an order
router.get('/:id/valid-transitions', async (req, res, next) => {
  try {
    const orderId = req.params.id;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { calculation: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const hasCalculation = !!order.calculation;
    const validTransitions = getValidTransitions(order.status, hasCalculation);
    const requirements = validTransitions.map(status => ({
      status,
      requirements: getStatusRequirements(status)
    }));

    res.json({
      currentStatus: order.status,
      hasCalculation,
      validTransitions,
      requirements,
      workflow: {
        canCreateCalculation: order.status === 'CREATED' && !hasCalculation,
        canSendProposal: order.status === 'CALCULATION' && hasCalculation,
        canRespondToProposal: order.status === 'PROPOSAL_SENT',
        canProceedToPayment: order.status === 'PROPOSAL_ACCEPTED',
        canProceedToPicking: ['PAID', 'FOR_SHIPMENT_UNPAID'].includes(order.status),
        canShip: order.status === 'PICKING',
        canClose: order.status === 'SHIPPED'
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get workflow status overview for manager workspace
router.get('/workflow/overview', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [
      ordersNeedingCalculation,
      ordersReadyForProposal,
      proposalsSent,
      proposalsAccepted,
      ordersInPicking,
      ordersReadyToShip
    ] = await Promise.all([
      prisma.order.count({
        where: { userId, status: 'CREATED' }
      }),
      prisma.order.count({
        where: { userId, status: 'CALCULATION', calculation: { isNot: null } }
      }),
      prisma.order.count({
        where: { userId, status: 'PROPOSAL_SENT' }
      }),
      prisma.order.count({
        where: { userId, status: 'PROPOSAL_ACCEPTED' }
      }),
      prisma.order.count({
        where: { userId, status: { in: ['PAID', 'FOR_SHIPMENT_UNPAID'] } }
      }),
      prisma.order.count({
        where: { userId, status: 'PICKING' }
      })
    ]);

    res.json({
      workflowStats: {
        ordersNeedingCalculation,
        ordersReadyForProposal,
        proposalsSent,
        proposalsAccepted,
        ordersInPicking,
        ordersReadyToShip
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;