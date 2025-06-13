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

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket service
const wsService = new WebSocketService(httpServer);



// Middleware
app.use(helmet());
app.use(cors({
    origin: [
        'http://localhost:3000', // Driver backend
        'http://localhost:8000', // Rider backend
        process.env.FRONTEND_APP_URL || 'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply route matching middleware
app.use(routeMatcher);

// Apply rate limiting
app.use(rateLimiter);

// Apply authentication middleware for protected routes
app.use((req, res, next) => {
    const routeConfig = (req as any).routeConfig;
    if (routeConfig?.authRequired) {
        return authenticate(req, res, next);
    }
    next();
});

// Set up routes with their respective service proxies
routes.forEach(route => {
    app.use(route.path, createServiceProxy(route));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal server error'
    });
});

// Start the server
const PORT = process.env.PORT || 3005;
httpServer.listen(PORT, () => {
    console.log(`API Gateway server running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('WebSocket server is ready for connections');
    console.log('Available routes:');
    routes.forEach(route => {
        console.log(`${route.methods.join(',')} ${route.path} -> ${route.service}`);
    });
}); 