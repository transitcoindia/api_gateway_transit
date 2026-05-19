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

## Cloudflare Tunnel on EC2

When the gateway runs on EC2 behind a Cloudflare Tunnel, `localhost` in the tunnel ingress is **the EC2 instance**, not your laptop.

1. Install/configure the tunnel connector on the server using PowerShell from this folder:
   ```powershell
   .\setup-cloudflared-tunnel-ec2.ps1 -TunnelToken "YOUR_CONNECTOR_TOKEN"
   ```
   Defaults match `deploy-gateway-to-ec2.ps1` (same EC2 IP and SSH key). Use `-EC2_IP`, `-SSH_KEY`, `-SSHUser` if needed.

2. In **Cloudflare Zero Trust → Networks → Tunnels → [tunnel] → Public Hostname**, point **`gateway.transitco.in`** to **`http://localhost:<PORT>`** where `PORT` is the one **`api-gateway-transit`** listens on (see **`CLOUDFLARE_TUNNEL_PORTS.md`** at repo root). Verify on EC2: `pm2 pid api-gateway-transit` + `ss -tlnp | grep node` — do not assume; driver and gateway use different ports.

3. If **one tunnel** serves both API and gateway on the **same** EC2, run **only one** of `setup-cloudflared-tunnel-ec2.ps1` (here or under `transit_driver`) — same connector token. Add **two** public hostnames: e.g. **`api.transitco.in` → `transit-driver`’s port**, **`gateway.transitco.in` → `api-gateway-transit`’s port** (each from `ss` + PM2).

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 