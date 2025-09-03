const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, productCreateSchema, productUpdateSchema } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get all products with enhanced pagination
router.get('/', async (req, res, next) => {
  try {
    const { 
      search, 
      page = 1, 
      limit = 20, 
      sort = 'createdAt', 
      order = 'DESC',
      status,
      lowStock,
      supplier,
      priceRange
    } = req.query;

    // Validate and sanitize pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100); // Max 100 items per page
    const skip = (pageNum - 1) * limitNum;

    // Validate sort field
    const validSortFields = ['name', 'code', 'supplier', 'purchasePrice', 'minStock', 'currentStock', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sort) ? sort : 'createdAt';
    
    // Validate order
    const sortOrder = order.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    // Build where clause for search and filters
    let where = {};
    
    // Search across multiple fields
    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { code: { contains: searchTerm, mode: 'insensitive' } },
        { supplier: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { location: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    // Status filter (if we add status field to schema later)
    if (status) {
      where.status = status;
    }

    // Supplier filter
    if (supplier && supplier.trim()) {
      where.supplier = { contains: supplier.trim(), mode: 'insensitive' };
    }

    // Price range filter
    if (priceRange) {
      try {
        const range = JSON.parse(priceRange);
        if (range.min !== undefined || range.max !== undefined) {
          where.purchasePrice = {};
          if (range.min !== undefined && !isNaN(range.min)) {
            where.purchasePrice.gte = parseFloat(range.min);
          }
          if (range.max !== undefined && !isNaN(range.max)) {
            where.purchasePrice.lte = parseFloat(range.max);
          }
        }
      } catch (e) {
        // Invalid JSON, ignore price range filter
      }
    }

    // Execute queries in parallel for performance
    const [products, total, totalUnfiltered, suppliers] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: skip,
        take: limitNum,
        orderBy: sortField === 'currentStock' ? { createdAt: sortOrder } : { [sortField]: sortOrder },
        include: {
          warehouseItems: {
            select: { quantity: true }
          },
          _count: {
            select: { transactions: true }
          }
        }
      }),
      prisma.product.count({ where }),
      prisma.product.count(), // Total count without filters
      // Get unique suppliers for filter dropdown
      prisma.product.findMany({
        select: { supplier: true },
        distinct: ['supplier'],
        where: { supplier: { not: null } },
        orderBy: { supplier: 'asc' }
      })
    ]);

    // Add current stock to each product and apply stock-based filtering/sorting
    let productsWithStock = products.map(product => ({
      ...product,
      currentStock: product.warehouseItems[0]?.quantity || 0,
      lowStock: (product.warehouseItems[0]?.quantity || 0) <= product.minStock && product.minStock > 0,
      outOfStock: (product.warehouseItems[0]?.quantity || 0) === 0,
      warehouseItems: undefined // Remove from response
    }));

    // Apply low stock filter if requested
    if (lowStock === 'true') {
      productsWithStock = productsWithStock.filter(product => product.lowStock);
    }

    // Sort by current stock if requested (since we can't do this in Prisma query)
    if (sortField === 'currentStock') {
      productsWithStock.sort((a, b) => {
        return sortOrder === 'asc' ? 
          a.currentStock - b.currentStock : 
          b.currentStock - a.currentStock;
      });
    }

    // Calculate stock statistics
    const stockStats = {
      lowStockCount: productsWithStock.filter(p => p.lowStock).length,
      outOfStockCount: productsWithStock.filter(p => p.outOfStock).length,
      totalValue: productsWithStock.reduce((sum, p) => sum + (p.currentStock * p.purchasePrice), 0)
    };

    // Calculate pagination metadata
    const actualTotal = lowStock === 'true' ? productsWithStock.length : total;
    const totalPages = Math.ceil(actualTotal / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;
    const nextPage = hasNext ? pageNum + 1 : null;
    const prevPage = hasPrev ? pageNum - 1 : null;

    // If low stock filter is applied, we need to paginate the filtered results
    if (lowStock === 'true') {
      productsWithStock = productsWithStock.slice(skip, skip + limitNum);
    }

    res.json({
      products: productsWithStock,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: actualTotal,
        pages: totalPages,
        hasNext,
        hasPrev,
        nextPage,
        prevPage
      },
      meta: {
        search: search || null,
        sort: sortField,
        order: sortOrder.toUpperCase(),
        totalFiltered: actualTotal,
        totalUnfiltered,
        status: status || null,
        lowStock: lowStock === 'true',
        supplier: supplier || null,
        priceRange: priceRange || null
      },
      stockStats,
      suppliers: suppliers.map(s => s.supplier).filter(s => s)
    });
  } catch (error) {
    next(error);
  }
});

// Get product by ID
router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        warehouseItems: {
          select: { quantity: true }
        },
        transactions: {
          select: {
            id: true,
            type: true,
            quantity: true,
            reason: true,
            createdAt: true,
            user: {
              select: { name: true }
            },
            client: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Add current stock
    const productWithStock = {
      ...product,
      currentStock: product.warehouseItems[0]?.quantity || 0,
      warehouseItems: undefined
    };

    res.json(productWithStock);
  } catch (error) {
    next(error);
  }
});

// Create product
router.post('/', validate(productCreateSchema), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (prisma) => {
      // Create product
      const product = await prisma.product.create({
        data: req.body
      });

      // Create initial warehouse item with 0 quantity
      await prisma.warehouseItem.create({
        data: {
          productId: product.id,
          quantity: 0
        }
      });

      return product;
    });

    res.status(201).json({
      message: 'Product created successfully',
      product: result
    });
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', validate(productUpdateSchema), async (req, res, next) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    next(error);
  }
});

// Delete product
router.delete('/:id', async (req, res, next) => {
  try {
    // Check if product has transactions
    const transactionsCount = await prisma.transaction.count({
      where: { productId: req.params.id }
    });

    if (transactionsCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete product',
        message: `Product has ${transactionsCount} transactions. Cannot delete product with transaction history.`
      });
    }

    await prisma.product.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get low stock products
router.get('/alerts/low-stock', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        minStock: { gt: 0 }
      },
      include: {
        warehouseItems: {
          select: { quantity: true }
        }
      }
    });

    const lowStockProducts = products.filter(product => {
      const currentStock = product.warehouseItems[0]?.quantity || 0;
      return currentStock <= product.minStock;
    }).map(product => ({
      ...product,
      currentStock: product.warehouseItems[0]?.quantity || 0,
      lowStock: true,
      warehouseItems: undefined
    }));

    res.json({ products: lowStockProducts });
  } catch (error) {
    next(error);
  }
});

// Get product statistics
router.get('/:id/stats', async (req, res, next) => {
  try {
    const productId = req.params.id;

    const [product, transactions] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        include: {
          warehouseItems: {
            select: { quantity: true }
          }
        }
      }),
      prisma.transaction.findMany({
        where: { productId },
        include: {
          client: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentStock = product.warehouseItems[0]?.quantity || 0;
    const totalIncoming = transactions
      .filter(t => t.type === 'INCOMING')
      .reduce((sum, t) => sum + t.quantity, 0);
    const totalOutgoing = transactions
      .filter(t => t.type === 'OUTGOING')
      .reduce((sum, t) => sum + t.quantity, 0);

    const lastIncoming = transactions.find(t => t.type === 'INCOMING');
    const lastOutgoing = transactions.find(t => t.type === 'OUTGOING');

    const stockValue = currentStock * product.purchasePrice;
    const turnoverRate = totalIncoming > 0 ? totalOutgoing / totalIncoming : 0;

    res.json({
      currentStock,
      totalIncoming,
      totalOutgoing,
      stockValue,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      lowStock: currentStock <= product.minStock && product.minStock > 0,
      outOfStock: currentStock === 0,
      lastIncoming: lastIncoming?.createdAt,
      lastOutgoing: lastOutgoing?.createdAt,
      totalTransactions: transactions.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;