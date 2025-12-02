import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { services, routes } from '../config/services';
import { RouteConfig } from '../types';

export const createServiceProxy = (route: RouteConfig) => {
  const service = services[route.service];
  
  if (!service) {
    throw new Error(`Service ${route.service} not found`);
  }

  return createProxyMiddleware({
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

export const routeMatcher = (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  const method = req.method;

  // Allow rides routes to pass through without checking routes array
  if (path.startsWith('/api/gateway/rides')) {
    return next();
  }

  // First try exact match
  let route = routes.find(
    (r) => r.path === path && r.methods.includes(method)
  );

  // If no exact match, try wildcard matching for driver routes
  if (!route && path.startsWith('/api/driver/')) {
    // Check if there's a wildcard route for driver service
    const driverService = services['driver'];
    if (driverService) {
      // Create a dynamic route config for unmatched driver routes
      route = {
        path: path,
        service: 'driver',
        methods: [method as any],
        authRequired: true // Default to requiring auth for driver routes
      };
    }
  }

  // If still no route, try wildcard matching for transit routes
  if (!route && (path.startsWith('/api/auth/') || path.startsWith('/api/cab/') || path.startsWith('/api/user/'))) {
    const transitService = services['transit'];
    if (transitService) {
      route = {
        path: path,
        service: 'transit',
        methods: [method as any],
        authRequired: true
      };
    }
  }

  if (!route) {
    return res.status(404).json({
      status: 'error',
      message: 'Route not found'
    });
  }

  // Attach route config to request for use in other middleware
  (req as any).routeConfig = route;
  next();
}; 