import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PORT as GATEWAY_PORT, getAllowedOrigins } from './config/env';
import { authenticate } from './middleware/auth';
import { routeMatcher, createServiceProxy } from './middleware/proxy';
// Rate limiting configuration
import { shouldApplyRateLimiting, getRateLimitingMessage } from './config/rateLimiting';
import { rateLimiter } from './middleware/rateLimiter';
import { AuthenticatedRequest, RouteConfig } from './types';
import { WebSocketService } from './services/websocketService';
import createRidesRouter from './routes/rides';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = GATEWAY_PORT;

// Behind Render/other proxies, trust X-Forwarded-* headers so rate limiters/IP logic work correctly
app.set('trust proxy', 1);

// Initialize WebSocket service with the HTTP server
const wsService = new WebSocketService(httpServer);

// CORS configuration
app.use(cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Rate limiting configuration
console.log(`📊 ${getRateLimitingMessage()}`);
if (!shouldApplyRateLimiting()) {
  console.log('⚠️  Rate limiting disabled to prevent 429 errors on Render');
  console.log('💡 For production security, implement rate limiting at CDN/load balancer level');
}

app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: "API Gateway is running",
    websocket: "enabled",
    timestamp: new Date().toISOString()
  });
});

// WebSocket health check endpoint
app.get('/websocket-health', (req, res) => {
  const io = wsService.getIO();
  const connectedClients = io.engine.clientsCount || 0;
  const rooms = Array.from(io.sockets.adapter.rooms.keys());
  
  res.json({
    status: 'ok',
    websocket: 'enabled',
    timestamp: new Date().toISOString(),
    connected_clients: connectedClients,
    active_rooms: rooms,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Routes
const ridesRouter = createRidesRouter(wsService);
app.use('/api/gateway/rides', ridesRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: 'enabled',
    environment: process.env.NODE_ENV || 'development',
    services: {
      driver_backend: process.env.driver_backend || 'http://localhost:3000',
      rider_backend: process.env.rider_backend || 'http://localhost:8000'
    },
    websocket_connections: wsService.getIO().engine.clientsCount || 0
  });
});

// Proxy + middleware pipeline for API routes
app.use(routeMatcher);

if (shouldApplyRateLimiting()) {
  app.use(rateLimiter);
}

const getRouteConfig = (req: express.Request): RouteConfig | undefined => {
  return (req as any).routeConfig as RouteConfig | undefined;
};

app.use((req, res, next) => {
  const routeConfig = getRouteConfig(req);

  if (!routeConfig || !routeConfig.authRequired) {
    return next();
  }

  return authenticate(req as AuthenticatedRequest, res, next);
});

app.use((req, res, next) => {
  const routeConfig = getRouteConfig(req);

  if (!routeConfig) {
    return next();
  }

  const proxy = createServiceProxy(routeConfig);
  return proxy(req, res, next);
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔌 WebSocket server is ready on ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket health: http://localhost:${PORT}/websocket-health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Available routes:');
  console.log('GET  /health');
  console.log('GET  /websocket-health');
  console.log('GET  /api/gateway/rides/health');
  console.log('POST /api/gateway/rides/request');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
}); 