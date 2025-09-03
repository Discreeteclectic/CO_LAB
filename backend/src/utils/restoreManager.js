const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');

class RestoreManager {
  constructor() {
    this.dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    this.uploadsDir = path.join(process.cwd(), 'uploads');
  }

  /**
   * Restore database component
   */
  async restoreDatabase(componentPath) {
    const dbFileName = 'dev.db';
    const sourcePath = path.join(componentPath, dbFileName);
    const targetPath = this.dbPath;
    
    if (!await fs.pathExists(sourcePath)) {
      throw new Error('Database backup file not found');
    }
    
    // Create backup of current database
    const currentDbBackup = `${targetPath}.pre-restore-${Date.now()}`;
    if (await fs.pathExists(targetPath)) {
      await fs.copy(targetPath, currentDbBackup);
      logger.info('Current database backed up before restore', {
        original: targetPath,
        backup: currentDbBackup
      });
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
        logger.warn('Restored original database due to restore failure', {
          restored: targetPath,
          from: currentDbBackup
        });
      }
      throw error;
    }
  }

  /**
   * Restore uploads component
   */
  async restoreUploads(componentPath) {
    const targetPath = this.uploadsDir;
    
    // Create backup of current uploads
    const currentUploadsBackup = `${targetPath}.pre-restore-${Date.now()}`;
    if (await fs.pathExists(targetPath)) {
      await fs.move(targetPath, currentUploadsBackup);
      logger.info('Current uploads backed up before restore', {
        original: targetPath,
        backup: currentUploadsBackup
      });
    }
    
    try {
      await fs.copy(componentPath, targetPath);
      
      // Remove backup of current uploads if restore successful
      if (await fs.pathExists(currentUploadsBackup)) {
        await fs.remove(currentUploadsBackup);
        logger.debug('Removed temporary uploads backup after successful restore');
      }
      
      logger.info('Uploads restored successfully', {
        source: componentPath,
        target: targetPath
      });
    } catch (error) {
      // Restore original uploads on failure
      if (await fs.pathExists(currentUploadsBackup)) {
        await fs.move(currentUploadsBackup, targetPath);
        logger.warn('Restored original uploads due to restore failure', {
          restored: targetPath,
          from: currentUploadsBackup
        });
      }
      throw error;
    }
  }

  /**
   * Restore configuration component
   */
  async restoreConfig(componentPath) {
    const configFiles = [
      { source: 'package.json', target: 'package.json' },
      { source: 'schema.prisma', target: path.join('prisma', 'schema.prisma') }
    ];
    
    const restoredFiles = [];
    const backupFiles = [];
    
    for (const configFile of configFiles) {
      const sourcePath = path.join(componentPath, configFile.source);
      
      if (!await fs.pathExists(sourcePath)) {
        logger.debug(`Configuration file not found in backup: ${configFile.source}`);
        continue;
      }
      
      const targetPath = path.join(process.cwd(), configFile.target);
      
      // Create backup of current file
      const currentFileBackup = `${targetPath}.pre-restore-${Date.now()}`;
      if (await fs.pathExists(targetPath)) {
        await fs.copy(targetPath, currentFileBackup);
        backupFiles.push({ original: targetPath, backup: currentFileBackup });
      }
      
      try {
        await fs.copy(sourcePath, targetPath);
        restoredFiles.push(configFile.source);
        logger.info(`Configuration file restored: ${configFile.source}`, {
          source: sourcePath,
          target: targetPath
        });
      } catch (error) {
        // Restore original file on failure
        if (await fs.pathExists(currentFileBackup)) {
          await fs.copy(currentFileBackup, targetPath);
          logger.warn(`Restored original configuration file: ${configFile.source}`, {
            restored: targetPath,
            from: currentFileBackup
          });
        }
        logger.error(`Failed to restore configuration file: ${configFile.source}`, {
          error: error.message
        });
        // Don't throw error for individual config file failures
      }
    }
    
    // Clean up backup files after successful restoration
    for (const backupFile of backupFiles) {
      try {
        if (await fs.pathExists(backupFile.backup)) {
          await fs.remove(backupFile.backup);
          logger.debug('Cleaned up configuration backup file', {
            backup: backupFile.backup
          });
        }
      } catch (error) {
        logger.warn('Failed to clean up configuration backup file', {
          backup: backupFile.backup,
          error: error.message
        });
      }
    }
    
    if (restoredFiles.length === 0) {
      throw new Error('No configuration files were restored');
    }
    
    logger.info('Configuration restore completed', {
      restoredFiles,
      totalFiles: configFiles.length
    });
  }

  /**
   * Validate backup component before restoration
   */
  async validateComponent(componentPath, componentType) {
    switch (componentType) {
      case 'database':
        return await this.validateDatabaseComponent(componentPath);
      case 'uploads':
        return await this.validateUploadsComponent(componentPath);
      case 'config':
        return await this.validateConfigComponent(componentPath);
      default:
        throw new Error(`Unknown component type: ${componentType}`);
    }
  }

  /**
   * Validate database component
   */
  async validateDatabaseComponent(componentPath) {
    const dbPath = path.join(componentPath, 'dev.db');
    
    if (!await fs.pathExists(dbPath)) {
      throw new Error('Database file not found in backup component');
    }
    
    const stats = await fs.stat(dbPath);
    if (stats.size === 0) {
      throw new Error('Database file is empty');
    }
    
    // Basic SQLite header validation
    const buffer = Buffer.alloc(16);
    const fd = await fs.open(dbPath, 'r');
    await fd.read(buffer, 0, 16, 0);
    await fd.close();
    
    const sqliteHeader = 'SQLite format 3\0';
    if (!buffer.toString().startsWith(sqliteHeader.substring(0, 15))) {
      throw new Error('Invalid SQLite database format in backup');
    }
    
    return {
      valid: true,
      size: stats.size,
      path: dbPath
    };
  }

  /**
   * Validate uploads component
   */
  async validateUploadsComponent(componentPath) {
    if (!await fs.pathExists(componentPath)) {
      throw new Error('Uploads directory not found in backup component');
    }
    
    const stats = await fs.stat(componentPath);
    if (!stats.isDirectory()) {
      throw new Error('Uploads component is not a directory');
    }
    
    // Count files in uploads
    let fileCount = 0;
    let totalSize = 0;
    
    const walk = async (dir) => {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const fileStats = await fs.stat(filePath);
        
        if (fileStats.isDirectory()) {
          await walk(filePath);
        } else {
          fileCount++;
          totalSize += fileStats.size;
        }
      }
    };
    
    await walk(componentPath);
    
    return {
      valid: true,
      fileCount,
      totalSize,
      path: componentPath
    };
  }

  /**
   * Validate config component
   */
  async validateConfigComponent(componentPath) {
    if (!await fs.pathExists(componentPath)) {
      throw new Error('Configuration directory not found in backup component');
    }
    
    const expectedFiles = ['package.json', 'schema.prisma'];
    const foundFiles = [];
    
    for (const file of expectedFiles) {
      const filePath = path.join(componentPath, file);
      if (await fs.pathExists(filePath)) {
        foundFiles.push(file);
      }
    }
    
    if (foundFiles.length === 0) {
      throw new Error('No valid configuration files found in backup component');
    }
    
    return {
      valid: true,
      foundFiles,
      expectedFiles,
      path: componentPath
    };
  }

  /**
   * Get restore preview (what would be restored)
   */
  async getRestorePreview(backupArchivePath, components = []) {
    const preview = {
      backupArchive: backupArchivePath,
      components: {},
      estimatedChanges: []
    };
    
    // This would require extracting the archive temporarily to analyze
    // For now, return a placeholder structure
    for (const component of components) {
      preview.components[component] = {
        available: true,
        estimatedSize: 'Unknown',
        changes: [`${component} will be restored from backup`]
      };
      
      // Add specific warnings based on component
      switch (component) {
        case 'database':
          preview.estimatedChanges.push('⚠️ Current database will be replaced - all unsaved data will be lost');
          break;
        case 'uploads':
          preview.estimatedChanges.push('⚠️ Current uploads will be replaced');
          break;
        case 'config':
          preview.estimatedChanges.push('⚠️ Configuration files will be updated - application restart may be required');
          break;
      }
    }
    
    return preview;
  }
}

module.exports = RestoreManager;