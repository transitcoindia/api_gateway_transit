"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRidesRouter = void 0;
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const redis_1 = __importDefault(require("../redis"));
dotenv_1.default.config();
const createRidesRouter = (wsService) => {
    const ridesRouter = express_1.default.Router();
    // Health check endpoint for rides service
    ridesRouter.get('/health', (req, res) => {
        res.json({
            status: 'OK',
            service: 'API Gateway Rides Router',
            timestamp: new Date().toISOString(),
            riderBackendUrl: process.env.RIDER_BACKEND_URL || 'http://localhost:8000'
        });
    });
    // rider app will request ride to api-gateway
    ridesRouter.post('/request', async (req, res) => {
        try {
            // Forward the ride request to the rider backend (transit_backend-1)
            const BACKEND_URL = process.env.RIDER_BACKEND_URL || 'http://localhost:8000';
            const response = await axios_1.default.post(`${BACKEND_URL}/api/rider/request`, req.body, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {})
                }
            });
            try {
                const data = response.data || {};
                const rideId = data.rideId;
                if (rideId) {
                    wsService.broadcastRideRequestFromRest({
                        rideId,
                        rideCode: data.rideCode,
                        riderId: req?.user?.id,
                        requestBody: req.body,
                        fare: data.fare,
                        candidateDrivers: data.candidateDrivers
                    });
                }
            }
            catch (e) {
                console.warn('Non-fatal broadcast error:', e?.message || e);
            }
            res.status(response.status).json(response.data);
        }
        catch (error) {
            if (error.response) {
                res.status(error.response.status).json(error.response.data);
            }
            else {
                res.status(500).json({ error: 'Failed to process ride request', details: error.message });
            }
        }
    });
    // Driver accepts ride (HTTP alternative to WS)
    ridesRouter.post('/accept', async (req, res) => {
        try {
            const { rideId, driverId } = req.body || {};
            const authHeader = req.headers.authorization;
            const driverAccessToken = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.split(' ')[1]
                : undefined;
            if (!rideId || !driverId) {
                return res.status(400).json({ error: 'rideId and driverId are required' });
            }
            const result = await wsService.acceptRideFromRest({ rideId, driverId, driverAccessToken });
            if (!result.ok) {
                return res.status(404).json({ error: result.message });
            }
            return res.json({ success: true, message: result.message });
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to accept ride', details: err.message });
        }
    });
    // --------------------
    // Testing/Utilities (mounted on the same router instance)
    // --------------------
    // Get last known location for a ride (cached by API Gateway subscriber)
    ridesRouter.get('/last-location/ride/:rideId', async (req, res) => {
        try {
            const { rideId } = req.params;
            if (!redis_1.default.client) {
                return res.status(503).json({ error: 'Redis service unavailable' });
            }
            const raw = await redis_1.default.get(`ride:lastLocation:${rideId}`);
            if (!raw) {
                return res.status(404).json({ error: 'No location found for this ride' });
            }
            return res.json(JSON.parse(raw));
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to fetch last location', details: err.message });
        }
    });
    // Get last known location for a driver
    ridesRouter.get('/last-location/driver/:driverId', async (req, res) => {
        try {
            const { driverId } = req.params;
            if (!redis_1.default.client) {
                return res.status(503).json({ error: 'Redis service unavailable' });
            }
            const raw = await redis_1.default.get(`driver:location:${driverId}`);
            if (!raw) {
                return res.status(404).json({ error: 'No location found for this driver' });
            }
            return res.json(JSON.parse(raw));
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to fetch driver location', details: err.message });
        }
    });
    // Map a driver to an active ride (useful for testing without full accept flow)
    ridesRouter.post('/testing/map-active-ride', async (req, res) => {
        try {
            const { driverId, rideId, ttlSeconds = 7200 } = req.body || {};
            if (!driverId || !rideId) {
                return res.status(400).json({ error: 'driverId and rideId are required' });
            }
            if (!redis_1.default.client) {
                return res.status(503).json({ error: 'Redis service unavailable' });
            }
            await redis_1.default.set(`driver:active_ride:${driverId}`, rideId, 'EX', Number(ttlSeconds));
            return res.json({ success: true });
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to map active ride', details: err.message });
        }
    });
    return ridesRouter;
};
exports.createRidesRouter = createRidesRouter;
exports.default = exports.createRidesRouter;
