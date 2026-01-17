"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeToRideStatus = subscribeToRideStatus;
const redis_1 = __importDefault(require("../redis"));
const CHANNEL = 'ride_status_updates';
let subscriptionClient = null;
let isSubscribed = false;
function createSubscription(io) {
    // Check if Redis is available
    if (!redis_1.default.client || !redis_1.default.isConnected()) {
        console.warn('⚠️ Redis not available - ride status subscription disabled');
        return;
    }
    // Close existing subscription if any
    if (subscriptionClient) {
        try {
            subscriptionClient.unsubscribe();
            subscriptionClient.quit();
        }
        catch (e) {
            // Ignore errors when closing
        }
    }
    // Create new subscription client with same config as main client
    const dupClient = redis_1.default.duplicate({
        retryStrategy: (times) => {
            if (times > 50) {
                // Stop retrying after 50 attempts
                console.warn('⚠️ Redis ride status subscription failed after 50 attempts. Disabling subscription.');
                return null;
            }
            const delay = Math.min(times * 50, 2000);
            // Only log every 10th attempt to reduce spam
            if (times % 10 === 0) {
                console.log(`🔄 Redis subscription reconnecting (attempt ${times}) in ${delay}ms...`);
            }
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        keepAlive: 30000,
    });
    if (!dupClient) {
        console.warn('⚠️ Cannot create Redis duplicate client - ride status subscription disabled');
        return;
    }
    subscriptionClient = dupClient;
    // Handle connection events
    subscriptionClient.on('connect', () => {
        console.log('✅ Redis subscription client connected');
    });
    subscriptionClient.on('ready', () => {
        console.log('✅ Redis subscription client ready');
        // Resubscribe when reconnected
        if (!isSubscribed) {
            subscriptionClient.subscribe(CHANNEL);
        }
    });
    subscriptionClient.on('error', (error) => {
        // Suppress DNS errors after initial notification
        if (error.message.includes('ENOTFOUND')) {
            console.warn('❌ Redis ride status subscription: Hostname not found. Subscription disabled.');
            isSubscribed = false;
            subscriptionClient = null;
            return;
        }
        // Handle specific error types gracefully
        if (error.message.includes('ECONNRESET')) {
            // Suppress repeated reset messages
            if (Math.random() < 0.1) {
                console.log('⚠️ Redis subscription connection reset');
            }
            isSubscribed = false;
        }
        else if (error.message.includes('ECONNREFUSED')) {
            console.error('❌ Redis subscription connection refused');
            isSubscribed = false;
            subscriptionClient = null;
        }
        else if (error.message.includes('ETIMEDOUT')) {
            // Suppress repeated timeout messages
            if (Math.random() < 0.1) {
                console.log('⚠️ Redis subscription connection timeout');
            }
            isSubscribed = false;
        }
    });
    subscriptionClient.on('close', () => {
        // Suppress close messages - expected if Redis is unavailable
        isSubscribed = false;
    });
    subscriptionClient.on('reconnecting', (delay) => {
        // Suppress reconnecting messages - handled in retryStrategy
        isSubscribed = false;
    });
    subscriptionClient.on('end', () => {
        console.log('⚠️ Redis subscription connection ended');
        isSubscribed = false;
    });
    // Handle messages
    subscriptionClient.on('message', async (channel, message) => {
        if (channel === CHANNEL) {
            try {
                const data = JSON.parse(message);
                const { rideId, riderId } = data || {};
                if (riderId) {
                    io.to(`rider:${riderId}`).emit('rideStatusUpdate', data);
                }
                else {
                    io.to('riders').emit('rideStatusUpdate', data);
                }
            }
            catch (e) {
                console.error('Failed to process ride status update:', e);
            }
        }
    });
    // Handle subscription events
    subscriptionClient.on('subscribe', (channel) => {
        console.log('✅ Subscribed to Redis channel (status):', channel);
        isSubscribed = true;
    });
    subscriptionClient.on('psubscribe', (pattern) => {
        console.log('✅ Subscribed to Redis pattern:', pattern);
    });
    // Initial subscribe
    subscriptionClient.subscribe(CHANNEL);
    console.log('API Gateway subscribed to ride_status_updates Redis channel');
}
function subscribeToRideStatus(io) {
    createSubscription(io);
}
