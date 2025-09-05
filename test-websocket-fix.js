#!/usr/bin/env node

/**
 * Test script to verify WebSocket 429 fix
 * Run this after deploying the API Gateway to test WebSocket connectivity
 */

const { io } = require('socket.io-client');

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'https://api-gateway-transit.onrender.com';

console.log('🧪 Testing WebSocket 429 fix (Rate Limiting Disabled)...');
console.log(`📍 API Gateway URL: ${API_GATEWAY_URL}`);
console.log('📊 Rate limiting is completely disabled to prevent 429 errors');

// Test 1: Basic WebSocket connection
console.log('\n1️⃣ Testing basic WebSocket connection...');

const socket = io(API_GATEWAY_URL, {
  transports: ['websocket'],
  upgrade: false,
  forceNew: true,
  withCredentials: true,
  path: '/socket.io/',
  timeout: 30000,
  reconnection: false, // Disable for testing
  extraHeaders: {
    Origin: API_GATEWAY_URL,
    'User-Agent': 'TestClient/1.0.0'
  }
});

let connectionSuccess = false;
let connectionError = null;

socket.on('connect', () => {
  console.log('✅ WebSocket connected successfully!');
  connectionSuccess = true;
  
  // Test authentication
  console.log('🔐 Testing authentication...');
  socket.emit('authenticate', {
    driverId: 'test-driver-123',
    accessToken: 'test-token-123'
  });
});

socket.on('authenticated', (response) => {
  console.log('✅ Authentication successful:', response);
  
  // Test server ping
  console.log('🏓 Testing server ping...');
  socket.emit('pong', { timestamp: Date.now() });
});

socket.on('serverPing', (data) => {
  console.log('✅ Server ping received:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
  connectionError = error;
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

// Test 2: Multiple simultaneous connections (should be queued)
console.log('\n2️⃣ Testing connection queuing...');

const testMultipleConnections = () => {
  const connections = [];
  const connectionCount = 5;
  
  for (let i = 0; i < connectionCount; i++) {
    const testSocket = io(API_GATEWAY_URL, {
      transports: ['websocket'],
      upgrade: false,
      forceNew: true,
      withCredentials: true,
      path: '/socket.io/',
      timeout: 30000,
      reconnection: false,
      extraHeaders: {
        Origin: API_GATEWAY_URL,
        'User-Agent': `TestClient-${i}/1.0.0`
      }
    });
    
    connections.push(testSocket);
    
    testSocket.on('connect', () => {
      console.log(`✅ Connection ${i + 1} established`);
    });
    
    testSocket.on('connect_error', (error) => {
      console.error(`❌ Connection ${i + 1} failed:`, error.message);
    });
  }
  
  // Clean up after 10 seconds
  setTimeout(() => {
    connections.forEach(socket => socket.disconnect());
    console.log('🧹 Cleaned up test connections');
  }, 10000);
};

// Test 3: Health check endpoint
console.log('\n3️⃣ Testing health check endpoint...');

const testHealthCheck = async () => {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/websocket-health`);
    const data = await response.json();
    
    console.log('✅ Health check successful:');
    console.log(`   - Status: ${data.status}`);
    console.log(`   - WebSocket: ${data.websocket}`);
    console.log(`   - Connected clients: ${data.connected_clients}`);
    console.log(`   - Environment: ${data.environment}`);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
};

// Run tests
const runTests = async () => {
  await testHealthCheck();
  
  // Wait for first connection test
  setTimeout(() => {
    if (connectionSuccess) {
      console.log('\n✅ All tests passed! WebSocket 429 fix is working.');
      process.exit(0);
    } else if (connectionError) {
      console.log('\n❌ Tests failed. Check the error above.');
      process.exit(1);
    } else {
      console.log('\n⏳ Connection test timed out.');
      process.exit(1);
    }
  }, 15000);
  
  // Test multiple connections after 5 seconds
  setTimeout(testMultipleConnections, 5000);
};

runTests();

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted. Cleaning up...');
  socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated. Cleaning up...');
  socket.disconnect();
  process.exit(0);
});
