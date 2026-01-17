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
// Logging middleware - Log ALL incoming requests
app.use((req, res, next) => {
    console.log(`📨 Incoming request: ${req.method} ${req.path}`);
    console.log(`   Headers: ${JSON.stringify(req.headers)}`);
    console.log(`   Body: ${JSON.stringify(req.body)}`);
    next();
});
// Basic route
app.get('/', (req, res) => {
    res.status(200).json({
        message: "API Gateway is running",
        websocket: "enabled",
        timestamp: new Date().toISOString(),
        deployedAt: "https://api-gateway-transit-iywb.onrender.com"
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
    console.log('🏥 Health check requested');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        websocket: 'enabled',
        environment: process.env.NODE_ENV || 'development',
        services: {
            driver_backend_url: env_1.DRIVER_BACKEND_URL,
            rider_backend_url: env_1.RIDER_BACKEND_URL
        },
        env_vars: {
            DRIVER_SERVICE_URL: process.env.DRIVER_SERVICE_URL || 'NOT SET',
            driver_backend: process.env.driver_backend || 'NOT SET',
            RIDER_BACKEND_URL: process.env.RIDER_BACKEND_URL || 'NOT SET',
            rider_backend: process.env.rider_backend || 'NOT SET'
        },
        websocket_connections: wsService.getIO().engine.clientsCount || 0,
        deployed_url: 'https://api-gateway-transit-iywb.onrender.com'
    });
});
// Network connectivity test endpoint - Tests Render's ability to reach AWS backends
app.get('/debug/network-test', async (req, res) => {
    console.log('🔍 Network connectivity test requested');
    const results = {
        timestamp: new Date().toISOString(),
        render_environment: process.env.NODE_ENV || 'development',
        configured_urls: {
            driver_backend: env_1.DRIVER_BACKEND_URL,
            rider_backend: env_1.RIDER_BACKEND_URL
        },
        tests: {}
    };
    // Test Driver Backend
    console.log('Testing Driver Backend connectivity...');
    results.tests.driver_backend = await testBackendConnectivity('Driver Backend', env_1.DRIVER_BACKEND_URL);
    // Test Rider Backend
    console.log('Testing Rider Backend connectivity...');
    results.tests.rider_backend = await testBackendConnectivity('Rider Backend', env_1.RIDER_BACKEND_URL);
    // Overall status
    const allPassed = Object.values(results.tests).every((test) => test.reachable === true);
    results.overall_status = allPassed ? '✅ All services reachable' : '❌ Some services unreachable';
    results.summary = {
        driver_backend_reachable: results.tests.driver_backend.reachable,
        rider_backend_reachable: results.tests.rider_backend.reachable
    };
    console.log('Network test results:', JSON.stringify(results, null, 2));
    res.json(results);
});
// Helper function to test backend connectivity
async function testBackendConnectivity(serviceName, baseUrl) {
    const result = {
        service: serviceName,
        url: baseUrl,
        reachable: false,
        response_time_ms: null,
        status_code: null,
        error: null,
        health_endpoint_tested: `${baseUrl}/health`
    };
    try {
        const startTime = Date.now();
        // Try to fetch the health endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'API-Gateway-Network-Test'
            }
        });
        clearTimeout(timeoutId);
        const endTime = Date.now();
        result.response_time_ms = endTime - startTime;
        result.status_code = response.status;
        result.reachable = response.ok; // true if status 200-299
        // Try to read response body
        try {
            const text = await response.text();
            result.response_preview = text.substring(0, 200); // First 200 chars
            // Try to parse as JSON
            try {
                result.response_data = JSON.parse(text);
            }
            catch (e) {
                // Not JSON, that's okay
            }
        }
        catch (e) {
            result.response_preview = 'Could not read response body';
        }
        console.log(`✅ ${serviceName} reachable: ${result.status_code} in ${result.response_time_ms}ms`);
    }
    catch (error) {
        console.error(`❌ ${serviceName} connection failed:`, error.message);
        result.reachable = false;
        result.error = error.message;
        // Categorize the error
        if (error.name === 'AbortError') {
            result.error_type = 'TIMEOUT';
            result.error_details = 'Connection timed out after 10 seconds - possible network/firewall issue';
        }
        else if (error.message.includes('ENOTFOUND')) {
            result.error_type = 'DNS_RESOLUTION_FAILED';
            result.error_details = 'Could not resolve hostname - check DNS or URL';
        }
        else if (error.message.includes('ECONNREFUSED')) {
            result.error_type = 'CONNECTION_REFUSED';
            result.error_details = 'Connection refused - service may be down or port blocked';
        }
        else if (error.message.includes('ETIMEDOUT')) {
            result.error_type = 'NETWORK_TIMEOUT';
            result.error_details = 'Network timeout - check AWS Security Groups allow Render IPs';
        }
        else {
            result.error_type = 'UNKNOWN';
            result.error_details = error.message;
        }
    }
    return result;
}
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
        console.log(`⚠️ No route config found for ${req.method} ${req.path} - returning 404`);
        return res.status(404).json({
            status: 'error',
            message: 'Route not found',
            path: req.path,
            method: req.method
        });
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
