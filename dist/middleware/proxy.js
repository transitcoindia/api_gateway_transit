"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeMatcher = exports.createServiceProxy = void 0;
const http_proxy_middleware_1 = require("http-proxy-middleware");
const services_1 = require("../config/services");
const createServiceProxy = (route) => {
    const service = services_1.services[route.service];
    if (!service) {
        throw new Error(`Service ${route.service} not found`);
    }
    console.log(`🔄 Proxying ${route.path} to ${service.url}`);
    return (0, http_proxy_middleware_1.createProxyMiddleware)({
        target: service.url,
        changeOrigin: true,
        pathRewrite: {
            [`^${route.path}`]: route.path
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log(`📤 Proxying request: ${req.method} ${req.path} → ${service.url}${req.path}`);
        },
        onError: (err, req, res) => {
            console.error(`❌ Proxy error for ${route.path} → ${service.url}:`, err.message);
            console.error(`   Target URL: ${service.url}${req.url}`);
            res.status(500).json({
                status: 'error',
                message: 'Service unavailable',
                details: process.env.NODE_ENV === 'production' ? undefined : err.message
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
