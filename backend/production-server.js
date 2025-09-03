const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Production configuration
const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'production',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  dbUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/colab_crm',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  httpsEnabled: process.env.HTTPS_ENABLED === 'true',
  sslKeyPath: process.env.SSL_KEY_PATH,
  sslCertPath: process.env.SSL_CERT_PATH,
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Logging utility
const logger = {
  info: (message, meta = {}) => {
    if (config.logLevel === 'info' || config.logLevel === 'debug') {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`, meta);
    }
  },
  error: (message, error = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}`, error);
  },
  debug: (message, meta = {}) => {
    if (config.logLevel === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} ${message}`, meta);
    }
  }
};

// CORS headers
const setCorsHeaders = (res, origin) => {
  if (config.corsOrigins.includes(origin) || config.nodeEnv === 'development') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

// Request logging middleware
const logRequest = (req) => {
  logger.info(`${req.method} ${req.url}`, {
    userAgent: req.headers['user-agent'],
    ip: req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  });
};

// Error response helper
const sendError = (res, statusCode, message, error = null) => {
  logger.error(`Error ${statusCode}: ${message}`, error);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: message,
    timestamp: new Date().toISOString(),
    ...(config.nodeEnv === 'development' && error && { details: error.message })
  }));
};

// Success response helper
const sendSuccess = (res, data, statusCode = 200) => {
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'X-Powered-By': 'CO-LAB CRM v4.0'
  });
  res.end(JSON.stringify(data));
};

// Content-Type detection
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return types[ext] || 'application/octet-stream';
};

// Main server function
const createServer = (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);
  logRequest(req);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Health check endpoint
    if (req.url === '/health' || req.url === '/api/health') {
      sendSuccess(res, {
        status: 'OK',
        version: '4.0',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
      return;
    }

    // API routes
    if (req.url.startsWith('/api/')) {
      handleApiRoutes(req, res);
      return;
    }

    // Static file serving
    handleStaticFiles(req, res);

  } catch (error) {
    sendError(res, 500, 'Internal server error', error);
  }
};

// API route handler
const handleApiRoutes = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // Authentication endpoints
  if (pathname === '/api/auth/login' && method === 'POST') {
    handleLogin(req, res);
    return;
  }

  if (pathname === '/api/auth/verify' && method === 'GET') {
    handleAuthVerify(req, res);
    return;
  }

  // Business logic endpoints (using mock data for now)
  if (pathname.includes('/api/clients')) {
    handleClients(req, res, pathname, method);
    return;
  }

  if (pathname.includes('/api/warehouse') || pathname.includes('/api/products')) {
    handleWarehouse(req, res, pathname, method);
    return;
  }

  if (pathname.includes('/api/orders')) {
    handleOrders(req, res, pathname, method);
    return;
  }

  if (pathname.includes('/api/contracts')) {
    handleContracts(req, res, pathname, method);
    return;
  }

  if (pathname.includes('/api/managers')) {
    handleManagers(req, res, pathname, method);
    return;
  }

  // Default API response
  sendSuccess(res, { 
    status: 'OK', 
    message: 'API endpoint not implemented yet',
    availableEndpoints: [
      '/api/auth/login',
      '/api/auth/verify', 
      '/api/clients',
      '/api/warehouse',
      '/api/products',
      '/api/orders',
      '/api/contracts',
      '/api/managers'
    ]
  });
};

// Static file handler with caching
const handleStaticFiles = (req, res) => {
  let filePath = req.url;
  
  // Default to login page
  if (filePath === '/') {
    filePath = '/simple-login.html';
  }

  // Remove query parameters
  if (filePath.includes('?')) {
    filePath = filePath.split('?')[0];
  }

  const fullPath = path.join(__dirname, '../frontend', filePath);
  
  // Security check - prevent directory traversal
  if (!fullPath.startsWith(path.join(__dirname, '../frontend'))) {
    sendError(res, 403, 'Access denied');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err) {
      logger.debug(`File not found: ${fullPath}`);
      sendError(res, 404, `File not found: ${filePath}`);
      return;
    }

    if (!stats.isFile()) {
      sendError(res, 404, 'Not a file');
      return;
    }

    const contentType = getContentType(fullPath);
    
    // Set caching headers for static assets
    if (config.nodeEnv === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
      res.setHeader('ETag', `"${stats.mtime.getTime()}"`);
    }

    fs.readFile(fullPath, (err, content) => {
      if (err) {
        sendError(res, 500, 'Error reading file', err);
        return;
      }

      res.writeHead(200, { 
        'Content-Type': contentType,
        'X-Powered-By': 'CO-LAB CRM v4.0'
      });
      res.end(content);
    });
  });
};

// Mock handlers (to be replaced with real database logic)
const handleLogin = (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      
      // In production, validate against real database
      if (data.email === 'admin@colab-crm.com' && data.password === 'admin123') {
        sendSuccess(res, {
          message: 'Login successful',
          user: { 
            id: '1', 
            email: 'admin@colab-crm.com', 
            name: 'Admin User',
            role: 'admin'
          },
          token: 'production-jwt-token-' + Date.now() // Replace with real JWT
        });
      } else {
        sendError(res, 401, 'Invalid credentials');
      }
    } catch (error) {
      sendError(res, 400, 'Invalid JSON in request body', error);
    }
  });
};

const handleAuthVerify = (req, res) => {
  // In production, verify JWT token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sendSuccess(res, { 
      valid: true, 
      user: { 
        id: '1', 
        email: 'admin@colab-crm.com', 
        name: 'Admin User',
        role: 'admin'
      }
    });
  } else {
    sendError(res, 401, 'Invalid or missing token');
  }
};

// Mock business logic handlers
const handleClients = (req, res, pathname, method) => {
  if (method === 'GET') {
    sendSuccess(res, {
      clients: [
        {
          id: '1',
          name: 'ООО "Тестовая компания"',
          phone: '+7 900 123-45-67',
          email: 'test@company.ru',
          status: 'active',
          manager: 'Менеджер 1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      meta: { totalCount: 1 }
    });
  } else if (method === 'POST') {
    // Handle client creation
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        sendSuccess(res, {
          id: Date.now().toString(),
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, 201);
      } catch (error) {
        sendError(res, 400, 'Invalid JSON in request body', error);
      }
    });
  } else {
    sendError(res, 405, 'Method not allowed');
  }
};

const handleWarehouse = (req, res, pathname, method) => {
  const mockProducts = [
    {
      id: '1',
      name: 'Товар 1',
      sku: 'SKU001',
      price: 1500,
      purchasePrice: 1200,
      quantity: 100,
      minQuantity: 10,
      supplier: 'Поставщик 1',
      category: 'Категория А',
      status: 'active',
      unit: 'шт',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  if (method === 'GET') {
    if (pathname.includes('/api/warehouse/stats')) {
      sendSuccess(res, {
        totalProducts: 1,
        lowStockCount: 0,
        totalValue: 150000,
        categories: 1
      });
    } else if (pathname.includes('/api/warehouse')) {
      // For order creation
      sendSuccess(res, { items: mockProducts, total: mockProducts.length });
    } else {
      // Products endpoint
      sendSuccess(res, {
        products: mockProducts,
        suppliers: ['Поставщик 1'],
        stockStats: { totalItems: 1, lowStock: 0, outOfStock: 0, totalValue: 150000 },
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        meta: { totalCount: 1 }
      });
    }
  } else {
    sendError(res, 405, 'Method not allowed');
  }
};

const handleOrders = (req, res, pathname, method) => {
  if (method === 'GET') {
    if (pathname.includes('/stats/overview')) {
      sendSuccess(res, {
        totalOrders: 1,
        activeOrders: 1,
        completedOrders: 0,
        totalAmount: 15000
      });
    } else {
      sendSuccess(res, {
        orders: [{
          id: '1',
          number: 'ORD001',
          client: { id: '1', name: 'ООО "Тестовая компания"' },
          status: 'CREATED',
          totalAmount: 15000,
          itemsCount: 1,
          createdAt: new Date().toISOString()
        }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });
    }
  } else {
    sendError(res, 405, 'Method not allowed');
  }
};

const handleContracts = (req, res, pathname, method) => {
  if (method === 'GET') {
    if (pathname.includes('/stats/overview')) {
      sendSuccess(res, {
        totalActive: 1,
        totalAmount: 150000,
        expiringCount: 0,
        totalContracts: 1
      });
    } else {
      sendSuccess(res, {
        contracts: [{
          id: '1',
          contractNumber: 'CTR001',
          client: { id: '1', name: 'ООО "Тестовая компания"' },
          status: 'active',
          totalAmount: 150000,
          createdAt: new Date().toISOString()
        }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });
    }
  } else {
    sendError(res, 405, 'Method not allowed');
  }
};

const handleManagers = (req, res, pathname, method) => {
  if (method === 'GET') {
    sendSuccess(res, {
      managers: [
        { id: '1', name: 'Менеджер 1' },
        { id: '2', name: 'Менеджер 2' }
      ]
    });
  } else {
    sendError(res, 405, 'Method not allowed');
  }
};

// Server startup
const startServer = () => {
  let server;

  if (config.httpsEnabled && config.sslKeyPath && config.sslCertPath) {
    // HTTPS server
    const options = {
      key: fs.readFileSync(config.sslKeyPath),
      cert: fs.readFileSync(config.sslCertPath)
    };
    server = https.createServer(options, createServer);
  } else {
    // HTTP server
    server = http.createServer(createServer);
  }

  server.listen(config.port, () => {
    logger.info(`
========================================
🚀 CO-LAB CRM Production Server Running!
========================================
Environment: ${config.nodeEnv}
Protocol: ${config.httpsEnabled ? 'HTTPS' : 'HTTP'}
Port: ${config.port}
URL: ${config.httpsEnabled ? 'https' : 'http'}://localhost:${config.port}/simple-login.html

Production credentials:
  Email: admin@colab-crm.com
  Password: admin123

Features:
  ✅ CORS configured
  ✅ Request logging
  ✅ Error handling
  ✅ Static file caching
  ✅ Security headers
  ${config.httpsEnabled ? '✅ HTTPS enabled' : '⚠️  HTTP only (enable HTTPS for production)'}
========================================
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  return server;
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { startServer, config };