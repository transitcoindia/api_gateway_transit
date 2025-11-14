"use strict";
/**
 * Rate Limiting Configuration
 *
 * For production deployments on Render, rate limiting is disabled
 * to prevent 429 errors with WebSocket connections.
 *
 * If you need rate limiting for security, implement it at the
 * CDN/load balancer level instead of the application level.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRateLimitingMessage = exports.shouldApplyRateLimiting = exports.RATE_LIMITING_CONFIG = void 0;
exports.RATE_LIMITING_CONFIG = {
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
const shouldApplyRateLimiting = () => {
    return exports.RATE_LIMITING_CONFIG.ENABLED;
};
exports.shouldApplyRateLimiting = shouldApplyRateLimiting;
const getRateLimitingMessage = () => {
    return (0, exports.shouldApplyRateLimiting)()
        ? 'Rate limiting is ENABLED'
        : 'Rate limiting is DISABLED (production mode)';
};
exports.getRateLimitingMessage = getRateLimitingMessage;
