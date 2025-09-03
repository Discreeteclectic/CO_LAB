const request = require('supertest');
const app = require('../../../src/server');
const { createTestData, cleanTestData, prisma } = require('../../helpers/testHelpers');
const bcrypt = require('bcryptjs');

describe('Auth Routes Integration', () => {
  let testData;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('POST /api/auth/register', () => {
    test('should register new user successfully', async () => {
      const newUser = {
        name: 'New Test User',
        email: 'newuser@test.com',
        password: 'password123',
        role: 'MANAGER'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User created successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(newUser.email);
      expect(response.body.user).not.toHaveProperty('password');

      // Verify user was created in database
      const createdUser = await prisma.user.findUnique({
        where: { email: newUser.email }
      });
      expect(createdUser).toBeDefined();
      expect(createdUser.name).toBe(newUser.name);
    });

    test('should reject registration with invalid email', async () => {
      const invalidUser = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123',
        role: 'MANAGER'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject registration with duplicate email', async () => {
      const duplicateUser = {
        name: 'Duplicate User',
        email: testData.user.email, // Use existing email
        password: 'password123',
        role: 'MANAGER'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('already exists');
    });

    test('should reject registration with weak password', async () => {
      const weakPasswordUser = {
        name: 'Test User',
        email: 'weakpass@test.com',
        password: '123', // Too short
        role: 'MANAGER'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const loginData = {
        email: testData.user.email,
        password: 'password123' // From test data
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.user).not.toHaveProperty('password');
      expect(typeof response.body.token).toBe('string');
    });

    test('should reject login with invalid email', async () => {
      const invalidLogin = {
        email: 'nonexistent@test.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject login with invalid password', async () => {
      const invalidLogin = {
        email: testData.user.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject login for inactive user', async () => {
      // Create inactive user
      const inactiveUser = await prisma.user.create({
        data: {
          name: 'Inactive User',
          email: 'inactive@test.com',
          password: await bcrypt.hash('password123', 10),
          role: 'MANAGER',
          isActive: false
        }
      });

      const loginData = {
        email: inactiveUser.email,
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('inactive');
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken;

    beforeAll(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      authToken = loginResponse.body.token;
    });

    test('should return current user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testData.user.id);
      expect(response.body.user.email).toBe(testData.user.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('No token provided');
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid token');
    });
  });

  describe('POST /api/auth/change-password', () => {
    let authToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      authToken = loginResponse.body.token;
    });

    test('should change password with valid current password', async () => {
      const changePasswordData = {
        currentPassword: 'password123',
        newPassword: 'newpassword123'
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(changePasswordData)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password changed');

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'newpassword123'
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');

      // Change back to original password for other tests
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'newpassword123',
          newPassword: 'password123'
        });
    });

    test('should reject password change with wrong current password', async () => {
      const invalidChangeData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123'
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidChangeData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Current password');
    });

    test('should reject weak new password', async () => {
      const weakPasswordData = {
        currentPassword: 'password123',
        newPassword: '123' // Too short
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(weakPasswordData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully with valid token', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      
      const authToken = loginResponse.body.token;

      // Logout
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Logged out');
    });

    test('should handle logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Request Validation', () => {
    test('should validate email format on registration', async () => {
      const invalidEmailFormats = [
        'notanemail',
        '@domain.com',
        'user@',
        'user..user@domain.com'
      ];

      for (const email of invalidEmailFormats) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            name: 'Test User',
            email: email,
            password: 'password123',
            role: 'MANAGER'
          })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });

    test('should validate required fields on registration', async () => {
      const requiredFields = ['name', 'email', 'password', 'role'];
      
      for (const field of requiredFields) {
        const userData = {
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'MANAGER'
        };
        
        delete userData[field];
        
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });
});
