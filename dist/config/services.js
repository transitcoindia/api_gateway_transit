"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routes = exports.services = void 0;
exports.services = {
    transit: {
        url: process.env.TRANSIT_SERVICE_URL || 'http://localhost:8000',
        routes: ['/api/auth', '/api/cab', '/api/user', '/api/driver'],
        authRequired: true
    },
    driver: {
        url: process.env.DRIVER_SERVICE_URL || 'http://localhost:3000',
        routes: ['/api/driver'],
        authRequired: true
    }
};
exports.routes = [
    // Auth Routes
    {
        path: '/api/auth/register',
        service: 'transit',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/auth/login',
        service: 'transit',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/auth/verify-email',
        service: 'transit',
        methods: ['GET'],
        authRequired: false
    },
    {
        path: '/api/auth/reset-password',
        service: 'transit',
        methods: ['POST'],
        authRequired: false
    },
    // Cab Routes
    {
        path: '/api/cab/getQuote',
        service: 'transit',
        methods: ['POST'],
        authRequired: true,
        rateLimit: {
            windowMs: 60000,
            max: 10
        }
    },
    {
        path: '/api/cab/book',
        service: 'transit',
        methods: ['POST'],
        authRequired: true
    },
    {
        path: '/api/cab/confirmBooking',
        service: 'transit',
        methods: ['POST'],
        authRequired: true
    },
    // Driver Routes
    {
        path: '/api/driver/register',
        service: 'driver',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/driver/login',
        service: 'driver',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/driver/login/email',
        service: 'driver',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/driver/login/phoneNumber',
        service: 'driver',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/driver/login/verify-otp',
        service: 'driver',
        methods: ['POST'],
        authRequired: false
    },
    {
        path: '/api/driver/documents/upload',
        service: 'driver',
        methods: ['POST'],
        authRequired: true
    },
    {
        path: '/api/driver/profile',
        service: 'driver',
        methods: ['GET'],
        authRequired: true
    }
];
