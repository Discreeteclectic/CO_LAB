const managerAnalyticsService = require('../../../src/services/managerAnalytics');
const { createTestData, cleanTestData, prisma } = require('../../helpers/testHelpers');

describe('Manager Analytics Service', () => {
  let testData;

  beforeAll(async () => {
    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('getManagerOverview', () => {
    test('should return manager overview with performance metrics', async () => {
      const managerId = testData.user.id;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const overview = await managerAnalyticsService.getManagerOverview(managerId, dateFrom, dateTo);

      expect(overview).toHaveProperty('summary');
      expect(overview).toHaveProperty('performance');
      expect(overview).toHaveProperty('topActivities');
      expect(overview).toHaveProperty('goals');
      expect(overview).toHaveProperty('generatedAt');

      // Check summary structure
      expect(overview.summary).toHaveProperty('totalSales');
      expect(overview.summary).toHaveProperty('totalOrders');
      expect(overview.summary).toHaveProperty('completedOrders');
      expect(overview.summary).toHaveProperty('activeClients');

      // Verify data types
      expect(typeof overview.summary.totalSales).toBe('number');
      expect(typeof overview.summary.totalOrders).toBe('number');
      expect(Array.isArray(overview.topActivities)).toBe(true);
    });

    test('should handle manager without data', async () => {
      const nonExistentManagerId = 99999;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const overview = await managerAnalyticsService.getManagerOverview(nonExistentManagerId, dateFrom, dateTo);

      expect(overview.summary.totalSales).toBe(0);
      expect(overview.summary.totalOrders).toBe(0);
    });
  });

  describe('getManagerPerformance', () => {
    test('should return performance metrics with trends', async () => {
      const managerId = testData.user.id;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const performance = await managerAnalyticsService.getManagerPerformance(managerId, dateFrom, dateTo);

      expect(performance).toHaveProperty('salesTrend');
      expect(performance).toHaveProperty('conversionRate');
      expect(performance).toHaveProperty('averageOrderValue');
      expect(performance).toHaveProperty('clientAcquisition');
      expect(performance).toHaveProperty('productivity');

      // Check productivity metrics
      expect(performance.productivity).toHaveProperty('ordersPerWeek');
      expect(performance.productivity).toHaveProperty('clientsPerWeek');
      expect(performance.productivity).toHaveProperty('revenuePerWeek');

      expect(Array.isArray(performance.salesTrend)).toBe(true);
      expect(typeof performance.conversionRate).toBe('number');
    });

    test('should calculate conversion rate correctly', async () => {
      const managerId = testData.user.id;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const performance = await managerAnalyticsService.getManagerPerformance(managerId, dateFrom, dateTo);

      expect(performance.conversionRate).toBeGreaterThanOrEqual(0);
      expect(performance.conversionRate).toBeLessThanOrEqual(100);
    });
  });

  describe('getTeamComparison', () => {
    test('should return team comparison with rankings', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const comparison = await managerAnalyticsService.getTeamComparison(dateFrom, dateTo);

      expect(comparison).toHaveProperty('managers');
      expect(comparison).toHaveProperty('teamSummary');
      expect(comparison).toHaveProperty('topPerformer');
      expect(comparison).toHaveProperty('averages');

      expect(Array.isArray(comparison.managers)).toBe(true);
      expect(comparison.teamSummary).toHaveProperty('totalRevenue');
      expect(comparison.teamSummary).toHaveProperty('totalOrders');

      // Check manager structure if results exist
      if (comparison.managers.length > 0) {
        const manager = comparison.managers[0];
        expect(manager).toHaveProperty('id');
        expect(manager).toHaveProperty('name');
        expect(manager).toHaveProperty('totalSales');
        expect(manager).toHaveProperty('totalOrders');
        expect(manager).toHaveProperty('rank');
      }
    });

    test('should handle team with no data', async () => {
      const farFutureDate = new Date('2030-01-01');
      const farFutureEndDate = new Date('2030-12-31');

      const comparison = await managerAnalyticsService.getTeamComparison(farFutureDate, farFutureEndDate);

      expect(comparison.teamSummary.totalRevenue).toBe(0);
      expect(comparison.teamSummary.totalOrders).toBe(0);
      expect(comparison.managers).toEqual([]);
    });
  });

  describe('getManagerGoals', () => {
    test('should return manager goals and progress', async () => {
      const managerId = testData.user.id;
      const year = 2024;

      const goals = await managerAnalyticsService.getManagerGoals(managerId, year);

      expect(goals).toHaveProperty('salesGoal');
      expect(goals).toHaveProperty('ordersGoal');
      expect(goals).toHaveProperty('clientsGoal');
      expect(goals).toHaveProperty('progress');
      expect(goals).toHaveProperty('achievements');

      // Check progress structure
      expect(goals.progress).toHaveProperty('salesProgress');
      expect(goals.progress).toHaveProperty('ordersProgress');
      expect(goals.progress).toHaveProperty('clientsProgress');

      // Verify data types
      expect(typeof goals.salesGoal).toBe('number');
      expect(typeof goals.progress.salesProgress).toBe('number');
      expect(Array.isArray(goals.achievements)).toBe(true);
    });

    test('should handle manager without goals', async () => {
      const nonExistentManagerId = 99999;
      const year = 2024;

      const goals = await managerAnalyticsService.getManagerGoals(nonExistentManagerId, year);

      expect(goals.salesGoal).toBe(0);
      expect(goals.ordersGoal).toBe(0);
      expect(goals.clientsGoal).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid manager ID', async () => {
      const invalidManagerId = null;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      await expect(
        managerAnalyticsService.getManagerOverview(invalidManagerId, dateFrom, dateTo)
      ).not.toThrow();
    });

    test('should handle invalid date ranges', async () => {
      const managerId = testData.user.id;
      const invalidDate = new Date('invalid');
      const validDate = new Date('2024-12-31');

      await expect(
        managerAnalyticsService.getManagerOverview(managerId, invalidDate, validDate)
      ).not.toThrow();
    });

    test('should handle database errors gracefully', async () => {
      const originalFindMany = prisma.order.findMany;
      prisma.order.findMany = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const managerId = testData.user.id;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      await expect(
        managerAnalyticsService.getManagerOverview(managerId, dateFrom, dateTo)
      ).rejects.toThrow('Database connection failed');

      prisma.order.findMany = originalFindMany;
    });
  });

  describe('Data Aggregation', () => {
    test('should aggregate manager activities correctly', async () => {
      const managerId = testData.user.id;
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const overview = await managerAnalyticsService.getManagerOverview(managerId, dateFrom, dateTo);

      // Activities should be sorted by frequency or importance
      if (overview.topActivities.length > 1) {
        expect(overview.topActivities[0].count).toBeGreaterThanOrEqual(
          overview.topActivities[1].count
        );
      }
    });

    test('should calculate team averages correctly', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const comparison = await managerAnalyticsService.getTeamComparison(dateFrom, dateTo);

      if (comparison.managers.length > 0) {
        const totalRevenue = comparison.managers.reduce((sum, m) => sum + m.totalSales, 0);
        const expectedAverage = totalRevenue / comparison.managers.length;

        expect(comparison.averages.revenuePerManager).toBeCloseTo(expectedAverage, 2);
      }
    });
  });
});
