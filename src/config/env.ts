import dotenv from 'dotenv';
dotenv.config();

// Robust URL resolution across different env var names
const val = (keys: string[], fallback?: string): string | undefined => {
  for (const k of keys) {
    const v = (process.env as any)[k];
    if (v && typeof v === 'string' && v.trim().length > 0) return v;
  }
  return fallback;
};

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT || 3005);

export const DRIVER_BACKEND_URL = val([
  'driver_backend',
  'DRIVER_BACKEND_URL',
  'DRIVER_SERVICE_URL'
], 'http://localhost:3000')!;

export const RIDER_BACKEND_URL = val([
  'rider_backend',
  'RIDER_BACKEND_URL',
  'TRANSIT_SERVICE_URL'
], 'http://localhost:8000')!;

export const API_GATEWAY_PUBLIC_ORIGIN = val([
  'API_GATEWAY_PUBLIC_ORIGIN'
]);

export const SOCKET_IO_PATH = '/socket.io/';

// Redis TTLs (seconds)
export const RIDE_LAST_LOCATION_TTL_SECONDS = Number(process.env.RIDE_LAST_LOCATION_TTL_SECONDS || 7200);

// Pub/Sub channels
export const CHANNELS = {
  DRIVER_LOCATION_UPDATES: 'driver_location_updates',
  RIDE_STATUS_UPDATES: 'ride_status_updates'
} as const;

export function getAllowedOrigins(): string[] {
  const defaults = [
    process.env.FRONTEND_APP_URL || 'http://localhost:3000',
    DRIVER_BACKEND_URL,
    RIDER_BACKEND_URL,
    'https://www.shankhtech.com',
    'https://pramaan.ondc.org',
    'https://api-gateway-transit.vercel.app',
    'https://api-gateway-transit.onrender.com'
  ];

  const extraCsv = process.env.CORS_ALLOWED_ORIGINS || '';
  const extras = extraCsv.split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...defaults, ...extras]));
}


