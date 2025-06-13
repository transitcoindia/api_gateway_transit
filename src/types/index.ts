import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface ServiceConfig {
  url: string;
  routes: string[];
  authRequired: boolean;
}

export interface RouteConfig {
  path: string;
  service: string;
  methods: string[];
  authRequired: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export interface ErrorResponse {
  status: 'error';
  message: string;
  code?: string;
  details?: any;
}

export interface SuccessResponse<T = any> {
  status: 'success';
  data: T;
  message?: string;
} 