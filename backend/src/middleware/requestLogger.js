const { v4: uuidv4 } = require('uuid');
const { accessLogger, logWithContext, logPerformance } = require('../utils/logger');

// Generate unique request ID middleware
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Main request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request
  const requestData = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection?.remoteAddress,
    referrer: req.headers.referer,
    userId: req.user?.id,
    userEmail: req.user?.email,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: shouldLogBody(req) ? sanitizeBody(req.body) : undefined
  };

  logWithContext('info', 'Incoming ' + req.method + ' ' + (req.originalUrl || req.url), req, Object.assign({type: 'request'}, requestData));

  // Override res.end to capture response data
  const originalEnd = res.end;
  const originalSend = res.send;
  const originalJson = res.json;

  let responseBody;
  let responseSize = 0;

  // Capture response body for logging
  res.send = function(body) {
    responseBody = body;
    responseSize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
    return originalSend.call(this, body);
  };

  res.json = function(body) {
    responseBody = body;
    responseSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    return originalJson.call(this, body);
  };

  res.end = function(chunk) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (chunk && !responseBody) {
      responseBody = chunk;
      responseSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk || '', 'utf8');
    }

    // Log response
    const responseData = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      responseTime: duration,
      responseSize,
      userId: req.user?.id,
      userEmail: req.user?.email,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      contentType: res.getHeader('content-type'),
      cacheControl: res.getHeader('cache-control'),
      responseBody: shouldLogResponseBody(req, res) ? sanitizeResponseBody(responseBody) : undefined
    };

    // Determine log level based on status code
    let logLevel = 'info';
    if (res.statusCode >= 400 && res.statusCode < 500) {
      logLevel = 'warn';
    } else if (res.statusCode >= 500) {
      logLevel = 'error';
    }

    // Log the response
    logWithContext(logLevel, req.method + ' ' + (req.originalUrl || req.url) + ' ' + res.statusCode + ' - ' + duration + 'ms', req, Object.assign({type: 'response'}, responseData));

    // Log performance metrics for slow requests
    if (duration > 1000) {
      logPerformance(req.method + ' ' + (req.originalUrl || req.url), duration, req, {
        statusCode: res.statusCode,
        slow: true
      });
    }

    // Use access logger for structured access logs
    accessLogger.info('HTTP Request', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: duration,
      responseSize,
      userId: req.user?.id,
      userEmail: req.user?.email,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer
    });

    return originalEnd.call(this, chunk);
  };

  next();
};

// Helper functions
function shouldLogBody(req) {
  const sensitiveRoutes = ['/api/auth/login', '/api/auth/register', '/api/auth/reset-password'];
  const largeBinaryTypes = ['image/', 'video/', 'audio/', 'application/octet-stream'];
  
  if (sensitiveRoutes.some(route => req.path.startsWith(route))) {
    return false;
  }
  
  const contentType = req.headers['content-type'] || '';
  if (largeBinaryTypes.some(type => contentType.startsWith(type))) {
    return false;
  }
  
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 1024 * 1024) {
    return false;
  }
  
  return true;
}

function shouldLogResponseBody(req, res) {
  const contentType = res.getHeader('content-type') || '';
  const largeBinaryTypes = ['image/', 'video/', 'audio/', 'application/octet-stream'];
  
  if (largeBinaryTypes.some(type => contentType.startsWith(type))) {
    return false;
  }
  
  if (res.get('content-length') && parseInt(res.get('content-length')) > 1024 * 1024) {
    return false;
  }
  
  if (res.get('content-disposition')) {
    return false;
  }
  
  return process.env.NODE_ENV === 'development';
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'auth'];
  const sanitized = Object.assign({}, body);
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeResponseBody(body) {
  if (!body) return body;
  
  try {
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    
    if (typeof body === 'object') {
      const sanitized = Object.assign({}, body);
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'auth', 'jwt'];
      
      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      }
      
      return sanitized;
    }
  } catch (e) {
    return typeof body === 'string' ? body.substring(0, 500) + '...' : body;
  }
  
  return body;
}

// Error tracking middleware
const errorTracker = (err, req, res, next) => {
  req.error = {
    name: err.name,
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    timestamp: new Date().toISOString()
  };
  
  next(err);
};

module.exports = {
  requestId,
  requestLogger,
  errorTracker
};
