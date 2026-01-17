"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisUrl = process.env.REDIS_URL;
// Make Redis optional - service can function without it
let redis = null;
if (redisUrl) {
    try {
        // Create Redis client with proper error handling and reconnection logic
        redis = new ioredis_1.default(redisUrl, {
            // Reconnection settings - but stop after many attempts
            retryStrategy: (times) => {
                if (times > 100) {
                    // Stop trying after 100 attempts (~5 minutes)
                    console.error('❌ Redis connection failed after 100 attempts. Continuing without Redis.');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 50, 2000); // Exponential backoff, max 2 seconds
                if (times % 10 === 0) {
                    // Only log every 10th attempt to reduce log spam
                    console.log(`🔄 Redis reconnecting (attempt ${times}) in ${delay}ms...`);
                }
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false, // Disable offline queue to fail fast if Redis is unavailable
            // Connection timeout
            connectTimeout: 10000, // 10 seconds
            lazyConnect: true, // Don't connect immediately
            // Keep alive
            keepAlive: 30000, // 30 seconds
            // Auto-reconnect but with limit
            reconnectOnError: (err) => {
                // Only reconnect on specific errors, not all errors
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false; // Don't reconnect on connection errors
            },
        });
        // Handle connection events
        redis.on('connect', () => {
            console.log('✅ Redis connected');
        });
        redis.on('ready', () => {
            console.log('✅ Redis ready');
        });
        redis.on('error', (error) => {
            // Suppress DNS errors after initial attempts - they're already being handled
            if (error.message.includes('ENOTFOUND')) {
                // Only log DNS errors occasionally to avoid spam
                if (Math.random() < 0.01) { // Log 1% of DNS errors
                    console.error('❌ Redis DNS error (hostname not found). Service will continue without Redis.');
                }
                return; // Don't try to reconnect on DNS errors
            }
            // Handle other error types
            if (error.message.includes('ECONNRESET')) {
                console.log('⚠️ Redis connection reset');
            }
            else if (error.message.includes('ECONNREFUSED')) {
                console.error('❌ Redis connection refused - continuing without Redis');
            }
            else if (error.message.includes('ETIMEDOUT')) {
                // Suppress timeout logs after many attempts
                if (Math.random() < 0.1) {
                    console.log('⚠️ Redis connection timeout');
                }
            }
        });
        redis.on('close', () => {
            // Suppress close messages - they're expected if Redis is unavailable
        });
        redis.on('reconnecting', (delay) => {
            // Suppress reconnecting logs - handled in retryStrategy
        });
        redis.on('end', () => {
            // Suppress end messages
        });
        // Attempt to connect, but don't block if it fails
        redis.connect().catch((err) => {
            console.warn('⚠️ Redis initial connection failed. Service will continue without Redis.');
            console.warn(`   Error: ${err.message}`);
            redis = null; // Clear the client if initial connection fails
        });
    }
    catch (error) {
        console.warn('⚠️ Redis initialization failed. Service will continue without Redis.');
        console.warn(`   Error: ${error.message}`);
        redis = null;
    }
}
else {
    console.warn('⚠️ REDIS_URL not set. Service will continue without Redis.');
}
// Handle unhandled errors (like ECONNRESET from subscriptions)
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && reason.message.includes('ECONNRESET')) {
        console.log('⚠️ Unhandled Redis ECONNRESET - connection will be re-established automatically');
        return; // Don't crash the app, Redis will reconnect
    }
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
// Graceful shutdown
process.on('SIGINT', async () => {
    if (redis) {
        console.log('🛑 Closing Redis connection...');
        try {
            await redis.quit();
        }
        catch (e) {
            // Ignore errors during shutdown
        }
    }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (redis) {
        console.log('🛑 Closing Redis connection...');
        try {
            await redis.quit();
        }
        catch (e) {
            // Ignore errors during shutdown
        }
    }
    process.exit(0);
});
// Create a wrapper that handles null Redis gracefully
const redisWrapper = {
    get: async (key) => {
        if (!redis)
            return null;
        try {
            return await redis.get(key);
        }
        catch (e) {
            console.warn(`Redis get failed for key ${key}:`, e.message);
            return null;
        }
    },
    set: async (key, value, mode, duration) => {
        if (!redis)
            return 'OK';
        try {
            if (mode && duration) {
                return await redis.set(key, value, mode, duration);
            }
            return await redis.set(key, value);
        }
        catch (e) {
            console.warn(`Redis set failed for key ${key}:`, e.message);
            return 'OK'; // Return success to not break calling code
        }
    },
    duplicate: (options) => {
        if (!redis)
            return null;
        try {
            return redis.duplicate(options);
        }
        catch (e) {
            console.warn('Redis duplicate failed:', e.message);
            return null;
        }
    },
    // Expose the redis client directly for advanced usage (with null checks)
    client: redis,
    isConnected: () => redis !== null && redis.status === 'ready'
};
exports.default = redisWrapper;
