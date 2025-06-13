import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

describe('Authentication Middleware', () => {
  const app = express();
  const secret = 'test_secret';

  // Test route that requires authentication
  app.get('/protected', authenticate, (req: AuthenticatedRequest, res) => {
    res.json({ message: 'Protected route accessed', user: req.user });
  });

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it('should return 401 when no token is provided', async () => {
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 'error',
      message: 'No token provided'
    });
  });

  it('should return 401 when token is invalid', async () => {
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid_token');
    
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Invalid token'
    });
  });

  it('should return 401 when token is expired', async () => {
    // Create a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { userId: '123' },
      secret,
      { expiresIn: '-1s' }
    );

    // Wait a moment to ensure token is expired
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);
    
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Token expired'
    });
  });

  it('should allow access with valid token', async () => {
    const validToken = jwt.sign(
      { userId: '123', email: 'test@example.com' },
      secret,
      { expiresIn: '1h' }
    );

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Protected route accessed');
    expect(response.body.user).toHaveProperty('userId', '123');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
  });
}); 