const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, Joi } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/contracts - List contracts
router.get('/', async (req, res, next) => {
  try {
    const contracts = await prisma.contract.findMany({
      include: {
        client: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      contracts: contracts.map(contract => ({
        id: contract.id,
        contractNumber: contract.contractNumber,
        contractType: contract.contractType,
        status: contract.status,
        totalAmount: contract.totalAmount,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        client: contract.client,
        createdAt: contract.createdAt
      })),
      total: contracts.length
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/:id - Get contract by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json({ contract });

  } catch (error) {
    next(error);
  }
});

module.exports = router;