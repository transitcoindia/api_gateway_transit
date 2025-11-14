"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.apiRateLimiter = exports.websocketRateLimiter = exports.createRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const createRateLimiter = (route) => {
    const defaultLimit = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    };
    const config = route.rateLimit || defaultLimit;
    return (0, express_rate_limit_1.default)({
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
exports.createRateLimiter = createRateLimiter;
// WebSocket-specific rate limiter - COMPLETELY DISABLED for Render
exports.websocketRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 10000, // effectively unlimited
    message: {
        status: 'error',
        message: 'Too many WebSocket connections, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip ALL WebSocket-related requests to prevent 429s
        const path = req.path || '';
        const upgrade = req.headers.upgrade;
        const connection = req.headers.connection;
        return (path.includes('/socket.io/') ||
            upgrade === 'websocket' ||
            connection === 'upgrade' ||
            req.method === 'GET' && path.includes('socket.io'));
    }
});
// General API rate limiter
exports.apiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per 15 minutes per IP
    message: {
        status: 'error',
        message: 'Too many API requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
const rateLimiter = (req, res, next) => {
    const routeConfig = req.routeConfig;
    if (!routeConfig) {
        return next();
    }
    const limiter = (0, exports.createRateLimiter)(routeConfig);
    return limiter(req, res, next);
};
exports.rateLimiter = rateLimiter;
