import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

interface AuthenticatedSocket {
  id: string;
  userId?: string;
  userType?: 'driver' | 'rider';
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: (data: any, callback?: (response: any) => void) => void) => void;
}

export class WebSocketService {
  private io: SocketIOServer;
  private driverSockets: Map<string, AuthenticatedSocket> = new Map();
  private riderSockets: Map<string, AuthenticatedSocket> = new Map();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: [
          'http://localhost:3000', // Driver backend
          'http://localhost:8000', // Rider backend
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
      socket.on('authenticate', (data: { driverId: string } | { riderId: string }) => {
        if ('driverId' in data) {
          connectionType = 'driver';
          userId = data.driverId;
          socket.userId = data.driverId;
          socket.userType = 'driver';
          socket.join(`driver:${data.driverId}`);
          this.driverSockets.set(data.driverId, socket);
          
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
      socket.on('requestRide', (data: { 
        riderId: string; 
        pickup: { latitude: number; longitude: number }; 
        dropoff: { latitude: number; longitude: number }; 
        timestamp: string 
      }, callback?: (response: { rideId: string }) => void) => {
        console.log('New Ride Request:', {
          socketId: socket.id,
          riderId: data.riderId,
          connectionType: 'rider',
          pickup: data.pickup,
          dropoff: data.dropoff,
          timestamp: data.timestamp
        });
        // Generate a unique ride ID
        const rideId = `ride_${Date.now()}`;
        
        // Broadcast to all drivers
        this.io.to('drivers').emit('newRideRequest', {
          rideId,
          riderId: data.riderId,
          pickup: data.pickup,
          dropoff: data.dropoff,
          timestamp: data.timestamp
        });

        // Send response to rider if callback provided
        if (callback) {
          callback({ rideId });
        }
      });

      // Handle ride acceptance
      socket.on('acceptRide', (data: { 
        driverId: string; 
        rideId: string; 
        timestamp: string 
      }) => {
        console.log('Ride Accepted:', {
          socketId: socket.id,
          driverId: data.driverId,
          connectionType: 'driver',
          rideId: data.rideId,
          timestamp: data.timestamp
        });
        // Broadcast to the specific rider
        this.io.emit('rideStatusUpdate', {
          rideId: data.rideId,
          driverId: data.driverId,
          status: 'ACCEPTED',
          timestamp: data.timestamp
        });
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