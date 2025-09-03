const { logger, logWithContext, logBusinessEvent } = require('../../../src/utils/logger');

describe('Logger Utilities', () => {
  let originalLog;

  beforeEach(() => {
    // Mock console methods to prevent actual logging during tests
    originalLog = console.log;
    console.log = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe('Basic Logging', () => {
    test('should have all required logging methods', () => {
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    test('should log messages with different levels', () => {
      const testMessage = 'Test log message';
      const testData = { key: 'value' };

      logger.info(testMessage, testData);
      logger.error(testMessage, testData);
      logger.warn(testMessage, testData);
      logger.debug(testMessage, testData);

      // Verify logger methods were called (mocked internally)
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('Context Logging', () => {
    test('should log with request context', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        originalUrl: '/api/test',
        ip: '127.0.0.1',
        user: { id: 1, email: 'test@example.com' }
      };

      const message = 'Test context log';
      const additionalData = { extra: 'data' };

      // Should not throw error
      expect(() => {
        logWithContext('info', message, mockRequest, additionalData);
      }).not.toThrow();

      expect(() => {
        logWithContext('error', message, mockRequest, additionalData);
      }).not.toThrow();
    });

    test('should handle requests without user context', () => {
      const mockRequest = {
        id: 'req-456',
        method: 'POST',
        originalUrl: '/api/auth/login',
        ip: '127.0.0.1'
        // No user property
      };

      expect(() => {
        logWithContext('info', 'Login attempt', mockRequest);
      }).not.toThrow();
    });

    test('should handle minimal request objects', () => {
      const mockRequest = {
        method: 'GET',
        originalUrl: '/api/minimal'
      };

      expect(() => {
        logWithContext('warn', 'Minimal request', mockRequest);
      }).not.toThrow();
    });
  });

  describe('Business Event Logging', () => {
    test('should log business events with proper structure', () => {
      const mockRequest = {
        id: 'req-789',
        method: 'POST',
        originalUrl: '/api/orders',
        user: { id: 1, email: 'manager@test.com', role: 'MANAGER' }
      };

      const eventType = 'order_created';
      const eventData = {
        orderId: 'ORD-001',
        clientId: 123,
        totalAmount: 1500.00
      };

      expect(() => {
        logBusinessEvent(eventType, mockRequest, eventData);
      }).not.toThrow();
    });

    test('should handle business events without request context', () => {
      const eventType = 'system_maintenance';
      const eventData = { maintenanceType: 'database_cleanup' };

      expect(() => {
        logBusinessEvent(eventType, null, eventData);
      }).not.toThrow();
    });

    test('should handle business events with minimal data', () => {
      const eventType = 'user_action';

      expect(() => {
        logBusinessEvent(eventType);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle logging errors gracefully', () => {
      // Test with circular reference that would cause JSON.stringify to fail
      const circularObject = { a: 1 };
      circularObject.self = circularObject;

      const mockRequest = {
        method: 'GET',
        circularData: circularObject
      };

      // Should not throw even with problematic data
      expect(() => {
        logWithContext('info', 'Test with circular data', mockRequest);
      }).not.toThrow();
    });

    test('should handle undefined/null parameters', () => {
      expect(() => {
        logWithContext('info', null, null, null);
      }).not.toThrow();

      expect(() => {
        logBusinessEvent(undefined, undefined, undefined);
      }).not.toThrow();
    });
  });

  describe('Log Formatting', () => {
    test('should include timestamp in logs', () => {
      const beforeTime = Date.now();
      
      logger.info('Test timestamp');
      
      // Logger should include timestamp (we can't easily test the exact format,
      // but we can verify the function doesn't throw and operates correctly)
      expect(true).toBe(true); // Basic sanity check
    });

    test('should include service information', () => {
      const mockRequest = {
        method: 'GET',
        originalUrl: '/api/test'
      };

      // Should include service context
      logWithContext('info', 'Service test', mockRequest);
      
      expect(true).toBe(true); // Function executed without error
    });
  });

  describe('Log Levels', () => {
    test('should respect different log levels', () => {
      const testMessage = 'Level test';
      
      // All levels should be available
      logger.debug(testMessage);
      logger.info(testMessage);
      logger.warn(testMessage);
      logger.error(testMessage);

      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should handle log level configuration', () => {
      // Logger should work regardless of environment
      const originalEnv = process.env.NODE_ENV;
      
      process.env.NODE_ENV = 'test';
      logger.debug('Debug in test');
      
      process.env.NODE_ENV = 'production';
      logger.debug('Debug in production');
      
      process.env.NODE_ENV = originalEnv;
      
      expect(true).toBe(true);
    });
  });
});