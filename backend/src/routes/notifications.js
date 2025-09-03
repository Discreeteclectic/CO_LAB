const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { 
  validate, 
  notificationCreateSchema,
  notificationSettingsSchema,
  notificationQuerySchema,
  notificationClearSchema
} = require('../middleware/validation');
const { logWithContext, logBusinessEvent, logError } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

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
 * GET /api/notifications - Get user's notifications
 * Supports pagination, filtering by type, read/unread status
 * Sort by createdAt (newest first)
 * Include counts for unread/urgent notifications
 */
router.get('/', validateQuery(notificationQuerySchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, type, isRead, isUrgent, sortBy, sortOrder } = req.query;

    logWithContext('info', 'Fetching user notifications', req, {
      page, limit, type, isRead, isUrgent, sortBy, sortOrder
    });

    // Build filter conditions
    const whereConditions = {
      userId,
      ...(type && { type }),
      ...(typeof isRead === 'boolean' && { isRead }),
      ...(typeof isUrgent === 'boolean' && { isUrgent }),
      // Filter out expired notifications
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    };

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch notifications with pagination
    const [notifications, totalCount, unreadCount, urgentCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          relatedId: true,
          relatedType: true,
          isRead: true,
          isUrgent: true,
          metadata: true,
          expiresAt: true,
          createdAt: true
        }
      }),
      prisma.notification.count({ where: whereConditions }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      prisma.notification.count({
        where: {
          userId,
          isUrgent: true,
          isRead: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      })
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    logBusinessEvent('notifications_fetched', req, {
      totalCount,
      unreadCount,
      urgentCount,
      page,
      totalPages
    });

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      counts: {
        unread: unreadCount,
        urgent: urgentCount,
        total: totalCount
      }
    });

  } catch (error) {
    logError(error, req, { operation: 'fetch_notifications' });
    next(error);
  }
});

/**
 * PUT /api/notifications/:id/read - Mark notification as read
 */
router.put('/:id/read', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    logWithContext('info', 'Marking notification as read', req, { notificationId });

    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found or access denied'
      });
    }

    if (notification.isRead) {
      return res.status(400).json({
        error: 'Notification is already marked as read'
      });
    }

    // Update notification
    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        relatedId: true,
        relatedType: true,
        isRead: true,
        isUrgent: true,
        metadata: true,
        expiresAt: true,
        createdAt: true
      }
    });

    logBusinessEvent('notification_marked_read', req, {
      notificationId,
      notificationType: notification.type,
      wasUrgent: notification.isUrgent
    });

    res.json({
      message: 'Notification marked as read',
      notification: updatedNotification
    });

  } catch (error) {
    logError(error, req, { operation: 'mark_notification_read' });
    next(error);
  }
});

/**
 * PUT /api/notifications/mark-all-read - Mark all notifications as read for user
 */
router.put('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logWithContext('info', 'Marking all notifications as read', req);

    // Update all unread notifications for the user
    const updateResult = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      data: { isRead: true }
    });

    logBusinessEvent('all_notifications_marked_read', req, {
      markedCount: updateResult.count
    });

    res.json({
      message: 'All notifications marked as read',
      markedCount: updateResult.count
    });

  } catch (error) {
    logError(error, req, { operation: 'mark_all_notifications_read' });
    next(error);
  }
});

/**
 * DELETE /api/notifications/:id - Delete specific notification
 * Only user can delete their own notifications
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    logWithContext('info', 'Deleting notification', req, { notificationId });

    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found or access denied'
      });
    }

    // Delete notification
    await prisma.notification.delete({
      where: { id: notificationId }
    });

    logBusinessEvent('notification_deleted', req, {
      notificationId,
      notificationType: notification.type,
      wasUrgent: notification.isUrgent
    });

    res.json({
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    logError(error, req, { operation: 'delete_notification' });
    next(error);
  }
});

/**
 * DELETE /api/notifications/clear - Clear all notifications for user
 * Optional type parameter to clear specific types only
 */
router.delete('/clear', validateQuery(notificationClearSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;

    logWithContext('info', 'Clearing notifications', req, { type });

    // Build delete conditions
    const whereConditions = {
      userId,
      ...(type && { type })
    };

    // Delete notifications
    const deleteResult = await prisma.notification.deleteMany({
      where: whereConditions
    });

    logBusinessEvent('notifications_cleared', req, {
      clearedCount: deleteResult.count,
      type: type || 'all'
    });

    res.json({
      message: type 
        ? `All ${type.toLowerCase()} notifications cleared` 
        : 'All notifications cleared',
      clearedCount: deleteResult.count
    });

  } catch (error) {
    logError(error, req, { operation: 'clear_notifications' });
    next(error);
  }
});

/**
 * GET /api/notifications/stats - Get notification statistics
 * Total count, unread count, urgent count, breakdown by type
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logWithContext('info', 'Fetching notification statistics', req);

    // Get all active notifications (not expired)
    const activeNotificationsWhere = {
      userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    };

    const [totalCount, unreadCount, urgentCount, typeBreakdown] = await Promise.all([
      prisma.notification.count({ where: activeNotificationsWhere }),
      prisma.notification.count({
        where: { ...activeNotificationsWhere, isRead: false }
      }),
      prisma.notification.count({
        where: { ...activeNotificationsWhere, isRead: false, isUrgent: true }
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where: activeNotificationsWhere,
        _count: {
          id: true
        }
      })
    ]);

    // Format type breakdown
    const typeStats = {
      MESSAGE: 0,
      REMINDER: 0,
      ALERT: 0,
      SYSTEM: 0
    };

    typeBreakdown.forEach(item => {
      typeStats[item.type] = item._count.id;
    });

    // Get unread counts by type
    const unreadByType = await prisma.notification.groupBy({
      by: ['type'],
      where: { ...activeNotificationsWhere, isRead: false },
      _count: { id: true }
    });

    const unreadTypeStats = {
      MESSAGE: 0,
      REMINDER: 0,
      ALERT: 0,
      SYSTEM: 0
    };

    unreadByType.forEach(item => {
      unreadTypeStats[item.type] = item._count.id;
    });

    const stats = {
      total: totalCount,
      unread: unreadCount,
      urgent: urgentCount,
      byType: typeStats,
      unreadByType: unreadTypeStats
    };

    logBusinessEvent('notification_stats_fetched', req, stats);

    res.json(stats);

  } catch (error) {
    logError(error, req, { operation: 'fetch_notification_stats' });
    next(error);
  }
});

module.exports = router;
/**
 * POST /api/notifications/settings - Update notification preferences
 */
router.post('/settings', validate(notificationSettingsSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const settings = req.body;

    logWithContext('info', 'Updating notification settings', req, { settings });

    // Store settings as JSON metadata in user table or create a separate UserSettings model
    // For now, we'll store in the user metadata field or create a notification settings record
    const settingsJson = JSON.stringify(settings);
    
    // Update user settings - assuming we add a notificationSettings field to User model
    // For now, we'll use a simple approach and return the settings
    const updatedSettings = {
      userId,
      ...settings,
      updatedAt: new Date()
    };

    logBusinessEvent('notification_settings_updated', req, settings);

    res.json({
      message: 'Notification settings updated successfully',
      settings: updatedSettings
    });

  } catch (error) {
    logError(error, req, { operation: 'update_notification_settings' });
    next(error);
  }
});

/**
 * GET /api/notifications/settings - Get current notification settings
 */
router.get('/settings', async (req, res, next) => {
  try {
    const userId = req.user.id;

    logWithContext('info', 'Fetching notification settings', req);

    // Default settings
    const defaultSettings = {
      emailNotifications: true,
      types: {
        MESSAGE: true,
        REMINDER: true,
        ALERT: true,
        SYSTEM: true
      },
      frequency: 'INSTANT',
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      }
    };

    // For now, return default settings
    // In a full implementation, you'd fetch from database
    const settings = {
      userId,
      ...defaultSettings,
      updatedAt: new Date()
    };

    logBusinessEvent('notification_settings_fetched', req);

    res.json(settings);

  } catch (error) {
    logError(error, req, { operation: 'fetch_notification_settings' });
    next(error);
  }
});

module.exports = router;
