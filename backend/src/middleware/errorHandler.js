const { logError, logWithContext } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Determine if this is an operational error vs programming error
  const isOperationalError = err.statusCode && err.statusCode < 500;
  
  // Log error with full context
  logError(err, req, {
    isOperationalError,
    errorType: getErrorType(err),
    endpoint: req.originalUrl || req.url,
    method: req.method
  });

  // Prisma errors
  if (err.code === 'P2002') {
    logWithContext('warn', 'Database constraint violation: Duplicate entry', req, {
      errorCode: err.code,
      meta: err.meta,
      constraint: err.meta?.target
    });
    
    return res.status(400).json({
      error: 'Duplicate entry',
      message: 'A record with this data already exists',
      requestId: req.id
    });
  }

  if (err.code === 'P2025') {
    logWithContext('warn', 'Database record not found', req, {
      errorCode: err.code,
      meta: err.meta
    });
    
    return res.status(404).json({
      error: 'Record not found',
      message: 'The requested record was not found',
      requestId: req.id
    });
  }

  // Validation errors
  if (err.isJoi) {
    logWithContext('warn', 'Request validation failed', req, {
      validationError: err.details[0].message,
      path: err.details[0].path,
      value: err.details[0].context?.value
    });
    
    return res.status(400).json({
      error: 'Validation error',
      message: err.details[0].message,
      requestId: req.id
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    logWithContext('warn', 'JWT validation failed: Invalid token', req, {
      jwtError: err.name,
      tokenProvided: !!req.headers.authorization
    });
    
    return res.status(401).json({
      error: 'Invalid token',
      message: 'The provided token is invalid',
      requestId: req.id
    });
  }

  if (err.name === 'TokenExpiredError') {
    logWithContext('warn', 'JWT validation failed: Token expired', req, {
      jwtError: err.name,
      expiredAt: err.expiredAt,
      tokenProvided: !!req.headers.authorization
    });
    
    return res.status(401).json({
      error: 'Token expired',
      message: 'The provided token has expired',
      requestId: req.id
    });
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    logWithContext('warn', 'File upload failed: File too large', req, {
      uploadError: err.code,
      limit: err.limit,
      field: err.field
    });
    
    return res.status(400).json({
      error: 'File too large',
      message: 'The uploaded file exceeds the maximum allowed size',
      requestId: req.id
    });
  }

  // Rate limiting errors
  if (err.name === 'RateLimitError' || err.statusCode === 429) {
    logWithContext('warn', 'Rate limit exceeded', req, {
      rateLimitError: true,
      remaining: err.remaining,
      resetTime: err.resetTime
    });
    
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      requestId: req.id
    });
  }

  // Database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    logError(err, req, {
      databaseError: true,
      critical: true
    });
    
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Database connection failed. Please try again later.',
      requestId: req.id
    });
  }

  // Programming errors (unhandled)
  if (!isOperationalError) {
    logError(err, req, {
      programmingError: true,
      critical: true,
      needsInvestigation: true
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  // Log final error response
  logWithContext(statusCode >= 500 ? 'error' : 'warn', 'Error response sent to client', req, {
    statusCode,
    errorMessage: message,
    originalError: err.message
  });

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Server error' : 'Client error',
    message,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: {
        name: err.name,
        code: err.code
      }
    })
  });
};

// Helper function to categorize error types
function getErrorType(err) {
  if (err.code && err.code.startsWith('P')) return 'database';
  if (err.isJoi) return 'validation';
  if (err.name && err.name.includes('JWT')) return 'authentication';
  if (err.code === 'LIMIT_FILE_SIZE') return 'upload';
  if (err.code && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) return 'connection';
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) return 'client';
  if (err.statusCode && err.statusCode >= 500) return 'server';
  return 'unknown';
}

module.exports = errorHandler;
