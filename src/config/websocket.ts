import { ServerOptions } from 'socket.io';
import { DRIVER_BACKEND_URL, RIDER_BACKEND_URL, getAllowedOrigins } from './env';

export const getWebSocketConfig = (): Partial<ServerOptions> => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Get all allowed origins for WebSocket (same as HTTP CORS)
  const allowedOrigins = getAllowedOrigins();
  
  return {
    // Path configuration
    path: '/socket.io/',
    
    // CORS configuration - allow driver and rider backends, plus public origin
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, server-to-server)
        if (!origin) {
          return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        // Also allow driver and rider backend URLs (in case they're not in the list)
        const driverUrl = DRIVER_BACKEND_URL.replace(/\/$/, '');
        const riderUrl = RIDER_BACKEND_URL.replace(/\/$/, '');
        const originClean = origin.replace(/\/$/, '');
        
        if (originClean === driverUrl || originClean === riderUrl) {
          return callback(null, true);
        }
        
        // Allow API Gateway public origin
        const publicOrigin = process.env.API_GATEWAY_PUBLIC_ORIGIN || 'https://api-gateway-transit.onrender.com';
        if (originClean === publicOrigin.replace(/\/$/, '')) {
          return callback(null, true);
        }
        
        // In development, be more permissive
        if (!isProduction) {
          console.log(`⚠️ WebSocket CORS: Allowing origin in dev mode: ${origin}`);
          return callback(null, true);
        }
        
        // Reject in production if not in allowed list
        console.warn(`❌ WebSocket CORS: Rejected origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'User-Agent']
    },
    
    // Connection configuration
    pingTimeout: isProduction ? 120000 : 60000, // 2 minutes in production, 1 minute in dev
    pingInterval: isProduction ? 25000 : 10000, // 25s in production, 10s in dev
    connectTimeout: isProduction ? 120000 : 60000, // 2 minutes in production, 1 minute in dev
    
    // Transport configuration
    transports: ['websocket', 'polling'],
    
    // Allow request function - very permissive to avoid 429s
    allowRequest: (req, fn) => {
      // Always allow WebSocket upgrade requests
      const upgrade = req.headers.upgrade;
      const connection = req.headers.connection;
      
      if (upgrade === 'websocket' || connection === 'upgrade') {
        return fn(null, true);
      }
      
      // Allow all other requests
      return fn(null, true);
    },
    
    // Engine.IO configuration
    allowEIO3: true, // Allow Engine.IO v3 clients
    
    // Additional options for production
    ...(isProduction && {
      // More conservative settings for production
      maxHttpBufferSize: 1e6, // 1MB
      allowUpgrades: true,
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
        memLevel: 7
      }
    })
  };
};

// Rate limiting configuration for WebSocket connections
export const getWebSocketRateLimit = () => {
  return {
    // Effectively disable rate limiting for WebSocket connections
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10000, // Very high limit
    skip: (req: any) => {
      const path = req.path || '';
      const upgrade = req.headers.upgrade;
      const connection = req.headers.connection;
      
      // Skip rate limiting for ALL WebSocket-related requests
      return (
        path.includes('/socket.io/') ||
        upgrade === 'websocket' ||
        connection === 'upgrade' ||
        (req.method === 'GET' && path.includes('socket.io')) ||
        (req.method === 'POST' && path.includes('socket.io'))
      );
    }
  };
};
