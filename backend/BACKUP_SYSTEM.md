# CO_LAB CRM Backup System

A comprehensive automated backup system for the CO_LAB CRM application with integrity verification, compression, scheduling, and restore capabilities.

## Features

- **Automated Backups**: Daily, weekly, and monthly scheduled backups
- **Manual Backups**: On-demand backup creation through API and UI
- **Component-wise Backup**: Database, uploads, configuration files, and logs
- **Compression**: tar.gz compression with integrity verification
- **Email Notifications**: Success/failure notifications via SMTP
- **Web Interface**: Complete backup management dashboard
- **Restore Functionality**: Restore from backups with safety measures
- **Retention Policies**: Automatic cleanup of old backups
- **Monitoring**: System status and health checks

## Directory Structure

```
backend/
├── backups/
│   ├── daily/          # Daily backups
│   ├── weekly/         # Weekly backups
│   ├── monthly/        # Monthly backups
│   └── temp/           # Temporary extraction/processing
├── src/
│   ├── utils/
│   │   └── backup.js   # Core backup functionality
│   ├── services/
│   │   └── backupScheduler.js  # Cron scheduling and notifications
│   └── routes/
│       └── backup.js   # REST API endpoints
└── frontend/
    └── backup.html     # Web management interface
```

## Environment Configuration

Create a `.env` file with the following backup-related variables:

```env
# Backup Configuration
BACKUP_DIR=./backups
BACKUP_RETENTION_DAILY=30
BACKUP_RETENTION_WEEKLY=12
BACKUP_RETENTION_MONTHLY=12

# Backup Schedules (Cron Format)
BACKUP_DAILY_SCHEDULE="0 2 * * *"      # 2 AM daily
BACKUP_WEEKLY_SCHEDULE="0 1 * * 0"     # 1 AM Sunday
BACKUP_MONTHLY_SCHEDULE="0 0 1 * *"    # Midnight 1st of month
BACKUP_CLEANUP_SCHEDULE="0 3 * * *"    # 3 AM daily cleanup

# Email Configuration
BACKUP_EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
BACKUP_EMAIL_FROM=your-email@gmail.com
BACKUP_EMAIL_TO=admin@yourcompany.com

# Timezone
TZ=UTC
```

## API Endpoints

All backup endpoints require admin authentication (`role: 'ADMIN'`).

### GET /api/backup
List all available backups with metadata.

### POST /api/backup/create
Create a manual backup.
```json
{
  "type": "manual",
  "description": "Manual backup before system update"
}
```

### GET /api/backup/:id/download
Download a specific backup archive.

### DELETE /api/backup/:id
Delete a specific backup.

### GET /api/backup/status
Get backup system status and statistics.

### POST /api/backup/restore
Restore from a backup (DESTRUCTIVE OPERATION).
```json
{
  "backupId": "uuid",
  "components": ["database", "uploads", "config"],
  "confirmToken": "CONFIRM_RESTORE"
}
```

### POST /api/backup/test-email
Test email notification configuration.

### POST /api/backup/cleanup
Manually trigger cleanup of old backups.

## Backup Components

### Database Backup
- Copies SQLite database file (`prisma/dev.db`)
- Includes journal file if present
- Verifies integrity with SHA256 hash comparison
- Creates backup of current database before restore

### File Uploads Backup
- Complete copy of `uploads/` directory
- Preserves file structure and permissions
- Statistics tracking (file count, total size)

### Configuration Backup
- `package.json` and `package-lock.json`
- Prisma schema (`prisma/schema.prisma`)
- Environment template (`.env` excluded for security)

### Logs Backup
- Compresses all `.log` files in `logs/` directory
- Uses gzip compression to save space
- Maintains log rotation structure

## Web Interface

Access the backup management interface at `/frontend/backup.html`.

Features:
- System status dashboard
- Backup statistics and next scheduled backup
- List of all available backups
- Manual backup creation
- Backup download and deletion
- Restore interface with confirmation dialogs
- Email configuration testing
- Manual cleanup trigger

## Scheduling

The system uses cron jobs for automated backups:

- **Daily**: 2:00 AM (configurable)
- **Weekly**: 1:00 AM on Sunday (configurable)
- **Monthly**: Midnight on 1st of month (configurable)
- **Cleanup**: 3:00 AM daily (configurable)

## Email Notifications

Automated email notifications are sent for:
- Backup completion (success/failure)
- Backup cleanup results
- System initialization
- Critical errors

Email templates include:
- Backup details (ID, name, size, duration)
- Component information
- Error messages and troubleshooting info
- System health status

## Security Features

- **Admin-only Access**: All backup operations require admin role
- **Confirmation Tokens**: Restore operations require explicit confirmation
- **Pre-restore Backups**: Current data is backed up before restoration
- **Integrity Verification**: SHA256 hashing for backup verification
- **Safe Environment Handling**: `.env` files are not included in backups

## Monitoring and Health Checks

The system provides comprehensive monitoring:

### System Status
- Scheduler initialization status
- Total backup count by type
- Last backup information
- Disk usage statistics
- Email notification status

### Backup Verification
- File integrity checks using SHA256 hashes
- Database format validation
- Archive extraction verification
- Component availability checks

### Error Handling
- Detailed error logging with context
- Graceful failure handling
- Automatic cleanup on failed operations
- Email notifications for critical errors

## Restoration Process

Restore operations follow these safety measures:

1. **Pre-restore Backup**: Current data is backed up before restoration
2. **Component Selection**: Choose which components to restore
3. **Confirmation Required**: Must type "CONFIRM_RESTORE" to proceed
4. **Atomic Operations**: All-or-nothing restoration per component
5. **Rollback Capability**: Original data preserved on failure
6. **Audit Trail**: Complete logging of restoration actions

## Installation and Setup

1. **Install Dependencies**:
   ```bash
   npm install archiver cron fs-extra nodemailer tar
   ```

2. **Create Backup Directories**:
   ```bash
   mkdir -p backups/{daily,weekly,monthly,temp}
   ```

3. **Configure Environment**:
   Copy `.env.example` to `.env` and configure backup settings.

4. **Initialize System**:
   The backup scheduler automatically initializes when the server starts.

5. **Test Configuration**:
   Use the web interface or API to test email configuration and create a manual backup.

## Troubleshooting

### Common Issues

**Scheduler Not Starting**:
- Check server logs for initialization errors
- Verify cron schedule format
- Ensure backup directories exist and are writable

**Email Notifications Not Working**:
- Verify SMTP credentials and settings
- Test email configuration through web interface
- Check firewall settings for SMTP ports

**Backup Failures**:
- Verify database file accessibility
- Check disk space availability
- Ensure proper file permissions
- Review backup directory write permissions

**Large Backup Files**:
- Monitor disk usage regularly
- Adjust retention policies as needed
- Consider external backup storage for large installations

### Log Analysis

The system provides detailed logging:
- Backup creation and completion events
- Component-level success/failure status
- Performance metrics (size, duration)
- Error details with stack traces
- Email notification status

Check logs at:
- Combined logs: `logs/combined-*.log`
- Error logs: `logs/error-*.log`
- Application logs through winston logger

## Best Practices

1. **Regular Testing**: Test restore functionality regularly
2. **Monitor Disk Space**: Set up alerts for backup storage usage
3. **Email Configuration**: Always configure email notifications
4. **Retention Policies**: Adjust based on available storage
5. **Security**: Restrict backup access to administrators only
6. **Documentation**: Keep backup and restore procedures documented
7. **External Storage**: Consider copying critical backups to external storage

## Performance Considerations

- Backup operations are designed to run during low-usage hours
- Large uploads directories may increase backup time
- Database backups include integrity verification (additional time)
- Compression reduces storage requirements but increases processing time
- Email notifications are sent asynchronously to avoid blocking operations

## Integration

The backup system integrates seamlessly with the existing CO_LAB CRM:
- Uses existing authentication and authorization
- Leverages winston logging infrastructure
- Follows established API patterns
- Maintains consistent error handling
- Integrates with existing middleware stack