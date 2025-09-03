const { PrismaClient } = require('@prisma/client');
const { logWithContext, logBusinessEvent, logError } = require('../utils/logger');

const prisma = new PrismaClient();

class ReminderService {
  /**
   * Create a new reminder
   * @param {string} userId - User ID who will receive the reminder
   * @param {string} relatedId - Related entity ID (calculation, order, etc.)
   * @param {string} relatedType - Type of related entity (CALCULATION, ORDER, etc.)
   * @param {string} reminderType - Type of reminder (FOLLOW_UP, CALL_CLIENT, etc.)
   * @param {string} title - Reminder title
   * @param {string} description - Optional description
   * @param {Date} scheduledDate - When to send the reminder
   * @param {Object} options - Additional options (frequency, maxReminders)
   * @returns {Promise<Object>} Created reminder
   */
  async createReminder(userId, relatedId, relatedType, reminderType, title, description = null, scheduledDate = null, options = {}) {
    try {
      const {
        frequency = 3, // Default: every 3 days
        maxReminders = 10 // Default: maximum 10 reminders
      } = options;

      // Default scheduled date is now + frequency days
      const defaultScheduledDate = scheduledDate || new Date(Date.now() + frequency * 24 * 60 * 60 * 1000);

      const reminder = await prisma.reminder.create({
        data: {
          userId,
          relatedId,
          relatedType,
          reminderType,
          title,
          description,
          scheduledDate: defaultScheduledDate,
          frequency,
          maxReminders
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      logBusinessEvent('reminder_created', null, {
        reminderId: reminder.id,
        userId,
        relatedId,
        relatedType,
        reminderType,
        scheduledDate: defaultScheduledDate
      });

      return reminder;
    } catch (error) {
      logError(error, null, { operation: 'create_reminder', userId, relatedId, relatedType });
      throw error;
    }
  }

  /**
   * Create follow-up reminders when КП is sent
   * @param {string} calculationId - Calculation ID
   * @param {string} managerId - Manager ID who will receive reminders
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Created reminder
   */
  async scheduleFollowUpReminders(calculationId, managerId, options = {}) {
    try {
      // Get calculation details
      const calculation = await prisma.calculation.findUnique({
        where: { id: calculationId },
        include: {
          client: {
            select: { id: true, name: true }
          }
        }
      });

      if (!calculation) {
        throw new Error('Calculation not found');
      }

      const clientName = calculation.client?.name || 'Клиент';
      const title = `Напоминание: связаться с ${clientName} по КП "${calculation.name}"`;
      const description = `Отправлено КП "${calculation.name}" клиенту ${clientName}. Необходимо связаться с клиентом для уточнения статуса.`;

      // Schedule first reminder in 3 days
      const firstReminderDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const reminder = await this.createReminder(
        managerId,
        calculationId,
        'CALCULATION',
        'FOLLOW_UP',
        title,
        description,
        firstReminderDate,
        {
          frequency: 3, // Every 3 days
          maxReminders: 10, // Maximum 10 reminders (30 days total)
          ...options
        }
      );

      // Update calculation with reminder info
      await prisma.calculation.update({
        where: { id: calculationId },
        data: {
          status: 'КП_ОТПРАВЛЕНО',
          sentDate: new Date(),
          reminderActive: true,
          nextReminderDate: firstReminderDate
        }
      });

      logBusinessEvent('follow_up_reminders_scheduled', null, {
        calculationId,
        managerId,
        clientName,
        firstReminderDate,
        reminderId: reminder.id
      });

      return reminder;
    } catch (error) {
      logError(error, null, { operation: 'schedule_follow_up_reminders', calculationId, managerId });
      throw error;
    }
  }

  /**
   * Get reminders that are due for processing
   * @param {Date} beforeDate - Get reminders scheduled before this date (default: now)
   * @returns {Promise<Array>} Array of due reminders
   */
  async getRemindersDue(beforeDate = new Date()) {
    try {
      const reminders = await prisma.reminder.findMany({
        where: {
          status: 'PENDING',
          scheduledDate: {
            lte: beforeDate
          }
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          calculation: {
            select: { id: true, name: true, clientId: true,
              client: {
                select: { id: true, name: true }
              }
            }
          }
        },
        orderBy: {
          scheduledDate: 'asc'
        }
      });

      logBusinessEvent('reminders_due_retrieved', null, {
        count: reminders.length,
        beforeDate
      });

      return reminders;
    } catch (error) {
      logError(error, null, { operation: 'get_reminders_due', beforeDate });
      throw error;
    }
  }

  /**
   * Process a reminder by creating a RED urgent notification
   * @param {string} reminderId - Reminder ID to process
   * @returns {Promise<Object>} Processing result
   */
  async processReminder(reminderId) {
    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          calculation: {
            select: { id: true, name: true,
              client: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      if (!reminder) {
        throw new Error('Reminder not found');
      }

      if (reminder.status !== 'PENDING') {
        throw new Error('Reminder is not pending');
      }

      // Check if we've reached the maximum number of reminders
      if (reminder.sentCount >= reminder.maxReminders) {
        await prisma.reminder.update({
          where: { id: reminderId },
          data: { status: 'CANCELLED' }
        });

        logBusinessEvent('reminder_cancelled_max_reached', null, {
          reminderId,
          sentCount: reminder.sentCount,
          maxReminders: reminder.maxReminders
        });

        return { status: 'cancelled', reason: 'max_reminders_reached' };
      }

      // Create urgent RED notification
      let notificationTitle = reminder.title;
      let notificationContent = reminder.description;

      // Add urgency indicators
      if (reminder.sentCount > 0) {
        notificationTitle = `🔴 СРОЧНО (${reminder.sentCount + 1}х): ${notificationTitle}`;
      } else {
        notificationTitle = `🔴 СРОЧНО: ${notificationTitle}`;
      }

      if (reminder.calculation?.client) {
        notificationContent += `\\n\\nКлиент: ${reminder.calculation.client.name}`;
      }

      notificationContent += `\\n\\nЭто ${reminder.sentCount + 1}-е напоминание из ${reminder.maxReminders} максимальных.`;

      await prisma.notification.create({
        data: {
          userId: reminder.userId,
          type: 'REMINDER',
          reminderType: reminder.reminderType,
          title: notificationTitle,
          content: notificationContent,
          relatedId: reminder.relatedId,
          relatedType: reminder.relatedType,
          isUrgent: true, // RED urgent notification
          metadata: JSON.stringify({
            reminderId: reminder.id,
            sentCount: reminder.sentCount + 1,
            reminderType: reminder.reminderType,
            calculationName: reminder.calculation?.name,
            clientName: reminder.calculation?.client?.name
          })
        }
      });

      // Update reminder: increment sent count and schedule next reminder
      const nextReminderDate = new Date(Date.now() + reminder.frequency * 24 * 60 * 60 * 1000);
      
      await prisma.reminder.update({
        where: { id: reminderId },
        data: {
          sentCount: reminder.sentCount + 1,
          scheduledDate: nextReminderDate,
          status: 'SENT'
        }
      });

      // Update calculation's next reminder date
      if (reminder.relatedType === 'CALCULATION') {
        await prisma.calculation.update({
          where: { id: reminder.relatedId },
          data: {
            nextReminderDate: nextReminderDate
          }
        });
      }

      // Schedule next reminder if not at maximum
      if (reminder.sentCount + 1 < reminder.maxReminders) {
        await prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: 'PENDING' // Reset to pending for next cycle
          }
        });
      } else {
        await prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: 'COMPLETED'
          }
        });
      }

      logBusinessEvent('reminder_processed', null, {
        reminderId,
        userId: reminder.userId,
        sentCount: reminder.sentCount + 1,
        nextReminderDate: reminder.sentCount + 1 < reminder.maxReminders ? nextReminderDate : null
      });

      return { 
        status: 'processed', 
        sentCount: reminder.sentCount + 1,
        nextReminderDate: reminder.sentCount + 1 < reminder.maxReminders ? nextReminderDate : null
      };
    } catch (error) {
      logError(error, null, { operation: 'process_reminder', reminderId });
      throw error;
    }
  }

  /**
   * Process all scheduled reminders (called by cron job)
   * @returns {Promise<Object>} Processing summary
   */
  async processScheduledReminders() {
    try {
      const dueReminders = await this.getRemindersDue();
      const results = {
        total: dueReminders.length,
        processed: 0,
        cancelled: 0,
        failed: 0,
        errors: []
      };

      for (const reminder of dueReminders) {
        try {
          const result = await this.processReminder(reminder.id);
          if (result.status === 'processed') {
            results.processed++;
          } else if (result.status === 'cancelled') {
            results.cancelled++;
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            reminderId: reminder.id,
            error: error.message
          });
          logError(error, null, { operation: 'process_reminder_in_batch', reminderId: reminder.id });
        }
      }

      logBusinessEvent('scheduled_reminders_processed', null, results);

      return results;
    } catch (error) {
      logError(error, null, { operation: 'process_scheduled_reminders' });
      throw error;
    }
  }

  /**
   * Cancel a reminder
   * @param {string} reminderId - Reminder ID to cancel
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Cancelled reminder
   */
  async cancelReminder(reminderId, userId) {
    try {
      // Verify reminder belongs to user
      const reminder = await prisma.reminder.findFirst({
        where: {
          id: reminderId,
          userId: userId
        }
      });

      if (!reminder) {
        throw new Error('Reminder not found or access denied');
      }

      if (reminder.status === 'CANCELLED') {
        throw new Error('Reminder is already cancelled');
      }

      const cancelledReminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'CANCELLED' }
      });

      // Update calculation if it's a calculation reminder
      if (reminder.relatedType === 'CALCULATION') {
        await prisma.calculation.update({
          where: { id: reminder.relatedId },
          data: {
            reminderActive: false,
            nextReminderDate: null
          }
        });
      }

      logBusinessEvent('reminder_cancelled', null, {
        reminderId,
        userId,
        relatedType: reminder.relatedType,
        relatedId: reminder.relatedId
      });

      return cancelledReminder;
    } catch (error) {
      logError(error, null, { operation: 'cancel_reminder', reminderId, userId });
      throw error;
    }
  }

  /**
   * Complete a reminder (mark as done)
   * @param {string} reminderId - Reminder ID to complete
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Completed reminder
   */
  async completeReminder(reminderId, userId) {
    try {
      // Verify reminder belongs to user
      const reminder = await prisma.reminder.findFirst({
        where: {
          id: reminderId,
          userId: userId
        }
      });

      if (!reminder) {
        throw new Error('Reminder not found or access denied');
      }

      if (reminder.status === 'COMPLETED') {
        throw new Error('Reminder is already completed');
      }

      const completedReminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'COMPLETED' }
      });

      // Update calculation if it's a calculation reminder
      if (reminder.relatedType === 'CALCULATION') {
        await prisma.calculation.update({
          where: { id: reminder.relatedId },
          data: {
            reminderActive: false,
            nextReminderDate: null
          }
        });
      }

      logBusinessEvent('reminder_completed', null, {
        reminderId,
        userId,
        relatedType: reminder.relatedType,
        relatedId: reminder.relatedId
      });

      return completedReminder;
    } catch (error) {
      logError(error, null, { operation: 'complete_reminder', reminderId, userId });
      throw error;
    }
  }

  /**
   * Get reminders for a user
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters (status, relatedType, etc.)
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Reminders with pagination info
   */
  async getRemindersForUser(userId, filters = {}, pagination = {}) {
    try {
      const {
        status,
        relatedType,
        reminderType
      } = filters;

      const {
        page = 1,
        limit = 20
      } = pagination;

      const skip = (page - 1) * limit;

      const whereConditions = {
        userId,
        ...(status && { status }),
        ...(relatedType && { relatedType }),
        ...(reminderType && { reminderType })
      };

      const [reminders, totalCount] = await Promise.all([
        prisma.reminder.findMany({
          where: whereConditions,
          skip,
          take: limit,
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
          },
          orderBy: {
            scheduledDate: 'asc'
          }
        }),
        prisma.reminder.count({ where: whereConditions })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      logBusinessEvent('reminders_retrieved_for_user', null, {
        userId,
        totalCount,
        page,
        totalPages,
        filters
      });

      return {
        reminders,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      logError(error, null, { operation: 'get_reminders_for_user', userId, filters });
      throw error;
    }
  }
}

module.exports = new ReminderService();