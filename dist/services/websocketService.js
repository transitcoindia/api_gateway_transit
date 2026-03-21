"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const socket_io_1 = require("socket.io");
const axios_1 = __importDefault(require("axios"));
const driverLocationSubscriber_1 = require("./driverLocationSubscriber");
const rideStatusSubscriber_1 = require("./rideStatusSubscriber");
const redis_1 = __importDefault(require("../redis"));
const websocket_1 = require("../config/websocket");
const env_1 = require("../config/env");
const rideDetailsMap = new Map();
class WebSocketService {
    constructor(server) {
        this.driverSockets = new Map();
        this.riderSockets = new Map();
        this.rideToRiderMap = new Map();
        /** rideId -> { riderId, driverId } - populated on first chat:send so typing can be forwarded */
        this.rideChatParticipants = new Map();
        this.io = new socket_io_1.Server(server, (0, websocket_1.getWebSocketConfig)());
        // Subscribe to driver location updates from Redis
        (0, driverLocationSubscriber_1.subscribeToDriverLocations)(this.io, this.rideToRiderMap);
        // Subscribe to ride status updates (e.g., end ride)
        (0, rideStatusSubscriber_1.subscribeToRideStatus)(this.io);
        this.setupSocketHandlers();
        this.setupHeartbeat();
        this.setupErrorHandling();
    }
    setupHeartbeat() {
        // Keep connections alive with periodic ping
        setInterval(() => {
            const connectedSockets = Array.from(this.io.sockets.sockets.values());
            console.log(`🔄 Heartbeat: Pinging ${connectedSockets.length} connected sockets`);
            connectedSockets.forEach(socket => {
                socket.emit('serverPing', {
                    timestamp: Date.now(),
                    socketId: socket.id
                });
            });
        }, 30000); // Every 30 seconds
    }
    setupErrorHandling() {
        // Handle server-level errors
        this.io.engine.on('connection_error', (err) => {
            console.error('🔌 WebSocket Connection Error:', {
                error: err.message,
                code: err.code,
                context: err.context,
                timestamp: new Date().toISOString()
            });
        });
        // Handle rate limiting errors
        this.io.engine.on('error', (err) => {
            console.error('🔌 WebSocket Engine Error:', {
                error: err.message,
                stack: err.stack,
                timestamp: new Date().toISOString()
            });
        });
        // Handle HTTP upgrade errors
        this.io.engine.on('upgrade_error', (err) => {
            console.error('🔌 WebSocket Upgrade Error:', {
                error: err.message,
                code: err.code,
                timestamp: new Date().toISOString()
            });
        });
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            // Track connection type
            let connectionType = 'unknown';
            let userId = '';
            console.log('New WebSocket connection established:', {
                socketId: socket.id,
                connectionType: 'pending authentication',
                timestamp: new Date().toISOString()
            });
            // Send connection info immediately
            socket.emit('connectionInfo', {
                socketId: socket.id,
                timestamp: new Date().toISOString(),
                serverTime: Date.now()
            });
            // Handle authentication
            socket.on('authenticate', (data) => {
                if ('driverId' in data) {
                    connectionType = 'driver';
                    userId = data.driverId;
                    socket.userId = data.driverId;
                    socket.userType = 'driver';
                    socket.join('drivers');
                    socket.join(`driver:${data.driverId}`);
                    this.driverSockets.set(data.driverId, socket);
                    if ('accessToken' in data && data.accessToken) {
                        socket.accessToken = data.accessToken;
                    }
                    console.log('Driver Connection:', {
                        socketId: socket.id,
                        driverId: data.driverId,
                        connectionType: 'driver',
                        timestamp: new Date().toISOString()
                    });
                    // Notify driver of successful connection
                    socket.emit('authenticated', { status: 'success', type: 'driver' });
                }
                else if ('riderId' in data) {
                    connectionType = 'rider';
                    userId = data.riderId;
                    socket.userId = data.riderId;
                    socket.userType = 'rider';
                    socket.join('riders'); // Join the general riders room
                    socket.join(`rider:${data.riderId}`); // Also join specific rider room
                    this.riderSockets.set(data.riderId, socket);
                    if ('accessToken' in data && data.accessToken) {
                        socket.accessToken = data.accessToken;
                    }
                    console.log('Rider Connection:', {
                        socketId: socket.id,
                        riderId: data.riderId,
                        connectionType: 'rider',
                        timestamp: new Date().toISOString()
                    });
                    // Notify rider of successful connection
                    socket.emit('authenticated', { status: 'success', type: 'rider' });
                }
            });
            // Handle driver location updates (legacy direct -> broadcast)
            socket.on('driverLocationUpdate', (data) => {
                console.log('Driver Location Update:', {
                    socketId: socket.id,
                    driverId: data.driverId,
                    connectionType: 'driver',
                    location: data.location,
                    timestamp: data.timestamp
                });
                // Broadcast to all riders
                this.io.to('riders').emit('driverLocationUpdate', data);
            });
            // Handle ride requests
            socket.on('requestRide', (data, callback) => {
                console.log('New Ride Request:', {
                    socketId: socket.id,
                    ...data
                });
                // Store accessToken from payload on the socket for later use
                if (data.accessToken) {
                    socket.accessToken = data.accessToken;
                }
                // Generate a unique ride ID
                const rideId = `ride_${Date.now()}`;
                // Generate a random 4-digit rideCode (OTP)
                const rideCode = Math.floor(1000 + Math.random() * 9000).toString();
                // Map rideId to riderId
                if (typeof socket.userId === 'string') {
                    this.rideToRiderMap.set(rideId, socket.userId);
                }
                // Store the full ride details in memory for later use
                rideDetailsMap.set(rideId, {
                    ...data,
                    rideId,
                    rideCode,
                    riderId: socket.userId,
                    accessToken: data.accessToken // <-- store it here
                });
                console.log('📡 Broadcasting to drivers room. Sockets in drivers room:', Array.from(this.io.sockets.adapter.rooms.get('drivers') || []));
                // Broadcast to all drivers with ALL ride details
                this.io.to('drivers').emit('newRideRequest', {
                    rideId,
                    rideCode,
                    ...data
                });
                // Send response to rider if callback provided
                if (callback) {
                    callback({ rideId, rideCode });
                }
            });
            // Handle ride acceptance (same logic as HTTP POST /api/gateway/rides/accept — race-safe)
            socket.on('acceptRide', async (data) => {
                const { rideId, driverId } = data || {};
                if (!rideId || !driverId) {
                    socket.emit('acceptRideAck', { rideId, status: 'error', message: 'rideId and driverId are required' });
                    return;
                }
                const storedRideDetails = rideDetailsMap.get(rideId);
                if (!storedRideDetails) {
                    console.error('No ride details found for rideId:', rideId);
                    socket.emit('acceptRideAck', { rideId, status: 'error', message: 'Ride details not found' });
                    return;
                }
                if (data.accessToken) {
                    storedRideDetails.driverAccessToken = data.accessToken;
                    rideDetailsMap.set(rideId, storedRideDetails);
                }
                const result = await this.acceptRideFromRest({
                    rideId,
                    driverId,
                    driverAccessToken: data.accessToken,
                });
                if (!result.ok) {
                    socket.emit('acceptRideAck', {
                        rideId,
                        status: 'error',
                        code: result.code,
                        message: result.message ?? 'Accept failed',
                    });
                    return;
                }
                socket.emit('acceptRideAck', {
                    rideId,
                    status: 'accepted',
                    message: result.message ?? 'accepted',
                });
            });
            // Handle ride cancellation
            socket.on('cancelRide', (data) => {
                console.log('Ride Cancelled:', {
                    socketId: socket.id,
                    riderId: data.riderId,
                    connectionType: 'rider',
                    rideId: data.rideId,
                    reason: data.reason,
                    timestamp: data.timestamp
                });
                // Broadcast to all relevant parties
                this.io.emit('rideStatusUpdate', {
                    rideId: data.rideId,
                    status: 'CANCELLED',
                    timestamp: data.timestamp,
                    reason: data.reason
                });
            });
            // Handle driver status updates
            socket.on('driverStatusUpdate', (data) => {
                console.log('Driver Status Update:', {
                    socketId: socket.id,
                    driverId: data.driverId,
                    connectionType: 'driver',
                    status: data.status,
                    timestamp: data.timestamp
                });
                // Broadcast to all riders
                this.io.to('riders').emit('driverStatusUpdate', data);
            });
            // Handle ping/pong for connection keep-alive
            socket.on('ping', () => {
                socket.emit('pong', {
                    timestamp: Date.now(),
                    socketId: socket.id
                });
            });
            // Handle real-time chat
            socket.on('chat:send', async (data) => {
                const rideId = data?.rideId;
                const text = typeof data?.text === 'string' ? data.text.trim() : '';
                if (!rideId || !text) {
                    socket.emit('chat:error', { message: 'rideId and text are required' });
                    return;
                }
                const accessToken = socket.accessToken;
                if (!accessToken) {
                    socket.emit('chat:error', { message: 'Not authenticated' });
                    return;
                }
                try {
                    if (connectionType === 'driver' && userId) {
                        const driverUrl = env_1.DRIVER_BACKEND_URL.replace(/\/$/, '');
                        const res = await axios_1.default.post(`${driverUrl}/api/driver/rides/${rideId}/chat`, { text }, { headers: { Authorization: `Bearer ${accessToken}` }, validateStatus: () => true });
                        const body = res.data;
                        if (res.status >= 200 && res.status < 300 && body?.success && body?.data?.message) {
                            const riderId = body.riderId;
                            this.rideChatParticipants.set(rideId, { riderId: riderId || '', driverId: userId });
                            if (riderId && this.riderSockets.has(riderId)) {
                                this.riderSockets.get(riderId).emit('chat:message', {
                                    rideId,
                                    message: body.data.message,
                                });
                            }
                            socket.emit('chat:sent', { message: body.data.message });
                        }
                        else {
                            socket.emit('chat:error', { message: body?.message || 'Failed to send message' });
                        }
                    }
                    else if (connectionType === 'rider' && userId) {
                        const riderUrl = env_1.RIDER_BACKEND_URL.replace(/\/$/, '');
                        const res = await axios_1.default.post(`${riderUrl}/api/rider/${rideId}/chat`, { text }, { headers: { Authorization: `Bearer ${accessToken}` }, validateStatus: () => true });
                        const body = res.data;
                        if (res.status >= 200 && res.status < 300 && body?.success && body?.data?.message) {
                            const driverId = body.driverId;
                            this.rideChatParticipants.set(rideId, { riderId: userId, driverId: driverId || '' });
                            if (driverId && this.driverSockets.has(driverId)) {
                                this.driverSockets.get(driverId).emit('chat:message', {
                                    rideId,
                                    message: body.data.message,
                                });
                            }
                            socket.emit('chat:sent', { message: body.data.message });
                        }
                        else {
                            socket.emit('chat:error', { message: body?.message || 'Failed to send message' });
                        }
                    }
                    else {
                        socket.emit('chat:error', { message: 'Invalid connection type for chat' });
                    }
                }
                catch (err) {
                    console.error('Chat send error:', err?.message || err);
                    socket.emit('chat:error', { message: 'Failed to send message' });
                }
            });
            // Handle chat typing indicator (forward to other party)
            socket.on('chat:typing', (data) => {
                const rideId = data?.rideId;
                const isTyping = data?.isTyping === true;
                if (!rideId || !userId)
                    return;
                const participants = this.rideChatParticipants.get(rideId);
                if (connectionType === 'driver') {
                    const riderId = participants?.riderId ?? this.rideToRiderMap.get(rideId);
                    if (riderId && this.riderSockets.has(riderId)) {
                        this.riderSockets.get(riderId).emit('chat:typing', { rideId, isTyping, from: 'driver' });
                    }
                }
                else if (connectionType === 'rider') {
                    const driverId = participants?.driverId;
                    if (driverId && this.driverSockets.has(driverId)) {
                        this.driverSockets.get(driverId).emit('chat:typing', { rideId, isTyping, from: 'rider' });
                    }
                }
            });
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log('🔌 Client Disconnected:', {
                    socketId: socket.id,
                    connectionType,
                    userId,
                    reason,
                    timestamp: new Date().toISOString()
                });
                // Clean up socket maps
                if (connectionType === 'driver' && userId) {
                    this.driverSockets.delete(userId);
                }
                else if (connectionType === 'rider' && userId) {
                    this.riderSockets.delete(userId);
                }
                console.log(`📊 Total connections: ${this.io.engine.clientsCount}`);
            });
            // Handle errors
            socket.on('error', (error) => {
                console.error('WebSocket Error:', {
                    socketId: socket.id,
                    connectionType,
                    userId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            });
        });
    }
    // Public methods for external use
    getIO() {
        return this.io;
    }
    // Allow REST routes to broadcast a newly created ride request and seed internal maps
    broadcastRideRequestFromRest(params) {
        const { rideId, rideCode, riderId, accessToken, requestBody, fare, candidateDrivers } = params;
        if (!rideId) {
            console.warn('broadcastRideRequestFromRest called without rideId');
            return;
        }
        // Seed mappings for later accept flow and location routing
        if (riderId) {
            this.rideToRiderMap.set(rideId, riderId);
        }
        const estimatedFare = (fare && typeof fare === 'object' && fare.totalAmount != null)
            ? Number(fare.totalAmount)
            : (requestBody?.estimatedFare != null ? Number(requestBody.estimatedFare) : undefined);
        const estimatedDistance = (fare && typeof fare === 'object' && fare.estimatedDistance != null)
            ? Number(fare.estimatedDistance)
            : (requestBody?.estimatedDistance != null ? Number(requestBody.estimatedDistance) : undefined);
        const details = {
            ...(requestBody || {}),
            rideId,
            rideCode,
            riderId,
            accessToken,
            fare,
            estimatedFare,
            estimatedDistance,
            candidateDrivers
        };
        // Store for later use in acceptRide (tokens, coordinates, etc.)
        rideDetailsMap.set(rideId, details);
        // Broadcast to drivers: include fare + top-level estimatedFare/estimatedDistance so driver app shows price
        const payload = {
            rideId,
            rideCode,
            ...((requestBody && (requestBody.pickup || requestBody.dropoff)) ? {
                pickup: requestBody.pickup,
                dropoff: requestBody.dropoff,
                pickupAddress: requestBody.pickupAddress,
                dropAddress: requestBody.dropAddress,
                rideType: requestBody.rideType,
            } : requestBody || {}),
            fare,
            estimatedFare,
            estimatedDistance,
            pickupLatitude: requestBody?.pickupLatitude ?? requestBody?.pickup?.latitude,
            pickupLongitude: requestBody?.pickupLongitude ?? requestBody?.pickup?.longitude,
            dropLatitude: requestBody?.dropLatitude ?? requestBody?.dropoff?.latitude,
            dropLongitude: requestBody?.dropLongitude ?? requestBody?.dropoff?.longitude,
            pickupAddress: requestBody?.pickupAddress,
            dropAddress: requestBody?.dropAddress,
            waypoints: requestBody?.waypoints ?? undefined,
            isRoundTrip: requestBody?.isRoundTrip === true || requestBody?.isRoundTrip === 'true',
            stopCount: (Array.isArray(requestBody?.waypoints) ? requestBody.waypoints.length : 0) + (requestBody?.dropLatitude != null ? 2 : 1),
            requestedVehicleType: requestBody?.requestedVehicleType ?? undefined,
            candidateDrivers,
            timestamp: new Date().toISOString()
        };
        // Vehicle-type filtering: only send to drivers in candidateDrivers when present (rider backend already filtered by vehicle type)
        const candidates = candidateDrivers && Array.isArray(candidateDrivers) ? candidateDrivers : [];
        if (candidates.length > 0) {
            for (const c of candidates) {
                const driverId = c?.id ?? c?.driverId ?? (typeof c === 'string' ? c : null);
                if (driverId) {
                    const socket = this.getDriverSocket(String(driverId));
                    if (socket)
                        socket.emit('newRideRequest', payload);
                }
            }
        }
        else {
            this.io.to('drivers').emit('newRideRequest', payload);
        }
    }
    // Internal broadcast for scheduled rides (panel backend): emit newRideRequest to given drivers via Gateway socket (same path as normal rides)
    broadcastRideRequestToDrivers(driverIds, ride, options) {
        const rideId = ride?.rideId;
        if (!rideId) {
            console.warn('broadcastRideRequestToDrivers called without ride.rideId');
            return;
        }
        const riderId = options?.riderId;
        const accessToken = options?.accessToken;
        if (riderId) {
            this.rideToRiderMap.set(rideId, riderId);
        }
        const candidateDrivers = (driverIds || []).map((id) => ({ id }));
        const waypoints = ride.waypoints;
        const details = {
            rideId,
            rideCode: ride.rideCode,
            riderId,
            accessToken,
            estimatedFare: ride.estimatedFare,
            estimatedDistance: ride.estimatedDistance,
            candidateDrivers,
            pickupLatitude: ride.pickupLatitude,
            pickupLongitude: ride.pickupLongitude,
            pickupAddress: ride.pickupAddress,
            dropLatitude: ride.dropLatitude,
            dropLongitude: ride.dropLongitude,
            dropAddress: ride.dropAddress,
            waypoints,
            ...ride,
        };
        rideDetailsMap.set(rideId, details);
        const payload = {
            rideId,
            rideCode: ride.rideCode,
            pickupLatitude: ride.pickupLatitude,
            pickupLongitude: ride.pickupLongitude,
            dropLatitude: ride.dropLatitude,
            dropLongitude: ride.dropLongitude,
            pickupAddress: ride.pickupAddress,
            dropAddress: ride.dropAddress,
            waypoints,
            isRoundTrip: ride.isRoundTrip === true || ride.isRoundTrip === 'true',
            stopCount: (Array.isArray(waypoints) ? waypoints.length : 0) + (ride.dropLatitude != null ? 2 : 1),
            estimatedFare: ride.estimatedFare,
            estimatedDistance: ride.estimatedDistance,
            requestedVehicleType: ride.requestedVehicleType,
            isScheduled: ride.isScheduled ?? true,
            scheduledPickupTime: ride.scheduledPickupTime,
            bookingForName: ride.bookingForName,
            bookingForPhone: ride.bookingForPhone,
            candidateDrivers,
            timestamp: new Date().toISOString(),
        };
        // Emit to driver room (reliable) – drivers join driver:${driverId} on authenticate
        for (const driverId of driverIds) {
            this.io.to(`driver:${String(driverId)}`).emit('newRideRequest', payload);
        }
    }
    getDriverSocket(driverId) {
        return this.driverSockets.get(driverId);
    }
    getRiderSocket(riderId) {
        return this.riderSockets.get(riderId);
    }
    // Accept ride via REST (HTTP) - mirrors the WS 'acceptRide' handler
    async acceptRideFromRest(params) {
        const { rideId, driverId, driverAccessToken } = params;
        const storedRideDetails = rideDetailsMap.get(rideId);
        if (!storedRideDetails) {
            return { ok: false, message: 'Ride details not found', riderStoreSuccess: false, driverStoreSuccess: false };
        }
        // Prepare ride payload for backends
        const ridePayload = {
            rideId,
            rideCode: storedRideDetails.rideCode || undefined,
            status: 'accepted',
            pickupLatitude: storedRideDetails.pickupLatitude ?? storedRideDetails.pickup?.latitude,
            pickupLongitude: storedRideDetails.pickupLongitude ?? storedRideDetails.pickup?.longitude,
            pickupAddress: storedRideDetails.pickupAddress,
            dropLatitude: storedRideDetails.dropLatitude ?? storedRideDetails.dropoff?.latitude,
            dropLongitude: storedRideDetails.dropLongitude ?? storedRideDetails.dropoff?.longitude,
            dropAddress: storedRideDetails.dropAddress,
            startTime: new Date().toISOString(),
            endTime: null,
            estimatedFare: storedRideDetails.estimatedFare,
            actualFare: null,
            estimatedDistance: storedRideDetails.estimatedDistance,
            actualDistance: null,
            estimatedDuration: storedRideDetails.estimatedDuration,
            actualDuration: null,
            baseFare: storedRideDetails.baseFare,
            surgeMultiplier: storedRideDetails.surgeMultiplier || 1.0,
            waitingTime: null,
            cancellationFee: null,
            cancellationReason: null,
            cancelledBy: null,
            paymentStatus: 'pending',
            paymentMethod: null,
            transactionId: null,
            driverId,
            riderId: storedRideDetails.riderId,
            vehicleId: storedRideDetails.vehicleId || null,
            serviceZoneId: storedRideDetails.serviceZoneId || null,
            route: storedRideDetails.route || null,
            waypoints: storedRideDetails.waypoints || null,
            driverLocationUpdates: [],
            timestamp: new Date().toISOString()
        };
        // 1) Forward to rider backend first so we get rideOtp; rider backend updates ride status to "accepted" (atomic: one winner)
        let riderStoreSuccess = false;
        let rideOtp;
        let riderError;
        try {
            const riderAccessToken = storedRideDetails?.accessToken;
            if (!riderAccessToken) {
                riderError = 'Rider token not stored at request time – cannot update rider backend';
                console.error('[ACCEPT]', riderError);
            }
            else {
                const riderUrl = env_1.RIDER_BACKEND_URL.replace(/\/$/, '');
                if (!riderUrl) {
                    riderError = 'RIDER_BACKEND_URL not set';
                    console.error('[ACCEPT]', riderError);
                }
                else {
                    const riderResponse = await axios_1.default.post(`${riderUrl}/api/rider/rides_accepted`, ridePayload, { headers: { Authorization: `Bearer ${riderAccessToken}` }, validateStatus: () => true });
                    if (riderResponse.status >= 200 && riderResponse.status < 300) {
                        riderStoreSuccess = true;
                        rideOtp = riderResponse?.data?.rideOtp ?? riderResponse?.data?.ride?.rideOtp;
                        if (rideOtp)
                            ridePayload.rideOtp = rideOtp;
                    }
                    else if (riderResponse.status === 409) {
                        const errMsg = (riderResponse.data?.error ?? riderResponse.data?.message ?? 'Ride already assigned');
                        console.warn('[ACCEPT] Rider backend conflict (another driver won):', rideId, driverId);
                        return {
                            ok: false,
                            code: 'RIDE_ALREADY_ASSIGNED',
                            message: errMsg,
                            riderStoreSuccess: false,
                            driverStoreSuccess: false,
                        };
                    }
                    else {
                        const errMsg = (riderResponse.data?.error ?? riderResponse.data?.message ?? `Rider backend ${riderResponse.status}`);
                        const details = riderResponse.data?.details;
                        riderError = details ? `${errMsg}: ${details}` : errMsg;
                        console.error('[ACCEPT] Rider backend failed:', riderResponse.status, riderResponse.data);
                    }
                }
            }
        }
        catch (err) {
            riderError = err.response?.data?.message ?? err.message ?? 'Rider backend request failed';
            console.error('Failed to notify rider backend (REST accept):', err.response?.data || err.message);
        }
        if (!riderStoreSuccess) {
            const message = riderError ?? 'Failed to persist ride details';
            return { ok: false, message, riderStoreSuccess: false, driverStoreSuccess: false };
        }
        // 2) Notify the rider via WS with rideOtp only after rider DB accepted (avoids false "accepted" on conflict)
        const rideAcceptedPayload = {
            rideId,
            driverId,
            rideCode: storedRideDetails?.rideCode,
            rideOtp: rideOtp ?? null,
            timestamp: new Date().toISOString()
        };
        const riderId = this.rideToRiderMap.get(rideId);
        if (typeof riderId === 'string') {
            const riderSocket = this.riderSockets.get(riderId);
            if (riderSocket) {
                riderSocket.emit('rideAccepted', rideAcceptedPayload);
            }
            else {
                this.io.to('riders').emit('rideAccepted', rideAcceptedPayload);
            }
        }
        else {
            this.io.to('riders').emit('rideAccepted', rideAcceptedPayload);
        }
        // 3) Forward to driver backend (must succeed for accept to be considered successful)
        let driverStoreSuccess = false;
        let driverError;
        try {
            const driverBackendUrl = env_1.DRIVER_BACKEND_URL.replace(/\/$/, '');
            if (!driverBackendUrl || !/^https?:\/\//.test(driverBackendUrl)) {
                driverError = 'Invalid driver_backend URL';
                console.error('[ACCEPT]', driverError);
            }
            else {
                const driverResponse = await axios_1.default.post(`${driverBackendUrl}/api/driver/rides_accepted`, ridePayload, {
                    headers: { Authorization: `Bearer ${driverAccessToken || ''}`, 'Content-Type': 'application/json' },
                    validateStatus: () => true,
                });
                if (driverResponse.status >= 200 && driverResponse.status < 300) {
                    driverStoreSuccess = true;
                }
                else {
                    driverError = (driverResponse.data?.message ?? driverResponse.data?.error ?? `Driver backend ${driverResponse.status}`);
                    console.error('[ACCEPT] Driver backend failed:', driverResponse.status, driverResponse.data);
                }
            }
        }
        catch (err) {
            driverError = err.response?.data?.message ?? err.message ?? 'Driver backend request failed';
            console.error('Failed to notify driver backend (REST accept):', err.response?.data || err.message);
        }
        const message = riderStoreSuccess && driverStoreSuccess
            ? 'Ride stored successfully in both rider and driver backend.'
            : riderStoreSuccess
                ? (driverError ? `Rider saved but driver backend failed: ${driverError}` : 'Ride stored successfully in rider backend.')
                : driverStoreSuccess
                    ? (riderError ? `Driver saved but rider backend failed: ${riderError}` : 'Ride stored successfully in driver backend.')
                    : riderError ?? driverError ?? 'Failed to persist ride details';
        // If driver backend failed, driver app won't see the ride – return error so client can retry
        if (!driverStoreSuccess) {
            return { ok: false, message, riderStoreSuccess: true, driverStoreSuccess: false };
        }
        // Persist driver -> active ride only after both backends succeeded (avoid mapping loser drivers)
        if (redis_1.default.client) {
            try {
                await redis_1.default.set(`driver:active_ride:${driverId}`, rideId, 'EX', 7200);
            }
            catch (e) {
                // Ignore Redis errors - service continues without Redis
            }
        }
        // Other drivers still showing the incoming-ride popup must dismiss it immediately.
        this.emitRideRequestClosedAfterAccept(rideId, driverId, storedRideDetails);
        return { ok: true, message, riderStoreSuccess, driverStoreSuccess };
    }
    /**
     * Notify all drivers who saw this ride request that it is no longer available
     * (another driver accepted). Driver apps listen for `rideRequestClosed`.
     */
    emitRideRequestClosedAfterAccept(rideId, acceptedDriverId, storedRideDetails) {
        try {
            const payload = {
                rideId,
                acceptedDriverId,
                reason: 'assigned',
                timestamp: new Date().toISOString()
            };
            const candidates = storedRideDetails?.candidateDrivers;
            if (Array.isArray(candidates) && candidates.length > 0) {
                for (const c of candidates) {
                    const id = c?.id ?? c?.driverId ?? (typeof c === 'string' ? c : null);
                    if (!id)
                        continue;
                    if (String(id) === String(acceptedDriverId))
                        continue;
                    this.io.to(`driver:${String(id)}`).emit('rideRequestClosed', payload);
                }
            }
            else {
                this.io.to('drivers').emit('rideRequestClosed', payload);
            }
        }
        catch (e) {
            console.warn('[ACCEPT] emitRideRequestClosedAfterAccept failed', e);
        }
    }
}
exports.WebSocketService = WebSocketService;
