const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import logging utilities
const { logger, logWithContext, logBusinessEvent } = require('./utils/logger');
const { requestId, requestLogger, errorTracker } = require('./middleware/requestLogger');

// Import performance optimization utilities
const { requestTimer, compressionMiddleware, optimizeRequests, getPerformanceStats } = require('./middleware/performance');
const { cacheManager, cacheMiddleware } = require('./utils/cache');
const { databaseOptimizer, createIndexes, healthCheck, runMaintenance } = require('./utils/database-optimization');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const productRoutes = require('./routes/products');
const warehouseRoutes = require('./routes/warehouse');
const calculationRoutes = require('./routes/calculations');
const fileRoutes = require('./routes/files');
const orderRoutes = require('./routes/orders');
const contractRoutes = require('./routes/contracts');
const managersRoutes = require('./routes/managers');
const dialoguesRoutes = require('./routes/dialogues');
const notificationsRoutes = require('./routes/notifications');
const remindersRoutes = require('./routes/reminders');
const proposalsRoutes = require('./routes/proposals');
const digitalSignaturesRoutes = require('./routes/digitalSignatures');
const analyticsRoutes = require('./routes/analytics');
const { router: backupRoutes, initializeBackupScheduler } = require('./routes/backup');
const cronJobsService = require('./services/cronJobs');

const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Log application startup
logger.info('Starting CO_LAB CRM API Server', {
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  nodeVersion: process.version,
  timestamp: new Date().toISOString()
});

// Rate limiting (disabled for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // much higher limit for development
  message: 'Too many requests from this IP, please try again later'
});

// Performance monitoring middleware (should be early in the stack)
app.use(requestTimer());
app.use(optimizeRequests());

// Add request ID and logging middleware early in the stack
app.use(requestId);
app.use(requestLogger);

// Manual CORS implementation that works with Safari
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log CORS requests for monitoring
  if (origin) {
    logger.debug('CORS request from origin', { origin, method: req.method });
  }
  
  // Set CORS headers for all requests
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Request-ID');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-ID');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    logger.debug('Handling OPTIONS preflight request');
    return res.sendStatus(200);
  }
  
  next();
});

// Security middleware AFTER CORS
app.use(limiter);
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));
app.use(compression());
app.use(compressionMiddleware());

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Log large payloads
    if (buf.length > 1024 * 1024) { // 1MB
      logWithContext('info', 'Large request payload detected', req, {
        payloadSize: buf.length,
        sizeInMB: (buf.length / 1024 / 1024).toFixed(2)
      });
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check with logging and performance metrics
app.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      performance: getPerformanceStats(),
      cache: cacheManager.getStats(),
      database: await healthCheck()
    };
    
    // Log health checks periodically (every 100th request)
    if (Math.random() < 0.01) {
      logWithContext('info', 'Health check performed', req, healthStatus);
    }
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Add cache warming middleware for common endpoints
const warmCacheMiddleware = (req, res, next) => {
  // Warm cache for expensive operations
  if (req.path.includes('/analytics') && req.method === 'GET') {
    res.on('finish', () => {
      // Cache analytics for future requests
      const cacheKey = cacheManager.generateKey('analytics', req.originalUrl, req.user?.id || 'anonymous');
      // Cache is already handled by response middleware
    });
  }
  next();
};

// Add authentication logging middleware for protected routes
const logAuthenticatedAccess = (req, res, next) => {
  if (req.user) {
    logWithContext('debug', 'Authenticated request', req, {
      authenticatedAccess: true,
      userId: req.user.id,
      userEmail: req.user.email
    });
  }
  next();
};

// Routes with business event logging
app.use('/api/auth', (req, res, next) => {
  // Log authentication attempts
  if (req.path === '/login' && req.method === 'POST') {
    logBusinessEvent('login_attempt', req, {
      email: req.body?.email,
      userAgent: req.headers['user-agent']
    });
  } else if (req.path === '/register' && req.method === 'POST') {
    logBusinessEvent('registration_attempt', req, {
      email: req.body?.email
    });
  }
  next();
}, authRoutes);

app.use('/api/clients', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, cacheMiddleware('clients', 300), clientRoutes);
app.use('/api/products', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, cacheMiddleware('products', 600), productRoutes);
app.use('/api/warehouse', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, cacheMiddleware('warehouse', 300), warehouseRoutes);
app.use('/api/calculations', authenticateToken, logAuthenticatedAccess, calculationRoutes);
app.use('/api/files', authenticateToken, logAuthenticatedAccess, fileRoutes);
app.use('/api/orders', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, orderRoutes);
app.use('/api/contracts', authenticateToken, logAuthenticatedAccess, contractRoutes);
app.use('/api/managers', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, cacheMiddleware('managers', 300), managersRoutes);
app.use('/api/dialogues', authenticateToken, logAuthenticatedAccess, dialoguesRoutes);
app.use('/api/notifications', authenticateToken, logAuthenticatedAccess, notificationsRoutes);
app.use('/api/reminders', authenticateToken, logAuthenticatedAccess, remindersRoutes);
app.use('/api/proposals', authenticateToken, logAuthenticatedAccess, proposalsRoutes);
app.use('/api/digital-signatures', authenticateToken, logAuthenticatedAccess, digitalSignaturesRoutes);
app.use('/api/analytics', authenticateToken, logAuthenticatedAccess, warmCacheMiddleware, cacheMiddleware('analytics', 180), analyticsRoutes);
app.use('/api/serial-numbers', authenticateToken, logAuthenticatedAccess, require('./routes/serialNumbers'));
app.use('/api/backup', authenticateToken, logAuthenticatedAccess, backupRoutes);

// Add error tracking before error handler
app.use(errorTracker);

// Error handling
app.use(errorHandler);

// 404 handler with logging
app.use('*', (req, res) => {
  logWithContext('warn', '404 - Route not found', req, {
    requestedRoute: req.originalUrl || req.url,
    method: req.method
  });
  
  res.status(404).json({ 
    error: 'Route not found',
    requestId: req.id
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
    critical: true
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise,
    critical: true
  });
});

const server = app.listen(PORT, () => {
  logger.info('CO_LAB CRM API Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    healthCheck: 'http://localhost:' + PORT + '/health',
    timestamp: new Date().toISOString()
  });
});

// Log when server is ready to accept connections
server.on('listening', () => {
  logger.info('Server is now accepting connections', {
    address: server.address(),
    pid: process.pid
  });
  
  // Initialize backup scheduler and cron jobs after server is listening
  setTimeout(async () => {
    try {
      initializeBackupScheduler();
      logger.info('Backup scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize backup scheduler', {
        error: error.message,
        stack: error.stack
      });
    }

    try {
      cronJobsService.init();
      logger.info('Cron jobs service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cron jobs service', {
        error: error.message,
        stack: error.stack
      });
    }
    
    // Initialize database optimization
    try {
      await createIndexes();
      logger.info('Database indexes created successfully');
    } catch (error) {
      logger.error('Failed to create database indexes', {
        error: error.message,
        stack: error.stack
      });
    }
    
    // Run database maintenance
    try {
      await runMaintenance();
      logger.info('Database maintenance completed successfully');
    } catch (error) {
      logger.error('Database maintenance failed', {
        error: error.message,
        stack: error.stack
      });
    }
    
    // Preload cache with common data
    try {
      await cacheManager.preloadCache();
      logger.info('Cache preloaded successfully');
    } catch (error) {
      logger.error('Cache preload failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }, 5000); // 5 second delay to ensure server is fully ready
});

// Handle server errors
server.on('error', (err) => {
  logger.error('Server error occurred', {
    error: err.message,
    code: err.code,
    port: PORT,
    critical: true
  });
});
