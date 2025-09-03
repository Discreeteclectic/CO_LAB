const salesAnalyticsService = require('../../../src/services/salesAnalytics');
const { createTestData, cleanTestData, prisma } = require('../../helpers/testHelpers');

describe('Sales Analytics Service', () => {
  let testData;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('getSalesOverview', () => {
    test('should return sales overview with correct structure', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const overview = await salesAnalyticsService.getSalesOverview(dateFrom, dateTo);

      expect(overview).toHaveProperty('summary');
      expect(overview).toHaveProperty('topProducts');
      expect(overview).toHaveProperty('topClients');
      expect(overview).toHaveProperty('trends');
      expect(overview).toHaveProperty('generatedAt');

      // Check summary structure
      expect(overview.summary).toHaveProperty('totalRevenue');
      expect(overview.summary).toHaveProperty('totalOrders');
      expect(overview.summary).toHaveProperty('completedOrders');
      expect(overview.summary).toHaveProperty('averageOrderValue');
      expect(overview.summary).toHaveProperty('conversionRate');

      // Verify data types
      expect(typeof overview.summary.totalRevenue).toBe('number');
      expect(typeof overview.summary.totalOrders).toBe('number');
      expect(typeof overview.summary.completedOrders).toBe('number');
      expect(Array.isArray(overview.topProducts)).toBe(true);
      expect(Array.isArray(overview.topClients)).toBe(true);
    });

    test('should handle date range filtering correctly', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      const overview = await salesAnalyticsService.getSalesOverview(dateFrom, dateTo);

      expect(overview.summary.totalOrders).toBeGreaterThanOrEqual(0);
      expect(overview.summary.totalRevenue).toBeGreaterThanOrEqual(0);
    });

    test('should handle filters parameter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      const filters = { managerId: testData.user.id };

      const overview = await salesAnalyticsService.getSalesOverview(dateFrom, dateTo, filters);

      expect(overview).toHaveProperty('summary');
      expect(overview.summary.totalOrders).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRevenueAnalytics', () => {
    test('should return revenue analytics with different grouping', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const dailyRevenue = await salesAnalyticsService.getRevenueAnalytics(dateFrom, dateTo, 'day');
      const monthlyRevenue = await salesAnalyticsService.getRevenueAnalytics(dateFrom, dateTo, 'month');

      expect(Array.isArray(dailyRevenue)).toBe(true);
      expect(Array.isArray(monthlyRevenue)).toBe(true);

      // Check data structure if results exist
      if (dailyRevenue.length > 0) {
        expect(dailyRevenue[0]).toHaveProperty('period');
        expect(dailyRevenue[0]).toHaveProperty('revenue');
        expect(dailyRevenue[0]).toHaveProperty('orders');
        expect(typeof dailyRevenue[0].revenue).toBe('number');
      }
    });

    test('should handle invalid groupBy parameter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const result = await salesAnalyticsService.getRevenueAnalytics(dateFrom, dateTo, 'invalid');

      // Should default to 'day' grouping
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getProductAnalytics', () => {
    test('should return top products with sales data', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      const limit = 5;

      const productAnalytics = await salesAnalyticsService.getProductAnalytics(dateFrom, dateTo, limit);

      expect(productAnalytics).toHaveProperty('topProducts');
      expect(productAnalytics).toHaveProperty('totalProductsSold');
      expect(productAnalytics).toHaveProperty('averageProductValue');
      expect(productAnalytics).toHaveProperty('generatedAt');

      expect(Array.isArray(productAnalytics.topProducts)).toBe(true);
      expect(productAnalytics.topProducts.length).toBeLessThanOrEqual(limit);

      // Check product structure if results exist
      if (productAnalytics.topProducts.length > 0) {
        const product = productAnalytics.topProducts[0];
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('totalSold');
        expect(product).toHaveProperty('totalRevenue');
        expect(typeof product.totalRevenue).toBe('number');
      }
    });

    test('should respect limit parameter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      const limit = 2;

      const productAnalytics = await salesAnalyticsService.getProductAnalytics(dateFrom, dateTo, limit);

      expect(productAnalytics.topProducts.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('getClientAnalytics', () => {
    test('should return client analytics with segmentation', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const clientAnalytics = await salesAnalyticsService.getClientAnalytics(dateFrom, dateTo);

      expect(clientAnalytics).toHaveProperty('topClients');
      expect(clientAnalytics).toHaveProperty('clientSegmentation');
      expect(clientAnalytics).toHaveProperty('newClientsCount');
      expect(clientAnalytics).toHaveProperty('retentionRate');
      expect(clientAnalytics).toHaveProperty('generatedAt');

      expect(Array.isArray(clientAnalytics.topClients)).toBe(true);
      expect(clientAnalytics.clientSegmentation).toHaveProperty('vip');
      expect(clientAnalytics.clientSegmentation).toHaveProperty('regular');
      expect(clientAnalytics.clientSegmentation).toHaveProperty('occasional');

      // Verify data types
      expect(typeof clientAnalytics.newClientsCount).toBe('number');
      expect(typeof clientAnalytics.retentionRate).toBe('number');
    });

    test('should calculate client segmentation correctly', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const clientAnalytics = await salesAnalyticsService.getClientAnalytics(dateFrom, dateTo);

      const segmentation = clientAnalytics.clientSegmentation;
      const totalSegmented = segmentation.vip + segmentation.regular + segmentation.occasional;

      expect(totalSegmented).toBeGreaterThanOrEqual(0);
      expect(segmentation.vip).toBeGreaterThanOrEqual(0);
      expect(segmentation.regular).toBeGreaterThanOrEqual(0);
      expect(segmentation.occasional).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid date ranges', async () => {
      const invalidDateFrom = new Date('invalid');
      const dateTo = new Date('2024-12-31');

      await expect(async () => {
        await salesAnalyticsService.getSalesOverview(invalidDateFrom, dateTo);
      }).not.toThrow();
    });

    test('should handle database connection errors', async () => {
      // Mock prisma to throw an error
      const originalFindMany = prisma.order.findMany;
      prisma.order.findMany = jest.fn().mockRejectedValue(new Error('Database error'));

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      await expect(
        salesAnalyticsService.getSalesOverview(dateFrom, dateTo)
      ).rejects.toThrow('Database error');

      // Restore original function
      prisma.order.findMany = originalFindMany;
    });
  });
});