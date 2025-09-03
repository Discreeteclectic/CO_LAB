const express = require('express');
const { validate } = require('../middleware/validation');
const Joi = require('joi');
const reminderService = require('../services/reminderService');
const { logWithContext, logBusinessEvent, logError } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const reminderCreateSchema = Joi.object({
  relatedId: Joi.string().required(),
  relatedType: Joi.string().valid('CALCULATION', 'ORDER', 'CLIENT').required(),
  reminderType: Joi.string().valid(
    'FOLLOW_UP', 
    'CALL_CLIENT', 
    'SEND_PROPOSAL', 
    'CHECK_PAYMENT', 
    'DELIVERY_REMINDER',
    'GENERAL'
  ).required(),
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow(null).optional(),
  scheduledDate: Joi.date().min('now').optional(),
  frequency: Joi.number().integer().min(1).max(30).default(3),
  maxReminders: Joi.number().integer().min(1).max(50).default(10)
});

const reminderUpdateSchema = Joi.object({
  title: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).allow(null).optional(),
  scheduledDate: Joi.date().min('now').optional(),
  frequency: Joi.number().integer().min(1).max(30).optional(),
  maxReminders: Joi.number().integer().min(1).max(50).optional()
});

const reminderQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('PENDING', 'SENT', 'COMPLETED', 'CANCELLED').optional(),
  relatedType: Joi.string().valid('CALCULATION', 'ORDER', 'CLIENT').optional(),
  reminderType: Joi.string().valid(
    'FOLLOW_UP', 
    'CALL_CLIENT', 
    'SEND_PROPOSAL', 
    'CHECK_PAYMENT', 
    'DELIVERY_REMINDER',
    'GENERAL'
  ).optional(),
  sortBy: Joi.string().valid('createdAt', 'scheduledDate', 'updatedAt').default('scheduledDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc')
});

const followUpReminderSchema = Joi.object({
  calculationId: Joi.string().required(),
  frequency: Joi.number().integer().min(1).max(30).default(3),
  maxReminders: Joi.number().integer().min(1).max(50).default(10)
});

// Validation middleware for query parameters
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.details[0].message
      });
    }
    req.query = value;
    next();
  };
};

/**
 * POST /api/reminders - Create a new reminder
 */
router.post('/', validate(reminderCreateSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      relatedId,
      relatedType,
      reminderType,
      title,
      description,
      scheduledDate,
      frequency,
      maxReminders
    } = req.body;

    logWithContext('info', 'Creating reminder', req, {
      relatedId, relatedType, reminderType, title
    });

    const reminder = await reminderService.createReminder(
      userId,
      relatedId,
      relatedType,
      reminderType,
      title,
      description,
      scheduledDate,
      { frequency, maxReminders }
    );

    logBusinessEvent('reminder_created_via_api', req, {
      reminderId: reminder.id,
      relatedId,
      relatedType,
      reminderType
    });

    res.status(201).json({
      message: 'Reminder created successfully',
      reminder
    });

  } catch (error) {
    logError(error, req, { operation: 'create_reminder' });
    next(error);
  }
});

/**
 * POST /api/reminders/follow-up - Create follow-up reminder for calculation
 */
router.post('/follow-up', validate(followUpReminderSchema), async (req, res, next) => {
  try {
    const managerId = req.user.id;
    const { calculationId, frequency, maxReminders } = req.body;

    logWithContext('info', 'Creating follow-up reminder', req, {
      calculationId, managerId
    });

    const reminder = await reminderService.scheduleFollowUpReminders(
      calculationId,
      managerId,
      { frequency, maxReminders }
    );

    logBusinessEvent('follow_up_reminder_created_via_api', req, {
      reminderId: reminder.id,
      calculationId,
      managerId
    });

    res.status(201).json({
      message: 'Follow-up reminder created successfully',
      reminder
    });

  } catch (error) {
    logError(error, req, { operation: 'create_follow_up_reminder' });
    next(error);
  }
});

/**
 * GET /api/reminders - Get user's reminders with filtering and pagination
 */
router.get('/', validateQuery(reminderQuerySchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, status, relatedType, reminderType, sortBy, sortOrder } = req.query;

    logWithContext('info', 'Fetching user reminders', req, {
      page, limit, status, relatedType, reminderType
    });

    const filters = {
      ...(status && { status }),
      ...(relatedType && { relatedType }),
      ...(reminderType && { reminderType })
    };

    const result = await reminderService.getRemindersForUser(
      userId,
      filters,
      { page, limit, sortBy, sortOrder }
    );

    logBusinessEvent('reminders_fetched_via_api', req, {
      totalCount: result.pagination.totalCount,
      page,
      filters
    });

    res.json(result);

  } catch (error) {
    logError(error, req, { operation: 'fetch_reminders' });
    next(error);
  }
});

/**
 * GET /api/reminders/:id - Get specific reminder
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reminderId = req.params.id;

    logWithContext('info', 'Fetching reminder by ID', req, { reminderId });

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const reminder = await prisma.reminder.findFirst({
      where: {
        id: reminderId,
        userId: userId
      },
      include: {
        calculation: {
          select: {
            id: true,
            name: true,
            client: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    await prisma.$disconnect();

    if (!reminder) {
      return res.status(404).json({
        error: 'Reminder not found or access denied'
      });
    }

    logBusinessEvent('reminder_fetched_by_id', req, {
      reminderId,
      relatedType: reminder.relatedType
    });

    res.json({ reminder });

  } catch (error) {
    logError(error, req, { operation: 'fetch_reminder_by_id' });
    next(error);
  }
});

/**
 * PUT /api/reminders/:id - Update reminder
 */
router.put('/:id', validate(reminderUpdateSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reminderId = req.params.id;
    const updates = req.body;

    logWithContext('info', 'Updating reminder', req, { reminderId, updates });

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Verify reminder belongs to user
    const existingReminder = await prisma.reminder.findFirst({
      where: {
        id: reminderId,
        userId: userId
      }
    });

    if (!existingReminder) {
      await prisma.$disconnect();
      return res.status(404).json({
        error: 'Reminder not found or access denied'
      });
    }

    // Update reminder
    const updatedReminder = await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        calculation: {
          select: {
            id: true,
            name: true,
            client: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    await prisma.$disconnect();

    logBusinessEvent('reminder_updated_via_api', req, {
      reminderId,
      updates: Object.keys(updates)
    });

    res.json({
      message: 'Reminder updated successfully',
      reminder: updatedReminder
    });

  } catch (error) {
    logError(error, req, { operation: 'update_reminder' });
    next(error);
  }
});

/**
 * PUT /api/reminders/:id/complete - Mark reminder as completed
 */
router.put('/:id/complete', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reminderId = req.params.id;

    logWithContext('info', 'Completing reminder', req, { reminderId });

    const completedReminder = await reminderService.completeReminder(reminderId, userId);

    logBusinessEvent('reminder_completed_via_api', req, {
      reminderId,
      relatedType: completedReminder.relatedType
    });

    res.json({
      message: 'Reminder marked as completed',
      reminder: completedReminder
    });

  } catch (error) {
    if (error.message === 'Reminder not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Reminder is already completed') {
      return res.status(400).json({ error: error.message });
    }
    logError(error, req, { operation: 'complete_reminder' });
    next(error);
  }
});

/**
 * DELETE /api/reminders/:id - Cancel/delete reminder
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reminderId = req.params.id;

    logWithContext('info', 'Cancelling reminder', req, { reminderId });

    const cancelledReminder = await reminderService.cancelReminder(reminderId, userId);

    logBusinessEvent('reminder_cancelled_via_api', req, {
      reminderId,
      relatedType: cancelledReminder.relatedType
    });

    res.json({
      message: 'Reminder cancelled successfully',
      reminder: cancelledReminder
    });

  } catch (error) {
    if (error.message === 'Reminder not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Reminder is already cancelled') {
      return res.status(400).json({ error: error.message });
    }
    logError(error, req, { operation: 'cancel_reminder' });
    next(error);
  }
});

/**
 * GET /api/reminders/stats/summary - Get reminder statistics
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logWithContext('info', 'Fetching reminder statistics', req);

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const [
      totalReminders,
      pendingReminders,
      overdueReminders,
      remindersByType,
      upcomingReminders
    ] = await Promise.all([
      prisma.reminder.count({ where: { userId } }),
      prisma.reminder.count({ 
        where: { userId, status: 'PENDING' } 
      }),
      prisma.reminder.count({
        where: {
          userId,
          status: 'PENDING',
          scheduledDate: { lt: new Date() }
        }
      }),
      prisma.reminder.groupBy({
        by: ['reminderType'],
        where: { userId, status: 'PENDING' },
        _count: { id: true }
      }),
      prisma.reminder.findMany({
        where: {
          userId,
          status: 'PENDING',
          scheduledDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
          }
        },
        take: 5,
        orderBy: { scheduledDate: 'asc' },
        include: {
          calculation: {
            select: {
              id: true,
              name: true,
              client: { select: { id: true, name: true } }
            }
          }
        }
      })
    ]);

    await prisma.$disconnect();

    // Format type breakdown
    const typeStats = {
      FOLLOW_UP: 0,
      CALL_CLIENT: 0,
      SEND_PROPOSAL: 0,
      CHECK_PAYMENT: 0,
      DELIVERY_REMINDER: 0,
      GENERAL: 0
    };

    remindersByType.forEach(item => {
      typeStats[item.reminderType] = item._count.id;
    });

    const stats = {
      total: totalReminders,
      pending: pendingReminders,
      overdue: overdueReminders,
      byType: typeStats,
      upcoming: upcomingReminders
    };

    logBusinessEvent('reminder_stats_fetched', req, {
      total: totalReminders,
      pending: pendingReminders,
      overdue: overdueReminders
    });

    res.json(stats);

  } catch (error) {
    logError(error, req, { operation: 'fetch_reminder_stats' });
    next(error);
  }
});

/**
 * POST /api/reminders/process-due - Manually trigger processing of due reminders (admin only)
 */
router.post('/process-due', async (req, res, next) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Access denied. Admin role required.'
      });
    }

    logWithContext('info', 'Manually processing due reminders', req);

    const results = await reminderService.processScheduledReminders();

    logBusinessEvent('manual_reminder_processing_triggered', req, results);

    res.json({
      message: 'Reminder processing completed',
      results
    });

  } catch (error) {
    logError(error, req, { operation: 'manual_process_reminders' });
    next(error);
  }
});

module.exports = router;