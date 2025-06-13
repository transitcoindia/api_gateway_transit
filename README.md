# Transit Assured API Gateway

This is the API Gateway for the Transit Assured application, which acts as a single entry point for all client requests and routes them to the appropriate microservices.

## Features

- Request routing to microservices
- Authentication and authorization
- Rate limiting
- Request/response transformation
- Error handling
- Logging
- CORS support
- Security headers (Helmet)
- Compression
- Health check endpoint

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- TypeScript

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h
TRANSIT_SERVICE_URL=http://localhost:3001
DRIVER_SERVICE_URL=http://localhost:3002
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

## Development

To start the development server:

```bash
npm run dev
```

## Building

To build the project:

```bash
npm run build
```

## Production

To start the production server:

```bash
npm start
```

## API Routes

### Authentication Routes
- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/verify-email` - Verify email
- POST `/api/auth/reset-password` - Reset password

### Cab Routes
- POST `/api/cab/getQuote` - Get ride quote
- POST `/api/cab/book` - Book a ride
- POST `/api/cab/confirmBooking` - Confirm booking

### Driver Routes
- POST `/api/driver/register` - Register a new driver
- POST `/api/driver/login` - Login driver
- POST `/api/driver/documents/upload` - Upload driver documents
- GET `/api/driver/profile` - Get driver profile

## Health Check

The API Gateway provides a health check endpoint:

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-02-14T12:00:00.000Z"
}
```

## Error Handling

The API Gateway provides consistent error responses:

```json
{
  "status": "error",
  "message": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Security

- JWT-based authentication
- Rate limiting per route
- CORS protection
- Security headers (Helmet)
- Request validation
- Error handling

## Logging

The API Gateway uses Morgan for HTTP request logging and Winston for application logging.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 