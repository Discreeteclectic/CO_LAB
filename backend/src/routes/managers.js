const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');
const { logger, logWithContext, logBusinessEvent } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/managers/workspace - Get current manager's workspace data
router.get('/workspace', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Find the manager record for the current user
    const manager = await prisma.manager.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true }
        },
        managerClients: {
          where: { isActive: true },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                code: true,
                inn: true,
                contactPerson: true,
                phone: true,
                email: true,
                createdAt: true,
                updatedAt: true
              }
            }
          },
          orderBy: { assignedAt: 'desc' }
        },
        dialogues: {
          where: { status: 'ACTIVE' },
          include: {
            client: {
              select: { id: true, name: true }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                content: true,
                createdAt: true,
                type: true
              }
            }
          },
          orderBy: { lastMessageAt: 'desc' }
        }
      }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Manager profile not found' });
    }

    // Get performance stats
    const totalClients = manager.managerClients.length;
    const activeDialogues = manager.dialogues.length;
    
    // Get recent activity stats
    const recentOrders = await prisma.order.count({
      where: {
        client: {
          managerClients: {
            some: {
              managerId: manager.id,
              isActive: true
            }
          }
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    });

    const workspaceData = {
      manager: {
        id: manager.id,
        name: manager.name,
        department: manager.department,
        isActive: manager.isActive,
        user: manager.user
      },
      assignedClients: manager.managerClients.map(mc => ({
        ...mc.client,
        assignedAt: mc.assignedAt,
        notes: mc.notes
      })),
      activeDialogues: manager.dialogues.map(dialogue => ({
        id: dialogue.id,
        subject: dialogue.subject,
        priority: dialogue.priority,
        client: dialogue.client,
        lastMessage: dialogue.messages[0] || null,
        lastMessageAt: dialogue.lastMessageAt
      })),
      stats: {
        totalClients,
        activeDialogues,
        recentOrders
      }
    };

    logBusinessEvent('manager_workspace_accessed', req, {
      managerId: manager.id,
      totalClients,
      activeDialogues
    });

    res.json(workspaceData);
  } catch (error) {
    logWithContext('error', 'Failed to get manager workspace', req, {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

// GET /api/managers/clients - Get clients assigned to current manager
router.get('/clients', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, search, sort = 'assignedAt', order = 'DESC' } = req.query;

    const manager = await prisma.manager.findUnique({
      where: { userId }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Manager profile not found' });
    }

    // Build search filter
    const searchFilter = search ? {
      client: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { contactPerson: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }
    } : {};

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const where = {
      managerId: manager.id,
      isActive: true,
      ...searchFilter
    };

    const [managerClients, totalCount] = await Promise.all([
      prisma.managerClient.findMany({
        where,
        include: {
          client: {
            include: {
              orders: {
                select: { id: true, status: true, totalAmount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5
              },
              _count: {
                select: { orders: true }
              }
            }
          }
        },
        orderBy: {
          [sort]: order.toLowerCase() === 'asc' ? 'asc' : 'desc'
        },
        skip,
        take: limitNum
      }),
      prisma.managerClient.count({ where })
    ]);

    const clients = managerClients.map(mc => ({
      id: mc.client.id,
      name: mc.client.name,
      code: mc.client.code,
      inn: mc.client.inn,
      contactPerson: mc.client.contactPerson,
      phone: mc.client.phone,
      email: mc.client.email,
      assignedAt: mc.assignedAt,
      notes: mc.notes,
      recentOrders: mc.client.orders,
      totalOrders: mc.client._count.orders
    }));

    res.json({
      clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    logWithContext('error', 'Failed to get manager clients', req, {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

// POST /api/managers/clients/assign - Assign clients to manager
router.post('/clients/assign', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { clientIds, notes } = req.body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({ error: 'Client IDs are required and must be an array' });
    }

    const manager = await prisma.manager.findUnique({
      where: { userId }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Manager profile not found' });
    }

    // For non-admin users, only allow assigning to themselves
    let targetManagerId = manager.id;
    if (req.user.role === 'ADMIN' && req.body.managerId) {
      targetManagerId = req.body.managerId;
      
      // Verify target manager exists
      const targetManager = await prisma.manager.findUnique({
        where: { id: targetManagerId }
      });
      
      if (!targetManager) {
        return res.status(404).json({ error: 'Target manager not found' });
      }
    }

    // Verify all clients exist
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } }
    });

    if (clients.length !== clientIds.length) {
      return res.status(400).json({ error: 'One or more clients not found' });
    }

    // Check for existing assignments
    const existingAssignments = await prisma.managerClient.findMany({
      where: {
        managerId: targetManagerId,
        clientId: { in: clientIds },
        isActive: true
      }
    });

    const alreadyAssigned = existingAssignments.map(mc => mc.clientId);
    const newAssignments = clientIds.filter(id => !alreadyAssigned.includes(id));

    if (newAssignments.length === 0) {
      return res.status(400).json({ 
        error: 'All clients are already assigned to this manager',
        alreadyAssigned 
      });
    }

    // Create new assignments
    const assignments = await Promise.all(
      newAssignments.map(clientId =>
        prisma.managerClient.create({
          data: {
            managerId: targetManagerId,
            clientId,
            notes: notes || null
          },
          include: {
            client: {
              select: { id: true, name: true, code: true }
            }
          }
        })
      )
    );

    logBusinessEvent('clients_assigned_to_manager', req, {
      managerId: targetManagerId,
      clientIds: newAssignments,
      assignedBy: req.user.id,
      assignmentsCount: assignments.length
    });

    res.json({
      message: `Successfully assigned ${assignments.length} clients`,
      assignments: assignments.map(a => ({
        clientId: a.clientId,
        client: a.client,
        assignedAt: a.assignedAt,
        notes: a.notes
      })),
      alreadyAssigned: alreadyAssigned.length > 0 ? alreadyAssigned : undefined
    });
  } catch (error) {
    logWithContext('error', 'Failed to assign clients to manager', req, {
      error: error.message,
      stack: error.stack,
      clientIds: req.body.clientIds
    });
    next(error);
  }
});

// DELETE /api/managers/clients/:clientId - Unassign client from manager
router.delete('/clients/:clientId', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { clientId } = req.params;

    const manager = await prisma.manager.findUnique({
      where: { userId }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Manager profile not found' });
    }

    // For non-admin users, only allow unassigning from themselves
    let targetManagerId = manager.id;
    if (req.user.role === 'ADMIN' && req.query.managerId) {
      targetManagerId = req.query.managerId;
    }

    // Find and deactivate the assignment
    const assignment = await prisma.managerClient.findFirst({
      where: {
        managerId: targetManagerId,
        clientId,
        isActive: true
      },
      include: {
        client: {
          select: { id: true, name: true, code: true }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Client assignment not found or already inactive' });
    }

    await prisma.managerClient.update({
      where: { id: assignment.id },
      data: { isActive: false }
    });

    logBusinessEvent('client_unassigned_from_manager', req, {
      managerId: targetManagerId,
      clientId,
      unassignedBy: req.user.id,
      clientName: assignment.client.name
    });

    res.json({
      message: 'Client successfully unassigned',
      client: assignment.client,
      unassignedAt: new Date()
    });
  } catch (error) {
    logWithContext('error', 'Failed to unassign client from manager', req, {
      error: error.message,
      stack: error.stack,
      clientId: req.params.clientId
    });
    next(error);
  }
});

// GET /api/managers/:id/performance - Get manager performance stats
router.get('/:id/performance', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const { id: managerId } = req.params;
    const { period = '30' } = req.query; // days

    // For non-admin users, only allow viewing their own performance
    if (req.user.role === 'MANAGER') {
      const manager = await prisma.manager.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!manager || manager.id !== managerId) {
        return res.status(403).json({ error: 'Can only view your own performance data' });
      }
    }

    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    const days = Math.max(1, Math.min(365, parseInt(period) || 30));
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get performance metrics
    const [
      totalAssignedClients,
      activeDialogues,
      ordersInPeriod,
      totalOrderValue
    ] = await Promise.all([
      // Total assigned clients
      prisma.managerClient.count({
        where: { managerId, isActive: true }
      }),
      
      // Active dialogues
      prisma.dialogue.count({
        where: { managerId, status: 'ACTIVE' }
      }),
      
      // Orders from assigned clients in period
      prisma.order.findMany({
        where: {
          client: {
            managerClients: {
              some: { managerId, isActive: true }
            }
          },
          createdAt: { gte: startDate }
        },
        select: {
          id: true,
          totalAmount: true,
          status: true,
          createdAt: true
        }
      }),
      
      // Total order value in period
      prisma.order.aggregate({
        where: {
          client: {
            managerClients: {
              some: { managerId, isActive: true }
            }
          },
          createdAt: { gte: startDate }
        },
        _sum: { totalAmount: true }
      })
    ]);

    const ordersByStatus = ordersInPeriod.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    const performance = {
      manager: {
        id: manager.id,
        name: manager.name,
        department: manager.department,
        user: manager.user
      },
      period: {
        days,
        startDate,
        endDate: new Date()
      },
      metrics: {
        totalAssignedClients,
        activeDialogues,
        ordersCount: ordersInPeriod.length,
        totalOrderValue: totalOrderValue._sum.totalAmount || 0,
        averageOrderValue: ordersInPeriod.length > 0 
          ? (totalOrderValue._sum.totalAmount || 0) / ordersInPeriod.length 
          : 0,
        ordersByStatus
      }
    };

    res.json(performance);
  } catch (error) {
    logWithContext('error', 'Failed to get manager performance', req, {
      error: error.message,
      stack: error.stack,
      managerId: req.params.id
    });
    next(error);
  }
});

// PUT /api/managers/profile - Update manager profile/settings
router.put('/profile', requireRole(['MANAGER', 'ADMIN']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, department, settings } = req.body;

    let manager = await prisma.manager.findUnique({
      where: { userId }
    });

    if (!manager) {
      // Create manager profile if it doesn't exist
      manager = await prisma.manager.create({
        data: {
          userId,
          name: name || req.user.name,
          department: department || null,
          settings: settings ? JSON.stringify(settings) : null
        },
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true }
          }
        }
      });

      logBusinessEvent('manager_profile_created', req, {
        managerId: manager.id,
        userId
      });
    } else {
      // Update existing profile
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (department !== undefined) updateData.department = department;
      if (settings !== undefined) updateData.settings = JSON.stringify(settings);

      manager = await prisma.manager.update({
        where: { id: manager.id },
        data: updateData,
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true }
          }
        }
      });

      logBusinessEvent('manager_profile_updated', req, {
        managerId: manager.id,
        updatedFields: Object.keys(updateData)
      });
    }

    res.json({
      id: manager.id,
      name: manager.name,
      department: manager.department,
      settings: manager.settings ? JSON.parse(manager.settings) : null,
      isActive: manager.isActive,
      user: manager.user,
      createdAt: manager.createdAt,
      updatedAt: manager.updatedAt
    });
  } catch (error) {
    logWithContext('error', 'Failed to update manager profile', req, {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

// GET /api/managers - Get all managers (admin only)
router.get('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, sort = 'createdAt', order = 'DESC', active } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    let where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (active !== undefined) {
      where.isActive = active === 'true';
    }

    const [managers, totalCount] = await Promise.all([
      prisma.manager.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true }
          },
          _count: {
            select: {
              managerClients: { where: { isActive: true } },
              dialogues: { where: { status: 'ACTIVE' } }
            }
          }
        },
        orderBy: {
          [sort]: order.toLowerCase() === 'asc' ? 'asc' : 'desc'
        },
        skip,
        take: limitNum
      }),
      prisma.manager.count({ where })
    ]);

    const managersWithStats = managers.map(manager => ({
      id: manager.id,
      name: manager.name,
      department: manager.department,
      isActive: manager.isActive,
      user: manager.user,
      stats: {
        assignedClients: manager._count.managerClients,
        activeDialogues: manager._count.dialogues
      },
      createdAt: manager.createdAt,
      updatedAt: manager.updatedAt
    }));

    res.json({
      managers: managersWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    logWithContext('error', 'Failed to get managers list', req, {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

// POST /api/managers - Create new manager (admin only)
router.post('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { userId, name, department, settings, isActive = true } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ error: 'User ID and name are required' });
    }

    // Verify user exists and has MANAGER role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'MANAGER') {
      return res.status(400).json({ error: 'User must have MANAGER role' });
    }

    // Check if manager profile already exists
    const existingManager = await prisma.manager.findUnique({
      where: { userId }
    });

    if (existingManager) {
      return res.status(400).json({ error: 'Manager profile already exists for this user' });
    }

    const manager = await prisma.manager.create({
      data: {
        userId,
        name,
        department: department || null,
        settings: settings ? JSON.stringify(settings) : null,
        isActive
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true }
        }
      }
    });

    logBusinessEvent('manager_created', req, {
      managerId: manager.id,
      userId,
      createdBy: req.user.id
    });

    res.status(201).json({
      id: manager.id,
      name: manager.name,
      department: manager.department,
      settings: manager.settings ? JSON.parse(manager.settings) : null,
      isActive: manager.isActive,
      user: manager.user,
      createdAt: manager.createdAt,
      updatedAt: manager.updatedAt
    });
  } catch (error) {
    logWithContext('error', 'Failed to create manager', req, {
      error: error.message,
      stack: error.stack,
      userId: req.body.userId
    });
    next(error);
  }
});

module.exports = router;
