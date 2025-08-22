const { io } = require('socket.io-client');

// Test WebSocket connection to API Gateway
async function testWebSocketConnection() {
  console.log('🔌 Testing WebSocket connection...');
  
  const socket = io('https://api-gateway-transit.onrender.com', {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000
  });

  // Connection events
  socket.on('connect', () => {
    console.log('✅ Connected successfully!');
    console.log('Socket ID:', socket.id);
    
    // Test authentication
    socket.emit('authenticate', { 
      riderId: 'test-rider-123', 
      accessToken: 'test-token' 
    });
  });

  socket.on('authenticated', (data) => {
    console.log('✅ Authentication successful:', data);
    
    // Test ride request
    socket.emit('requestRide', {
      riderId: 'test-rider-123',
      accessToken: 'test-token',
      pickupLatitude: 19.076,
      pickupLongitude: 72.8777,
      pickupAddress: 'Test Pickup',
      dropLatitude: 19.2183,
      dropLongitude: 72.9781,
      dropAddress: 'Test Drop',
      rideType: 'STANDARD',
      maxWaitTime: 300
    }, (response) => {
      console.log('✅ Ride request response:', response);
    });
  });

  // Error handling
  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
    if (error.message.includes('429')) {
      console.log('💡 This is a rate limiting error. Try again in a few seconds.');
    }
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', reason);
  });

  // Test events
  socket.on('connectionInfo', (info) => {
    console.log('📡 Connection info received:', info);
  });

  socket.on('serverPing', (ping) => {
    console.log('🏓 Server ping received:', ping);
    socket.emit('ping');
  });

  socket.on('pong', (pong) => {
    console.log('🏓 Pong sent:', pong);
  });

  // Cleanup after 30 seconds
  setTimeout(() => {
    console.log('🧹 Cleaning up test connection...');
    socket.disconnect();
    process.exit(0);
  }, 30000);
}

// Test HTTP endpoints first
async function testHTTPEndpoints() {
  console.log('🌐 Testing HTTP endpoints...');
  
  try {
    const response = await fetch('https://api-gateway-transit.onrender.com/health');
    const data = await response.json();
    console.log('✅ Health check:', data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }

  try {
    const response = await fetch('https://api-gateway-transit.onrender.com/websocket-health');
    const data = await response.json();
    console.log('✅ WebSocket health check:', data);
  } catch (error) {
    console.error('❌ WebSocket health check failed:', error.message);
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting API Gateway tests...\n');
  
  await testHTTPEndpoints();
  console.log('');
  await testWebSocketConnection();
}

runTests().catch(console.error);
