const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Custom log format with structured data
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    
    // Base log object
    const logObj = {
      timestamp,
      level: level.toUpperCase(),
      message,
      pid: process.pid,
      hostname: require('os').hostname(),
      ...meta
    };
    
    return JSON.stringify(logObj);
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
require('fs').mkdirSync(logsDir, { recursive: true });

// Daily rotating file transport for errors
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  handleExceptions: true,
  handleRejections: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat
});

// Daily rotating file transport for all logs
const combinedFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat
});

// Daily rotating file transport for access logs
const accessFileTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '20m',
  maxFiles: '7d',
  format: logFormat
});

// Console transport for development
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  handleExceptions: true,
  handleRejections: true,
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
    winston.format.printf((info) => {
      const { timestamp, level, message, requestId, userId, ...meta } = info;
      let logString = `${timestamp} [${level}]`;
      
      if (requestId) logString += ` [${requestId}]`;
      if (userId) logString += ` [User:${userId}]`;
      
      logString += `: ${message}`;
      
      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        logString += ` ${JSON.stringify(meta)}`;
      }
      
      return logString;
    })
  )
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  defaultMeta: {
    service: 'colab-crm-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    errorFileTransport,
    combinedFileTransport,
    ...(process.env.NODE_ENV !== 'test' ? [consoleTransport] : [])
  ],
  exitOnError: false
});

// Create separate access logger for HTTP requests
const accessLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: 'colab-crm-backend',
    type: 'access'
  },
  transports: [
    accessFileTransport,
    combinedFileTransport
  ]
});

// Helper functions for structured logging
const createLogContext = (req = {}, additionalContext = {}) => {
  // Handle null/undefined req parameter
  if (!req) {
    req = {};
  }
  
  return {
    requestId: req.id || req.headers?.['x-request-id'],
    userId: req.user?.id,
    userEmail: req.user?.email,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers?.['user-agent'],
    ...additionalContext
  };
};

// Enhanced logging methods with context
const logWithContext = (level, message, req, additionalContext = {}) => {
  const context = createLogContext(req, additionalContext);
  logger.log(level, message, context);
};

// Database operation logging helper
const logDatabaseOperation = (operation, table, req, additionalData = {}) => {
  logWithContext('info', `Database ${operation} on ${table}`, req, {
    operation,
    table,
    ...additionalData
  });
};

// Authentication logging helper
const logAuthEvent = (event, req, additionalData = {}) => {
  logWithContext('info', `Authentication event: ${event}`, req, {
    authEvent: event,
    ...additionalData
  });
};

// Performance logging helper
const logPerformance = (operation, duration, req, additionalData = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logWithContext(level, `Performance: ${operation} took ${duration}ms`, req, {
    operation,
    duration,
    performance: true,
    ...additionalData
  });
};

// Error logging with full context
const logError = (error, req, additionalContext = {}) => {
  const context = createLogContext(req, {
    errorName: error.name,
    errorCode: error.code,
    stack: error.stack,
    ...additionalContext
  });
  
  logger.error(error.message, context);
};

// Business logic logging
const logBusinessEvent = (event, req, data = {}) => {
  logWithContext('info', `Business event: ${event}`, req, {
    businessEvent: event,
    ...data
  });
};

module.exports = {
  logger,
  accessLogger,
  logWithContext,
  logDatabaseOperation,
  logAuthEvent,
  logPerformance,
  logError,
  logBusinessEvent,
  createLogContext
};
