const request = require('supertest');
const app = require('../../src/server');
const { createTestData, cleanTestData, prisma } = require('../helpers/testHelpers');

describe('User Workflow E2E Tests', () => {
  let testData;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('Complete Order Management Workflow', () => {
    test('should complete full order lifecycle: create -> update -> complete', async () => {
      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        })
        .expect(200);

      const authToken = loginResponse.body.token;
      expect(authToken).toBeDefined();

      // Step 2: Create new client
      const clientData = {
        name: 'E2E Test Company',
        email: 'e2e@test.com',
        phone: '+1234567890',
        contactPerson: 'John Test',
        address: '123 Test Street'
      };

      const clientResponse = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(201);

      const clientId = clientResponse.body.client.id;
      expect(clientId).toBeDefined();

      // Step 3: Create new product
      const productData = {
        name: 'E2E Test Product',
        description: 'Product for E2E testing',
        price: 2500.00,
        unit: 'pcs',
        category: 'test',
        isActive: true
      };

      const productResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData)
        .expect(201);

      const productId = productResponse.body.product.id;
      expect(productId).toBeDefined();

      // Step 4: Create order
      const orderData = {
        clientId: clientId,
        status: 'PENDING',
        totalAmount: 5000.00,
        notes: 'E2E test order',
        priority: 'MEDIUM',
        orderItems: [
          {
            productId: productId,
            quantity: 2,
            price: 2500.00
          }
        ]
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      const orderId = orderResponse.body.order.id;
      expect(orderId).toBeDefined();
      expect(orderResponse.body.order.status).toBe('PENDING');

      // Step 5: Update order to processing
      const updateResponse = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          status: 'PROCESSING',
          notes: 'Order is now being processed'
        })
        .expect(200);

      expect(updateResponse.body.order.status).toBe('PROCESSING');

      // Step 6: Get order details with relations
      const orderDetailResponse = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(orderDetailResponse.body.order).toHaveProperty('client');
      expect(orderDetailResponse.body.order.client.name).toBe(clientData.name);
      expect(orderDetailResponse.body.order).toHaveProperty('user');
      expect(orderDetailResponse.body.order.user.email).toBe(testData.user.email);

      // Step 7: Complete the order
      const completeResponse = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          status: 'COMPLETED',
          notes: 'Order completed successfully'
        })
        .expect(200);

      expect(completeResponse.body.order.status).toBe('COMPLETED');

      // Step 8: Verify order appears in completed orders list
      const completedOrdersResponse = await request(app)
        .get('/api/orders?status=COMPLETED')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const completedOrders = completedOrdersResponse.body.orders;
      const ourCompletedOrder = completedOrders.find(order => order.id === orderId);
      expect(ourCompletedOrder).toBeDefined();
      expect(ourCompletedOrder.status).toBe('COMPLETED');
    });

    test('should handle order cancellation workflow', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Create order
      const orderData = {
        clientId: testData.client.id,
        status: 'PENDING',
        totalAmount: 3000.00,
        notes: 'Order to be cancelled',
        orderItems: []
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);
      
      const orderId = orderResponse.body.order.id;

      // Cancel the order
      const cancelResponse = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          status: 'CANCELLED',
          notes: 'Order cancelled by client request'
        })
        .expect(200);

      expect(cancelResponse.body.order.status).toBe('CANCELLED');

      // Verify in cancelled orders list
      const cancelledOrdersResponse = await request(app)
        .get('/api/orders?status=CANCELLED')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const cancelledOrder = cancelledOrdersResponse.body.orders.find(order => order.id === orderId);
      expect(cancelledOrder).toBeDefined();
      expect(cancelledOrder.status).toBe('CANCELLED');
    });
  });

  describe('Client Management Workflow', () => {
    test('should complete client creation and management workflow', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Step 1: Create client
      const clientData = {
        name: 'Workflow Test Client',
        email: 'workflow@client.com',
        phone: '+1987654321',
        contactPerson: 'Jane Workflow',
        address: '456 Workflow Ave',
        notes: 'Client for workflow testing'
      };

      const createResponse = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send(clientData)
        .expect(201);

      const clientId = createResponse.body.client.id;
      expect(createResponse.body.client.name).toBe(clientData.name);

      // Step 2: Update client information
      const updateData = {
        phone: '+1999888777',
        address: '789 Updated Street',
        notes: 'Updated client information'
      };

      const updateResponse = await request(app)
        .put(`/api/clients/${clientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.client.phone).toBe(updateData.phone);
      expect(updateResponse.body.client.address).toBe(updateData.address);

      // Step 3: Get client details
      const detailResponse = await request(app)
        .get(`/api/clients/${clientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(detailResponse.body.client.phone).toBe(updateData.phone);
      expect(detailResponse.body.client.address).toBe(updateData.address);

      // Step 4: Search for client
      const searchResponse = await request(app)
        .get('/api/clients?search=Workflow')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const foundClient = searchResponse.body.clients.find(client => client.id === clientId);
      expect(foundClient).toBeDefined();
      expect(foundClient.name).toContain('Workflow');

      // Step 5: Create order for this client to establish relationship
      const orderData = {
        clientId: clientId,
        status: 'PENDING',
        totalAmount: 4500.00,
        notes: 'Order for workflow client',
        orderItems: []
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData)
        .expect(201);

      expect(orderResponse.body.order.clientId).toBe(clientId);

      // Step 6: Get client with orders
      const clientWithOrdersResponse = await request(app)
        .get(`/api/clients/${clientId}?include=orders`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check if orders are included (depends on API implementation)
      expect(clientWithOrdersResponse.body.client).toBeDefined();
    });
  });

  describe('Analytics and Reporting Workflow', () => {
    test('should generate comprehensive analytics report', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Step 1: Get sales overview
      const salesOverviewResponse = await request(app)
        .get('/api/analytics/sales/overview?dateFrom=2024-01-01&dateTo=2024-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(salesOverviewResponse.body).toHaveProperty('summary');
      expect(salesOverviewResponse.body.summary).toHaveProperty('totalRevenue');
      expect(salesOverviewResponse.body.summary).toHaveProperty('totalOrders');

      // Step 2: Get revenue analytics
      const revenueResponse = await request(app)
        .get('/api/analytics/revenue?dateFrom=2024-01-01&dateTo=2024-12-31&groupBy=month')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(revenueResponse.body)).toBe(true);

      // Step 3: Get product analytics
      const productAnalyticsResponse = await request(app)
        .get('/api/analytics/products?dateFrom=2024-01-01&dateTo=2024-12-31&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(productAnalyticsResponse.body).toHaveProperty('topProducts');
      expect(Array.isArray(productAnalyticsResponse.body.topProducts)).toBe(true);

      // Step 4: Get client analytics
      const clientAnalyticsResponse = await request(app)
        .get('/api/analytics/clients?dateFrom=2024-01-01&dateTo=2024-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(clientAnalyticsResponse.body).toHaveProperty('topClients');
      expect(clientAnalyticsResponse.body).toHaveProperty('clientSegmentation');

      // Step 5: Get manager performance (if endpoint exists)
      const managerPerformanceResponse = await request(app)
        .get(`/api/analytics/managers/${testData.user.id}/performance?dateFrom=2024-01-01&dateTo=2024-12-31`)
        .set('Authorization', `Bearer ${authToken}`);

      // This might be 200 or 404 depending on implementation
      expect([200, 404]).toContain(managerPerformanceResponse.status);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle network errors gracefully', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Try to access non-existent resources
      const responses = await Promise.all([
        request(app)
          .get('/api/orders/999999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404),
        request(app)
          .get('/api/clients/999999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404),
        request(app)
          .get('/api/products/999999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404)
      ]);

      responses.forEach(response => {
        expect(response.body).toHaveProperty('error');
      });
    });

    test('should validate data integrity across workflow', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Try to create order with invalid data
      const invalidOrderData = {
        clientId: 999999, // Non-existent client
        status: 'INVALID_STATUS', // Invalid status
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
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent requests', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Create multiple concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, (_, i) => 
        request(app)
          .get('/api/orders')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect(response.body).toHaveProperty('orders');
        expect(Array.isArray(response.body.orders)).toBe(true);
      });

      // Should complete within reasonable time (5 seconds)
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(5000);
    });

    test('should handle pagination efficiently', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.user.email,
          password: 'password123'
        });
      const authToken = loginResponse.body.token;

      // Test pagination with different page sizes
      const paginationTests = [
        { page: 1, limit: 10 },
        { page: 1, limit: 25 },
        { page: 2, limit: 10 }
      ];

      for (const { page, limit } of paginationTests) {
        const response = await request(app)
          .get(`/api/orders?page=${page}&limit=${limit}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('orders');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.pagination.page).toBe(page);
        expect(response.body.pagination.limit).toBe(limit);
        expect(response.body.orders.length).toBeLessThanOrEqual(limit);
      }
    });
  });
});
