const { CronJob } = require('cron');
const nodemailer = require('nodemailer');
const BackupManager = require('../utils/backup');
const { logger } = require('../utils/logger');

class BackupScheduler {
  constructor() {
    this.backupManager = new BackupManager();
    this.jobs = new Map();
    this.isInitialized = false;
    
    // Email configuration
    this.emailConfig = {
      enabled: process.env.BACKUP_EMAIL_ENABLED === 'true',
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.BACKUP_EMAIL_FROM || process.env.SMTP_USER,
      to: process.env.BACKUP_EMAIL_TO
    };
    
    // Backup schedules from environment variables
    this.schedules = {
      daily: process.env.BACKUP_DAILY_SCHEDULE || '0 2 * * *', // 2 AM daily
      weekly: process.env.BACKUP_WEEKLY_SCHEDULE || '0 1 * * 0', // 1 AM on Sunday
      monthly: process.env.BACKUP_MONTHLY_SCHEDULE || '0 0 1 * *', // Midnight on 1st of month
      cleanup: process.env.BACKUP_CLEANUP_SCHEDULE || '0 3 * * *' // 3 AM daily cleanup
    };
    
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeEmailTransporter() {
    if (this.emailConfig.enabled && this.emailConfig.host && this.emailConfig.user) {
      try {
        this.emailTransporter = nodemailer.createTransporter({
          host: this.emailConfig.host,
          port: this.emailConfig.port,
          secure: this.emailConfig.secure,
          auth: {
            user: this.emailConfig.user,
            pass: this.emailConfig.password
          },
          pool: true,
          maxConnections: 1
        });

        logger.info('Email transporter initialized for backup notifications', {
          host: this.emailConfig.host,
          port: this.emailConfig.port,
          user: this.emailConfig.user
        });
      } catch (error) {
        logger.error('Failed to initialize email transporter', {
          error: error.message
        });
        this.emailConfig.enabled = false;
      }
    } else {
      logger.info('Email notifications disabled for backups');
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(subject, message, isError = false) {
    if (!this.emailConfig.enabled || !this.emailTransporter || !this.emailConfig.to) {
      return;
    }

    try {
      const mailOptions = {
        from: this.emailConfig.from,
        to: this.emailConfig.to,
        subject: `[CO_LAB CRM Backup] ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: ${isError ? '#dc3545' : '#28a745'}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
              <h2 style="margin: 0;">${isError ? '❌' : '✅'} ${subject}</h2>
            </div>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; border: 1px solid #dee2e6;">
              <div style="white-space: pre-line;">${message}</div>
              <hr style="margin: 20px 0;">
              <p style="color: #6c757d; font-size: 12px;">
                Time: ${new Date().toISOString()}<br>
                Server: ${process.env.NODE_ENV || 'development'}<br>
                CO_LAB CRM Backup System
              </p>
            </div>
          </div>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
      logger.debug('Backup notification email sent', {
        to: this.emailConfig.to,
        subject
      });
    } catch (error) {
      logger.error('Failed to send backup notification email', {
        error: error.message,
        subject
      });
    }
  }

  /**
   * Perform scheduled backup
   */
  async performScheduledBackup(type, metadata = {}) {
    logger.info(`Starting ${type} backup`, { type, metadata });
    
    try {
      const startTime = Date.now();
      const backup = await this.backupManager.createBackup(type, {
        ...metadata,
        scheduled: true,
        scheduledAt: new Date().toISOString()
      });
      
      const duration = Date.now() - startTime;
      const durationMinutes = Math.round(duration / 1000 / 60 * 100) / 100;
      
      logger.info(`${type} backup completed successfully`, {
        backupId: backup.id,
        backupName: backup.name,
        duration: `${durationMinutes}m`,
        archiveSize: backup.archive?.size
      });
      
      // Send success notification
      const message = `Backup completed successfully!

Backup Details:
• ID: ${backup.id}
• Name: ${backup.name}
• Type: ${type}
• Duration: ${durationMinutes} minutes
• Archive Size: ${this.formatBytes(backup.archive?.size || 0)}
• Components: ${Object.keys(backup.components).join(', ')}

Archive Location: ${backup.archive?.path}`;
      
      await this.sendEmailNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} Backup Successful`, message);
      
      // Trigger cleanup after successful backup
      if (type === 'daily') {
        setTimeout(() => this.performCleanup(), 5 * 60 * 1000); // 5 minutes delay
      }
      
      return backup;
    } catch (error) {
      logger.error(`${type} backup failed`, {
        error: error.message,
        stack: error.stack
      });
      
      // Send failure notification
      const message = `Backup failed with the following error:

Error: ${error.message}

Type: ${type}
Time: ${new Date().toISOString()}

Please check the server logs for more details and ensure the backup system is functioning properly.`;
      
      await this.sendEmailNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} Backup Failed`, message, true);
      
      throw error;
    }
  }

  /**
   * Perform backup cleanup
   */
  async performCleanup() {
    logger.info('Starting scheduled backup cleanup');
    
    try {
      const result = await this.backupManager.cleanOldBackups();
      
      logger.info('Backup cleanup completed', {
        deletedCount: result.deletedCount
      });
      
      if (result.deletedCount > 0) {
        const message = `Backup cleanup completed successfully!

Deleted ${result.deletedCount} old backup(s) according to retention policy.

Current Retention Policy:
• Daily backups: ${this.backupManager.retention.daily} days
• Weekly backups: ${this.backupManager.retention.weekly} weeks
• Monthly backups: ${this.backupManager.retention.monthly} months`;
        
        await this.sendEmailNotification('Backup Cleanup Completed', message);
      }
      
      return result;
    } catch (error) {
      logger.error('Backup cleanup failed', {
        error: error.message
      });
      
      const message = `Backup cleanup failed with the following error:

Error: ${error.message}
Time: ${new Date().toISOString()}

Please check the server logs for more details.`;
      
      await this.sendEmailNotification('Backup Cleanup Failed', message, true);
      
      throw error;
    }
  }

  /**
   * Initialize and start all scheduled jobs
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Backup scheduler already initialized');
      return;
    }

    try {
      logger.info('Initializing backup scheduler', {
        schedules: this.schedules,
        timezone: process.env.TZ || 'system default'
      });

      // Daily backup job
      const dailyJob = new CronJob(
        this.schedules.daily,
        () => this.performScheduledBackup('daily'),
        null,
        false,
        process.env.TZ
      );

      // Weekly backup job
      const weeklyJob = new CronJob(
        this.schedules.weekly,
        () => this.performScheduledBackup('weekly'),
        null,
        false,
        process.env.TZ
      );

      // Monthly backup job
      const monthlyJob = new CronJob(
        this.schedules.monthly,
        () => this.performScheduledBackup('monthly'),
        null,
        false,
        process.env.TZ
      );

      // Cleanup job
      const cleanupJob = new CronJob(
        this.schedules.cleanup,
        () => this.performCleanup(),
        null,
        false,
        process.env.TZ
      );

      // Store jobs
      this.jobs.set('daily', dailyJob);
      this.jobs.set('weekly', weeklyJob);
      this.jobs.set('monthly', monthlyJob);
      this.jobs.set('cleanup', cleanupJob);

      // Start all jobs
      dailyJob.start();
      weeklyJob.start();
      monthlyJob.start();
      cleanupJob.start();

      this.isInitialized = true;

      logger.info('Backup scheduler initialized successfully', {
        jobsCount: this.jobs.size,
        nextRuns: {
          daily: dailyJob.nextDates().format(),
          weekly: weeklyJob.nextDates().format(),
          monthly: monthlyJob.nextDates().format(),
          cleanup: cleanupJob.nextDates().format()
        }
      });

      // Send initialization notification
      const message = `Backup scheduler has been initialized successfully!

Scheduled Backups:
• Daily: ${this.schedules.daily} (next run: ${dailyJob.nextDates().format()})
• Weekly: ${this.schedules.weekly} (next run: ${weeklyJob.nextDates().format()})
• Monthly: ${this.schedules.monthly} (next run: ${monthlyJob.nextDates().format()})

Cleanup Schedule:
• ${this.schedules.cleanup} (next run: ${cleanupJob.nextDates().format()})

Email notifications: ${this.emailConfig.enabled ? 'Enabled' : 'Disabled'}`;

      await this.sendEmailNotification('Backup Scheduler Initialized', message);
      
    } catch (error) {
      logger.error('Failed to initialize backup scheduler', {
        error: error.message,
        stack: error.stack
      });
      
      await this.sendEmailNotification('Backup Scheduler Initialization Failed', 
        `Failed to initialize backup scheduler: ${error.message}`, true);
      
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping backup scheduler');
    
    for (const [name, job] of this.jobs) {
      try {
        job.stop();
        logger.debug(`Stopped ${name} backup job`);
      } catch (error) {
        logger.error(`Failed to stop ${name} backup job`, {
          error: error.message
        });
      }
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    
    if (this.emailTransporter) {
      this.emailTransporter.close();
    }
    
    logger.info('Backup scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    const jobsStatus = {};
    
    for (const [name, job] of this.jobs) {
      jobsStatus[name] = {
        running: job.running,
        nextRun: job.running ? job.nextDates().format() : null,
        lastRun: job.lastDate() ? job.lastDate().format() : null
      };
    }
    
    return {
      initialized: this.isInitialized,
      jobsCount: this.jobs.size,
      jobs: jobsStatus,
      schedules: this.schedules,
      emailNotifications: this.emailConfig.enabled
    };
  }

  /**
   * Trigger manual backup
   */
  async triggerManualBackup(type = 'manual', metadata = {}) {
    return await this.performScheduledBackup(type, {
      ...metadata,
      manual: true,
      triggeredAt: new Date().toISOString()
    });
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Test email configuration
   */
  async testEmailConfig() {
    if (!this.emailConfig.enabled) {
      throw new Error('Email notifications are not enabled');
    }

    if (!this.emailTransporter) {
      throw new Error('Email transporter not initialized');
    }

    try {
      await this.emailTransporter.verify();
      
      // Send test email
      await this.sendEmailNotification(
        'Test Email - Configuration OK',
        'This is a test email to verify backup notification settings are working correctly.'
      );
      
      return { success: true, message: 'Email configuration test successful' };
    } catch (error) {
      logger.error('Email configuration test failed', {
        error: error.message
      });
      throw new Error(`Email configuration test failed: ${error.message}`);
    }
  }
}

module.exports = BackupScheduler;