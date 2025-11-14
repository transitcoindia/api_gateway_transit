import redis from '../redis';
import { CHANNELS, RIDE_LAST_LOCATION_TTL_SECONDS } from '../config/env';
import { Server as SocketIOServer } from 'socket.io';

let subscriptionClient: ReturnType<typeof redis.duplicate> | null = null;
let isSubscribed = false;

function createSubscription(io: SocketIOServer, rideToRiderMap: Map<string, string>) {
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
  subscriptionClient = redis.duplicate({
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis driver location subscription reconnecting (attempt ${times}) in ${delay}ms...`);
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
    // Handle specific error types gracefully
    if (error.message.includes('ECONNRESET')) {
      console.log('⚠️ Redis driver location subscription connection reset - will reconnect automatically');
      isSubscribed = false;
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('❌ Redis driver location subscription connection refused');
    } else if (error.message.includes('ETIMEDOUT')) {
      console.log('⚠️ Redis driver location subscription connection timeout - will retry');
      isSubscribed = false;
    } else {
      console.error('❌ Redis driver location subscription error:', error.message);
    }
  });

  subscriptionClient.on('close', () => {
    console.log('⚠️ Redis driver location subscription connection closed');
    isSubscribed = false;
  });

  subscriptionClient.on('reconnecting', (delay: number) => {
    console.log(`🔄 Redis driver location subscription reconnecting in ${delay}ms...`);
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
        if (rideId) {
          await redis.set(`ride:lastLocation:${rideId}`, message, 'EX', RIDE_LAST_LOCATION_TTL_SECONDS);
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