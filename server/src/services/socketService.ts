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

        console.log('✅ Socket.IO initialized with Redis adapter');
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
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.forEach((socketId) => {
                this.io?.to(socketId).emit(event, data);
            });
        }
    }

    emitToCoalition(coalitionId: string, event: string, data: any) {
        this.io?.to(`coalition:${coalitionId}`).emit(event, data);
    }

    emitToAll(event: string, data: any) {
        this.io?.emit(event, data);
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
}

export const socketService = new SocketService();
