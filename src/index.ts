import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { routes } from './config/services';
import { authenticate } from './middleware/auth';
import { routeMatcher, createServiceProxy } from './middleware/proxy';
import { rateLimiter } from './middleware/rateLimiter';
import { WebSocketService } from './services/websocketService';
import ridesRouter from './routes/rides';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3005;

// Initialize WebSocket service with the HTTP server
const wsService = new WebSocketService(httpServer);

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_APP_URL || 'http://localhost:3000',
    process.env.driver_backend || 'http://localhost:3000',
    process.env.rider_backend || 'http://localhost:8000',
    'https://www.shankhtech.com',
    'https://pramaan.ondc.org',
    // Add your Render domains here
    'https://api-gateway-transit.vercel.app'
  ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: "API Gateway is running",
    websocket: "enabled",
    timestamp: new Date().toISOString()
  });
});

// Routes
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

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔌 WebSocket server is ready on ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Available routes:');
  console.log('GET  /health');
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