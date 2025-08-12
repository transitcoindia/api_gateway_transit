const Redis = require('ioredis');
const io = require('socket.io-client');
const dotenv= require('dotenv');
dotenv.config();


async function publishTestLocation() {
  console.log('📡 Publishing test location to Redis...');
  
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  const testLocationData = {
    driverId: 'test-driver-456',
    latitude: 12.9716,
    longitude: 77.5946,
    cellId: 'test-cell-123',
    timestamp: Date.now()
  };

  try {
    await redis.publish('driver_location_updates', JSON.stringify(testLocationData));
    console.log('✅ Published to Redis:', testLocationData);
  } catch (error) {
    console.error('❌ Error publishing to Redis:', error);
  } finally {
    await redis.disconnect();
  }
}

publishTestLocation(); 