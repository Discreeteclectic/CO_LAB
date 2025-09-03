/**
 * Advanced caching system for CO-LAB CRM
 * Supports memory cache, Redis (when available), and intelligent cache invalidation
 */

const { logger } = require('./logger');

class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.redisClient = null;
        this.defaultTTL = 10 * 60; // 10 minutes
        this.maxMemoryCacheSize = 1000; // Maximum items in memory cache
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
        
        this.initializeRedis();
        this.setupCleanupInterval();
    }

    // Initialize Redis connection if available
    async initializeRedis() {
        try {
            // Only try to connect to Redis if explicitly configured
            if (process.env.REDIS_URL) {
                const redis = require('redis');
                this.redisClient = redis.createClient({
                    url: process.env.REDIS_URL
                });

                this.redisClient.on('error', (err) => {
                    logger.warn('Redis connection error, falling back to memory cache', { error: err.message });
                    this.redisClient = null;
                });

                this.redisClient.on('connect', () => {
                    logger.info('Redis cache connected successfully');
                });

                await this.redisClient.connect();
            }
        } catch (error) {
            logger.warn('Redis not available, using memory cache only', { error: error.message });
            this.redisClient = null;
        }
    }

    // Set cache value
    async set(key, value, ttlSeconds = null) {
        const ttl = ttlSeconds || this.defaultTTL;
        const expiresAt = Date.now() + (ttl * 1000);
        const cacheItem = {
            value,
            expiresAt,
            createdAt: Date.now()
        };

        try {
            // Try Redis first if available
            if (this.redisClient) {
                await this.redisClient.setEx(key, ttl, JSON.stringify(cacheItem));
            }

            // Always store in memory cache as fallback
            this.memoryCache.set(key, cacheItem);
            this.cacheStats.sets++;

            // Cleanup memory cache if too large
            this.cleanupMemoryCache();

            logger.debug('Cache set', { key, ttl, storage: this.redisClient ? 'redis+memory' : 'memory' });
            return true;
        } catch (error) {
            logger.error('Cache set error', { key, error: error.message });
            return false;
        }
    }

    // Get cache value
    async get(key) {
        try {
            let cacheItem = null;

            // Try Redis first if available
            if (this.redisClient) {
                try {
                    const redisValue = await this.redisClient.get(key);
                    if (redisValue) {
                        cacheItem = JSON.parse(redisValue);
                    }
                } catch (redisError) {
                    logger.warn('Redis get error, trying memory cache', { key, error: redisError.message });
                }
            }

            // Fallback to memory cache
            if (!cacheItem) {
                cacheItem = this.memoryCache.get(key);
            }

            // Check if item exists and is not expired
            if (cacheItem) {
                if (Date.now() < cacheItem.expiresAt) {
                    this.cacheStats.hits++;
                    logger.debug('Cache hit', { key, age: Date.now() - cacheItem.createdAt });
                    return cacheItem.value;
                } else {
                    // Item expired, remove it
                    await this.delete(key);
                }
            }

            this.cacheStats.misses++;
            logger.debug('Cache miss', { key });
            return null;
        } catch (error) {
            logger.error('Cache get error', { key, error: error.message });
            this.cacheStats.misses++;
            return null;
        }
    }

    // Delete cache entry
    async delete(key) {
        try {
            // Delete from Redis if available
            if (this.redisClient) {
                await this.redisClient.del(key);
            }

            // Delete from memory cache
            this.memoryCache.delete(key);
            this.cacheStats.deletes++;

            logger.debug('Cache deleted', { key });
            return true;
        } catch (error) {
            logger.error('Cache delete error', { key, error: error.message });
            return false;
        }
    }

    // Delete all cache entries matching pattern
    async deletePattern(pattern) {
        try {
            let deletedCount = 0;

            // Delete from Redis if available
            if (this.redisClient) {
                try {
                    const keys = await this.redisClient.keys(pattern);
                    if (keys.length > 0) {
                        await this.redisClient.del(keys);
                        deletedCount += keys.length;
                    }
                } catch (redisError) {
                    logger.warn('Redis delete pattern error', { pattern, error: redisError.message });
                }
            }

            // Delete from memory cache
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            for (const key of this.memoryCache.keys()) {
                if (regex.test(key)) {
                    this.memoryCache.delete(key);
                    deletedCount++;
                }
            }

            this.cacheStats.deletes += deletedCount;
            logger.debug('Cache pattern deleted', { pattern, count: deletedCount });
            return deletedCount;
        } catch (error) {
            logger.error('Cache delete pattern error', { pattern, error: error.message });
            return 0;
        }
    }

    // Check if key exists in cache
    async exists(key) {
        try {
            // Check Redis first if available
            if (this.redisClient) {
                const exists = await this.redisClient.exists(key);
                if (exists) return true;
            }

            // Check memory cache
            const cacheItem = this.memoryCache.get(key);
            return cacheItem && Date.now() < cacheItem.expiresAt;
        } catch (error) {
            logger.error('Cache exists error', { key, error: error.message });
            return false;
        }
    }

    // Get cache statistics
    getStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100
            : 0;

        return {
            ...this.cacheStats,
            hitRate: Math.round(hitRate * 100) / 100,
            memoryCacheSize: this.memoryCache.size,
            redisConnected: !!this.redisClient,
            uptime: process.uptime()
        };
    }

    // Clear all cache
    async clear() {
        try {
            // Clear Redis if available
            if (this.redisClient) {
                await this.redisClient.flushDb();
            }

            // Clear memory cache
            this.memoryCache.clear();

            // Reset stats
            this.cacheStats = {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0
            };

            logger.info('All cache cleared');
            return true;
        } catch (error) {
            logger.error('Cache clear error', { error: error.message });
            return false;
        }
    }

    // Cleanup expired items from memory cache
    cleanupMemoryCache() {
        const now = Date.now();
        let expiredCount = 0;

        // Remove expired items
        for (const [key, item] of this.memoryCache.entries()) {
            if (now >= item.expiresAt) {
                this.memoryCache.delete(key);
                expiredCount++;
            }
        }

        // If still too large, remove oldest items
        if (this.memoryCache.size > this.maxMemoryCacheSize) {
            const entries = Array.from(this.memoryCache.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt);
            
            const toRemove = this.memoryCache.size - this.maxMemoryCacheSize;
            for (let i = 0; i < toRemove; i++) {
                this.memoryCache.delete(entries[i][0]);
            }
        }

        if (expiredCount > 0) {
            logger.debug('Memory cache cleanup', { expiredCount, currentSize: this.memoryCache.size });
        }
    }

    // Setup periodic cleanup
    setupCleanupInterval() {
        // Clean expired items every 5 minutes
        setInterval(() => {
            this.cleanupMemoryCache();
        }, 5 * 60 * 1000);
    }

    // Generate cache key with namespace
    generateKey(namespace, ...parts) {
        return `colab:${namespace}:${parts.join(':')}`;
    }

    // Cache wrapper function for expensive operations
    async wrap(key, fetchFunction, ttlSeconds = null) {
        // Try to get from cache first
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }

        // Not in cache, execute function
        try {
            const result = await fetchFunction();
            
            // Cache the result
            await this.set(key, result, ttlSeconds);
            
            return result;
        } catch (error) {
            logger.error('Cache wrap function error', { key, error: error.message });
            throw error;
        }
    }

    // Intelligent cache invalidation for related data
    async invalidateRelated(entityType, entityId) {
        const patterns = this.getInvalidationPatterns(entityType, entityId);
        
        let totalDeleted = 0;
        for (const pattern of patterns) {
            const deleted = await this.deletePattern(pattern);
            totalDeleted += deleted;
        }

        logger.debug('Related cache invalidated', { 
            entityType, 
            entityId, 
            patterns, 
            totalDeleted 
        });

        return totalDeleted;
    }

    // Get invalidation patterns for different entity types
    getInvalidationPatterns(entityType, entityId) {
        const patterns = [];

        switch (entityType) {
            case 'client':
                patterns.push(
                    `colab:clients:${entityId}:*`,
                    `colab:orders:client:${entityId}:*`,
                    `colab:analytics:clients:*`,
                    `colab:analytics:overview:*`
                );
                break;
                
            case 'order':
                patterns.push(
                    `colab:orders:${entityId}:*`,
                    `colab:analytics:orders:*`,
                    `colab:analytics:overview:*`,
                    `colab:analytics:revenue:*`
                );
                break;
                
            case 'product':
                patterns.push(
                    `colab:products:${entityId}:*`,
                    `colab:warehouse:${entityId}:*`,
                    `colab:analytics:products:*`
                );
                break;
                
            case 'user':
            case 'manager':
                patterns.push(
                    `colab:users:${entityId}:*`,
                    `colab:managers:${entityId}:*`,
                    `colab:analytics:managers:*`
                );
                break;
                
            case 'analytics':
                patterns.push(
                    `colab:analytics:*`
                );
                break;
                
            default:
                patterns.push(`colab:${entityType}:${entityId}:*`);
        }

        return patterns;
    }

    // Preload commonly accessed data
    async preloadCache() {
        logger.info('Starting cache preload...');
        
        try {
            // Preload could include:
            // - Active users list
            // - Product categories
            // - Common analytics queries
            // - System configurations
            
            // This is a placeholder for preload logic
            const preloadTasks = [
                // Add specific preload tasks here
            ];

            await Promise.allSettled(preloadTasks);
            logger.info('Cache preload completed');
        } catch (error) {
            logger.error('Cache preload error', { error: error.message });
        }
    }

    // Graceful shutdown
    async shutdown() {
        try {
            if (this.redisClient) {
                await this.redisClient.quit();
                logger.info('Redis connection closed');
            }
        } catch (error) {
            logger.error('Cache shutdown error', { error: error.message });
        }
    }
}

// Singleton instance
const cacheManager = new CacheManager();

// Cache middleware for Express routes
const cacheMiddleware = (namespace, ttlSeconds = null) => {
    return async (req, res, next) => {
        // Generate cache key from request
        const cacheKey = cacheManager.generateKey(
            namespace,
            req.method,
            req.originalUrl || req.url,
            req.user?.id || 'anonymous'
        );

        try {
            // Try to get cached response
            const cached = await cacheManager.get(cacheKey);
            if (cached) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cached);
            }

            // Not cached, continue with request
            res.setHeader('X-Cache', 'MISS');
            
            // Override res.json to cache the response
            const originalJson = res.json;
            res.json = function(data) {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    cacheManager.set(cacheKey, data, ttlSeconds)
                        .catch(error => {
                            logger.warn('Failed to cache response', { 
                                cacheKey, 
                                error: error.message 
                            });
                        });
                }
                
                return originalJson.call(this, data);
            };

            next();
        } catch (error) {
            logger.error('Cache middleware error', { error: error.message });
            next(); // Continue without caching
        }
    };
};

module.exports = {
    cacheManager,
    cacheMiddleware,
    
    // Helper functions
    set: (key, value, ttl) => cacheManager.set(key, value, ttl),
    get: (key) => cacheManager.get(key),
    delete: (key) => cacheManager.delete(key),
    deletePattern: (pattern) => cacheManager.deletePattern(pattern),
    clear: () => cacheManager.clear(),
    exists: (key) => cacheManager.exists(key),
    wrap: (key, fn, ttl) => cacheManager.wrap(key, fn, ttl),
    invalidateRelated: (type, id) => cacheManager.invalidateRelated(type, id),
    getStats: () => cacheManager.getStats(),
    generateKey: (...args) => cacheManager.generateKey(...args)
};