const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, clientCreateSchema, clientUpdateSchema } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get all clients
router.get('/', async (req, res, next) => {
  try {
    const { 
      search, 
      page = 1, 
      limit = 20, 
      sort = 'createdAt', 
      order = 'DESC',
      status
    } = req.query;

    // Validate and sanitize pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100); // Max 100 items per page
    const skip = (pageNum - 1) * limitNum;

    // Validate sort field
    const validSortFields = ['name', 'email', 'code', 'inn', 'contactPerson', 'phone', 'createdAt', 'updatedAt'];
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
        { inn: { contains: searchTerm, mode: 'insensitive' } },
        { contactPerson: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { telegram: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    // Status filter (if we add status field to schema later)
    if (status) {
      where.status = status;
    }

    // Execute queries in parallel for performance
    const [clients, total, totalUnfiltered] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: skip,
        take: limitNum,
        orderBy: { [sortField]: sortOrder },
        include: {
          _count: {
            select: { 
              calculations: true,
              transactions: true 
            }
          }
        }
      }),
      prisma.client.count({ where }),
      prisma.client.count() // Total count without filters
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;
    const nextPage = hasNext ? pageNum + 1 : null;
    const prevPage = hasPrev ? pageNum - 1 : null;

    res.json({
      clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
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
        totalFiltered: total,
        totalUnfiltered,
        status: status || null
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get client by ID
router.get('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        calculations: {
          select: {
            id: true,
            name: true,
            totalCost: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: { calculations: true, transactions: true }
        }
      }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    next(error);
  }
});

// Create client
router.post('/', validate(clientCreateSchema), async (req, res, next) => {
  try {
    const client = await prisma.client.create({
      data: req.body
    });

    res.status(201).json({
      message: 'Client created successfully',
      client
    });
  } catch (error) {
    next(error);
  }
});

// Update client
router.put('/:id', validate(clientUpdateSchema), async (req, res, next) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json({
      message: 'Client updated successfully',
      client
    });
  } catch (error) {
    next(error);
  }
});

// Delete client
router.delete('/:id', async (req, res, next) => {
  try {
    // Check if client has calculations
    const calculationsCount = await prisma.calculation.count({
      where: { clientId: req.params.id }
    });

    if (calculationsCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete client',
        message: `Client has ${calculationsCount} calculations. Delete calculations first or transfer them to another client.`
      });
    }

    await prisma.client.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get client statistics
router.get('/:id/stats', async (req, res, next) => {
  try {
    const clientId = req.params.id;

    const [calculations, transactions] = await Promise.all([
      prisma.calculation.findMany({
        where: { clientId },
        select: {
          totalCost: true,
          createdAt: true
        }
      }),
      prisma.transaction.findMany({
        where: { clientId, type: 'OUTGOING' },
        include: {
          product: {
            select: {
              name: true,
              purchasePrice: true
            }
          }
        }
      })
    ]);

    const totalCalculations = calculations.length;
    const totalCalculationValue = calculations.reduce((sum, calc) => sum + (calc.totalCost || 0), 0);
    const totalTransactions = transactions.length;
    const totalTransactionValue = transactions.reduce((sum, trans) => 
      sum + (trans.quantity * (trans.product?.purchasePrice || 0)), 0);

    res.json({
      totalCalculations,
      totalCalculationValue,
      totalTransactions,
      totalTransactionValue,
      lastCalculation: calculations[0]?.createdAt,
      lastTransaction: transactions[0]?.createdAt
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;