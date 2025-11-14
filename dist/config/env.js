"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNELS = exports.RIDE_LAST_LOCATION_TTL_SECONDS = exports.SOCKET_IO_PATH = exports.API_GATEWAY_PUBLIC_ORIGIN = exports.RIDER_BACKEND_URL = exports.DRIVER_BACKEND_URL = exports.PORT = exports.NODE_ENV = void 0;
exports.getAllowedOrigins = getAllowedOrigins;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Robust URL resolution across different env var names
const val = (keys, fallback) => {
    for (const k of keys) {
        const v = process.env[k];
        if (v && typeof v === 'string' && v.trim().length > 0)
            return v;
    }
    return fallback;
};
exports.NODE_ENV = process.env.NODE_ENV || 'development';
exports.PORT = Number(process.env.PORT || 3005);
exports.DRIVER_BACKEND_URL = val([
    'driver_backend',
    'DRIVER_BACKEND_URL',
    'DRIVER_SERVICE_URL'
], 'http://localhost:3000');
exports.RIDER_BACKEND_URL = val([
    'rider_backend',
    'RIDER_BACKEND_URL',
    'TRANSIT_SERVICE_URL'
], 'http://localhost:8000');
exports.API_GATEWAY_PUBLIC_ORIGIN = val([
    'API_GATEWAY_PUBLIC_ORIGIN'
]);
exports.SOCKET_IO_PATH = '/socket.io/';
// Redis TTLs (seconds)
exports.RIDE_LAST_LOCATION_TTL_SECONDS = Number(process.env.RIDE_LAST_LOCATION_TTL_SECONDS || 7200);
// Pub/Sub channels
exports.CHANNELS = {
    DRIVER_LOCATION_UPDATES: 'driver_location_updates',
    RIDE_STATUS_UPDATES: 'ride_status_updates'
};
function getAllowedOrigins() {
    const defaults = [
        process.env.FRONTEND_APP_URL || 'http://localhost:3000',
        exports.DRIVER_BACKEND_URL,
        exports.RIDER_BACKEND_URL,
        'https://www.shankhtech.com',
        'https://pramaan.ondc.org',
        'https://api-gateway-transit.vercel.app',
        'https://api-gateway-transit.onrender.com'
    ];
    const extraCsv = process.env.CORS_ALLOWED_ORIGINS || '';
    const extras = extraCsv.split(',').map(s => s.trim()).filter(Boolean);
    return Array.from(new Set([...defaults, ...extras]));
}
