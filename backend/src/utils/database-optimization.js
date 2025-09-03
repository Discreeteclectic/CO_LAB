/**
 * Database optimization utilities for CO-LAB CRM
 * Includes query optimization, indexing, and performance monitoring
 */

const { PrismaClient } = require('@prisma/client');
const { logger } = require('./logger');
const { trackDatabaseQuery } = require('../middleware/performance');

class DatabaseOptimizer {
    constructor() {
        this.prisma = new PrismaClient({
            log: [
                { emit: 'event', level: 'query' },
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'info' },
                { emit: 'event', level: 'warn' }
            ]
        });

        this.setupQueryLogging();
        this.queryStats = new Map();
    }

    // Setup query performance logging
    setupQueryLogging() {
        this.prisma.$on('query', (e) => {
            const duration = parseInt(e.duration);
            const query = e.query.substring(0, 100) + (e.query.length > 100 ? '...' : '');

            // Track query performance
            trackDatabaseQuery({
                query: e.query,
                duration,
                result: true
            });

            // Log slow queries
            if (duration > 1000) {
                logger.warn('Slow database query', {
                    duration: `${duration}ms`,
                    query,
                    params: e.params
                });
            }

            // Update query statistics
            this.updateQueryStats(query, duration);
        });

        this.prisma.$on('error', (e) => {
            logger.error('Database error', {
                error: e.message,
                target: e.target
            });
        });
    }

    // Update query statistics
    updateQueryStats(query, duration) {
        const queryType = this.getQueryType(query);
        
        if (!this.queryStats.has(queryType)) {
            this.queryStats.set(queryType, {
                count: 0,
                totalDuration: 0,
                avgDuration: 0,
                maxDuration: 0,
                minDuration: Infinity
            });
        }

        const stats = this.queryStats.get(queryType);
        stats.count++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.count;
        stats.maxDuration = Math.max(stats.maxDuration, duration);
        stats.minDuration = Math.min(stats.minDuration, duration);
    }

    // Extract query type from SQL
    getQueryType(query) {
        const trimmed = query.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) return 'SELECT';
        if (trimmed.startsWith('INSERT')) return 'INSERT';
        if (trimmed.startsWith('UPDATE')) return 'UPDATE';
        if (trimmed.startsWith('DELETE')) return 'DELETE';
        return 'OTHER';
    }

    // Create database indexes for better performance
    async createOptimizedIndexes() {
        logger.info('Creating optimized database indexes...');

        try {
            const indexQueries = [
                // Client indexes
                'CREATE INDEX IF NOT EXISTS idx_clients_email ON Client(email)',
                'CREATE INDEX IF NOT EXISTS idx_clients_phone ON Client(phone)',
                'CREATE INDEX IF NOT EXISTS idx_clients_created_at ON Client(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_clients_name ON Client(name)',

                // Order indexes
                'CREATE INDEX IF NOT EXISTS idx_orders_user_id ON "Order"(userId)',
                'CREATE INDEX IF NOT EXISTS idx_orders_client_id ON "Order"(clientId)',
                'CREATE INDEX IF NOT EXISTS idx_orders_status ON "Order"(status)',
                'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON "Order"(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON "Order"(totalAmount)',
                'CREATE INDEX IF NOT EXISTS idx_orders_user_status ON "Order"(userId, status)',
                'CREATE INDEX IF NOT EXISTS idx_orders_client_status ON "Order"(clientId, status)',

                // Product indexes
                'CREATE INDEX IF NOT EXISTS idx_products_name ON Product(name)',
                'CREATE INDEX IF NOT EXISTS idx_products_category ON Product(category)',
                'CREATE INDEX IF NOT EXISTS idx_products_price ON Product(price)',
                'CREATE INDEX IF NOT EXISTS idx_products_active ON Product(isActive)',

                // User indexes
                'CREATE INDEX IF NOT EXISTS idx_users_email ON User(email)',
                'CREATE INDEX IF NOT EXISTS idx_users_role ON User(role)',
                'CREATE INDEX IF NOT EXISTS idx_users_active ON User(isActive)',

                // Calculation indexes
                'CREATE INDEX IF NOT EXISTS idx_calculations_user_id ON Calculation(userId)',
                'CREATE INDEX IF NOT EXISTS idx_calculations_created_at ON Calculation(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_calculations_user_created ON Calculation(userId, createdAt)',

                // Contract indexes
                'CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON Contract(userId)',
                'CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON Contract(clientId)',
                'CREATE INDEX IF NOT EXISTS idx_contracts_status ON Contract(status)',
                'CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON Contract(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_contracts_user_status ON Contract(userId, status)',

                // Dialogue indexes
                'CREATE INDEX IF NOT EXISTS idx_dialogues_manager_id ON Dialogue(managerId)',
                'CREATE INDEX IF NOT EXISTS idx_dialogues_client_id ON Dialogue(clientId)',
                'CREATE INDEX IF NOT EXISTS idx_dialogues_status ON Dialogue(status)',
                'CREATE INDEX IF NOT EXISTS idx_dialogues_created_at ON Dialogue(createdAt)',

                // Message indexes
                'CREATE INDEX IF NOT EXISTS idx_messages_dialogue_id ON Message(dialogueId)',
                'CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON Message(senderId)',
                'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON Message(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_messages_priority ON Message(priority)',

                // Notification indexes
                'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON Notification(userId)',
                'CREATE INDEX IF NOT EXISTS idx_notifications_read ON Notification(isRead)',
                'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON Notification(createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON Notification(userId, isRead)',

                // Composite indexes for common queries
                'CREATE INDEX IF NOT EXISTS idx_orders_analytics ON "Order"(userId, status, createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_contracts_analytics ON Contract(userId, status, createdAt)',
                'CREATE INDEX IF NOT EXISTS idx_client_revenue ON "Order"(clientId, status, totalAmount)',
                'CREATE INDEX IF NOT EXISTS idx_manager_performance ON "Order"(userId, createdAt, totalAmount)',

                // Full-text search indexes (for SQLite FTS)
                'CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(name, email, phone, description, content=Client)',
                'CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(name, description, category, content=Product)'
            ];

            for (const query of indexQueries) {
                try {
                    await this.prisma.$executeRawUnsafe(query);
                    logger.debug('Index created successfully', { query: query.substring(0, 50) + '...' });
                } catch (error) {
                    // Some indexes might already exist, that's OK
                    if (!error.message.includes('already exists')) {
                        logger.warn('Failed to create index', { 
                            query: query.substring(0, 50) + '...', 
                            error: error.message 
                        });
                    }
                }
            }

            logger.info('Database indexes optimization completed');
        } catch (error) {
            logger.error('Failed to create database indexes', { error: error.message });
        }
    }

    // Analyze query performance and suggest optimizations
    async analyzeQueryPerformance() {
        logger.info('Analyzing database query performance...');

        try {
            // Get query statistics
            const stats = Array.from(this.queryStats.entries()).map(([type, data]) => ({
                queryType: type,
                ...data,
                avgDuration: Math.round(data.avgDuration)
            }));

            // Get table sizes
            const tableSizes = await this.getTableSizes();

            // Generate optimization recommendations
            const recommendations = this.generateOptimizationRecommendations(stats, tableSizes);

            const analysis = {
                queryStats: stats,
                tableSizes,
                recommendations,
                analyzedAt: new Date().toISOString()
            };

            logger.info('Query performance analysis completed', analysis);
            return analysis;
        } catch (error) {
            logger.error('Query performance analysis failed', { error: error.message });
            return null;
        }
    }

    // Get table row counts and sizes
    async getTableSizes() {
        try {
            const tables = [
                'Client', 'Order', 'Product', 'User', 'Calculation', 
                'Contract', 'Dialogue', 'Message', 'Notification'
            ];

            const sizes = {};

            for (const table of tables) {
                try {
                    const result = await this.prisma.$queryRawUnsafe(
                        `SELECT COUNT(*) as count FROM "${table}"`
                    );
                    sizes[table] = parseInt(result[0].count);
                } catch (error) {
                    sizes[table] = 0;
                }
            }

            return sizes;
        } catch (error) {
            logger.error('Failed to get table sizes', { error: error.message });
            return {};
        }
    }

    // Generate optimization recommendations
    generateOptimizationRecommendations(queryStats, tableSizes) {
        const recommendations = [];

        // Check for slow queries
        queryStats.forEach(stat => {
            if (stat.avgDuration > 500) {
                recommendations.push({
                    type: 'SLOW_QUERY',
                    severity: stat.avgDuration > 2000 ? 'HIGH' : 'MEDIUM',
                    message: `${stat.queryType} queries are averaging ${stat.avgDuration}ms`,
                    suggestion: 'Consider adding indexes or optimizing query structure'
                });
            }
        });

        // Check for large tables
        Object.entries(tableSizes).forEach(([table, size]) => {
            if (size > 10000) {
                recommendations.push({
                    type: 'LARGE_TABLE',
                    severity: size > 100000 ? 'HIGH' : 'MEDIUM',
                    message: `${table} table has ${size.toLocaleString()} rows`,
                    suggestion: 'Consider partitioning or archiving old data'
                });
            }
        });

        // Check query frequency
        const totalQueries = queryStats.reduce((sum, stat) => sum + stat.count, 0);
        queryStats.forEach(stat => {
            const percentage = (stat.count / totalQueries) * 100;
            if (percentage > 50) {
                recommendations.push({
                    type: 'HIGH_FREQUENCY',
                    severity: 'MEDIUM',
                    message: `${stat.queryType} queries make up ${percentage.toFixed(1)}% of all queries`,
                    suggestion: 'Consider aggressive caching for these query types'
                });
            }
        });

        return recommendations;
    }

    // Optimize specific queries with better implementations
    getOptimizedQueries() {
        return {
            // Optimized client search with pagination
            searchClients: async (searchTerm, limit = 20, offset = 0) => {
                return await this.prisma.$queryRaw`
                    SELECT c.*, COUNT(*) OVER() as totalCount
                    FROM Client c
                    WHERE c.name ILIKE ${'%' + searchTerm + '%'} 
                       OR c.email ILIKE ${'%' + searchTerm + '%'}
                       OR c.phone ILIKE ${'%' + searchTerm + '%'}
                    ORDER BY c.createdAt DESC
                    LIMIT ${limit} OFFSET ${offset}
                `;
            },

            // Optimized manager analytics query
            getManagerPerformance: async (managerId, dateFrom, dateTo) => {
                return await this.prisma.$queryRaw`
                    WITH manager_stats AS (
                        SELECT 
                            COUNT(DISTINCT o.id) as total_orders,
                            COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END) as completed_orders,
                            SUM(CASE WHEN o.status = 'COMPLETED' THEN o.totalAmount ELSE 0 END) as total_revenue,
                            COUNT(DISTINCT o.clientId) as unique_clients
                        FROM "Order" o
                        WHERE o.userId = ${managerId}
                          AND o.createdAt >= ${dateFrom}
                          AND o.createdAt <= ${dateTo}
                    )
                    SELECT * FROM manager_stats
                `;
            },

            // Optimized revenue analytics
            getRevenueByPeriod: async (dateFrom, dateTo, groupBy = 'day') => {
                const dateFormat = groupBy === 'month' ? '%Y-%m' : 
                                 groupBy === 'week' ? '%Y-%W' : '%Y-%m-%d';

                return await this.prisma.$queryRaw`
                    SELECT 
                        strftime(${dateFormat}, createdAt) as period,
                        SUM(totalAmount) as revenue,
                        COUNT(*) as order_count
                    FROM "Order"
                    WHERE status = 'COMPLETED'
                      AND createdAt >= ${dateFrom}
                      AND createdAt <= ${dateTo}
                    GROUP BY strftime(${dateFormat}, createdAt)
                    ORDER BY period
                `;
            },

            // Optimized top clients query
            getTopClients: async (limit = 10, dateFrom, dateTo) => {
                return await this.prisma.$queryRaw`
                    SELECT 
                        c.id,
                        c.name,
                        c.email,
                        SUM(o.totalAmount) as total_revenue,
                        COUNT(o.id) as total_orders,
                        AVG(o.totalAmount) as avg_order_value
                    FROM Client c
                    JOIN "Order" o ON c.id = o.clientId
                    WHERE o.status = 'COMPLETED'
                      AND o.createdAt >= ${dateFrom}
                      AND o.createdAt <= ${dateTo}
                    GROUP BY c.id, c.name, c.email
                    ORDER BY total_revenue DESC
                    LIMIT ${limit}
                `;
            }
        };
    }

    // Database health check
    async healthCheck() {
        try {
            const startTime = Date.now();
            
            // Test basic connectivity
            await this.prisma.$queryRaw`SELECT 1 as test`;
            
            const connectionTime = Date.now() - startTime;

            // Get database statistics
            const stats = await this.getQueryStats();
            const tableSizes = await this.getTableSizes();

            return {
                status: 'healthy',
                connectionTime: `${connectionTime}ms`,
                queryStats: stats,
                tableSizes,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Database health check failed', { error: error.message });
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Get query statistics summary
    getQueryStats() {
        const stats = Array.from(this.queryStats.entries()).map(([type, data]) => ({
            queryType: type,
            count: data.count,
            avgDuration: Math.round(data.avgDuration),
            maxDuration: data.maxDuration,
            minDuration: data.minDuration === Infinity ? 0 : data.minDuration
        }));

        return stats;
    }

    // Connection pool optimization
    optimizeConnectionPool() {
        // This would be configured in the Prisma schema or connection string
        logger.info('Database connection pool optimization', {
            maxConnections: process.env.DATABASE_MAX_CONNECTIONS || 10,
            connectionTimeout: process.env.DATABASE_CONNECTION_TIMEOUT || 5000,
            poolTimeout: process.env.DATABASE_POOL_TIMEOUT || 10000
        });
    }

    // Cleanup old data (archival)
    async cleanupOldData() {
        logger.info('Starting database cleanup...');

        try {
            const cleanupConfig = {
                // Delete notifications older than 30 days
                notifications: 30,
                // Archive orders older than 1 year
                orders: 365,
                // Delete expired sessions
                sessions: 7
            };

            let totalDeleted = 0;

            // Cleanup old notifications
            const deletedNotifications = await this.prisma.notification.deleteMany({
                where: {
                    createdAt: {
                        lt: new Date(Date.now() - cleanupConfig.notifications * 24 * 60 * 60 * 1000)
                    },
                    isRead: true
                }
            });
            totalDeleted += deletedNotifications.count;

            // Archive old completed orders (in a real system, you might move to archive table)
            // For now, just mark them as archived
            const archivedOrders = await this.prisma.order.updateMany({
                where: {
                    createdAt: {
                        lt: new Date(Date.now() - cleanupConfig.orders * 24 * 60 * 60 * 1000)
                    },
                    status: 'COMPLETED'
                },
                data: {
                    // Add archived flag if it exists in schema
                    notes: { concat: '[ARCHIVED]' }
                }
            });

            logger.info('Database cleanup completed', {
                deletedNotifications: deletedNotifications.count,
                archivedOrders: archivedOrders.count,
                totalDeleted
            });

            return {
                deletedNotifications: deletedNotifications.count,
                archivedOrders: archivedOrders.count,
                totalDeleted
            };
        } catch (error) {
            logger.error('Database cleanup failed', { error: error.message });
            return null;
        }
    }

    // Run VACUUM and other maintenance tasks
    async runMaintenance() {
        logger.info('Running database maintenance...');

        try {
            // For SQLite, run VACUUM to reclaim space
            await this.prisma.$executeRaw`VACUUM`;
            
            // Analyze tables for query planner
            await this.prisma.$executeRaw`ANALYZE`;

            logger.info('Database maintenance completed');
            return true;
        } catch (error) {
            logger.error('Database maintenance failed', { error: error.message });
            return false;
        }
    }

    // Graceful shutdown
    async shutdown() {
        try {
            await this.prisma.$disconnect();
            logger.info('Database connection closed');
        } catch (error) {
            logger.error('Database shutdown error', { error: error.message });
        }
    }
}

// Singleton instance
const databaseOptimizer = new DatabaseOptimizer();

module.exports = {
    databaseOptimizer,
    optimizedQueries: databaseOptimizer.getOptimizedQueries(),
    createIndexes: () => databaseOptimizer.createOptimizedIndexes(),
    analyzePerformance: () => databaseOptimizer.analyzeQueryPerformance(),
    healthCheck: () => databaseOptimizer.healthCheck(),
    cleanupOldData: () => databaseOptimizer.cleanupOldData(),
    runMaintenance: () => databaseOptimizer.runMaintenance()
};