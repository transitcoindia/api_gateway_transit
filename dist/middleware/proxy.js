"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeMatcher = exports.createServiceProxy = void 0;
const http_proxy_middleware_1 = require("http-proxy-middleware");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const services_1 = require("../config/services");
const createServiceProxy = (route) => {
    const service = services_1.services[route.service];
    if (!service) {
        throw new Error(`Service ${route.service} not found`);
    }
    console.log(`🔄 Proxying ${route.path} to ${service.url}`);
    // For driver service, bypass http-proxy-middleware entirely and
    // use a simple axios-based proxy. This avoids low-level socket
    // handling that can trigger intermittent ECONNRESET with some CDNs.
    if (route.service === 'driver') {
        return async (req, res, next) => {
            try {
                const targetUrl = `${service.url}${req.path}`;
                console.log(`📤 [driver-axios] ${req.method} ${req.path} → ${targetUrl}`);
                // Clone headers but drop hop-by-hop ones that can confuse upstream
                const { host, connection, 'content-length': _cl, 'accept-encoding': _ae, ...restHeaders } = req.headers;
                const axiosResponse = await axios_1.default.request({
                    url: targetUrl,
                    method: req.method,
                    headers: restHeaders,
                    data: req.body,
                    // Important: let us forward any status, don't throw on 4xx/5xx
                    validateStatus: () => true,
                    httpsAgent: new https_1.default.Agent({ keepAlive: false }),
                    timeout: 30000,
                });
                console.log(`📥 [driver-axios] Response ${axiosResponse.status} from ${targetUrl}`);
                // Forward status and body
                res.status(axiosResponse.status);
                // Ensure JSON is sent as JSON
                if (typeof axiosResponse.data === 'object') {
                    res.json(axiosResponse.data);
                }
                else {
                    res.send(axiosResponse.data);
                }
            }
            catch (err) {
                console.error('❌ [driver-axios] Proxy error:', err.message || err);
                const code = err.code || 'UNKNOWN';
                if (code === 'ECONNRESET') {
                    return res.status(503).json({
                        status: 'error',
                        message: 'Driver backend connection reset. The backend may be unreachable or experiencing issues.',
                        error: 'ECONNRESET',
                    });
                }
                if (code === 'ETIMEDOUT') {
                    return res.status(504).json({
                        status: 'error',
                        message: 'Driver backend timeout. The request took too long to process.',
                        error: 'ETIMEDOUT',
                    });
                }
                if (code === 'ECONNREFUSED') {
                    return res.status(503).json({
                        status: 'error',
                        message: 'Driver backend connection refused. The backend may be down or not accepting connections.',
                        error: 'ECONNREFUSED',
                    });
                }
                return res.status(500).json({
                    status: 'error',
                    message: 'Service unavailable',
                    details: process.env.NODE_ENV === 'production' ? undefined : (err.message || String(err)),
                    error: code,
                });
            }
        };
    }
    return (0, http_proxy_middleware_1.createProxyMiddleware)({
        target: service.url,
        changeOrigin: true,
        timeout: 30000, // 30 second timeout
        proxyTimeout: 30000, // 30 second proxy timeout
        pathRewrite: {
            [`^${route.path}`]: route.path
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log(`📤 Proxying request: ${req.method} ${req.path} → ${service.url}${req.path}`);
        },
        onError: (err, req, res) => {
            console.error(`❌ Proxy error for ${route.path} → ${service.url}:`, err.message);
            console.error(`   Target URL: ${service.url}${req.url}`);
            console.error(`   Error code: ${err.code || 'UNKNOWN'}`);
            // Handle specific error types
            if (err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) {
                return res.status(503).json({
                    status: 'error',
                    message: 'Backend service connection reset. The backend may be unreachable or experiencing issues.',
                    error: 'ECONNRESET'
                });
            }
            if (err.code === 'ETIMEDOUT' || err.message.includes('ETIMEDOUT')) {
                return res.status(504).json({
                    status: 'error',
                    message: 'Backend service timeout. The request took too long to process.',
                    error: 'ETIMEDOUT'
                });
            }
            if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
                return res.status(503).json({
                    status: 'error',
                    message: 'Backend service connection refused. The backend may be down or not accepting connections.',
                    error: 'ECONNREFUSED'
                });
            }
            // Generic error response
            res.status(500).json({
                status: 'error',
                message: 'Service unavailable',
                details: process.env.NODE_ENV === 'production' ? undefined : err.message,
                error: err.code || 'UNKNOWN'
            });
        },
        onProxyRes: (proxyRes, req, res) => {
            console.log(`📥 Response from ${service.url}: ${proxyRes.statusCode}`);
            // Add service name to response headers for debugging
            proxyRes.headers['x-service'] = route.service;
        }
    });
};
exports.createServiceProxy = createServiceProxy;
const routeMatcher = (req, res, next) => {
    const path = req.path;
    const method = req.method;
    console.log(`🔍 Route matching: ${method} ${path}`);
    console.log(`   Available routes count: ${services_1.routes.length}`);
    console.log(`   Checking exact match for: ${path} with method ${method}`);
    // Allow rides routes to pass through without checking routes array
    if (path.startsWith('/api/gateway/rides')) {
        console.log(`✅ Matched gateway rides route`);
        return next();
    }
    // First try exact match (MUST come first to avoid parameterized routes matching before exact routes)
    let route = services_1.routes.find((r) => r.path === path && r.methods.includes(method));
    if (route) {
        console.log(`✅ Found exact match: ${route.path} → ${route.service}`);
    }
    else {
        console.log(`   No exact match found. Checking parameterized routes...`);
    }
    // If no exact match, try parameterized route matching (e.g., /api/driver/admin/approve/:driverId)
    // Only match parameterized routes if no exact route was found
    if (!route) {
        route = services_1.routes.find((r) => {
            if (!r.methods.includes(method))
                return false;
            // Only match parameterized routes (those with ':')
            if (!r.path.includes(':'))
                return false;
            // Convert route path pattern to regex (e.g., /api/rider/:rideId -> /api/rider/[^/]+)
            const pattern = r.path.replace(/:[^/]+/g, '[^/]+');
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(path);
        });
    }
    // If no exact match, try wildcard matching for driver routes
    if (!route && path.startsWith('/api/driver/')) {
        console.log(`📍 No exact match, checking driver wildcard for: ${path}`);
        // Check if there's a wildcard route for driver service
        const driverService = services_1.services['driver'];
        if (driverService) {
            console.log(`✅ Creating dynamic driver route config for ${path}`);
            console.log(`   Will proxy to: ${driverService.url}${path}`);
            // Admin routes require authentication
            const isAdminRoute = path.startsWith('/api/driver/admin/');
            // Public routes (register, login, etc.) don't require auth
            const isPublicRoute = path.match(/^\/(api\/driver\/(register|login|auth\/google|verify-email|password-reset|verify-registration-otp))/);
            // Create a dynamic route config for unmatched driver routes
            route = {
                path: path,
                service: 'driver',
                methods: [method],
                authRequired: isAdminRoute || (!isPublicRoute && path !== '/api/driver/subscription/activate')
            };
        }
        else {
            console.error(`❌ Driver service not configured!`);
        }
    }
    // If still no route, try wildcard matching for transit routes
    if (!route && (path.startsWith('/api/auth/') || path.startsWith('/api/cab/') || path.startsWith('/api/user/') || path.startsWith('/api/rider/'))) {
        console.log(`📍 Checking transit wildcard for: ${path}`);
        const transitService = services_1.services['transit'];
        if (transitService) {
            console.log(`✅ Creating dynamic transit route config for ${path}`);
            console.log(`   Transit service URL: ${transitService.url}`);
            route = {
                path: path,
                service: 'transit',
                methods: [method],
                authRequired: true
            };
        }
        else {
            console.log(`❌ Transit service not configured!`);
        }
    }
    if (!route) {
        console.log(`❌ No route found for ${method} ${path}`);
        return res.status(404).json({
            status: 'error',
            message: 'Route not found',
            path: path,
            method: method
        });
    }
    console.log(`✅ Route matched: ${route.service} service`);
    // Attach route config to request for use in other middleware
    req.routeConfig = route;
    next();
};
exports.routeMatcher = routeMatcher;
