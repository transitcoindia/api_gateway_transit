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
    // Allow rides routes to pass through without checking routes array
    if (path.startsWith('/api/gateway/rides')) {
        console.log(`✅ Matched gateway rides route`);
        return next();
    }
    // First try exact match
    let route = services_1.routes.find((r) => r.path === path && r.methods.includes(method));
    // If no exact match, try wildcard matching for driver routes
    if (!route && path.startsWith('/api/driver/')) {
        console.log(`📍 No exact match, checking driver wildcard for: ${path}`);
        // Check if there's a wildcard route for driver service
        const driverService = services_1.services['driver'];
        if (driverService) {
            console.log(`✅ Creating dynamic driver route config for ${path}`);
            // Create a dynamic route config for unmatched driver routes
            route = {
                path: path,
                service: 'driver',
                methods: [method],
                authRequired: true // Default to requiring auth for driver routes
            };
        }
    }
    // If still no route, try wildcard matching for transit routes
    if (!route && (path.startsWith('/api/auth/') || path.startsWith('/api/cab/') || path.startsWith('/api/user/'))) {
        console.log(`📍 Checking transit wildcard for: ${path}`);
        const transitService = services_1.services['transit'];
        if (transitService) {
            console.log(`✅ Creating dynamic transit route config for ${path}`);
            route = {
                path: path,
                service: 'transit',
                methods: [method],
                authRequired: true
            };
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
