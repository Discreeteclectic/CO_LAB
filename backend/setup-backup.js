#!/usr/bin/env node

/**
 * CO_LAB CRM Backup System Setup Script
 * This script initializes the backup system and tests its configuration
 */

const fs = require('fs-extra');
const path = require('path');
const BackupManager = require('./src/utils/backup');
const BackupScheduler = require('./src/services/backupScheduler');

console.log('🛡️  CO_LAB CRM Backup System Setup');
console.log('=====================================\n');

async function setupBackupSystem() {
  try {
    console.log('1. Creating backup directory structure...');
    
    // Create backup directories
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.ensureDir(path.join(backupDir, 'daily'));
    await fs.ensureDir(path.join(backupDir, 'weekly'));
    await fs.ensureDir(path.join(backupDir, 'monthly'));
    await fs.ensureDir(path.join(backupDir, 'temp'));
    
    console.log('✅ Backup directories created successfully\n');
    
    console.log('2. Testing backup manager...');
    
    // Test backup manager initialization
    const backupManager = new BackupManager();
    const status = await backupManager.getStatus();
    
    console.log(`✅ Backup manager initialized successfully`);
    console.log(`   - Backup directory: ${status.backupDir}`);
    console.log(`   - Current backups: ${status.backupsCount}`);
    console.log(`   - Retention policy: ${status.retention.daily}d/${status.retention.weekly}w/${status.retention.monthly}m\n`);
    
    console.log('3. Checking environment configuration...');
    
    // Check for .env file
    const envPath = path.join(process.cwd(), '.env');
    if (await fs.pathExists(envPath)) {
      console.log('✅ Environment file found');
    } else {
      console.log('⚠️  No .env file found. Copy .env.backup.template to .env and configure it.');
    }
    
    // Check backup scheduler configuration
    console.log('\n4. Testing backup scheduler configuration...');
    
    const scheduler = new BackupScheduler();
    const schedulerStatus = scheduler.getStatus();
    
    console.log(`   - Email notifications: ${scheduler.emailConfig.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Daily schedule: ${scheduler.schedules.daily}`);
    console.log(`   - Weekly schedule: ${scheduler.schedules.weekly}`);
    console.log(`   - Monthly schedule: ${scheduler.schedules.monthly}`);
    
    console.log('\n5. Creating test backup...');
    
    // Create a test manual backup
    const testBackup = await backupManager.createBackup('manual', {
      description: 'Test backup created during setup',
      setupScript: true
    });
    
    console.log('✅ Test backup created successfully');
    console.log(`   - Backup ID: ${testBackup.id}`);
    console.log(`   - Backup Name: ${testBackup.name}`);
    console.log(`   - Archive Size: ${formatBytes(testBackup.archive?.size || 0)}`);
    console.log(`   - Components: ${Object.keys(testBackup.components).join(', ')}\n`);
    
    console.log('6. Setup summary:');
    console.log('================');
    console.log('✅ Backup system installed and configured successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Configure your .env file with backup settings');
    console.log('2. Set up email notifications (optional)');
    console.log('3. Start your server to activate scheduled backups');
    console.log('4. Access the backup interface at /frontend/backup.html');
    console.log('');
    console.log('For more information, see BACKUP_SYSTEM.md');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nPlease check the error details and try again.');
    console.error('Make sure all dependencies are installed: npm install');
    process.exit(1);
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run setup if called directly
if (require.main === module) {
  setupBackupSystem().catch(console.error);
}

module.exports = { setupBackupSystem };