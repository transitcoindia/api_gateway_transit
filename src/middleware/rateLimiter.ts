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

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const routeConfig = (req as any).routeConfig as RouteConfig;
  
  if (!routeConfig) {
    return next();
  }

  const limiter = createRateLimiter(routeConfig);
  return limiter(req, res, next);
}; 