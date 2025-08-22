# WebSocket Testing Guide

## Fixing the 429 Error

The `Unexpected server response: 429` error indicates rate limiting. We've implemented several fixes:

### 1. WebSocket-Specific Rate Limiter
- Added `websocketRateLimiter` with 30 connections per minute per IP
- Applied to `/socket.io/` endpoint specifically
- More lenient than general API rate limiting

### 2. Better Error Handling
- Added comprehensive error handling for WebSocket connections
- Added connection retry logic
- Added server-level error logging

### 3. CORS and Origin Updates
- Added `https://api-gateway-transit.onrender.com` to allowed origins
- Improved CORS configuration for WebSocket upgrades

## Testing Steps

### 1. Deploy the Updated API Gateway
```bash
# Commit and push your changes
git add .
git commit -m "Fix WebSocket 429 error with better rate limiting and error handling"
git push
```

### 2. Test HTTP Endpoints First
```bash
# Test health check
curl https://api-gateway-transit.onrender.com/health

# Test WebSocket health check
curl https://api-gateway-transit.onrender.com/websocket-health
```

### 3. Test WebSocket Connection
```bash
# Install dependencies
npm install

# Run the test script
node testWebSocket.js
```

### 4. Monitor Logs
Watch your Render logs for:
- WebSocket connection attempts
- Rate limiting events
- Error messages

## Expected Behavior

✅ **Success Case:**
```
🔌 Testing WebSocket connection...
✅ Connected successfully!
Socket ID: abc123...
✅ Authentication successful: { status: 'success', type: 'rider' }
✅ Ride request response: { rideId: 'ride_123...', rideCode: '1234' }
```

❌ **Rate Limited Case:**
```
🔌 Testing WebSocket connection...
❌ Connection error: Too many requests
💡 This is a rate limiting error. Try again in a few seconds.
```

## Troubleshooting

### If Still Getting 429:
1. **Check Render Infrastructure Limits:**
   - Render might have its own rate limiting
   - Check your service plan limits

2. **Verify Environment Variables:**
   ```bash
   # In your Render dashboard, ensure these are set:
   REDIS_URL=your_redis_url
   NODE_ENV=production
   ```

3. **Check WebSocket Health:**
   ```bash
   curl https://api-gateway-transit.onrender.com/websocket-health
   ```

4. **Monitor Connection Counts:**
   - The health endpoint shows active WebSocket connections
   - If too many, connections might be getting stuck

### If WebSocket Won't Connect:
1. **Check CORS Origins:**
   - Ensure your client domain is in the allowed origins
   - Test with `https://api-gateway-transit.onrender.com`

2. **Check Transport:**
   - Try both `websocket` and `polling` transports
   - Some networks block WebSocket connections

3. **Check Firewall/Proxy:**
   - Corporate networks often block WebSocket connections
   - Test from different network locations

## Production Considerations

### 1. Rate Limiting Tuning
- Adjust `websocketRateLimiter` values based on your traffic
- Monitor connection patterns in production

### 2. Connection Pooling
- Consider implementing connection pooling for high-traffic scenarios
- Monitor memory usage with many WebSocket connections

### 3. Load Balancing
- If using multiple API Gateway instances, ensure WebSocket connections are sticky
- Consider Redis adapter for Socket.IO clustering

## Quick Test Commands

```bash
# Test basic connectivity
curl -I https://api-gateway-transit.onrender.com/health

# Test WebSocket endpoint
curl -I https://api-gateway-transit.onrender.com/socket.io/

# Run full WebSocket test
node testWebSocket.js
```

## Next Steps

After fixing the 429 error:
1. Test the complete ride flow (rider → driver → location updates)
2. Monitor Redis connections and WebSocket performance
3. Implement connection monitoring and alerting
4. Add WebSocket connection metrics to your health checks
