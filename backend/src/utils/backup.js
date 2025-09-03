const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const tar = require('tar');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

class BackupManager {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    this.dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.logsDir = path.join(process.cwd(), 'logs');
    
    // Backup retention settings
    this.retention = {
      daily: parseInt(process.env.BACKUP_RETENTION_DAILY) || 30,
      weekly: parseInt(process.env.BACKUP_RETENTION_WEEKLY) || 12,
      monthly: parseInt(process.env.BACKUP_RETENTION_MONTHLY) || 12
    };
    
    this.initializeDirectories();
  }

  /**
   * Initialize backup directory structure
   */
  async initializeDirectories() {
    try {
      await fs.ensureDir(this.backupDir);
      await fs.ensureDir(path.join(this.backupDir, 'daily'));
      await fs.ensureDir(path.join(this.backupDir, 'weekly'));
      await fs.ensureDir(path.join(this.backupDir, 'monthly'));
      await fs.ensureDir(path.join(this.backupDir, 'temp'));
      
      logger.info('Backup directories initialized', {
        backupDir: this.backupDir,
        subdirectories: ['daily', 'weekly', 'monthly', 'temp']
      });
    } catch (error) {
      logger.error('Failed to initialize backup directories', {
        error: error.message,
        backupDir: this.backupDir
      });
      throw error;
    }
  }

  /**
   * Calculate file hash for integrity verification
   */
  async calculateFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Verify database integrity
   */
  async verifyDatabaseIntegrity() {
    try {
      if (!await fs.pathExists(this.dbPath)) {
        throw new Error('Database file does not exist');
      }

      const stats = await fs.stat(this.dbPath);
      if (stats.size === 0) {
        throw new Error('Database file is empty');
      }

      // Basic SQLite integrity check by trying to read the header
      const buffer = Buffer.alloc(16);
      const fd = await fs.open(this.dbPath, 'r');
      await fd.read(buffer, 0, 16, 0);
      await fd.close();

      const sqliteHeader = 'SQLite format 3\0';
      if (!buffer.toString().startsWith(sqliteHeader.substring(0, 15))) {
        throw new Error('Invalid SQLite database format');
      }

      logger.debug('Database integrity verified', {
        dbPath: this.dbPath,
        size: stats.size
      });

      return true;
    } catch (error) {
      logger.error('Database integrity check failed', {
        error: error.message,
        dbPath: this.dbPath
      });
      throw error;
    }
  }

  /**
   * Backup database with integrity checks
   */
  async backupDatabase(tempDir) {
    try {
      logger.info('Starting database backup');
      
      // Verify database integrity before backup
      await this.verifyDatabaseIntegrity();
      
      const dbBackupPath = path.join(tempDir, 'database');
      await fs.ensureDir(dbBackupPath);
      
      // Copy main database file
      const dbFileName = path.basename(this.dbPath);
      const backupDbPath = path.join(dbBackupPath, dbFileName);
      await fs.copy(this.dbPath, backupDbPath);
      
      // Copy journal file if it exists
      const journalPath = this.dbPath + '-journal';
      if (await fs.pathExists(journalPath)) {
        const backupJournalPath = path.join(dbBackupPath, dbFileName + '-journal');
        await fs.copy(journalPath, backupJournalPath);
      }
      
      // Verify backed up database
      const backupHash = await this.calculateFileHash(backupDbPath);
      const originalHash = await this.calculateFileHash(this.dbPath);
      
      if (backupHash !== originalHash) {
        throw new Error('Database backup verification failed - hash mismatch');
      }
      
      logger.info('Database backup completed successfully', {
        originalPath: this.dbPath,
        backupPath: backupDbPath,
        hash: backupHash
      });
      
      return {
        path: dbBackupPath,
        hash: backupHash,
        size: (await fs.stat(backupDbPath)).size
      };
    } catch (error) {
      logger.error('Database backup failed', {
        error: error.message,
        dbPath: this.dbPath
      });
      throw error;
    }
  }

  /**
   * Backup uploads directory
   */
  async backupUploads(tempDir) {
    try {
      logger.info('Starting uploads backup');
      
      const uploadsBackupPath = path.join(tempDir, 'uploads');
      
      if (await fs.pathExists(this.uploadsDir)) {
        await fs.copy(this.uploadsDir, uploadsBackupPath);
        
        const stats = await this.getDirectoryStats(uploadsBackupPath);
        logger.info('Uploads backup completed', {
          originalPath: this.uploadsDir,
          backupPath: uploadsBackupPath,
          fileCount: stats.fileCount,
          totalSize: stats.totalSize
        });
        
        return {
          path: uploadsBackupPath,
          fileCount: stats.fileCount,
          totalSize: stats.totalSize
        };
      } else {
        logger.warn('Uploads directory does not exist, skipping', {
          uploadsDir: this.uploadsDir
        });
        return { path: null, fileCount: 0, totalSize: 0 };
      }
    } catch (error) {
      logger.error('Uploads backup failed', {
        error: error.message,
        uploadsDir: this.uploadsDir
      });
      throw error;
    }
  }

  /**
   * Backup configuration files
   */
  async backupConfiguration(tempDir) {
    try {
      logger.info('Starting configuration backup');
      
      const configBackupPath = path.join(tempDir, 'config');
      await fs.ensureDir(configBackupPath);
      
      const configFiles = [
        'package.json',
        'package-lock.json',
        path.join('prisma', 'schema.prisma')
      ];
      
      const backedUpFiles = [];
      
      for (const configFile of configFiles) {
        const sourcePath = path.join(process.cwd(), configFile);
        if (await fs.pathExists(sourcePath)) {
          const targetPath = path.join(configBackupPath, path.basename(configFile));
          await fs.copy(sourcePath, targetPath);
          backedUpFiles.push({
            original: sourcePath,
            backup: targetPath,
            size: (await fs.stat(targetPath)).size
          });
        }
      }
      
      // Check for .env file (don't backup sensitive data, but note its existence)
      const envPath = path.join(process.cwd(), '.env');
      if (await fs.pathExists(envPath)) {
        await fs.writeFile(
          path.join(configBackupPath, '.env.template'),
          '# Environment file exists but not backed up for security reasons\n# Restore manually from your secure backup\n'
        );
      }
      
      logger.info('Configuration backup completed', {
        backupPath: configBackupPath,
        backedUpFiles: backedUpFiles.length
      });
      
      return {
        path: configBackupPath,
        files: backedUpFiles
      };
    } catch (error) {
      logger.error('Configuration backup failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Backup and compress logs
   */
  async backupLogs(tempDir) {
    try {
      logger.info('Starting logs backup');
      
      const logsBackupPath = path.join(tempDir, 'logs');
      
      if (await fs.pathExists(this.logsDir)) {
        await fs.copy(this.logsDir, logsBackupPath);
        
        // Compress individual log files
        const logFiles = await fs.readdir(logsBackupPath);
        const compressedLogs = [];
        
        for (const logFile of logFiles) {
          if (path.extname(logFile) === '.log') {
            const logPath = path.join(logsBackupPath, logFile);
            const gzPath = logPath + '.gz';
            
            // Create gzip compressed version
            await this.compressFile(logPath, gzPath);
            await fs.remove(logPath); // Remove original after compression
            
            compressedLogs.push({
              original: logFile,
              compressed: logFile + '.gz',
              size: (await fs.stat(gzPath)).size
            });
          }
        }
        
        logger.info('Logs backup completed', {
          backupPath: logsBackupPath,
          compressedLogs: compressedLogs.length
        });
        
        return {
          path: logsBackupPath,
          compressedFiles: compressedLogs
        };
      } else {
        logger.warn('Logs directory does not exist, skipping', {
          logsDir: this.logsDir
        });
        return { path: null, compressedFiles: [] };
      }
    } catch (error) {
      logger.error('Logs backup failed', {
        error: error.message,
        logsDir: this.logsDir
      });
      throw error;
    }
  }

  /**
   * Compress a file using gzip
   */
  async compressFile(inputPath, outputPath) {
    const zlib = require('zlib');
    const gzip = zlib.createGzip();
    const readStream = fs.createReadStream(inputPath);
    const writeStream = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /**
   * Create compressed backup archive
   */
  async createCompressedArchive(sourceDir, targetPath, type = 'tar.gz') {
    try {
      logger.info('Creating compressed archive', {
        sourceDir,
        targetPath,
        type
      });
      
      if (type === 'tar.gz') {
        await tar.create(
          {
            gzip: true,
            file: targetPath,
            cwd: path.dirname(sourceDir)
          },
          [path.basename(sourceDir)]
        );
      } else {
        // Fallback to zip
        await this.createZipArchive(sourceDir, targetPath);
      }
      
      const archiveStats = await fs.stat(targetPath);
      logger.info('Archive created successfully', {
        targetPath,
        size: archiveStats.size
      });
      
      return {
        path: targetPath,
        size: archiveStats.size,
        hash: await this.calculateFileHash(targetPath)
      };
    } catch (error) {
      logger.error('Failed to create compressed archive', {
        error: error.message,
        sourceDir,
        targetPath
      });
      throw error;
    }
  }

  /**
   * Create ZIP archive as fallback
   */
  async createZipArchive(sourceDir, targetPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(targetPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => resolve());
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Get directory statistics
   */
  async getDirectoryStats(dirPath) {
    let fileCount = 0;
    let totalSize = 0;
    
    const walk = async (dir) => {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await walk(filePath);
        } else {
          fileCount++;
          totalSize += stats.size;
        }
      }
    };
    
    if (await fs.pathExists(dirPath)) {
      await walk(dirPath);
    }
    
    return { fileCount, totalSize };
  }

  /**
   * Create a full system backup
   */
  async createBackup(type = 'manual', metadata = {}) {
    const backupId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${type}-${timestamp}-${backupId.substring(0, 8)}`;
    
    logger.info('Starting backup process', {
      backupId,
      backupName,
      type,
      metadata
    });
    
    try {
      // Create temporary directory
      const tempDir = path.join(this.backupDir, 'temp', backupName);
      await fs.ensureDir(tempDir);
      
      const backupResults = {
        id: backupId,
        name: backupName,
        type,
        timestamp: new Date(),
        metadata,
        status: 'in_progress',
        components: {}
      };
      
      // Backup database
      backupResults.components.database = await this.backupDatabase(tempDir);
      
      // Backup uploads
      backupResults.components.uploads = await this.backupUploads(tempDir);
      
      // Backup configuration
      backupResults.components.config = await this.backupConfiguration(tempDir);
      
      // Backup logs
      backupResults.components.logs = await this.backupLogs(tempDir);
      
      // Determine target directory based on backup type
      let targetDir;
      switch (type) {
        case 'daily':
          targetDir = path.join(this.backupDir, 'daily');
          break;
        case 'weekly':
          targetDir = path.join(this.backupDir, 'weekly');
          break;
        case 'monthly':
          targetDir = path.join(this.backupDir, 'monthly');
          break;
        default:
          targetDir = this.backupDir;
      }
      
      // Create compressed archive
      const archivePath = path.join(targetDir, `${backupName}.tar.gz`);
      const archiveInfo = await this.createCompressedArchive(tempDir, archivePath);
      
      // Create backup manifest
      const manifest = {
        ...backupResults,
        archive: archiveInfo,
        status: 'completed',
        completedAt: new Date()
      };
      
      const manifestPath = path.join(targetDir, `${backupName}.manifest.json`);
      await fs.writeJson(manifestPath, manifest, { spaces: 2 });
      
      // Cleanup temporary directory
      await fs.remove(tempDir);
      
      logger.info('Backup completed successfully', {
        backupId,
        backupName,
        archivePath,
        manifestPath,
        archiveSize: archiveInfo.size
      });
      
      return manifest;
    } catch (error) {
      logger.error('Backup failed', {
        backupId,
        backupName,
        error: error.message
      });
      
      // Cleanup on failure
      const tempDir = path.join(this.backupDir, 'temp', backupName);
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
      
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const backups = [];
      const backupTypes = ['daily', 'weekly', 'monthly'];
      
      for (const type of backupTypes) {
        const typeDir = path.join(this.backupDir, type);
        if (await fs.pathExists(typeDir)) {
          const files = await fs.readdir(typeDir);
          const manifestFiles = files.filter(f => f.endsWith('.manifest.json'));
          
          for (const manifestFile of manifestFiles) {
            const manifestPath = path.join(typeDir, manifestFile);
            try {
              const manifest = await fs.readJson(manifestPath);
              backups.push({
                ...manifest,
                type,
                manifestPath,
                archivePath: path.join(typeDir, `${manifest.name}.tar.gz`)
              });
            } catch (error) {
              logger.warn('Failed to read backup manifest', {
                manifestPath,
                error: error.message
              });
            }
          }
        }
      }
      
      // Also check root backup directory for manual backups
      const rootFiles = await fs.readdir(this.backupDir);
      const rootManifests = rootFiles.filter(f => f.endsWith('.manifest.json'));
      
      for (const manifestFile of rootManifests) {
        const manifestPath = path.join(this.backupDir, manifestFile);
        try {
          const manifest = await fs.readJson(manifestPath);
          backups.push({
            ...manifest,
            type: manifest.type || 'manual',
            manifestPath,
            archivePath: path.join(this.backupDir, `${manifest.name}.tar.gz`)
          });
        } catch (error) {
          logger.warn('Failed to read backup manifest', {
            manifestPath,
            error: error.message
          });
        }
      }
      
      // Sort by timestamp descending
      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      logger.error('Failed to list backups', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete backup by ID
   */
  async deleteBackup(backupId) {
    try {
      const backups = await this.listBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) {
        throw new Error(`Backup with ID ${backupId} not found`);
      }
      
      // Delete archive file
      if (await fs.pathExists(backup.archivePath)) {
        await fs.remove(backup.archivePath);
      }
      
      // Delete manifest file
      if (await fs.pathExists(backup.manifestPath)) {
        await fs.remove(backup.manifestPath);
      }
      
      logger.info('Backup deleted successfully', {
        backupId,
        backupName: backup.name
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete backup', {
        backupId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean old backups according to retention policy
   */
  async cleanOldBackups() {
    try {
      logger.info('Starting backup cleanup', {
        retention: this.retention
      });
      
      const backups = await this.listBackups();
      const now = new Date();
      let deletedCount = 0;
      
      for (const backup of backups) {
        const backupDate = new Date(backup.timestamp);
        const daysDiff = Math.floor((now - backupDate) / (1000 * 60 * 60 * 24));
        
        let shouldDelete = false;
        
        switch (backup.type) {
          case 'daily':
            if (daysDiff > this.retention.daily) {
              shouldDelete = true;
            }
            break;
          case 'weekly':
            if (daysDiff > (this.retention.weekly * 7)) {
              shouldDelete = true;
            }
            break;
          case 'monthly':
            if (daysDiff > (this.retention.monthly * 30)) {
              shouldDelete = true;
            }
            break;
        }
        
        if (shouldDelete) {
          await this.deleteBackup(backup.id);
          deletedCount++;
        }
      }
      
      logger.info('Backup cleanup completed', {
        deletedCount,
        retention: this.retention
      });
      
      return { deletedCount };
    } catch (error) {
      logger.error('Backup cleanup failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get backup system status
   */
  async getStatus() {
    try {
      const backups = await this.listBackups();
      const diskUsage = await this.getDiskUsage();
      
      return {
        backupsCount: backups.length,
        backupsByType: {
          daily: backups.filter(b => b.type === 'daily').length,
          weekly: backups.filter(b => b.type === 'weekly').length,
          monthly: backups.filter(b => b.type === 'monthly').length,
          manual: backups.filter(b => b.type === 'manual').length
        },
        lastBackup: backups.length > 0 ? backups[0] : null,
        diskUsage,
        backupDir: this.backupDir,
        retention: this.retention
      };
    } catch (error) {
      logger.error('Failed to get backup status', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get disk usage information
   */
  async getDiskUsage() {
    try {
      const stats = await this.getDirectoryStats(this.backupDir);
      
      return {
        totalSize: stats.totalSize,
        fileCount: stats.fileCount,
        backupDir: this.backupDir
      };
    } catch (error) {
      return {
        totalSize: 0,
        fileCount: 0,
        error: error.message
      };
    }
  }
}

module.exports = BackupManager;