import redis from '../redis';
import { CHANNELS, RIDE_LAST_LOCATION_TTL_SECONDS } from '../config/env';
import { Server as SocketIOServer } from 'socket.io';

let subscriptionClient: ReturnType<typeof redis.duplicate> | null = null;
let isSubscribed = false;

function createSubscription(io: SocketIOServer, rideToRiderMap: Map<string, string>) {
  // Check if Redis is available
  if (!redis.client || !redis.isConnected()) {
    console.warn('⚠️ Redis not available - driver location subscription disabled');
    return;
  }

  // Close existing subscription if any
  if (subscriptionClient) {
    try {
      subscriptionClient.unsubscribe();
      subscriptionClient.quit();
    } catch (e) {
      // Ignore errors when closing
    }
  }

  // Create new subscription client with same config as main client
  const dupClient = redis.duplicate({
    retryStrategy: (times: number) => {
      if (times > 50) {
        // Stop retrying after 50 attempts
        console.warn('⚠️ Redis driver location subscription failed after 50 attempts. Disabling subscription.');
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      // Only log every 10th attempt to reduce spam
      if (times % 10 === 0) {
        console.log(`🔄 Redis driver location subscription reconnecting (attempt ${times}) in ${delay}ms...`);
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
    console.warn('⚠️ Cannot create Redis duplicate client - driver location subscription disabled');
    return;
  }

  subscriptionClient = dupClient;

  // Handle connection events
  subscriptionClient.on('connect', () => {
    console.log('✅ Redis driver location subscription client connected');
  });

  subscriptionClient.on('ready', () => {
    console.log('✅ Redis driver location subscription client ready');
    // Resubscribe when reconnected
    if (!isSubscribed) {
      subscriptionClient!.subscribe(CHANNELS.DRIVER_LOCATION_UPDATES);
    }
  });

  subscriptionClient.on('error', (error: Error) => {
    // Suppress DNS errors after initial notification
    if (error.message.includes('ENOTFOUND')) {
      console.warn('❌ Redis driver location subscription: Hostname not found. Subscription disabled.');
      isSubscribed = false;
      subscriptionClient = null;
      return;
    }
    // Handle specific error types gracefully
    if (error.message.includes('ECONNRESET')) {
      // Suppress repeated reset messages
      if (Math.random() < 0.1) {
        console.log('⚠️ Redis driver location subscription connection reset');
      }
      isSubscribed = false;
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('❌ Redis driver location subscription connection refused');
      isSubscribed = false;
      subscriptionClient = null;
    } else if (error.message.includes('ETIMEDOUT')) {
      // Suppress repeated timeout messages
      if (Math.random() < 0.1) {
        console.log('⚠️ Redis driver location subscription connection timeout');
      }
      isSubscribed = false;
    }
  });

  subscriptionClient.on('close', () => {
    // Suppress close messages - expected if Redis is unavailable
    isSubscribed = false;
  });

  subscriptionClient.on('reconnecting', (delay: number) => {
    // Suppress reconnecting messages - handled in retryStrategy
    isSubscribed = false;
  });

  subscriptionClient.on('end', () => {
    console.log('⚠️ Redis driver location subscription connection ended');
    isSubscribed = false;
  });

  // Handle messages
  subscriptionClient.on('message', async (channel, message) => {
    if (channel === CHANNELS.DRIVER_LOCATION_UPDATES) {
      try {
        const data = JSON.parse(message);
        const { rideId } = data || {};

        // Cache last location by ride for GET fallback
        if (rideId && redis.client) {
          try {
            await redis.set(`ride:lastLocation:${rideId}`, message, 'EX', RIDE_LAST_LOCATION_TTL_SECONDS);
          } catch (e) {
            // Ignore Redis set errors
          }
        }

        // Targeted emit to the rider owning this ride
        if (rideId) {
          const riderId = rideToRiderMap.get(rideId);
          if (riderId) {
            io.to(`rider:${riderId}`).emit('driverLocationUpdate', data);
            return;
          }
        }

        // Fallback: broadcast to riders (useful during early testing)
        io.to('riders').emit('driverLocationUpdate', data);
      } catch (e) {
        console.error('Failed to process driver location update:', e);
      }
    }
  });

  // Handle subscription events
  subscriptionClient.on('subscribe', (channel) => {
    console.log('✅ Subscribed to Redis channel:', channel);
    isSubscribed = true;
  });

  subscriptionClient.on('psubscribe', (pattern) => {
    console.log('✅ Subscribed to Redis pattern:', pattern);
  });

  // Initial subscribe
  subscriptionClient.subscribe(CHANNELS.DRIVER_LOCATION_UPDATES);
  console.log(`API Gateway subscribed to ${CHANNELS.DRIVER_LOCATION_UPDATES} Redis channel`);
}

export function subscribeToDriverLocations(io: SocketIOServer, rideToRiderMap: Map<string, string>) {
  createSubscription(io, rideToRiderMap);
} 