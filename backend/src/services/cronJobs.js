const cron = require('node-cron');
const reminderService = require('./reminderService');
const { logWithContext, logBusinessEvent, logError } = require('../utils/logger');

class CronJobsService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize and start all cron jobs
   */
  init() {
    if (this.isInitialized) {
      console.log('CronJobs already initialized');
      return;
    }

    try {
      // Process reminders every day at 9:00 AM, 1:00 PM, and 5:00 PM
      this.scheduleReminderProcessing();

      // Clean up old notifications every day at 2:00 AM
      this.scheduleNotificationCleanup();

      // Health check every hour
      this.scheduleHealthCheck();

      this.isInitialized = true;
      console.log('CronJobs initialized successfully');
      
      logBusinessEvent('cronjobs_initialized', null, {
        jobCount: this.jobs.size,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to initialize CronJobs:', error);
      logError(error, null, { operation: 'cronjobs_init' });
    }
  }

  /**
   * Schedule reminder processing - runs 3 times a day
   * 9:00 AM, 1:00 PM, and 5:00 PM on weekdays
   */
  scheduleReminderProcessing() {
    // Process reminders at 9:00 AM every day
    const morningJob = cron.schedule('0 9 * * *', async () => {
      await this.processRemindersJob('morning');
    }, {
      scheduled: false,
      timezone: 'Europe/Moscow' // Adjust timezone as needed
    });

    // Process reminders at 1:00 PM every day
    const afternoonJob = cron.schedule('0 13 * * *', async () => {
      await this.processRemindersJob('afternoon');
    }, {
      scheduled: false,
      timezone: 'Europe/Moscow'
    });

    // Process reminders at 5:00 PM every day
    const eveningJob = cron.schedule('0 17 * * *', async () => {
      await this.processRemindersJob('evening');
    }, {
      scheduled: false,
      timezone: 'Europe/Moscow'
    });

    // Start the jobs
    morningJob.start();
    afternoonJob.start();
    eveningJob.start();

    this.jobs.set('reminders-morning', morningJob);
    this.jobs.set('reminders-afternoon', afternoonJob);
    this.jobs.set('reminders-evening', eveningJob);

    console.log('Reminder processing jobs scheduled (9:00 AM, 1:00 PM, 5:00 PM daily)');
  }

  /**
   * Process reminders job implementation
   * @param {string} timeSlot - Time slot identifier (morning, afternoon, evening)
   */
  async processRemindersJob(timeSlot) {
    try {
      console.log(`[${timeSlot.toUpperCase()}] Starting reminder processing job...`);
      
      const startTime = Date.now();
      const results = await reminderService.processScheduledReminders();
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`[${timeSlot.toUpperCase()}] Reminder processing completed:`, {
        total: results.total,
        processed: results.processed,
        cancelled: results.cancelled,
        failed: results.failed,
        duration: `${duration}ms`
      });

      logBusinessEvent('cronjob_reminders_processed', null, {
        timeSlot,
        results,
        duration,
        timestamp: new Date().toISOString()
      });

      // Log errors if any
      if (results.errors.length > 0) {
        console.error(`[${timeSlot.toUpperCase()}] Reminder processing errors:`, results.errors);
        results.errors.forEach(error => {
          logError(new Error(error.error), null, { 
            operation: 'cronjob_reminder_processing', 
            reminderId: error.reminderId,
            timeSlot
          });
        });
      }

    } catch (error) {
      console.error(`[${timeSlot.toUpperCase()}] Reminder processing job failed:`, error);
      logError(error, null, { 
        operation: 'cronjob_reminder_processing', 
        timeSlot,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Schedule notification cleanup - runs daily at 2:00 AM
   * Cleans up expired and old read notifications
   */
  scheduleNotificationCleanup() {
    const cleanupJob = cron.schedule('0 2 * * *', async () => {
      await this.notificationCleanupJob();
    }, {
      scheduled: false,
      timezone: 'Europe/Moscow'
    });

    cleanupJob.start();
    this.jobs.set('notification-cleanup', cleanupJob);

    console.log('Notification cleanup job scheduled (2:00 AM daily)');
  }

  /**
   * Notification cleanup job implementation
   */
  async notificationCleanupJob() {
    try {
      console.log('Starting notification cleanup job...');
      
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const startTime = Date.now();
      
      // Delete expired notifications
      const expiredResult = await prisma.notification.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      // Delete old read notifications (older than 30 days)
      const oldReadDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const oldReadResult = await prisma.notification.deleteMany({
        where: {
          isRead: true,
          createdAt: {
            lt: oldReadDate
          },
          type: {
            not: 'REMINDER' // Keep reminder notifications longer
          }
        }
      });

      // Delete old reminder notifications (older than 60 days)
      const oldReminderDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const oldReminderResult = await prisma.notification.deleteMany({
        where: {
          type: 'REMINDER',
          createdAt: {
            lt: oldReminderDate
          }
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      const results = {
        expiredNotifications: expiredResult.count,
        oldReadNotifications: oldReadResult.count,
        oldReminderNotifications: oldReminderResult.count,
        totalCleaned: expiredResult.count + oldReadResult.count + oldReminderResult.count,
        duration: `${duration}ms`
      };

      console.log('Notification cleanup completed:', results);

      logBusinessEvent('cronjob_notifications_cleaned', null, {
        ...results,
        timestamp: new Date().toISOString()
      });

      await prisma.$disconnect();

    } catch (error) {
      console.error('Notification cleanup job failed:', error);
      logError(error, null, { 
        operation: 'cronjob_notification_cleanup',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Schedule health check - runs every hour
   */
  scheduleHealthCheck() {
    const healthJob = cron.schedule('0 * * * *', async () => {
      await this.healthCheckJob();
    }, {
      scheduled: false,
      timezone: 'Europe/Moscow'
    });

    healthJob.start();
    this.jobs.set('health-check', healthJob);

    console.log('Health check job scheduled (every hour)');
  }

  /**
   * Health check job implementation
   */
  async healthCheckJob() {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      // Check database connectivity
      await prisma.$queryRaw`SELECT 1`;

      // Get system statistics
      const stats = {
        timestamp: new Date().toISOString(),
        activeReminders: await prisma.reminder.count({
          where: { status: 'PENDING' }
        }),
        pendingNotifications: await prisma.notification.count({
          where: { isRead: false }
        }),
        urgentNotifications: await prisma.notification.count({
          where: { isRead: false, isUrgent: true }
        })
      };

      // Log if there are many pending items
      if (stats.activeReminders > 100 || stats.urgentNotifications > 50) {
        console.warn('High number of pending reminders/notifications:', stats);
      }

      logBusinessEvent('cronjob_health_check', null, stats);

      await prisma.$disconnect();

    } catch (error) {
      console.error('Health check job failed:', error);
      logError(error, null, { 
        operation: 'cronjob_health_check',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    console.log('Stopping all cron jobs...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped job: ${name}`);
    });

    this.jobs.clear();
    this.isInitialized = false;

    logBusinessEvent('cronjobs_stopped', null, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      totalJobs: this.jobs.size,
      jobs: {}
    };

    this.jobs.forEach((job, name) => {
      status.jobs[name] = {
        running: job.running || false,
        scheduled: job.scheduled || false
      };
    });

    return status;
  }

  /**
   * Manually trigger reminder processing (for testing)
   */
  async triggerReminderProcessing() {
    console.log('Manually triggering reminder processing...');
    return await this.processRemindersJob('manual');
  }

  /**
   * Manually trigger notification cleanup (for testing)
   */
  async triggerNotificationCleanup() {
    console.log('Manually triggering notification cleanup...');
    return await this.notificationCleanupJob();
  }
}

module.exports = new CronJobsService();