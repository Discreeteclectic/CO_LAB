const { PrismaClient } = require('@prisma/client');
const { logWithContext, logBusinessEvent, logError } = require('./logger');

const prisma = new PrismaClient();

/**
 * Create a notification for a specific user
 * @param {string} userId - The ID of the user to notify
 * @param {string} type - Notification type (MESSAGE, REMINDER, ALERT, SYSTEM)
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {Object} options - Additional options
 * @param {string} options.relatedId - ID of related entity
 * @param {string} options.relatedType - Type of related entity
 * @param {boolean} options.isUrgent - Whether notification is urgent
 * @param {string} options.metadata - Additional metadata as JSON string
 * @param {Date} options.expiresAt - When notification expires
 * @returns {Promise<Object>} Created notification
 */
async function createNotification(userId, type, title, content, options = {}) {
  try {
    const {
      relatedId,
      relatedType,
      isUrgent = false,
      metadata,
      expiresAt
    } = options;

    // Validate notification type
    const validTypes = ['MESSAGE', 'REMINDER', 'ALERT', 'SYSTEM'];
    if (\!validTypes.includes(type)) {
      throw new Error('Invalid notification type: ' + type + '. Must be one of: ' + validTypes.join(', '));
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        content,
        relatedId,
        relatedType,
        isUrgent,
        metadata: metadata ? JSON.stringify(metadata) : null,
        expiresAt
      },
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

    // Log notification creation
    console.log('Notification created for user ' + userId + ': ' + type + ' - ' + title);

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Notify all managers of a specific client
 * @param {string} clientId - The ID of the client
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {Object} options - Additional options
 * @returns {Promise<Object[]>} Array of created notifications
 */
async function notifyManagers(clientId, type, title, content, options = {}) {
  try {
    // Find all managers assigned to this client
    const managerClients = await prisma.managerClient.findMany({
      where: {
        clientId,
        isActive: true
      },
      include: {
        manager: {
          include: {
            user: true
          }
        }
      }
    });

    const notifications = [];

    // Create notifications for all managers
    for (const managerClient of managerClients) {
      const managerId = managerClient.manager.userId;
      
      const notification = await createNotification(
        managerId,
        type,
        title,
        content,
        {
          ...options,
          relatedId: clientId,
          relatedType: 'CLIENT'
        }
      );

      notifications.push(notification);
    }

    console.log('Notified ' + notifications.length + ' managers about client ' + clientId + ': ' + title);

    return notifications;
  } catch (error) {
    console.error('Error notifying managers:', error);
    throw error;
  }
}

/**
 * Send urgent alert notification
 * @param {string} userId - User ID to notify
 * @param {string} title - Alert title
 * @param {string} content - Alert content
 * @param {string} relatedId - ID of related entity
 * @param {string} relatedType - Type of related entity
 * @returns {Promise<Object>} Created urgent notification
 */
async function sendUrgentAlert(userId, title, content, relatedId = null, relatedType = null) {
  try {
    const notification = await createNotification(
      userId,
      'ALERT',
      'URGENT: ' + title,
      content,
      {
        isUrgent: true,
        relatedId,
        relatedType,
        metadata: {
          alertLevel: 'CRITICAL',
          createdAt: new Date().toISOString()
        }
      }
    );

    console.log('Urgent alert sent to user ' + userId + ': ' + title);

    return notification;
  } catch (error) {
    console.error('Error sending urgent alert:', error);
    throw error;
  }
}

/**
 * Create reminder notification with expiration
 * @param {string} userId - User ID to notify
 * @param {string} title - Reminder title
 * @param {string} content - Reminder content
 * @param {Date} reminderDate - When to remind (for expiresAt)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Created reminder notification
 */
async function createReminder(userId, title, content, reminderDate, options = {}) {
  try {
    const notification = await createNotification(
      userId,
      'REMINDER',
      'Reminder: ' + title,
      content,
      {
        ...options,
        expiresAt: reminderDate,
        metadata: {
          reminderDate: reminderDate.toISOString(),
          ...options.metadata
        }
      }
    );

    console.log('Reminder set for user ' + userId + ': ' + title + ' on ' + reminderDate.toISOString());

    return notification;
  } catch (error) {
    console.error('Error creating reminder:', error);
    throw error;
  }
}

/**
 * Clean up expired notifications
 * @returns {Promise<number>} Number of notifications deleted
 */
async function cleanupExpiredNotifications() {
  try {
    const result = await prisma.notification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    console.log('Cleaned up ' + result.count + ' expired notifications');

    return result.count;
  } catch (error) {
    console.error('Error cleaning up expired notifications:', error);
    throw error;
  }
}

/**
 * Get notification count for user
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Notification counts
 */
async function getNotificationCounts(userId, filters = {}) {
  try {
    const whereConditions = {
      userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
      ...filters
    };

    const [total, unread, urgent] = await Promise.all([
      prisma.notification.count({ where: whereConditions }),
      prisma.notification.count({ where: { ...whereConditions, isRead: false } }),
      prisma.notification.count({ where: { ...whereConditions, isRead: false, isUrgent: true } })
    ]);

    return { total, unread, urgent };
  } catch (error) {
    console.error('Error getting notification counts:', error);
    throw error;
  }
}

/**
 * Mark notifications as read by criteria
 * @param {string} userId - User ID
 * @param {Object} criteria - Criteria for selecting notifications
 * @returns {Promise<number>} Number of notifications marked as read
 */
async function markNotificationsRead(userId, criteria = {}) {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...criteria,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      data: { isRead: true }
    });

    console.log('Marked ' + result.count + ' notifications as read for user ' + userId);

    return result.count;
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    throw error;
  }
}

module.exports = {
  createNotification,
  notifyManagers,
  sendUrgentAlert,
  createReminder,
  cleanupExpiredNotifications,
  getNotificationCounts,
  markNotificationsRead
};
ENDOFFILE < /dev/null