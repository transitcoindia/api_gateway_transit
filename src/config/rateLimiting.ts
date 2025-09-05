/**
 * Rate Limiting Configuration
 * 
 * For production deployments on Render, rate limiting is disabled
 * to prevent 429 errors with WebSocket connections.
 * 
 * If you need rate limiting for security, implement it at the
 * CDN/load balancer level instead of the application level.
 */

export const RATE_LIMITING_CONFIG = {
  // Disable rate limiting in production to prevent 429 errors
  ENABLED: process.env.NODE_ENV !== 'production',
  
  // If enabled, use these settings
  API_LIMITS: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: 'Too many requests, please try again later'
  },
  
  WEBSOCKET_LIMITS: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10000, // Effectively unlimited
    message: 'Too many WebSocket connections'
  }
};

export const shouldApplyRateLimiting = (): boolean => {
  return RATE_LIMITING_CONFIG.ENABLED;
};

export const getRateLimitingMessage = (): string => {
  return shouldApplyRateLimiting() 
    ? 'Rate limiting is ENABLED' 
    : 'Rate limiting is DISABLED (production mode)';
};
