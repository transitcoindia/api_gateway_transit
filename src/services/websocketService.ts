import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import axios from 'axios';

interface AuthenticatedSocket {
  id: string;
  userId?: string;
  userType?: 'driver' | 'rider';
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: (data: any, callback?: (response: any) => void) => void) => void;
}

const rideDetailsMap = new Map();

export class WebSocketService {
  private io: SocketIOServer;
  private driverSockets: Map<string, AuthenticatedSocket> = new Map();
  private riderSockets: Map<string, AuthenticatedSocket> = new Map();
  private rideToRiderMap: Map<string, string> = new Map();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: [
          process.env.driver_backend || 'http://localhost:3000', // Driver backend
          process.env.rider_backend || 'http://localhost:8000', // Rider backend
          process.env.FRONTEND_APP_URL || 'http://localhost:3000'
        ],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      // Track connection type
      let connectionType = 'unknown';
      let userId = '';

      console.log('New WebSocket connection established:', {
        socketId: socket.id,
        connectionType: 'pending authentication',
        timestamp: new Date().toISOString()
      });

      // Handle authentication
      socket.on('authenticate', (data: { driverId: string, accessToken?: string } | { riderId: string, accessToken?: string }) => {
        if ('driverId' in data) {
          connectionType = 'driver';
          userId = data.driverId;
          socket.userId = data.driverId;
          socket.userType = 'driver';
          socket.join('drivers');
          socket.join(`driver:${data.driverId}`);
          this.driverSockets.set(data.driverId, socket);
          if ('accessToken' in data && data.accessToken) {
            (socket as any).accessToken = data.accessToken;
          }
          console.log('Driver Connection:', {
            socketId: socket.id,
            driverId: data.driverId,
            connectionType: 'driver',
            timestamp: new Date().toISOString()
          });
          // Notify driver of successful connection
          socket.emit('authenticated', { status: 'success', type: 'driver' });
        } else if ('riderId' in data) {
          connectionType = 'rider';
          userId = data.riderId;
          socket.userId = data.riderId;
          socket.userType = 'rider';
          socket.join(`rider:${data.riderId}`);
          this.riderSockets.set(data.riderId, socket);
          if ('accessToken' in data && data.accessToken) {
            (socket as any).accessToken = data.accessToken;
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

      // Handle driver location updates
      socket.on('driverLocationUpdate', (data: { 
        driverId: string; 
        location: { latitude: number; longitude: number }; 
        timestamp: string 
      }) => {
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
      socket.on('requestRide', (data: any, callback?: (response: { rideId: string, rideCode: string }) => void) => {
        console.log('New Ride Request:', {
          socketId: socket.id,
          ...data
        });
        // Store accessToken from payload on the socket for later use
        if (data.accessToken) {
          (socket as any).accessToken = data.accessToken;
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

        console.log('Sockets in drivers room:', Array.from(this.io.sockets.adapter.rooms.get('drivers') || []));
        
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

      
      // Handle ride acceptance
      socket.on('acceptRide', async (data) => {
        const { rideId, driverId, timestamp, ...rideDetails } = data;
        // 1. Mark the ride as accepted in your DB or in-memory store
        // 2. Notify the correct rider (find by rideId)
        const riderId = this.rideToRiderMap.get(rideId);
        if (typeof riderId === 'string') {
          const riderSocket = this.riderSockets.get(riderId);
          if (riderSocket) {
            riderSocket.emit('rideAccepted', { rideId, driverId, timestamp });
          }
        }

        // Retrieve the full ride details from memory
        const storedRideDetails = rideDetailsMap.get(rideId);
        const accessToken = storedRideDetails?.accessToken;
        // Store the driver's access token if present
        if (data.accessToken) {
          storedRideDetails.driverAccessToken = data.accessToken;
          rideDetailsMap.set(rideId, storedRideDetails);
        }
        const driverAccessToken = storedRideDetails?.driverAccessToken;
        console.log("accessToken (rider): ", accessToken);
        console.log("driverAccessToken: ", driverAccessToken);
        if (!storedRideDetails) {
          console.error('No ride details found for rideId:', rideId);
          socket.emit('acceptRideAck', { rideId, status: 'error', message: 'Ride details not found' });
          return;
        }

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
          riderId: storedRideDetails.riderId, // <-- ensure this is set!
          vehicleId: storedRideDetails.vehicleId || null,
          serviceZoneId: storedRideDetails.serviceZoneId || null,
          route: storedRideDetails.route || null,
          waypoints: storedRideDetails.waypoints || null,
          driverLocationUpdates: [],
          timestamp
        };

        //after accepting the ride store into the rider databse
        let riderStoreSuccess = false;
        try {
          console.log('Forwarding access token to rider backend:', accessToken);
          await axios.post(
            `${process.env.rider_backend}/api/rider/rides_accepted`,
            ridePayload,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );
          riderStoreSuccess = true;
          console.log('Ride stored successfully in rider backend.');
        } catch (err) {
          console.error('Failed to notify rider backend:', (err as any).response?.data || (err as any).message);
        }

        //after accepting the ride store into the driver databse
        let driverStoreSuccess = false;
        try {
          const driverBackendUrl = process.env.driver_backend;
          // console.log('driver_backend URL:', driverBackendUrl);
          if (!driverBackendUrl || !/^https?:\/\//.test(driverBackendUrl)) {
            throw new Error('Invalid driver_backend URL');
          }
          await axios.post(
            `${driverBackendUrl}/api/driver/rides_accepted`,
            ridePayload,
            {
              headers: {
                Authorization: `Bearer ${driverAccessToken}`
              }
            }
          );
          driverStoreSuccess = true;
          console.log('Ride stored successfully in driver backend.');
        } catch (err) {
          console.error('Failed to notify driver backend:', (err as any).response?.data || (err as any).message);
        }

        // 3. Optionally, notify other drivers that the ride is no longer available
        // 4. Optionally, send an ack to the driver
        let ackMessage = 'accepted';
        if (riderStoreSuccess && driverStoreSuccess) {
          ackMessage = 'Ride stored successfully in both rider and driver backend.';
        } else if (riderStoreSuccess) {
          ackMessage = 'Ride stored successfully in rider backend.';
        } else if (driverStoreSuccess) {
          ackMessage = 'Ride stored successfully in driver backend.';
        }
        socket.emit('acceptRideAck', { rideId, status: 'accepted', message: ackMessage });
      });

      // Handle ride cancellation
      socket.on('cancelRide', (data: { 
        riderId: string; 
        rideId: string; 
        timestamp: string;
        reason?: string;
      }) => {
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
      socket.on('driverStatusUpdate', (data: {
        driverId: string;
        status: 'ONLINE' | 'OFFLINE' | 'BUSY';
        timestamp: string;
      }) => {
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

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client Disconnected:', {
          socketId: socket.id,
          connectionType,
          userId,
          timestamp: new Date().toISOString()
        });

        // Clean up socket maps
        if (connectionType === 'driver' && userId) {
          this.driverSockets.delete(userId);
        } else if (connectionType === 'rider' && userId) {
          this.riderSockets.delete(userId);
        }
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
  public getIO(): SocketIOServer {
    return this.io;
  }

  public getDriverSocket(driverId: string): AuthenticatedSocket | undefined {
    return this.driverSockets.get(driverId);
  }

  public getRiderSocket(riderId: string): AuthenticatedSocket | undefined {
    return this.riderSockets.get(riderId);
  }
} 