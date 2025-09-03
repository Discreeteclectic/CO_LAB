const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../../../src/middleware/auth');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/testHelpers');

describe('Authentication Middleware', () => {
  let req, res, next;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = mockNext();
  });

  describe('Valid Token', () => {
    test('should authenticate user with valid token', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(req.user).toEqual({
        id: 1,
        email: 'test@example.com',
        role: 'MANAGER',
        iat: expect.any(Number)
      });
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle token without Bearer prefix', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'ADMIN' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.authorization = token; // Without "Bearer "

      authenticateToken(req, res, next);

      expect(req.user).toEqual({
        id: 1,
        email: 'test@example.com',
        role: 'ADMIN',
        iat: expect.any(Number)
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Invalid Token', () => {
    test('should reject request without authorization header', () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied. No token provided.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with empty authorization header', () => {
      req.headers.authorization = '';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied. No token provided.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with malformed token', () => {
      req.headers.authorization = 'Bearer invalid-token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with expired token', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const expiredToken = jwt.sign(testUser, process.env.JWT_SECRET, { expiresIn: '-1h' });

      req.headers.authorization = `Bearer ${expiredToken}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject token signed with wrong secret', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const wrongToken = jwt.sign(testUser, 'wrong-secret');

      req.headers.authorization = `Bearer ${wrongToken}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Bearer format', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(req.user.email).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });

    test('should handle authorization header case variations', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.Authorization = `Bearer ${token}`; // Capital A

      authenticateToken(req, res, next);

      expect(req.user.email).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('User Data Extraction', () => {
    test('should extract all user fields from token', () => {
      const testUser = { 
        id: 123, 
        email: 'manager@test.com', 
        role: 'ADMIN',
        name: 'Test Manager',
        isActive: true
      };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(req.user).toEqual({
        ...testUser,
        iat: expect.any(Number)
      });
      expect(next).toHaveBeenCalled();
    });

    test('should handle minimal token payload', () => {
      const minimalUser = { id: 1 };
      const token = jwt.sign(minimalUser, process.env.JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(req.user).toEqual({
        id: 1,
        iat: expect.any(Number)
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle JWT verification errors gracefully', () => {
      // Mock jwt.verify to throw an error
      const originalVerify = jwt.verify;
      jwt.verify = jest.fn().mockImplementation(() => {
        throw new Error('Token verification failed');
      });

      const token = 'any-token';
      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });

      // Restore original function
      jwt.verify = originalVerify;
    });

    test('should handle missing JWT_SECRET', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const testUser = { id: 1, email: 'test@example.com' };
      const token = jwt.sign(testUser, 'any-secret');
      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });

      // Restore
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('Request Modification', () => {
    test('should add user to request object', () => {
      const testUser = { id: 1, email: 'test@example.com', role: 'MANAGER' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      expect(req.user).toBeUndefined();

      authenticateToken(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.email).toBe('test@example.com');
      expect(req.user.role).toBe('MANAGER');
    });

    test('should not modify request on authentication failure', () => {
      req.headers.authorization = 'Bearer invalid-token';
      const originalReq = { ...req };

      authenticateToken(req, res, next);

      expect(req.user).toBeUndefined();
      expect(req.headers).toEqual(originalReq.headers);
    });
  });
});