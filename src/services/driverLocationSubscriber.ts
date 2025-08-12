import redis from '../redis';
import { Server as SocketIOServer } from 'socket.io';

export function subscribeToDriverLocations(io: SocketIOServer, rideToRiderMap: Map<string, string>) {
  const sub = redis.duplicate();
  sub.subscribe('driver_location_updates');
  sub.on('message', (channel, message) => {
    if (channel === 'driver_location_updates') {
      const data = JSON.parse(message);
      console.log('📡 Received driver location from Redis:', data);
      
      // Broadcast to all riders in the 'riders' room
      io.to('riders').emit('driverLocationUpdate', data);
      
      // Also emit to specific rider rooms for targeted updates
      // This ensures both broadcast and targeted delivery work
      io.emit('driverLocationUpdate', data);
      
      console.log('📤 Emitted driver location to WebSocket clients');
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