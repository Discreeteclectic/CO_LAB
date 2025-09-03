# CO_LAB CRM Backup System - Installation Instructions

## Quick Start

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Run Setup Script**
   ```bash
   node setup-backup.js
   ```

3. **Configure Environment**
   ```bash
   cp .env.backup.template .env
   # Edit .env with your settings
   ```

4. **Start Server**
   ```bash
   npm start
   ```

5. **Access Backup Interface**
   Open `/frontend/backup.html` in your browser

## Configuration

### Environment Variables (.env)

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
```

### Email Setup (Gmail Example)

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. Use the generated password as `SMTP_PASSWORD`

## Files Created

### Backend Files
- `/src/utils/backup.js` - Core backup functionality
- `/src/utils/restoreManager.js` - Restore operations
- `/src/services/backupScheduler.js` - Cron scheduling and notifications
- `/src/routes/backup.js` - REST API endpoints
- `/backups/` - Backup storage directory
- `/.env.backup.template` - Environment configuration template
- `/setup-backup.js` - Setup and testing script
- `/BACKUP_SYSTEM.md` - Comprehensive documentation

### Frontend Files
- `/frontend/backup.html` - Web management interface

### Dependencies Added
- `archiver` - Archive creation
- `cron` - Job scheduling
- `fs-extra` - Enhanced file operations
- `nodemailer` - Email notifications
- `tar` - Archive compression

## API Endpoints

All endpoints require admin authentication:

- `GET /api/backup` - List backups
- `POST /api/backup/create` - Create manual backup
- `GET /api/backup/:id/download` - Download backup
- `DELETE /api/backup/:id` - Delete backup
- `GET /api/backup/status` - System status
- `POST /api/backup/restore` - Restore from backup
- `POST /api/backup/test-email` - Test email config
- `POST /api/backup/cleanup` - Manual cleanup

## Backup Components

1. **Database** - SQLite database with integrity verification
2. **Uploads** - File uploads directory
3. **Configuration** - package.json, schema.prisma
4. **Logs** - Compressed application logs

## Security Features

- Admin-only access for all operations
- SHA256 integrity verification
- Pre-restore backups of current data
- Confirmation tokens for destructive operations
- Environment secrets excluded from backups

## Monitoring

- Comprehensive logging with winston
- Email notifications for success/failure
- System health checks
- Performance metrics
- Disk usage monitoring

## Automated Scheduling

- **Daily**: Database, uploads, config, logs (2 AM)
- **Weekly**: Full system backup (1 AM Sunday)  
- **Monthly**: Archive backup (1st of month)
- **Cleanup**: Old backup removal (3 AM daily)

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   sudo chown -R $USER:$USER backups/
   chmod 755 backups/
   ```

2. **Email Not Working**
   - Verify SMTP credentials
   - Check firewall settings
   - Test with `POST /api/backup/test-email`

3. **Backup Failures**
   - Check disk space
   - Verify database accessibility
   - Review server logs

### Testing

1. **Manual Backup**
   ```bash
   curl -X POST http://localhost:5000/api/backup/create \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"type":"manual","description":"Test backup"}'
   ```

2. **System Status**
   ```bash
   curl http://localhost:5000/api/backup/status \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Email Test**
   ```bash
   curl -X POST http://localhost:5000/api/backup/test-email \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Best Practices

1. **Regular Testing**: Test restore functionality monthly
2. **Monitor Storage**: Set up disk space alerts
3. **External Backups**: Copy critical backups off-site
4. **Documentation**: Keep restore procedures updated
5. **Access Control**: Limit backup access to administrators
6. **Retention Tuning**: Adjust retention based on storage capacity

## Support

- Full documentation: `BACKUP_SYSTEM.md`
- Setup script: `node setup-backup.js`
- Web interface: `/frontend/backup.html`
- API documentation: Built-in endpoint descriptions

## Integration

The backup system is fully integrated with the existing CO_LAB CRM:
- Uses existing authentication system
- Follows established API patterns
- Leverages winston logging
- Maintains consistent error handling
- Works with current database structure