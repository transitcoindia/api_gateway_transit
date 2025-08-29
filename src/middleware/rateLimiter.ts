import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RouteConfig } from '../types';

export const createRateLimiter = (route: RouteConfig) => {
  const defaultLimit = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  };

  const config = route.rateLimit || defaultLimit;

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      status: 'error',
      message: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// WebSocket-specific rate limiter - much more lenient
export const websocketRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000, // effectively disabled but kept for future
  message: {
    status: 'error',
    message: 'Too many WebSocket connections, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => true // fully skip WS limiting for now
});

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per IP
  message: {
    status: 'error',
    message: 'Too many API requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const routeConfig = (req as any).routeConfig as RouteConfig;
  
  if (!routeConfig) {
    return next();
  }

  const limiter = createRateLimiter(routeConfig);
  return limiter(req, res, next);
}; 