const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const tar = require('tar');
const { v4: uuidv4 } = require('uuid');
const BackupManager = require('../utils/backup');
const BackupScheduler = require('../services/backupScheduler');
const RestoreManager = require('../utils/restoreManager');
const { logger } = require('../utils/logger');

const router = express.Router();
const backupManager = new BackupManager();
const restoreManager = new RestoreManager();

// We'll store the scheduler instance globally to access it from routes
let backupScheduler = null;

/**
 * Initialize backup scheduler (called from server.js)
 */
function initializeBackupScheduler() {
  if (!backupScheduler) {
    backupScheduler = new BackupScheduler();
    backupScheduler.initialize().catch(error => {
      logger.error('Failed to initialize backup scheduler on startup', {
        error: error.message
      });
    });
  }
  return backupScheduler;
}

/**
 * Validation middleware
 */
const validateBackupAccess = (req, res, next) => {
  // Additional authorization check for backup operations
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Access denied. Admin role required for backup operations.',
      requestId: req.id
    });
  }
  next();
};

/**
 * GET /api/backup - List available backups
 */
router.get('/', validateBackupAccess, async (req, res) => {
  try {
    logger.info('Listing backups', {
      userId: req.user.id,
      requestId: req.id
    });

    const backups = await backupManager.listBackups();
    
    // Add download URLs
    const backupsWithUrls = backups.map(backup => ({
      ...backup,
      downloadUrl: `/api/backup/${backup.id}/download`,
      canDelete: true,
      canRestore: backup.status === 'completed'
    }));

    res.json({
      success: true,
      data: backupsWithUrls,
      count: backupsWithUrls.length,
      requestId: req.id
    });
  } catch (error) {
    logger.error('Failed to list backups', {
      error: error.message,
      userId: req.user.id,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Failed to list backups',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * POST /api/backup/create - Create manual backup
 */
router.post('/create', validateBackupAccess, async (req, res) => {
  try {
    const { type = 'manual', description } = req.body;
    
    logger.info('Creating manual backup', {
      type,
      description,
      userId: req.user.id,
      userEmail: req.user.email,
      requestId: req.id
    });

    const metadata = {
      description: description || 'Manual backup',
      createdBy: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name
      },
      manual: true,
      requestId: req.id
    };

    // Start backup process asynchronously
    const backupPromise = backupManager.createBackup(type, metadata);

    // Return immediately with backup started status
    res.status(202).json({
      success: true,
      message: 'Backup process started',
      status: 'started',
      requestId: req.id
    });

    // Continue backup in background
    try {
      const backup = await backupPromise;
      logger.info('Manual backup completed successfully', {
        backupId: backup.id,
        backupName: backup.name,
        userId: req.user.id,
        requestId: req.id
      });
    } catch (error) {
      logger.error('Manual backup failed', {
        error: error.message,
        userId: req.user.id,
        requestId: req.id
      });
    }
  } catch (error) {
    logger.error('Failed to start backup process', {
      error: error.message,
      userId: req.user.id,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Failed to start backup process',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * GET /api/backup/:id/download - Download backup file
 */
router.get('/:id/download', validateBackupAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info('Downloading backup', {
      backupId: id,
      userId: req.user.id,
      requestId: req.id
    });

    const backups = await backupManager.listBackups();
    const backup = backups.find(b => b.id === id);

    if (!backup) {
      return res.status(404).json({
        error: 'Backup not found',
        backupId: id,
        requestId: req.id
      });
    }

    if (backup.status !== 'completed') {
      return res.status(400).json({
        error: 'Backup is not completed',
        status: backup.status,
        requestId: req.id
      });
    }

    const archivePath = backup.archivePath;
    
    if (!await fs.pathExists(archivePath)) {
      return res.status(404).json({
        error: 'Backup file not found on disk',
        archivePath,
        requestId: req.id
      });
    }

    const stats = await fs.stat(archivePath);
    const filename = `${backup.name}.tar.gz`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Length', stats.size);

    logger.info('Backup download started', {
      backupId: id,
      filename,
      size: stats.size,
      userId: req.user.id,
      requestId: req.id
    });

    const readStream = fs.createReadStream(archivePath);
    readStream.pipe(res);

    readStream.on('error', (error) => {
      logger.error('Error during backup download', {
        error: error.message,
        backupId: id,
        userId: req.user.id,
        requestId: req.id
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Download failed',
          message: error.message,
          requestId: req.id
        });
      }
    });

    readStream.on('end', () => {
      logger.info('Backup download completed', {
        backupId: id,
        filename,
        userId: req.user.id,
        requestId: req.id
      });
    });

  } catch (error) {
    logger.error('Failed to download backup', {
      error: error.message,
      backupId: req.params.id,
      userId: req.user.id,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Failed to download backup',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * DELETE /api/backup/:id - Delete backup
 */
router.delete('/:id', validateBackupAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info('Deleting backup', {
      backupId: id,
      userId: req.user.id,
      requestId: req.id
    });

    await backupManager.deleteBackup(id);

    logger.info('Backup deleted successfully', {
      backupId: id,
      userId: req.user.id,
      requestId: req.id
    });

    res.json({
      success: true,
      message: 'Backup deleted successfully',
      backupId: id,
      requestId: req.id
    });
  } catch (error) {
    logger.error('Failed to delete backup', {
      error: error.message,
      backupId: req.params.id,
      userId: req.user.id,
      requestId: req.id
    });

    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: 'Failed to delete backup',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * GET /api/backup/status - Get backup system status
 */
router.get('/status', validateBackupAccess, async (req, res) => {
  try {
    logger.debug('Getting backup system status', {
      userId: req.user.id,
      requestId: req.id
    });

    const status = await backupManager.getStatus();
    const schedulerStatus = backupScheduler ? backupScheduler.getStatus() : null;

    res.json({
      success: true,
      data: {
        ...status,
        scheduler: schedulerStatus,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        }
      },
      requestId: req.id
    });
  } catch (error) {
    logger.error('Failed to get backup status', {
      error: error.message,
      userId: req.user.id,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Failed to get backup status',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * POST /api/backup/restore - Restore from backup
 */
router.post('/restore', validateBackupAccess, async (req, res) => {
  try {
    const { backupId, components = [], confirmToken } = req.body;
    
    // Security check - require confirmation token
    if (!confirmToken || confirmToken !== 'CONFIRM_RESTORE') {
      return res.status(400).json({
        error: 'Restore confirmation required',
        message: 'Please provide confirmation token "CONFIRM_RESTORE"',
        requestId: req.id
      });
    }
    
    logger.warn('Backup restoration initiated', {
      backupId,
      components,
      userId: req.user.id,
      userEmail: req.user.email,
      requestId: req.id,
      warning: 'DESTRUCTIVE_OPERATION'
    });

    const backups = await backupManager.listBackups();
    const backup = backups.find(b => b.id === backupId);

    if (!backup) {
      return res.status(404).json({
        error: 'Backup not found',
        backupId,
        requestId: req.id
      });
    }

    if (backup.status !== 'completed') {
      return res.status(400).json({
        error: 'Cannot restore from incomplete backup',
        status: backup.status,
        requestId: req.id
      });
    }

    const archivePath = backup.archivePath;
    
    if (!await fs.pathExists(archivePath)) {
      return res.status(404).json({
        error: 'Backup archive not found on disk',
        archivePath,
        requestId: req.id
      });
    }

    // Start restore process
    const restoreId = uuidv4();
    const restoreDir = path.join(backupManager.backupDir, 'temp', `restore-${restoreId}`);
    
    try {
      await fs.ensureDir(restoreDir);
      
      // Extract backup archive
      logger.info('Extracting backup archive for restore', {
        archivePath,
        restoreDir,
        restoreId
      });
      
      await tar.extract({
        file: archivePath,
        cwd: restoreDir
      });
      
      const extractedBackupDir = path.join(restoreDir, backup.name);
      
      if (!await fs.pathExists(extractedBackupDir)) {
        throw new Error('Extracted backup directory not found');
      }
      
      const restoreResults = {
        restoreId,
        backupId,
        timestamp: new Date(),
        components: {},
        restoredBy: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name
        }
      };
      
      // Restore components based on request
      const availableComponents = ['database', 'uploads', 'config'];
      const componentsToRestore = components.length > 0 ? components : availableComponents;
      
      for (const component of componentsToRestore) {
        if (!availableComponents.includes(component)) {
          logger.warn(`Unknown component requested for restore: ${component}`);
          continue;
        }
        
        const componentPath = path.join(extractedBackupDir, component);
        if (!await fs.pathExists(componentPath)) {
          logger.warn(`Component not found in backup: ${component}`);
          continue;
        }
        
        try {
          switch (component) {
            case 'database':
              await restoreManager.restoreDatabase(componentPath);
              break;
            case 'uploads':
              await restoreManager.restoreUploads(componentPath);
              break;
            case 'config':
              await restoreManager.restoreConfig(componentPath);
              break;
          }
          
          restoreResults.components[component] = { success: true };
          logger.info(`Component restored successfully: ${component}`);
        } catch (componentError) {
          restoreResults.components[component] = { 
            success: false, 
            error: componentError.message 
          };
          logger.error(`Failed to restore component: ${component}`, {
            error: componentError.message
          });
        }
      }
      
      // Cleanup restore directory
      await fs.remove(restoreDir);
      
      logger.warn('Backup restoration completed', {
        restoreId,
        backupId,
        components: restoreResults.components,
        userId: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Restore process completed',
        data: restoreResults,
        warning: 'System may need restart to fully apply restored configuration',
        requestId: req.id
      });
      
    } catch (restoreError) {
      // Cleanup on failure
      if (await fs.pathExists(restoreDir)) {
        await fs.remove(restoreDir);
      }
      throw restoreError;
    }
    
  } catch (error) {
    logger.error('Backup restoration failed', {
      error: error.message,
      backupId: req.body.backupId,
      userId: req.user.id,
      requestId: req.id
    });

    res.status(500).json({
      error: 'Restore process failed',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * Restore database component
 */
async function restoreDatabase(componentPath) {
  const dbFileName = 'dev.db';
  const sourcePath = path.join(componentPath, dbFileName);
  const targetPath = path.join(process.cwd(), 'prisma', dbFileName);
  
  if (!await fs.pathExists(sourcePath)) {
    throw new Error('Database backup file not found');
  }
  
  // Create backup of current database
  const currentDbBackup = `${targetPath}.pre-restore-${Date.now()}`;
  if (await fs.pathExists(targetPath)) {
    await fs.copy(targetPath, currentDbBackup);
  }
  
  try {
    await fs.copy(sourcePath, targetPath);
    logger.info('Database restored successfully', {
      source: sourcePath,
      target: targetPath,
      backup: currentDbBackup
    });
  } catch (error) {
    // Restore original database on failure
    if (await fs.pathExists(currentDbBackup)) {
      await fs.copy(currentDbBackup, targetPath);
    }
    throw error;
  }
}

/**
 * Restore uploads component
 */
async function restoreUploads(componentPath) {
  const targetPath = path.join(process.cwd(), 'uploads');
  
  // Create backup of current uploads
  const currentUploadsBackup = `${targetPath}.pre-restore-${Date.now()}`;
  if (await fs.pathExists(targetPath)) {
    await fs.move(targetPath, currentUploadsBackup);
  }
  
  try {
    await fs.copy(componentPath, targetPath);
    
    // Remove backup of current uploads if restore successful
    if (await fs.pathExists(currentUploadsBackup)) {
      await fs.remove(currentUploadsBackup);
    }
    
    logger.info('Uploads restored successfully', {
      source: componentPath,
      target: targetPath
    });
  } catch (error) {
    // Restore original uploads on failure
    if (await fs.pathExists(currentUploadsBackup)) {
      await fs.move(currentUploadsBackup, targetPath);
    }
    throw error;
  }
}

/**
 * Restore configuration component
 */
async function restoreConfig(componentPath) {
  const configFiles = ['package.json', 'schema.prisma'];
  
  for (const configFile of configFiles) {
    const sourcePath = path.join(componentPath, configFile);
    
    if (!await fs.pathExists(sourcePath)) {
      continue;
    }
    
    let targetPath;
    if (configFile === 'schema.prisma') {
      targetPath = path.join(process.cwd(), 'prisma', configFile);
    } else {
      targetPath = path.join(process.cwd(), configFile);
    }
    
    // Create backup of current file
    const currentFileBackup = `${targetPath}.pre-restore-${Date.now()}`;
    if (await fs.pathExists(targetPath)) {
      await fs.copy(targetPath, currentFileBackup);
    }
    
    try {
      await fs.copy(sourcePath, targetPath);
      logger.info(`Configuration file restored: ${configFile}`, {
        source: sourcePath,
        target: targetPath
      });
    } catch (error) {
      // Restore original file on failure
      if (await fs.pathExists(currentFileBackup)) {
        await fs.copy(currentFileBackup, targetPath);
      }
      logger.error(`Failed to restore configuration file: ${configFile}`, {
        error: error.message
      });
    }
  }
}

/**
 * POST /api/backup/test-email - Test email configuration
 */
router.post('/test-email', validateBackupAccess, async (req, res) => {
  try {
    if (!backupScheduler) {
      return res.status(503).json({
        error: 'Backup scheduler not initialized',
        requestId: req.id
      });
    }
    
    logger.info('Testing backup email configuration', {
      userId: req.user.id,
      requestId: req.id
    });
    
    const result = await backupScheduler.testEmailConfig();
    
    res.json({
      success: true,
      message: result.message,
      requestId: req.id
    });
  } catch (error) {
    logger.error('Email configuration test failed', {
      error: error.message,
      userId: req.user.id,
      requestId: req.id
    });
    
    res.status(500).json({
      error: 'Email test failed',
      message: error.message,
      requestId: req.id
    });
  }
});

/**
 * POST /api/backup/cleanup - Trigger manual cleanup
 */
router.post('/cleanup', validateBackupAccess, async (req, res) => {
  try {
    logger.info('Manual backup cleanup triggered', {
      userId: req.user.id,
      requestId: req.id
    });
    
    const result = await backupManager.cleanOldBackups();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      data: result,
      requestId: req.id
    });
  } catch (error) {
    logger.error('Manual cleanup failed', {
      error: error.message,
      userId: req.user.id,
      requestId: req.id
    });
    
    res.status(500).json({
      error: 'Cleanup failed',
      message: error.message,
      requestId: req.id
    });
  }
});

// Export the router and initialization function
module.exports = {
  router,
  initializeBackupScheduler
};