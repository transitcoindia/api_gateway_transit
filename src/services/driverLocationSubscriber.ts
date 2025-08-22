import redis from '../redis';
import { Server as SocketIOServer } from 'socket.io';

export function subscribeToDriverLocations(io: SocketIOServer, rideToRiderMap: Map<string, string>) {
  const sub = redis.duplicate();
  sub.subscribe('driver_location_updates');
  sub.on('message', async (channel, message) => {
    if (channel === 'driver_location_updates') {
      const data = JSON.parse(message);
      const { rideId } = data || {};

      // Cache last location by ride for GET fallback
      if (rideId) {
        await redis.set(`ride:lastLocation:${rideId}`, message, 'EX', 7200);
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
    }
  });

  sub.on('error', (error) => {
    console.error('❌ Redis subscription error:', error);
  });

  sub.on('subscribe', (channel) => {
    console.log('✅ Subscribed to Redis channel:', channel);
  });

  console.log('API Gateway subscribed to driver_location_updates Redis channel');
} 