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

  const route = routes.find(
    (r) => r.path === path && r.methods.includes(method)
  );

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