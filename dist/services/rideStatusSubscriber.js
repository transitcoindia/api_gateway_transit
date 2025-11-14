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
    subscriptionClient = redis_1.default.duplicate({
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            console.log(`🔄 Redis subscription reconnecting (attempt ${times}) in ${delay}ms...`);
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
        connectTimeout: 10000,
        keepAlive: 30000,
    });
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
        // Handle specific error types gracefully
        if (error.message.includes('ECONNRESET')) {
            console.log('⚠️ Redis subscription connection reset - will reconnect automatically');
            isSubscribed = false;
        }
        else if (error.message.includes('ECONNREFUSED')) {
            console.error('❌ Redis subscription connection refused');
        }
        else if (error.message.includes('ETIMEDOUT')) {
            console.log('⚠️ Redis subscription connection timeout - will retry');
            isSubscribed = false;
        }
        else {
            console.error('❌ Redis subscription error:', error.message);
        }
    });
    subscriptionClient.on('close', () => {
        console.log('⚠️ Redis subscription connection closed');
        isSubscribed = false;
    });
    subscriptionClient.on('reconnecting', (delay) => {
        console.log(`🔄 Redis subscription reconnecting in ${delay}ms...`);
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
