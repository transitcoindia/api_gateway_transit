# WebSocket 429 Error Fix - Complete Solution

## Problem
Render's infrastructure was rate-limiting WebSocket connections, causing 429 "Too Many Requests" errors when drivers/riders tried to connect to the API Gateway.

## Root Causes
1. **Rate Limiting**: Express rate limiter was blocking WebSocket upgrade requests
2. **Burst Connections**: Multiple clients connecting simultaneously triggered rate limits
3. **Polling Fallback**: Socket.IO falling back to polling transport, which is more likely to be rate-limited
4. **Insufficient Backoff**: Clients retrying too quickly after 429 errors

## Solutions Implemented

### 1. Complete Rate Limiter Bypass
- **File**: `api_gateway/src/middleware/rateLimiter.ts`
- **Changes**: 
  - WebSocket rate limiter now skips ALL WebSocket-related requests
  - Increased max limit to 10,000 (effectively unlimited)
  - Added comprehensive path detection for WebSocket requests

### 2. Enhanced WebSocket Configuration
- **File**: `api_gateway/src/config/websocket.ts` (NEW)
- **Features**:
  - Production-optimized timeouts and intervals
  - Permissive CORS configuration
  - Always-allow request handler
  - Engine.IO v3 compatibility

### 3. Connection Queuing System
- **Files**: 
  - `driver_backend/src/services/websocketClient.ts`
  - `transit_backend-1/src/services/websocketClient.ts`
- **Features**:
  - Global connection delay to prevent simultaneous connections
  - Random jitter (2-5 seconds) to spread out connection attempts
  - Connection queue to prevent duplicate connection attempts

### 4. Aggressive 429 Error Handling
- **Enhanced Error Detection**: Detects 429 errors in multiple error properties
- **Exponential Backoff**: 60s + 30s per attempt (60s, 90s, 120s, 150s, 180s)
- **Connection Reset**: Disconnects before retrying to avoid stuck connections
- **Better Logging**: Clear indication of backoff periods

### 5. Production-Optimized Client Settings
- **Transport Priority**: WebSocket first, polling fallback
- **Increased Timeouts**: 60s connection timeout, 25s ping interval
- **Better Headers**: User-Agent and Origin headers for identification
- **Conservative Reconnection**: 8s initial delay, 30s max delay

## Configuration Changes

### API Gateway
```typescript
// Rate limiting completely disabled for WebSocket paths
skip: (req) => {
  const path = req.path || '';
  const upgrade = req.headers.upgrade;
  const connection = req.headers.connection;
  
  return (
    path.includes('/socket.io/') ||
    upgrade === 'websocket' ||
    connection === 'upgrade' ||
    req.method === 'GET' && path.includes('socket.io')
  );
}
```

### Driver/Rider Clients
```typescript
// Staggered connection with global delay
private scheduleConnection() {
  if (this.connectionQueue) return;
  
  this.connectionQueue = true;
  DriverWebSocketClient.globalConnectionDelay += 2000; // 2s between connections
  const delay = DriverWebSocketClient.globalConnectionDelay + Math.random() * 3000;
  
  setTimeout(() => {
    this.connectionQueue = false;
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }, delay);
}
```

## Testing the Fix

### 1. Deploy API Gateway
```bash
cd api_gateway
git add .
git commit -m "Fix WebSocket 429 errors with comprehensive solution"
git push origin main
```

### 2. Test Driver Connection
```bash
cd driver_backend
npm start
# Check logs for successful connection without 429 errors
```

### 3. Test Rider Connection
```bash
cd transit_backend-1
npm start
# Check logs for successful connection without 429 errors
```

### 4. Monitor WebSocket Health
```bash
curl https://api-gateway-transit.onrender.com/websocket-health
```

## Expected Results

### Before Fix
```
Connection error: TransportError: websocket error
{ description: ErrorEvent { Symbol(kError): Error: Unexpected server response: 429 } }
```

### After Fix
```
✅ Connected to API Gateway WebSocket server
✅ Driver authenticated: { success: true }
✅ Scheduling connection in 3.2s to avoid burst...
```

## Monitoring

### WebSocket Health Endpoint
- **URL**: `https://api-gateway-transit.onrender.com/websocket-health`
- **Returns**: Connection count, active rooms, environment info

### Log Patterns to Watch
- **Success**: `✅ Connected to API Gateway WebSocket server`
- **Backoff**: `Received 429. Backing off for 60s before next attempt`
- **Queue**: `Scheduling connection in 3.2s to avoid burst...`

## Fallback Strategy

If 429 errors persist:
1. **Increase Delays**: Modify `globalConnectionDelay` increment
2. **Reduce Concurrency**: Limit simultaneous connections per service
3. **Use Dedicated Subdomain**: Deploy WebSocket on separate subdomain
4. **Implement Circuit Breaker**: Temporarily disable connections after repeated failures

## Environment Variables

Ensure these are set in Render:
```env
NODE_ENV=production
API_GATEWAY_PUBLIC_ORIGIN=https://api-gateway-transit.onrender.com
REDIS_URL=your_redis_url
```

## Performance Impact

- **Connection Time**: Slightly increased due to staggered connections (2-5s delay)
- **Memory Usage**: Minimal increase due to connection queuing
- **CPU Usage**: Reduced due to fewer failed connection attempts
- **Reliability**: Significantly improved WebSocket connection success rate

This comprehensive solution should eliminate 429 errors while maintaining reliable WebSocket connectivity for your cab provider application.
