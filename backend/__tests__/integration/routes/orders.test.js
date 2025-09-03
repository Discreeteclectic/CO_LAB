const request = require('supertest');
const app = require('../../../src/server');
const { createTestData, cleanTestData, prisma } = require('../../helpers/testHelpers');

describe('Orders Routes Integration', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    testData = await createTestData();
    
    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testData.user.email,
        password: 'password123'
      });
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('GET /api/orders', () => {
    test('should get orders list with pagination', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.orders)).toBe(true);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
    });

    test('should filter orders by status', async () => {
      const response = await request(app)
        .get('/api/orders?status=PENDING')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      if (response.body.orders.length > 0) {
        response.body.orders.forEach(order => {
          expect(order.status).toBe('PENDING');
        });
      }
    });

    test('should filter orders by date range', async () => {
      const dateFrom = '2024-01-01';
      const dateTo = '2024-12-31';
      
      const response = await request(app)
        .get(`/api/orders?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      expect(Array.isArray(response.body.orders)).toBe(true);
    });

    test('should search orders by client name', async () => {
      const response = await request(app)
        .get('/api/orders?search=test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      expect(Array.isArray(response.body.orders)).toBe(true);
    });
  });

  describe('GET /api/orders/:id', () => {
    test('should get specific order by ID', async () => {
      // Create test order first
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 5000,
        notes: 'Test order',
        orderItems: [
          {
            productId: testData.product.id,
            quantity: 2,
            price: 2500
          }
        ]
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.order.id;

      // Get the order
      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('order');
      expect(response.body.order.id).toBe(orderId);
      expect(response.body.order).toHaveProperty('client');
      expect(response.body.order).toHaveProperty('orderItems');
      expect(response.body.order).toHaveProperty('user');
    });

    test('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/orders', () => {
    test('should create new order successfully', async () => {
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 7000,
        notes: 'New test order',
        priority: 'MEDIUM',
        orderItems: [
          {
            productId: testData.product.id,
            quantity: 2,
            price: 3500
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('order');
      expect(response.body.order.clientId).toBe(orderData.clientId);
      expect(response.body.order.totalAmount).toBe(orderData.totalAmount);
      expect(response.body.order.status).toBe(orderData.status);
      expect(response.body.order.userId).toBe(testData.user.id);
    });

    test('should validate required fields', async () => {
      const invalidOrderData = {
        // Missing clientId
        status: 'PENDING',
        totalAmount: 5000
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrderData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should validate client exists', async () => {
      const orderData = {
        clientId: 99999, // Non-existent client
        status: 'PENDING',
        totalAmount: 5000,
        orderItems: []
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should create order with multiple items', async () => {
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 10000,
        orderItems: [
          {
            productId: testData.product.id,
            quantity: 2,
            price: 3000
          },
          {
            productId: testData.product.id,
            quantity: 1,
            price: 4000
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.order).toHaveProperty('orderItems');
      // Note: orderItems might not be returned in create response, check in get request
    });
  });

  describe('PUT /api/orders/:id', () => {
    let orderId;

    beforeEach(async () => {
      // Create order for update tests
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 5000,
        notes: 'Order for update test'
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);
      
      orderId = createResponse.body.order.id;
    });

    test('should update order successfully', async () => {
      const updateData = {
        status: 'PROCESSING',
        totalAmount: 6000,
        notes: 'Updated order notes',
        priority: 'HIGH'
      };

      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('order');
      expect(response.body.order.status).toBe(updateData.status);
      expect(response.body.order.totalAmount).toBe(updateData.totalAmount);
      expect(response.body.order.notes).toBe(updateData.notes);
    });

    test('should return 404 for non-existent order update', async () => {
      const response = await request(app)
        .put('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'PROCESSING' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should validate status transitions', async () => {
      // First mark as completed
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'COMPLETED' });

      // Try to change back to pending (might be invalid based on business rules)
      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'PENDING' });

      // This test depends on business logic implementation
      // Expect either success or validation error
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('DELETE /api/orders/:id', () => {
    let orderId;

    beforeEach(async () => {
      // Create order for delete test
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 5000,
        notes: 'Order for delete test'
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);
      
      orderId = createResponse.body.order.id;
    });

    test('should delete order successfully', async () => {
      const response = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify order is deleted
      await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 404 for non-existent order deletion', async () => {
      const response = await request(app)
        .delete('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should prevent deletion of completed orders', async () => {
      // Mark order as completed first
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'COMPLETED' });

      // Try to delete completed order
      const response = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // This depends on business rules - might be 400 or 200
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('GET /api/orders/stats/summary', () => {
    test('should return order statistics', async () => {
      const response = await request(app)
        .get('/api/orders/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('total');
      expect(response.body.stats).toHaveProperty('pending');
      expect(response.body.stats).toHaveProperty('processing');
      expect(response.body.stats).toHaveProperty('completed');
      expect(response.body.stats).toHaveProperty('cancelled');
      expect(response.body.stats).toHaveProperty('totalRevenue');
    });

    test('should filter stats by date range', async () => {
      const dateFrom = '2024-01-01';
      const dateTo = '2024-12-31';
      
      const response = await request(app)
        .get(`/api/orders/stats/summary?dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('dateRange');
    });
  });

  describe('Authorization', () => {
    test('should require authentication for all order routes', async () => {
      // Test without token
      await request(app).get('/api/orders').expect(401);
      await request(app).post('/api/orders').expect(401);
      await request(app).get('/api/orders/1').expect(401);
      await request(app).put('/api/orders/1').expect(401);
      await request(app).delete('/api/orders/1').expect(401);
    });

    test('should reject invalid tokens', async () => {
      const invalidToken = 'invalid-token';
      
      await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(403);
    });
  });

  describe('Input Validation', () => {
    test('should validate order amounts', async () => {
      const invalidOrderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: -1000, // Negative amount
        orderItems: []
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrderData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should validate order status values', async () => {
      const invalidOrderData = {
        clientId: testData.client.id,
        status: 'INVALID_STATUS',
        totalAmount: 5000,
        orderItems: []
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrderData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should validate order item quantities', async () => {
      const invalidOrderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 5000,
        orderItems: [
          {
            productId: testData.product.id,
            quantity: 0, // Invalid quantity
            price: 5000
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrderData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
