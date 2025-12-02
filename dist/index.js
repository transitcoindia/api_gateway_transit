"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const env_1 = require("./config/env");
const auth_1 = require("./middleware/auth");
const proxy_1 = require("./middleware/proxy");
// Rate limiting configuration
const rateLimiting_1 = require("./config/rateLimiting");
const rateLimiter_1 = require("./middleware/rateLimiter");
const websocketService_1 = require("./services/websocketService");
const rides_1 = __importDefault(require("./routes/rides"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const PORT = env_1.PORT;
// Behind Render/other proxies, trust X-Forwarded-* headers so rate limiters/IP logic work correctly
app.set('trust proxy', 1);
// Initialize WebSocket service with the HTTP server
const wsService = new websocketService_1.WebSocketService(httpServer);
// CORS configuration
app.use((0, cors_1.default)({
    origin: (0, env_1.getAllowedOrigins)(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
// Rate limiting configuration
console.log(`📊 ${(0, rateLimiting_1.getRateLimitingMessage)()}`);
if (!(0, rateLimiting_1.shouldApplyRateLimiting)()) {
    console.log('⚠️  Rate limiting disabled to prevent 429 errors on Render');
    console.log('💡 For production security, implement rate limiting at CDN/load balancer level');
}
app.use(express_1.default.json());
// Basic route
app.get('/', (req, res) => {
    res.status(200).json({
        message: "API Gateway is running",
        websocket: "enabled",
        timestamp: new Date().toISOString()
    });
});
// WebSocket health check endpoint
app.get('/websocket-health', (req, res) => {
    const io = wsService.getIO();
    const connectedClients = io.engine.clientsCount || 0;
    const rooms = Array.from(io.sockets.adapter.rooms.keys());
    res.json({
        status: 'ok',
        websocket: 'enabled',
        timestamp: new Date().toISOString(),
        connected_clients: connectedClients,
        active_rooms: rooms,
        environment: process.env.NODE_ENV || 'development'
    });
});
// Routes
const ridesRouter = (0, rides_1.default)(wsService);
app.use('/api/gateway/rides', ridesRouter);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        websocket: 'enabled',
        environment: process.env.NODE_ENV || 'development',
        services: {
            driver_backend: process.env.driver_backend || 'http://localhost:3000',
            rider_backend: process.env.rider_backend || 'http://localhost:8000'
        },
        websocket_connections: wsService.getIO().engine.clientsCount || 0
    });
});
// Proxy + middleware pipeline for API routes
app.use(proxy_1.routeMatcher);
if ((0, rateLimiting_1.shouldApplyRateLimiting)()) {
    app.use(rateLimiter_1.rateLimiter);
}
const getRouteConfig = (req) => {
    return req.routeConfig;
};
app.use((req, res, next) => {
    const routeConfig = getRouteConfig(req);
    if (!routeConfig || !routeConfig.authRequired) {
        return next();
    }
    return (0, auth_1.authenticate)(req, res, next);
});
app.use((req, res, next) => {
    const routeConfig = getRouteConfig(req);
    if (!routeConfig) {
        return next();
    }
    const proxy = (0, proxy_1.createServiceProxy)(routeConfig);
    return proxy(req, res, next);
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(err.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});
// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔌 WebSocket server is ready on ws://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket health: http://localhost:${PORT}/websocket-health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n🔧 Environment Variables Check:');
    console.log(`   DRIVER_SERVICE_URL: ${process.env.DRIVER_SERVICE_URL || 'NOT SET'}`);
    console.log(`   driver_backend: ${process.env.driver_backend || 'NOT SET'}`);
    console.log(`   RIDER_BACKEND_URL: ${process.env.RIDER_BACKEND_URL || 'NOT SET'}`);
    console.log(`   rider_backend: ${process.env.rider_backend || 'NOT SET'}`);
    console.log(`   REDIS_URL: ${process.env.REDIS_URL ? '✅ SET' : 'NOT SET'}`);
    console.log('\n🔗 Resolved Backend Service URLs:');
    console.log(`   Driver Backend: ${env_1.DRIVER_BACKEND_URL}`);
    console.log(`   Rider Backend:  ${env_1.RIDER_BACKEND_URL}`);
    console.log('\n📋 Available routes:');
    console.log('GET  /health');
    console.log('GET  /websocket-health');
    console.log('GET  /api/gateway/rides/health');
    console.log('POST /api/gateway/rides/request');
    console.log('POST /api/driver/subscription/activate (proxies to driver backend)');
    // Warn if using localhost URLs in production
    if (process.env.NODE_ENV === 'production') {
        if (env_1.DRIVER_BACKEND_URL.includes('localhost') || env_1.RIDER_BACKEND_URL.includes('localhost')) {
            console.warn('\n⚠️  WARNING: Using localhost URLs in production!');
            console.warn('   Current values:');
            console.warn(`   DRIVER_BACKEND_URL: ${env_1.DRIVER_BACKEND_URL}`);
            console.warn(`   RIDER_BACKEND_URL: ${env_1.RIDER_BACKEND_URL}`);
            console.warn('\n   Please set these environment variables in Render:');
            console.warn('   - DRIVER_SERVICE_URL (e.g., https://your-driver-backend.onrender.com)');
            console.warn('   - rider_backend (e.g., https://your-rider-backend.onrender.com)');
        }
    }
});
// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
});
