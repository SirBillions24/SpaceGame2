import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { ChatSendSchema, DMSendSchema } from '../schemas/socketSchemas';
import * as coalitionService from './coalitionService';
import * as dmService from './dmService';
import { logError, isRedisReadOnlyError } from '../lib/errorLogger';

class SocketService {
    private io: Server | null = null;
    private userSockets = new Map<string, Set<string>>();
    private pubClient: RedisClientType | null = null;
    private subClient: RedisClientType | null = null;

    async initialize(httpServer: any) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        // Create Redis clients with retry strategy
        this.pubClient = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    // Log reconnection attempts
                    logError('REDIS_CONNECTION', `Socket.IO pub client reconnect attempt ${retries}`, {
                        client: 'pub',
                        url: redisUrl,
                        retries
                    });
                    // Exponential backoff: 100ms, 200ms, 400ms... max 5 seconds
                    return Math.min(retries * 100, 5000);
                }
            }
        });

        this.subClient = this.pubClient.duplicate();

        // Attach error handlers BEFORE connecting
        this.pubClient.on('error', (err) => {
            const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'REDIS_CONNECTION';
            logError(category, err, { client: 'pub', url: redisUrl });
        });

        this.subClient.on('error', (err) => {
            const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'REDIS_CONNECTION';
            logError(category, err, { client: 'sub', url: redisUrl });
        });

        // Log successful connections
        this.pubClient.on('ready', () => {
            console.log('✅ Redis pub client connected');
        });

        this.subClient.on('ready', () => {
            console.log('✅ Redis sub client connected');
        });

        // Log reconnection events
        this.pubClient.on('reconnecting', () => {
            console.log('🔄 Redis pub client reconnecting...');
        });

        this.subClient.on('reconnecting', () => {
            console.log('🔄 Redis sub client reconnecting...');
        });

        // Now connect
        await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

        this.io = new Server(httpServer, {
            cors: { origin: '*', credentials: true },
            adapter: createAdapter(this.pubClient, this.subClient),
        });

        // Handle Socket.IO server errors
        this.io.on('error', (err) => {
            logError('SOCKET_ERROR', err instanceof Error ? err : new Error(String(err)), {
                component: 'socket.io-server'
            });
        });

        this.io.use(this.authMiddleware.bind(this));
        this.io.on('connection', this.handleConnection.bind(this));

        // Subscribe to worker-to-API socket event channels
        // This allows the worker process to emit socket events via Redis
        const socketSubClient = this.pubClient.duplicate();
        await socketSubClient.connect();

        await socketSubClient.subscribe('socket:emit:user', (message) => {
            try {
                const { userId, event, data } = JSON.parse(message);
                console.log(`[SocketService] 📥 Received Redis relay: ${event} for user:${userId}`);
                this.io?.to(`user:${userId}`).emit(event, data);
                console.log(`[SocketService] ✅ Forwarded to Socket.IO: ${event} → user:${userId}`);
            } catch (err) {
                console.error('Failed to parse socket:emit:user message:', err);
            }
        });

        await socketSubClient.subscribe('socket:emit:coalition', (message) => {
            try {
                const { coalitionId, event, data } = JSON.parse(message);
                this.io?.to(`coalition:${coalitionId}`).emit(event, data);
            } catch (err) {
                console.error('Failed to parse socket:emit:coalition message:', err);
            }
        });

        await socketSubClient.subscribe('socket:emit:all', (message) => {
            try {
                const { event, data } = JSON.parse(message);
                this.io?.emit(event, data);
            } catch (err) {
                console.error('Failed to parse socket:emit:all message:', err);
            }
        });

        console.log('✅ Socket.IO initialized with Redis adapter and worker relay');
    }

    private authMiddleware(socket: Socket, next: (err?: Error) => void) {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication required'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
            socket.data.userId = decoded.userId;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    }

    private async handleConnection(socket: Socket) {
        const userId = socket.data.userId;
        console.log(`🔌 Socket connected: ${userId} (${socket.id})`);

        // Track socket
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId)!.add(socket.id);

        // Join user-specific room for cross-process emission via Redis adapter
        socket.join(`user:${userId}`);
        console.log(`   ↳ Joined room user:${userId}`);

        // Join coalition room if applicable
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true },
        });
        if (user?.coalitionId) {
            socket.join(`coalition:${user.coalitionId}`);
        }

        // Event handlers
        socket.on('chat:send', async (data) => {
            const parsed = ChatSendSchema.safeParse(data);
            if (!parsed.success) return;
            const currentUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!currentUser?.coalitionId) return;
            await coalitionService.sendCoalitionMessage(userId, currentUser.coalitionId, parsed.data.content);
        });

        socket.on('dm:send', async (data) => {
            const parsed = DMSendSchema.safeParse(data);
            if (!parsed.success) return;
            await dmService.sendDirectMessage(userId, parsed.data.receiverId, parsed.data.content);
        });

        socket.on('disconnect', () => {
            this.userSockets.get(userId)?.delete(socket.id);
            if (this.userSockets.get(userId)?.size === 0) {
                this.userSockets.delete(userId);
            }
            console.log(`🔌 Socket disconnected: ${userId} (${socket.id})`);
        });

        // Handle individual socket errors
        socket.on('error', (err) => {
            logError('SOCKET_ERROR', err, {
                userId,
                socketId: socket.id
            });
        });
    }

    // Emission methods
    emitToUser(userId: string, event: string, data: any) {
        // Use room-based emission for cross-process support via Redis adapter
        if (this.io) {
            console.log(`[SocketService] Emitting ${event} to user:${userId} via io.to()`);
            this.io.to(`user:${userId}`).emit(event, data);
        } else if (this.pubClient?.isReady) {
            // Worker process: publish to Redis channel for API server to pick up
            console.log(`[SocketService] Publishing ${event} for user:${userId} to Redis`);
            this.pubClient.publish('socket:emit:user', JSON.stringify({ userId, event, data }));
        } else {
            console.warn(`[SocketService] Cannot emit to user ${userId}: no io and no pubClient`);
        }
    }

    emitToCoalition(coalitionId: string, event: string, data: any) {
        if (this.io) {
            this.io.to(`coalition:${coalitionId}`).emit(event, data);
        } else if (this.pubClient?.isReady) {
            this.pubClient.publish('socket:emit:coalition', JSON.stringify({ coalitionId, event, data }));
        }
    }

    emitToAll(event: string, data: any) {
        if (this.io) {
            this.io.emit(event, data);
        } else if (this.pubClient?.isReady) {
            this.pubClient.publish('socket:emit:all', JSON.stringify({ event, data }));
        }
    }

    // Room management for coalition changes
    async updateUserCoalitionRoom(userId: string, oldCoalitionId: string | null, newCoalitionId: string | null) {
        const sockets = this.userSockets.get(userId);
        if (!sockets) return;

        for (const socketId of sockets) {
            const socket = this.io?.sockets.sockets.get(socketId);
            if (socket) {
                if (oldCoalitionId) socket.leave(`coalition:${oldCoalitionId}`);
                if (newCoalitionId) socket.join(`coalition:${newCoalitionId}`);
            }
        }
    }

    // Check if Redis clients are connected (for health check)
    isRedisConnected(): boolean {
        return this.pubClient?.isReady === true && this.subClient?.isReady === true;
    }

    // Initialize only Redis connection (for worker process - no Socket.IO server)
    async initializeForWorker() {
        if (this.pubClient?.isReady) return; // Already initialized

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        this.pubClient = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
            }
        });

        this.pubClient.on('error', (err) => {
            console.error('[Worker] Redis pub client error:', err.message);
        });

        this.pubClient.on('ready', () => {
            console.log('✅ [Worker] Redis pub client connected for socket relay');
        });

        await this.pubClient.connect();
    }
}

export const socketService = new SocketService();
