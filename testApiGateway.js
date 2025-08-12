const axios = require('axios');

async function testApiGateway() {
  console.log('🌐 Testing API Gateway Rides Endpoint\n');
  
  const apiGatewayUrl = 'http://localhost:3005';
  
  try {
    // 1. Test health endpoint
    console.log('1️⃣ Testing API Gateway health...');
    const healthResponse = await axios.get(`${apiGatewayUrl}/health`);
    console.log('✅ API Gateway health check passed');
    console.log('   Status:', healthResponse.status);
    console.log('   Response:', healthResponse.data);
    console.log('');

    // 2. Test rides health endpoint
    console.log('2️⃣ Testing rides health endpoint...');
    const ridesHealthResponse = await axios.get(`${apiGatewayUrl}/api/gateway/rides/health`);
    console.log('✅ Rides health check passed');
    console.log('   Status:', ridesHealthResponse.status);
    console.log('   Response:', ridesHealthResponse.data);
    console.log('');

    // 3. Test ride request endpoint
    console.log('3️⃣ Testing ride request endpoint...');
    const testRideRequest = {
      pickupLatitude: 19.0760,
      pickupLongitude: 72.8777,
      pickupAddress: "Mumbai Central",
      dropLatitude: 19.2183,
      dropLongitude: 72.9781,
      dropAddress: "Powai Lake, Mumbai",
      rideType: "STANDARD",
      maxWaitTime: 300
    };

    const rideResponse = await axios.post(`${apiGatewayUrl}/api/gateway/rides/request`, testRideRequest, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtYW54amlmOTAwN3Z0dDBxYm02bWlzNGQiLCJpYXQiOjE3NTM3OTM2OTgsImV4cCI6MTc1Mzc5NDU5OH0.BRrvmCsB5ckJAhJtBDrmSE-UkewM2p25P3zyR1cBQ44'
      },
      timeout: 15000
    });

    console.log('✅ Ride request successful!');
    console.log('   Status:', rideResponse.status);
    console.log('   Response:', JSON.stringify(rideResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('📡 HTTP Error:', error.response.status);
      console.error('📄 Response:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Connection refused. Make sure API Gateway is running on port 3005');
    } else {
      console.error('💥 Unexpected error:', error.message);
    }
  }
}

testApiGateway();