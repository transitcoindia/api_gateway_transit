"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisUrl = process.env.REDIS_URL;
console.log(redisUrl);
if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set');
}
// Create Redis client with proper error handling and reconnection logic
const redis = new ioredis_1.default(redisUrl, {
    // Reconnection settings
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000); // Exponential backoff, max 2 seconds
        console.log(`🔄 Redis reconnecting (attempt ${times}) in ${delay}ms...`);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    // Connection timeout
    connectTimeout: 10000, // 10 seconds
    lazyConnect: false,
    // Keep alive
    keepAlive: 30000, // 30 seconds
});
// Handle connection events
redis.on('connect', () => {
    console.log('✅ Redis connected');
});
redis.on('ready', () => {
    console.log('✅ Redis ready');
});
redis.on('error', (error) => {
    // Handle specific error types
    if (error.message.includes('ECONNRESET')) {
        console.log('⚠️ Redis connection reset - will reconnect automatically');
    }
    else if (error.message.includes('ECONNREFUSED')) {
        console.error('❌ Redis connection refused - check if Redis server is running');
    }
    else if (error.message.includes('ETIMEDOUT')) {
        console.log('⚠️ Redis connection timeout - will retry');
    }
    else {
        console.error('❌ Redis error:', error.message);
    }
});
redis.on('close', () => {
    console.log('⚠️ Redis connection closed');
});
redis.on('reconnecting', (delay) => {
    console.log(`🔄 Redis reconnecting in ${delay}ms...`);
});
redis.on('end', () => {
    console.log('⚠️ Redis connection ended');
});
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
    console.log('🛑 Closing Redis connection...');
    await redis.quit();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('🛑 Closing Redis connection...');
    await redis.quit();
    process.exit(0);
});
exports.default = redis;
