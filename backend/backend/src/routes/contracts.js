const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate } = require('../middleware/validation');
const Joi = require('joi');
const contractTemplatesService = require('../services/contractTemplates');

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const contractCreateSchema = Joi.object({
  clientId: Joi.string().required(),
  orderId: Joi.string().optional().allow(null),
  contractNumber: Joi.string().required(),
  contractDate: Joi.date().required(),
  signedDate: Joi.date().optional().allow(null),
  contractType: Joi.string().valid('SUPPLY', 'SERVICE', 'LEASE', 'PURCHASE', 'EXCHANGE', 'OTHER').required(),
  exchangeName: Joi.string().optional().allow('', null),
  exchangeType: Joi.string().optional().allow('', null),
  status: Joi.string().valid('DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED').optional(),
  totalAmount: Joi.number().min(0).optional(),
  currency: Joi.string().optional(),
  description: Joi.string().optional().allow('', null),
  terms: Joi.string().optional().allow('', null),
  conditions: Joi.string().optional().allow('', null),
  responsibleManager: Joi.string().optional().allow('', null),
  validFrom: Joi.date().required(),
  validTo: Joi.date().optional().allow(null),
  autoRenewal: Joi.boolean().optional(),
  metadata: Joi.string().optional().allow('', null)
});

const contractUpdateSchema = Joi.object({
  clientId: Joi.string().optional(),
  orderId: Joi.string().optional().allow(null),
  contractNumber: Joi.string().optional(),
  contractDate: Joi.date().optional(),
  signedDate: Joi.date().optional().allow(null),
  contractType: Joi.string().valid('SUPPLY', 'SERVICE', 'LEASE', 'PURCHASE', 'EXCHANGE', 'OTHER').optional(),
  exchangeName: Joi.string().optional().allow('', null),
  exchangeType: Joi.string().optional().allow('', null),
  status: Joi.string().valid('DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED').optional(),
  totalAmount: Joi.number().min(0).optional(),
  currency: Joi.string().optional(),
  description: Joi.string().optional().allow('', null),
  terms: Joi.string().optional().allow('', null),
  conditions: Joi.string().optional().allow('', null),
  responsibleManager: Joi.string().optional().allow('', null),
  validFrom: Joi.date().optional(),
  validTo: Joi.date().optional().allow(null),
  autoRenewal: Joi.boolean().optional(),
  metadata: Joi.string().optional().allow('', null)
});

// GET /api/contracts - List contracts with filtering
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, status, contractType, clientId, dateFrom, dateTo, excludeCompleted } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { contractNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { client: { inn: { contains: search, mode: 'insensitive' } } },
        { exchangeName: { contains: search, mode: 'insensitive' } },
        { responsibleManager: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (excludeCompleted === 'true') {
      if (status && status !== 'COMPLETED' && status !== 'CANCELLED') {
        where.status = status;
      } else if (!status) {
        where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
      }
    } else if (status) {
      where.status = status;
    }

    if (contractType) {
      where.contractType = contractType;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (dateFrom || dateTo) {
      where.contractDate = {};
      if (dateFrom) {
        where.contractDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.contractDate.lte = endDate;
      }
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, inn: true }
          },
          creator: {
            select: { id: true, name: true }
          },
          orders: {
            select: { id: true, number: true, status: true, totalAmount: true }
          },
          _count: {
            select: { files: true, orders: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.contract.count({ where })
    ]);

    const pages = Math.ceil(total / limit);

    res.json({
      contracts,
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

// POST /api/contracts - Create new contract
router.post('/', validate(contractCreateSchema), async (req, res, next) => {
  try {
    const contractData = { ...req.body };
    contractData.createdBy = req.user.id;

    // Check if contract number already exists
    const existingContract = await prisma.contract.findUnique({
      where: { contractNumber: contractData.contractNumber }
    });

    if (existingContract) {
      return res.status(400).json({ error: 'Contract number already exists' });
    }

    // Validate client exists
    const client = await prisma.client.findUnique({
      where: { id: contractData.clientId }
    });

    if (!client) {
      return res.status(400).json({ error: 'Client not found' });
    }

    // Validate order exists if provided
    if (contractData.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: contractData.orderId }
      });

      if (!order) {
        return res.status(400).json({ error: 'Order not found' });
      }

      // Check if order belongs to the same client
      if (order.clientId !== contractData.clientId) {
        return res.status(400).json({ error: 'Order does not belong to the specified client' });
      }
    }

    const contract = await prisma.contract.create({
      data: contractData,
      include: {
        client: {
          select: { id: true, name: true, inn: true }
        },
        creator: {
          select: { id: true, name: true }
        },
        orders: {
          select: { id: true, number: true, status: true, totalAmount: true }
        },
        _count: {
          select: { files: true, orders: true }
        }
      }
    });

    res.status(201).json({
      message: 'Contract created successfully',
      contract
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/:id - Get contract details
router.get('/:id', async (req, res, next) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        creator: {
          select: { id: true, name: true, email: true }
        },
        orders: {
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true, unit: true }
                }
              }
            }
          }
        },
        files: true
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Parse documentIds if it exists
    if (contract.documentIds) {
      try {
        contract.documentIds = JSON.parse(contract.documentIds);
      } catch (e) {
        contract.documentIds = [];
      }
    } else {
      contract.documentIds = [];
    }

    // Parse metadata if it exists
    if (contract.metadata) {
      try {
        contract.metadata = JSON.parse(contract.metadata);
      } catch (e) {
        contract.metadata = {};
      }
    } else {
      contract.metadata = {};
    }

    res.json(contract);
  } catch (error) {
    next(error);
  }
});

// PUT /api/contracts/:id - Update contract
router.put('/:id', validate(contractUpdateSchema), async (req, res, next) => {
  try {
    const contractId = req.params.id;
    const updateData = { ...req.body };

    // Check if contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id: contractId }
    });

    if (!existingContract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check contract number uniqueness if being updated
    if (updateData.contractNumber && updateData.contractNumber !== existingContract.contractNumber) {
      const duplicateContract = await prisma.contract.findUnique({
        where: { contractNumber: updateData.contractNumber }
      });

      if (duplicateContract) {
        return res.status(400).json({ error: 'Contract number already exists' });
      }
    }

    // Validate client exists if being updated
    if (updateData.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: updateData.clientId }
      });

      if (!client) {
        return res.status(400).json({ error: 'Client not found' });
      }
    }

    // Validate order exists if being updated
    if (updateData.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: updateData.orderId }
      });

      if (!order) {
        return res.status(400).json({ error: 'Order not found' });
      }

      const clientId = updateData.clientId || existingContract.clientId;
      if (order.clientId !== clientId) {
        return res.status(400).json({ error: 'Order does not belong to the specified client' });
      }
    }

    const contract = await prisma.contract.update({
      where: { id: contractId },
      data: updateData,
      include: {
        client: {
          select: { id: true, name: true, inn: true }
        },
        creator: {
          select: { id: true, name: true }
        },
        orders: {
          select: { id: true, number: true, status: true, totalAmount: true }
        },
        _count: {
          select: { files: true, orders: true }
        }
      }
    });

    res.json({
      message: 'Contract updated successfully',
      contract
    });

  } catch (error) {
    next(error);
  }
});

// DELETE /api/contracts/:id - Delete/cancel contract
router.delete('/:id', async (req, res, next) => {
  try {
    const contractId = req.params.id;

    const existingContract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { orders: true }
    });

    if (!existingContract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if contract has active orders
    const activeOrders = existingContract.orders.filter(order => 
      !['CLOSED', 'CANCELLED'].includes(order.status)
    );

    if (activeOrders.length > 0) {
      // Instead of deleting, mark as cancelled
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: 'CANCELLED' }
      });

      return res.json({ 
        message: 'Contract cancelled due to active orders',
        cancelled: true 
      });
    }

    await prisma.contract.delete({
      where: { id: contractId }
    });

    res.json({ message: 'Contract deleted successfully' });

  } catch (error) {
    next(error);
  }
});

// POST /api/contracts/:id/sign - Digital signature process
router.post('/:id/sign', async (req, res, next) => {
  try {
    const contractId = req.params.id;
    const { signedDate } = req.body;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status === 'SIGNED') {
      return res.status(400).json({ error: 'Contract is already signed' });
    }

    const updatedContract = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: 'SIGNED',
        signedDate: signedDate ? new Date(signedDate) : new Date()
      },
      include: {
        client: {
          select: { id: true, name: true, inn: true }
        },
        creator: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      message: 'Contract signed successfully',
      contract: updatedContract
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/contracts/:id/attach-document - Attach document
router.post('/:id/attach-document', async (req, res, next) => {
  try {
    const contractId = req.params.id;
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if file exists
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Update file to link to contract
    await prisma.file.update({
      where: { id: fileId },
      data: {
        relatedId: contractId,
        relatedType: 'CONTRACT'
      }
    });

    // Update contract's documentIds
    let documentIds = [];
    if (contract.documentIds) {
      try {
        documentIds = JSON.parse(contract.documentIds);
      } catch (e) {
        documentIds = [];
      }
    }

    if (!documentIds.includes(fileId)) {
      documentIds.push(fileId);
      
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          documentIds: JSON.stringify(documentIds)
        }
      });
    }

    res.json({ 
      message: 'Document attached to contract successfully',
      fileId 
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/:id/documents - Get contract documents
router.get('/:id/documents', async (req, res, next) => {
  try {
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        files: true
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json({
      documents: contract.files
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/contracts/from-order/:orderId - Create contract from order
router.post('/from-order/:orderId', async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const { contractData } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Generate contract number if not provided
    let contractNumber = contractData.contractNumber;
    if (!contractNumber) {
      const lastContract = await prisma.contract.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { contractNumber: true }
      });

      let nextNumber = 1;
      if (lastContract && lastContract.contractNumber.match(/\d+/)) {
        const match = lastContract.contractNumber.match(/(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      contractNumber = `DOG-${nextNumber.toString().padStart(4, '0')}`;
    }

    const newContractData = {
      clientId: order.clientId,
      orderId: orderId,
      contractNumber,
      contractDate: contractData.contractDate || new Date(),
      contractType: contractData.contractType || 'SUPPLY',
      status: 'DRAFT',
      totalAmount: order.totalAmount,
      currency: 'RUB',
      description: contractData.description || `Договор по заявке ${order.number}`,
      responsibleManager: contractData.responsibleManager,
      createdBy: req.user.id,
      validFrom: contractData.validFrom || new Date(),
      validTo: contractData.validTo,
      autoRenewal: contractData.autoRenewal || false,
      terms: contractData.terms,
      conditions: contractData.conditions,
      exchangeName: contractData.exchangeName,
      exchangeType: contractData.exchangeType
    };

    const contract = await prisma.$transaction(async (tx) => {
      const newContract = await tx.contract.create({
        data: newContractData,
        include: {
          client: {
            select: { id: true, name: true, inn: true }
          },
          creator: {
            select: { id: true, name: true }
          },
          orders: {
            select: { id: true, number: true, status: true, totalAmount: true }
          }
        }
      });

      // Update order to link to contract
      await tx.order.update({
        where: { id: orderId },
        data: { contractId: newContract.id }
      });

      return newContract;
    });

    res.status(201).json({
      message: 'Contract created from order successfully',
      contract
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/stats/overview - Contract statistics
router.get('/stats/overview', async (req, res, next) => {
  try {
    const [
      totalContracts,
      activeContracts,
      signedContracts,
      draftContracts,
      completedContracts,
      totalValue,
      contractsByType
    ] = await Promise.all([
      prisma.contract.count(),
      prisma.contract.count({
        where: { status: { in: ['ACTIVE', 'SIGNED'] } }
      }),
      prisma.contract.count({
        where: { status: 'SIGNED' }
      }),
      prisma.contract.count({
        where: { status: 'DRAFT' }
      }),
      prisma.contract.count({
        where: { status: 'COMPLETED' }
      }),
      prisma.contract.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: ['SIGNED', 'ACTIVE', 'COMPLETED'] } }
      }),
      prisma.contract.groupBy({
        by: ['contractType'],
        _count: {
          contractType: true
        }
      })
    ]);

    res.json({
      totalContracts,
      activeContracts,
      signedContracts,
      draftContracts,
      completedContracts,
      totalValue: totalValue._sum.totalAmount || 0,
      contractsByType
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/templates - Get available contract templates
router.get('/templates', async (req, res, next) => {
  try {
    const templates = contractTemplatesService.getAvailableTemplates();
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// POST /api/contracts/:id/generate-document - Generate contract document from template
router.post('/:id/generate-document', async (req, res, next) => {
  try {
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
        orders: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Generate contract document
    const orderData = contract.orders.length > 0 ? contract.orders[0] : null;
    const contractDocument = contractTemplatesService.generateContract(
      contract.contractType,
      contract,
      contract.client,
      orderData
    );

    // Save contract document
    const filePath = await contractTemplatesService.saveContractToFile(
      contractId, 
      contractDocument
    );

    res.json({
      message: 'Contract document generated successfully',
      document: contractDocument,
      filePath: filePath
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/contracts/:id/preview - Preview generated contract
router.get('/:id/preview', async (req, res, next) => {
  try {
    const contractId = req.params.id;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
        orders: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Generate preview
    const orderData = contract.orders.length > 0 ? contract.orders[0] : null;
    const contractPreview = contractTemplatesService.generateContract(
      contract.contractType,
      contract,
      contract.client,
      orderData
    );

    res.json({
      preview: contractPreview,
      contractType: contract.contractType,
      template: contractTemplatesService.getTemplate(contract.contractType)
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;