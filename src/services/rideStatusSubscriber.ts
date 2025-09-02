import redis from '../redis';
import { Server as SocketIOServer } from 'socket.io';

export function subscribeToRideStatus(io: SocketIOServer) {
  const sub = redis.duplicate();
  sub.subscribe('ride_status_updates');

  sub.on('message', async (channel, message) => {
    if (channel === 'ride_status_updates') {
      try {
        const data = JSON.parse(message);
        const { rideId, riderId } = data || {};
        if (riderId) {
          io.to(`rider:${riderId}`).emit('rideStatusUpdate', data);
        } else {
          io.to('riders').emit('rideStatusUpdate', data);
        }
      } catch (e) {
        console.error('Failed to process ride status update:', e);
      }
    }
  });

  sub.on('error', (error) => {
    console.error('❌ Redis ride status subscription error:', error);
  });

  sub.on('subscribe', (channel) => {
    console.log('✅ Subscribed to Redis channel (status):', channel);
  });

  console.log('API Gateway subscribed to ride_status_updates Redis channel');
}


