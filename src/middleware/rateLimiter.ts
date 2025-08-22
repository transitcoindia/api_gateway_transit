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

// WebSocket-specific rate limiter - more lenient
export const websocketRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 WebSocket connections per minute per IP
  message: {
    status: 'error',
    message: 'Too many WebSocket connections, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful connections
  skipFailedRequests: false, // Count failed connections
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