import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ridesRouter = express.Router();

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
    const response = await axios.post(`${BACKEND_URL}/api/rider/request`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {})
      }
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Failed to process ride request', details: error.message });
    }
  }
});

export default ridesRouter; 