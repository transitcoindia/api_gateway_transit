import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import redis from '../redis';
import { RIDER_BACKEND_URL } from '../config/env';
import { WebSocketService } from '../services/websocketService';
dotenv.config();

export const createRidesRouter = (wsService: WebSocketService) => {
const ridesRouter = express.Router();

// Health check endpoint for rides service
ridesRouter.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'API Gateway Rides Router',
    timestamp: new Date().toISOString(),
    riderBackendUrl: RIDER_BACKEND_URL
  });
});

// rider app will request ride to api-gateway
ridesRouter.post('/request', async (req, res) => {
  try {
    // Forward the ride request to the rider backend (transit_backend-1)
    const BACKEND_URL = process.env.RIDER_BACKEND_URL || 'http://localhost:8000';
    const response = await axios.post(`${BACKEND_URL}/api/rider/request`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {})
      }
    });
    try {
      const data = response.data || {};
      const rideId = data.rideId;
      if (rideId) {
        const authHeader = req.headers.authorization;
        const riderAccessToken = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.split(' ')[1]
          : undefined;
        // riderId: from auth if gateway had auth, else from body (rider app sends it so we can emit rideAccepted to correct rider)
        const riderId = (req as any)?.user?.id ?? req.body?.riderId;
        wsService.broadcastRideRequestFromRest({
          rideId,
          rideCode: data.rideCode,
          riderId,
          accessToken: riderAccessToken || (authHeader as string),
          requestBody: req.body,
          fare: data.fare,
          candidateDrivers: data.candidateDrivers
        });
      }
    } catch (e) {
      console.warn('Non-fatal broadcast error:', (e as any)?.message || e);
    }
    res.status(response.status).json(response.data);
  } catch (error: any) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
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
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to accept ride', details: err.message });
  }
});

// --------------------
// Testing/Utilities (mounted on the same router instance)
// --------------------

// Get last known location for a ride (cached by API Gateway subscriber)
ridesRouter.get('/last-location/ride/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params as { rideId: string };
    if (!redis.client) {
      return res.status(503).json({ error: 'Redis service unavailable' });
    }
    const raw = await redis.get(`ride:lastLocation:${rideId}`);
    if (!raw) {
      return res.status(404).json({ error: 'No location found for this ride' });
    }
    return res.json(JSON.parse(raw));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch last location', details: err.message });
  }
});

// Get last known location for a driver
ridesRouter.get('/last-location/driver/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params as { driverId: string };
    if (!redis.client) {
      return res.status(503).json({ error: 'Redis service unavailable' });
    }
    const raw = await redis.get(`driver:location:${driverId}`);
    if (!raw) {
      return res.status(404).json({ error: 'No location found for this driver' });
    }
    return res.json(JSON.parse(raw));
  } catch (err: any) {
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
    if (!redis.client) {
      return res.status(503).json({ error: 'Redis service unavailable' });
    }
    await redis.set(`driver:active_ride:${driverId}`, rideId, 'EX', Number(ttlSeconds));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to map active ride', details: err.message });
  }
});

return ridesRouter; 
}

export default createRidesRouter; 