import { ServiceConfig, RouteConfig } from '../types';
import { DRIVER_BACKEND_URL, RIDER_BACKEND_URL } from './env';

export const services: Record<string, ServiceConfig> = {
  transit: {
    url: RIDER_BACKEND_URL,
    routes: ['/api/auth', '/api/cab', '/api/user', '/api/rider', '/api/driver'],
    authRequired: true
  },
  driver: {
    url: DRIVER_BACKEND_URL,
    routes: ['/api/driver'],
    authRequired: true
  }
};

export const routes: RouteConfig[] = [
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

  // Rider Routes
  {
    path: '/api/rider/request',
    service: 'transit',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/rider/history',
    service: 'transit',
    methods: ['GET'],
    authRequired: true
  },
  {
    path: '/api/rider/fare/estimate',
    service: 'transit',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/rider/:rideId',
    service: 'transit',
    methods: ['GET', 'POST', 'PATCH'],
    authRequired: true
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
  },
  {
    path: '/api/driver/profile/request-phone-otp',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/profile/verify-phone-otp',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/profile/image',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/subscription/activate',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/rides_accepted',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/start_ride',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/end_ride',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  {
    path: '/api/driver/verify-registration-otp',
    service: 'driver',
    methods: ['POST'],
    authRequired: false
  },
  {
    path: '/api/driver/verify-email',
    service: 'driver',
    methods: ['GET'],
    authRequired: false
  },
  {
    path: '/api/driver/auth/google',
    service: 'driver',
    methods: ['POST'],
    authRequired: false
  },
  {
    path: '/api/driver/password-reset/request-otp',
    service: 'driver',
    methods: ['POST'],
    authRequired: false
  },
  {
    path: '/api/driver/password-reset/verify-otp',
    service: 'driver',
    methods: ['POST'],
    authRequired: false
  },
  {
    path: '/api/driver/documents/vehicleInfo',
    service: 'driver',
    methods: ['POST'],
    authRequired: true
  },
  
  // Admin Driver Management Routes
  {
    path: '/api/driver/admin/list',
    service: 'driver',
    methods: ['GET'],
    authRequired: true
  },
  {
    path: '/api/driver/admin/approve/:driverId',
    service: 'driver',
    methods: ['PUT', 'GET'],
    authRequired: true
  },
  {
    path: '/api/driver/admin/approve',
    service: 'driver',
    methods: ['GET'],
    authRequired: false // Token-based, no auth header needed
  },
  {
    path: '/api/driver/admin/reject/:driverId',
    service: 'driver',
    methods: ['PUT'],
    authRequired: true
  },
  {
    path: '/api/driver/admin/reject',
    service: 'driver',
    methods: ['GET', 'POST'],
    authRequired: false // Token-based
  },
  {
    path: '/api/driver/admin/suspend/:driverId',
    service: 'driver',
    methods: ['PUT'],
    authRequired: true
  },
  {
    path: '/api/driver/admin/suspend',
    service: 'driver',
    methods: ['GET', 'POST'],
    authRequired: false // Token-based
  },
  {
    path: '/api/driver/admin/:driverId/approval',
    service: 'driver',
    methods: ['PATCH'],
    authRequired: true
  }
]; 