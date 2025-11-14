"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebSocketRateLimit = exports.getWebSocketConfig = void 0;
const getWebSocketConfig = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        // Path configuration
        path: '/socket.io/',
        // CORS configuration
        cors: {
            origin: process.env.API_GATEWAY_PUBLIC_ORIGIN || 'https://api-gateway-transit.onrender.com',
            methods: ['GET', 'POST'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'User-Agent']
        },
        // Connection configuration
        pingTimeout: isProduction ? 120000 : 60000, // 2 minutes in production, 1 minute in dev
        pingInterval: isProduction ? 25000 : 10000, // 25s in production, 10s in dev
        connectTimeout: isProduction ? 120000 : 60000, // 2 minutes in production, 1 minute in dev
        // Transport configuration
        transports: ['websocket', 'polling'],
        // Allow request function - very permissive to avoid 429s
        allowRequest: (req, fn) => {
            // Always allow WebSocket upgrade requests
            const upgrade = req.headers.upgrade;
            const connection = req.headers.connection;
            if (upgrade === 'websocket' || connection === 'upgrade') {
                return fn(null, true);
            }
            // Allow all other requests
            return fn(null, true);
        },
        // Engine.IO configuration
        allowEIO3: true, // Allow Engine.IO v3 clients
        // Additional options for production
        ...(isProduction && {
            // More conservative settings for production
            maxHttpBufferSize: 1e6, // 1MB
            allowUpgrades: true,
            perMessageDeflate: {
                threshold: 1024,
                concurrencyLimit: 10,
                memLevel: 7
            }
        })
    };
};
exports.getWebSocketConfig = getWebSocketConfig;
// Rate limiting configuration for WebSocket connections
const getWebSocketRateLimit = () => {
    return {
        // Effectively disable rate limiting for WebSocket connections
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 10000, // Very high limit
        skip: (req) => {
            const path = req.path || '';
            const upgrade = req.headers.upgrade;
            const connection = req.headers.connection;
            // Skip rate limiting for ALL WebSocket-related requests
            return (path.includes('/socket.io/') ||
                upgrade === 'websocket' ||
                connection === 'upgrade' ||
                (req.method === 'GET' && path.includes('socket.io')) ||
                (req.method === 'POST' && path.includes('socket.io')));
        }
    };
};
exports.getWebSocketRateLimit = getWebSocketRateLimit;
