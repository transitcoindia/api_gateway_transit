// Set test environment
process.env.NODE_ENV = 'test';

// Set default JWT secret for tests
process.env.JWT_SECRET = 'test_secret';

// Set default service URLs for tests
process.env.TRANSIT_SERVICE_URL = 'http://localhost:8000';
process.env.DRIVER_SERVICE_URL = 'http://localhost:3000'; 