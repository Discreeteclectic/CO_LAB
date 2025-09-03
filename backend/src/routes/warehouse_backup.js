const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, warehouseUpdateSchema, transactionCreateSchema } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get warehouse overview
router.get('/', async (req, res, next) => {
  try {
    const { search, lowStock, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    let where = {};
    
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { supplier: { contains: search } }
        ]
      };
    }

    const [warehouseItems, total] = await Promise.all([
      prisma.warehouseItem.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          product: true
        },
        orderBy: {
          product: { name: 'asc' }
        }
      }),
      prisma.warehouseItem.count({ where })
    ]);

    let filteredItems = warehouseItems;
    
    // Filter by low stock if requested
    if (lowStock === 'true') {
      filteredItems = warehouseItems.filter(item => 
        item.product.minStock > 0 && item.quantity <= item.product.minStock
      );
    }

    res.json({
      items: filteredItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: lowStock === 'true' ? filteredItems.length : total,
        pages: Math.ceil((lowStock === 'true' ? filteredItems.length : total) / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get warehouse statistics
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalItems,
      warehouseItems,
      recentTransactions
    ] = await Promise.all([
      prisma.product.count(),
      prisma.warehouseItem.findMany({
        include: { product: true }
      }),
      prisma.transaction.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      })
    ]);

    const totalQuantity = warehouseItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = warehouseItems.reduce((sum, item) => 
      sum + (item.quantity * item.product.purchasePrice), 0);
    const lowStockItems = warehouseItems.filter(item => 
      item.product.minStock > 0 && item.quantity <= item.product.minStock).length;

    res.json({
      totalItems,
      totalQuantity: Math.round(totalQuantity),
      totalValue: Math.round(totalValue),
      lowStockItems,
      recentTransactions
    });
  } catch (error) {
    next(error);
  }
});

// Create transaction (incoming/outgoing/inventory)
router.post('/transactions', validate(transactionCreateSchema), async (req, res, next) => {
  try {
    const { productId, type, quantity, reason, clientId, serialNumbers, serialNumberIds } = req.body;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (prisma) => {
      // Get current warehouse item
      const warehouseItem = await prisma.warehouseItem.findUnique({
        where: { productId },
        include: { product: true }
      });

      if (!warehouseItem) {
        throw new Error('Product not found in warehouse');
      }

      let newQuantity = warehouseItem.quantity;

      // Calculate new quantity based on transaction type
      switch (type) {
        case 'INCOMING':
          newQuantity += quantity;
          break;
        case 'OUTGOING':
          if (quantity > warehouseItem.quantity) {
            throw new Error(`Insufficient stock. Available: ${warehouseItem.quantity} ${warehouseItem.product.unit}`);
          }
          newQuantity -= quantity;
          break;
        case 'INVENTORY':
          newQuantity = quantity; // Set absolute quantity
          break;
        default:
          throw new Error('Invalid transaction type');
      }

      // Update warehouse quantity
      const updatedWarehouseItem = await prisma.warehouseItem.update({
        where: { productId },
        data: { quantity: newQuantity }
      });

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          productId,
          userId,
          clientId,
          type,
          quantity,
          reason
        },
        include: {
          product: {
            select: { name: true, unit: true }
          },
          user: {
            select: { name: true }
          },
          client: {
            select: { name: true }
          }
        }
      });

      return { transaction, updatedWarehouseItem };
    });

    res.status(201).json({
      message: 'Transaction completed successfully',
      transaction: result.transaction,
      newQuantity: result.updatedWarehouseItem.quantity
    });
  } catch (error) {
    next(error);
  }
});

// Get transactions for a product
router.get('/products/:productId/transactions', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { productId },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          user: {
            select: { name: true }
          },
          client: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.transaction.count({
        where: { productId }
      })
    ]);

    res.json({
      transactions,
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

// Get all recent transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const skip = (page - 1) * limit;

    const where = type ? { type } : {};

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          product: {
            select: { name: true, unit: true }
          },
          user: {
            select: { name: true }
          },
          client: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      transactions,
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

// Get warehouse item by product ID
router.get('/products/:productId', async (req, res, next) => {
  try {
    const warehouseItem = await prisma.warehouseItem.findUnique({
      where: { productId: req.params.productId },
      include: {
        product: true
      }
    });

    if (!warehouseItem) {
      return res.status(404).json({ error: 'Product not found in warehouse' });
    }

    res.json(warehouseItem);
  } catch (error) {
    next(error);
  }
});

// Manual quantity update (for corrections)
router.put('/products/:productId/quantity', validate(warehouseUpdateSchema), async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (prisma) => {
      const currentItem = await prisma.warehouseItem.findUnique({
        where: { productId },
        include: { product: true }
      });

      if (!currentItem) {
        throw new Error('Product not found in warehouse');
      }

      const difference = quantity - currentItem.quantity;

      // Update warehouse quantity
      const updatedItem = await prisma.warehouseItem.update({
        where: { productId },
        data: { quantity }
      });

      // Record as inventory adjustment
      await prisma.transaction.create({
        data: {
          productId,
          userId,
          type: 'INVENTORY',
          quantity: difference,
          reason: 'Manual quantity adjustment'
        }
      });

      return updatedItem;
    });

    res.json({
      message: 'Quantity updated successfully',
      warehouseItem: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;