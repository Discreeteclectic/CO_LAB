/**
 * Performance monitoring and optimization middleware
 */

const { logger } = require('../utils/logger');
const cluster = require('cluster');
const os = require('os');

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.requestTimes = [];
        this.slowQueries = [];
        this.memoryUsage = [];
        this.alertThresholds = {
            responseTime: 5000, // 5 seconds
            memoryUsage: 85, // 85% of available memory
            cpuUsage: 80, // 80% CPU usage
            queryTime: 1000 // 1 second for DB queries
        };
        
        this.initializeMonitoring();
    }

    initializeMonitoring() {
        // Monitor memory usage every 30 seconds
        setInterval(() => {
            this.trackMemoryUsage();
        }, 30000);

        // Monitor CPU usage every 60 seconds
        setInterval(() => {
            this.trackCPUUsage();
        }, 60000);

        // Clean old metrics every 10 minutes
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 600000);
    }

    // Request timing middleware
    requestTimer() {
        return (req, res, next) => {
            const startTime = Date.now();
            const startHrTime = process.hrtime();
            
            // Add request ID for tracking
            req.requestId = req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Override res.end to capture timing
            const originalEnd = res.end;
            res.end = (...args) => {
                const endTime = Date.now();
                const [seconds, nanoseconds] = process.hrtime(startHrTime);
                const responseTime = (seconds * 1000) + (nanoseconds / 1000000);
                
                // Log performance metrics
                this.logRequestMetrics(req, res, {
                    responseTime,
                    startTime,
                    endTime
                });
                
                // Check for slow requests
                if (responseTime > this.alertThresholds.responseTime) {
                    this.handleSlowRequest(req, res, responseTime);
                }
                
                // Call original end
                originalEnd.apply(res, args);
            };
            
            next();
        };
    }

    // Log detailed request metrics
    logRequestMetrics(req, res, timing) {
        const metrics = {
            requestId: req.requestId,
            method: req.method,
            url: req.originalUrl || req.url,
            statusCode: res.statusCode,
            responseTime: timing.responseTime,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            timestamp: timing.startTime,
            userId: req.user?.id,
            contentLength: res.get('content-length')
        };

        // Store in memory for analysis
        this.requestTimes.push({
            ...metrics,
            timestamp: Date.now()
        });

        // Log based on response time
        if (timing.responseTime > 1000) {
            logger.warn('Slow request detected', metrics);
        } else {
            logger.debug('Request metrics', metrics);
        }

        // Keep only last 1000 requests in memory
        if (this.requestTimes.length > 1000) {
            this.requestTimes = this.requestTimes.slice(-1000);
        }
    }

    // Handle slow requests
    handleSlowRequest(req, res, responseTime) {
        logger.error('Very slow request detected', {
            requestId: req.requestId,
            method: req.method,
            url: req.originalUrl || req.url,
            responseTime: `${responseTime.toFixed(2)}ms`,
            statusCode: res.statusCode,
            userId: req.user?.id,
            critical: true
        });

        // Could trigger alerts, scaling, or other actions here
        this.triggerPerformanceAlert('slow_request', {
            requestId: req.requestId,
            responseTime,
            url: req.originalUrl || req.url
        });
    }

    // Database query timing
    trackDatabaseQuery(queryInfo) {
        const { query, duration, result } = queryInfo;
        
        if (duration > this.alertThresholds.queryTime) {
            const slowQuery = {
                query: query.substring(0, 200), // Truncate long queries
                duration,
                result: result ? 'success' : 'error',
                timestamp: Date.now()
            };

            this.slowQueries.push(slowQuery);
            
            logger.warn('Slow database query detected', slowQuery);

            // Keep only last 100 slow queries
            if (this.slowQueries.length > 100) {
                this.slowQueries = this.slowQueries.slice(-100);
            }
        }
    }

    // Memory usage monitoring
    trackMemoryUsage() {
        const usage = process.memoryUsage();
        const systemMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = systemMemory - freeMemory;
        const memoryUsagePercent = (usedMemory / systemMemory) * 100;

        const memoryData = {
            rss: usage.rss,
            heapTotal: usage.heapTotal,
            heapUsed: usage.heapUsed,
            external: usage.external,
            systemMemory,
            freeMemory,
            usedMemory,
            memoryUsagePercent,
            timestamp: Date.now()
        };

        this.memoryUsage.push(memoryData);

        // Alert on high memory usage
        if (memoryUsagePercent > this.alertThresholds.memoryUsage) {
            logger.warn('High memory usage detected', {
                memoryUsagePercent: `${memoryUsagePercent.toFixed(2)}%`,
                heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`
            });

            this.triggerPerformanceAlert('high_memory', memoryData);
        }

        // Keep only last 100 memory readings
        if (this.memoryUsage.length > 100) {
            this.memoryUsage = this.memoryUsage.slice(-100);
        }
    }

    // CPU usage monitoring  
    trackCPUUsage() {
        const cpus = os.cpus();
        const cpuUsage = this.getCPUUsage(cpus);

        if (cpuUsage > this.alertThresholds.cpuUsage) {
            logger.warn('High CPU usage detected', {
                cpuUsage: `${cpuUsage.toFixed(2)}%`,
                cpuCount: cpus.length
            });

            this.triggerPerformanceAlert('high_cpu', { cpuUsage });
        }
    }

    // Calculate CPU usage percentage
    getCPUUsage(cpus) {
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        
        return 100 - ~~(100 * idle / total);
    }

    // Performance alert system
    triggerPerformanceAlert(alertType, data) {
        const alert = {
            type: alertType,
            severity: this.getAlertSeverity(alertType, data),
            timestamp: Date.now(),
            data,
            pid: process.pid,
            server: os.hostname()
        };

        // Log the alert
        logger.error('Performance alert triggered', alert);

        // Could send to external monitoring service
        this.sendToMonitoringService(alert);
    }

    // Determine alert severity
    getAlertSeverity(alertType, data) {
        switch (alertType) {
            case 'slow_request':
                return data.responseTime > 10000 ? 'critical' : 'warning';
            case 'high_memory':
                return data.memoryUsagePercent > 95 ? 'critical' : 'warning';
            case 'high_cpu':
                return data.cpuUsage > 95 ? 'critical' : 'warning';
            default:
                return 'info';
        }
    }

    // Send alerts to monitoring service
    sendToMonitoringService(alert) {
        // Placeholder for external monitoring integration
        // Could integrate with services like DataDog, New Relic, etc.
        console.log('Would send alert to monitoring service:', alert);
    }

    // Clean up old metrics
    cleanupOldMetrics() {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

        // Clean request times
        this.requestTimes = this.requestTimes.filter(
            request => request.timestamp > tenMinutesAgo
        );

        // Clean slow queries
        this.slowQueries = this.slowQueries.filter(
            query => query.timestamp > tenMinutesAgo
        );

        // Clean memory usage (keep last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.memoryUsage = this.memoryUsage.filter(
            memory => memory.timestamp > oneHourAgo
        );
    }

    // Get performance statistics
    getPerformanceStats() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const fiveMinutesAgo = now - 300000;

        // Recent requests
        const recentRequests = this.requestTimes.filter(
            request => request.timestamp > oneMinuteAgo
        );

        // Calculate average response times
        const avgResponseTime = recentRequests.length > 0 
            ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
            : 0;

        // Error rate
        const errorRequests = recentRequests.filter(req => req.statusCode >= 400);
        const errorRate = recentRequests.length > 0 
            ? (errorRequests.length / recentRequests.length) * 100
            : 0;

        // Memory stats
        const latestMemory = this.memoryUsage[this.memoryUsage.length - 1] || {};

        return {
            requests: {
                total: recentRequests.length,
                avgResponseTime: Math.round(avgResponseTime),
                errorRate: Math.round(errorRate * 100) / 100,
                slowRequests: recentRequests.filter(req => req.responseTime > 1000).length
            },
            memory: {
                heapUsed: Math.round((latestMemory.heapUsed || 0) / 1024 / 1024),
                heapTotal: Math.round((latestMemory.heapTotal || 0) / 1024 / 1024),
                memoryUsagePercent: Math.round((latestMemory.memoryUsagePercent || 0) * 100) / 100
            },
            database: {
                slowQueries: this.slowQueries.filter(
                    query => query.timestamp > fiveMinutesAgo
                ).length
            },
            uptime: Math.round(process.uptime()),
            pid: process.pid
        };
    }

    // Get detailed metrics for admin dashboard
    getDetailedMetrics() {
        return {
            requestTimes: this.requestTimes.slice(-50), // Last 50 requests
            slowQueries: this.slowQueries.slice(-20),   // Last 20 slow queries
            memoryUsage: this.memoryUsage.slice(-20),   // Last 20 memory readings
            performance: this.getPerformanceStats()
        };
    }

    // Response compression middleware
    compressionMiddleware() {
        return (req, res, next) => {
            // Set compression headers for appropriate content types
            const acceptEncoding = req.headers['accept-encoding'] || '';
            
            if (acceptEncoding.includes('gzip')) {
                res.setHeader('Vary', 'Accept-Encoding');
                
                // Override writeHead to add compression info
                const originalWriteHead = res.writeHead;
                res.writeHead = function(statusCode, headers) {
                    const contentType = this.getHeader('content-type');
                    
                    // Compress JSON and text responses
                    if (contentType && (
                        contentType.includes('application/json') ||
                        contentType.includes('text/') ||
                        contentType.includes('application/javascript')
                    )) {
                        this.setHeader('Content-Encoding', 'gzip');
                    }
                    
                    originalWriteHead.call(this, statusCode, headers);
                };
            }
            
            next();
        };
    }

    // Request optimization middleware
    optimizeRequests() {
        return (req, res, next) => {
            // Set cache headers for static resources
            if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
                res.setHeader('ETag', `"${Date.now()}"`);
            }

            // Set security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');

            // CORS preflight optimization
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Max-Age', '86400');
                return res.sendStatus(200);
            }

            next();
        };
    }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
    performanceMonitor,
    requestTimer: () => performanceMonitor.requestTimer(),
    compressionMiddleware: () => performanceMonitor.compressionMiddleware(),
    optimizeRequests: () => performanceMonitor.optimizeRequests(),
    trackDatabaseQuery: (queryInfo) => performanceMonitor.trackDatabaseQuery(queryInfo),
    getPerformanceStats: () => performanceMonitor.getPerformanceStats(),
    getDetailedMetrics: () => performanceMonitor.getDetailedMetrics()
};