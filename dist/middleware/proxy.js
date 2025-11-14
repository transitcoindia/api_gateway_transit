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
    return (0, http_proxy_middleware_1.createProxyMiddleware)({
        target: service.url,
        changeOrigin: true,
        pathRewrite: {
            [`^${route.path}`]: route.path
        },
        onError: (err, req, res) => {
            console.error(`Proxy error for ${route.path}:`, err);
            res.status(500).json({
                status: 'error',
                message: 'Service unavailable'
            });
        },
        onProxyRes: (proxyRes, req, res) => {
            // Add service name to response headers for debugging
            proxyRes.headers['x-service'] = route.service;
        }
    });
};
exports.createServiceProxy = createServiceProxy;
const routeMatcher = (req, res, next) => {
    const path = req.path;
    const method = req.method;
    // Allow rides routes to pass through without checking routes array
    if (path.startsWith('/api/gateway/rides')) {
        return next();
    }
    const route = services_1.routes.find((r) => r.path === path && r.methods.includes(method));
    if (!route) {
        return res.status(404).json({
            status: 'error',
            message: 'Route not found'
        });
    }
    // Attach route config to request for use in other middleware
    req.routeConfig = route;
    next();
};
exports.routeMatcher = routeMatcher;
