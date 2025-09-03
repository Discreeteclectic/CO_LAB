const { cacheManager } = require('../../../src/utils/cache');

describe('Cache Manager', () => {
  beforeEach(() => {
    // Clear cache before each test
    cacheManager.clear();
  });

  describe('Basic Cache Operations', () => {
    test('should set and get cache values', async () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      await cacheManager.set(key, value, 60);
      const result = await cacheManager.get(key);

      expect(result).toEqual(value);
    });

    test('should return null for non-existent keys', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    test('should delete cache entries', async () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      await cacheManager.set(key, value, 60);
      await cacheManager.delete(key);
      const result = await cacheManager.get(key);

      expect(result).toBeNull();
    });

    test('should check if key exists', async () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      expect(await cacheManager.exists(key)).toBe(false);
      
      await cacheManager.set(key, value, 60);
      expect(await cacheManager.exists(key)).toBe(true);
    });
  });

  describe('Cache Expiration', () => {
    test('should expire cache entries after TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      // Set with 1 second TTL
      await cacheManager.set(key, value, 1);
      
      // Should exist immediately
      expect(await cacheManager.get(key)).toEqual(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(await cacheManager.get(key)).toBeNull();
    });

    test('should handle default TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test-data' };

      await cacheManager.set(key, value); // No TTL specified
      const result = await cacheManager.get(key);

      expect(result).toEqual(value);
    });
  });

  describe('Cache Wrapper Function', () => {
    test('should wrap expensive operations', async () => {
      const key = 'expensive-operation';
      const mockFunction = jest.fn().mockResolvedValue({ result: 'expensive-data' });

      // First call should execute function
      const result1 = await cacheManager.wrap(key, mockFunction, 60);
      expect(result1).toEqual({ result: 'expensive-data' });
      expect(mockFunction).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await cacheManager.wrap(key, mockFunction, 60);
      expect(result2).toEqual({ result: 'expensive-data' });
      expect(mockFunction).toHaveBeenCalledTimes(1); // Should not be called again
    });

    test('should handle function errors in wrap', async () => {
      const key = 'error-operation';
      const mockFunction = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(cacheManager.wrap(key, mockFunction, 60))
        .rejects.toThrow('Operation failed');
    });
  });

  describe('Pattern-based Deletion', () => {
    test('should delete entries matching pattern', async () => {
      // Set multiple cache entries
      await cacheManager.set('user:1:profile', { id: 1 }, 60);
      await cacheManager.set('user:2:profile', { id: 2 }, 60);
      await cacheManager.set('user:1:orders', { orders: [] }, 60);
      await cacheManager.set('product:1:details', { name: 'product' }, 60);

      // Delete all user-related entries
      const deletedCount = await cacheManager.deletePattern('user:*');
      expect(deletedCount).toBe(3);

      // Check that user entries are deleted
      expect(await cacheManager.get('user:1:profile')).toBeNull();
      expect(await cacheManager.get('user:2:profile')).toBeNull();
      expect(await cacheManager.get('user:1:orders')).toBeNull();

      // Check that product entry still exists
      expect(await cacheManager.get('product:1:details')).toEqual({ name: 'product' });
    });
  });

  describe('Cache Statistics', () => {
    test('should track cache statistics', async () => {
      const key1 = 'test-key-1';
      const key2 = 'test-key-2';
      const value = { data: 'test' };

      // Perform operations
      await cacheManager.set(key1, value, 60);
      await cacheManager.set(key2, value, 60);
      await cacheManager.get(key1); // Hit
      await cacheManager.get(key1); // Hit
      await cacheManager.get('non-existent'); // Miss
      await cacheManager.delete(key2);

      const stats = cacheManager.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(1);
      expect(stats.hitRate).toBe(66.67); // 2 hits out of 3 total
    });
  });

  describe('Cache Key Generation', () => {
    test('should generate consistent cache keys', () => {
      const key1 = cacheManager.generateKey('analytics', 'user', '123', 'revenue');
      const key2 = cacheManager.generateKey('analytics', 'user', '123', 'revenue');
      
      expect(key1).toBe(key2);
      expect(key1).toBe('colab:analytics:user:123:revenue');
    });

    test('should generate different keys for different parameters', () => {
      const key1 = cacheManager.generateKey('analytics', 'user', '123');
      const key2 = cacheManager.generateKey('analytics', 'user', '456');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Related Cache Invalidation', () => {
    test('should invalidate related cache entries for client updates', async () => {
      const clientId = '123';
      
      // Set related cache entries
      await cacheManager.set(`colab:clients:${clientId}:profile`, { id: clientId }, 60);
      await cacheManager.set(`colab:orders:client:${clientId}:list`, [], 60);
      await cacheManager.set(`colab:analytics:clients:summary`, {}, 60);

      // Invalidate related cache
      const deletedCount = await cacheManager.invalidateRelated('client', clientId);
      
      expect(deletedCount).toBeGreaterThan(0);
      
      // Check that related entries are deleted
      expect(await cacheManager.get(`colab:clients:${clientId}:profile`)).toBeNull();
      expect(await cacheManager.get(`colab:orders:client:${clientId}:list`)).toBeNull();
    });

    test('should handle different entity types for invalidation', async () => {
      const orderId = '456';
      
      // Set order-related cache entries
      await cacheManager.set(`colab:orders:${orderId}:details`, { id: orderId }, 60);
      await cacheManager.set(`colab:analytics:orders:summary`, {}, 60);

      // Invalidate order-related cache
      await cacheManager.invalidateRelated('order', orderId);
      
      // Check that order entries are deleted
      expect(await cacheManager.get(`colab:orders:${orderId}:details`)).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle cache operation errors gracefully', async () => {
      // Mock internal error
      const originalGet = cacheManager.memoryCache.get;
      cacheManager.memoryCache.get = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await cacheManager.get('test-key');
      expect(result).toBeNull();

      // Restore original method
      cacheManager.memoryCache.get = originalGet;
    });
  });
});