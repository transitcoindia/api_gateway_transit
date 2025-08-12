const Redis = require('ioredis');
const io = require('socket.io-client');
const dotenv= require('dotenv');
dotenv.config();

// Test Redis subscription flow
async function testRedisSubscription() {
  console.log('🧪 Testing Redis Subscription Flow...\n');

  // 1. Connect to Redis
  const redisClient = new Redis(process.env.REDIS_URL);
  console.log('✅ Connected to Redis');

  // 2. Connect to API Gateway WebSocket as a rider
  const socket = io('http://localhost:3005', {
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('✅ Connected to API Gateway WebSocket');
    
    // Authenticate as a rider
    socket.emit('authenticate', { riderId: 'test-rider-123' });
  });

  socket.on('authenticated', (data) => {
    console.log('✅ Authenticated as rider:', data);
    
    // 3. Listen for driver location updates
    socket.on('driverLocationUpdate', (data) => {
      console.log('🎯 Received driver location update:', data);
      console.log('✅ Redis subscription is working!');
      
      // Clean up
      redisClient.disconnect();
      socket.disconnect();
      process.exit(0);
    });

    // 4. Publish a test location update to Redis
    setTimeout(async () => {
      const testLocationData = {
        driverId: 'test-driver-456',
        latitude: 12.9716,
        longitude: 77.5946,
        cellId: 'test-cell-123',
        timestamp: Date.now()
      };

      console.log('📡 Publishing test location to Redis:', testLocationData);
      await redisClient.publish('driver_location_updates', JSON.stringify(testLocationData));
    }, 1000);
  });

  socket.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout - Redis subscription may not be working');
    redisClient.disconnect();
    socket.disconnect();
    process.exit(1);
  }, 10000);
}

// Run the test
testRedisSubscription().catch(console.error); 