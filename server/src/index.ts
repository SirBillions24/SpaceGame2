import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import worldRoutes from './routes/world';
import actionsRoutes from './routes/actions';
import defenseRoutes from './routes/defense';
import reportsRoutes from './routes/reports';
import mailboxRoutes from './routes/mailbox';
import admiralRoutes from './routes/admiral';
import espionageRoutes from './routes/espionage';
import coalitionRoutes from './routes/coalitions';
import devRoutes from './routes/dev';
import { migrateExistingNpcs } from './services/pveService';
import { seedBlackHoles, spawnMissingHarvesters } from './services/harvesterService';
import { globalLimiter, authLimiter, heavyActionLimiter } from './middleware/rateLimiter';
import { createGameEventsWorker } from './workers/gameEventWorker';
import { startProbeUpdateScheduler, checkRedisHealth } from './lib/jobQueue';
import { socketService } from './services/socketService';
import { logErrorSync, logError } from './lib/errorLogger';

dotenv.config();

// =============================================================================
// GLOBAL ERROR HANDLERS
// Prevent process crash from unhandled errors - LOG AND CONTINUE
// =============================================================================

process.on('uncaughtException', (err) => {
  logErrorSync('UNCAUGHT_EXCEPTION', err, { 
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
  // Don't exit - let the server try to recover
  // The error is logged for historical analysis
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logError('UNHANDLED_REJECTION', error, {
    pid: process.pid,
    uptime: process.uptime()
  });
  // Don't exit - log and continue
});

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================

const app = express();
const httpServer = createServer(app);
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Apply global rate limiting
app.use(globalLimiter);

// Health check endpoint - now checks Redis connectivity
app.get('/health', async (req, res) => {
  try {
    const redisOk = await checkRedisHealth();
    const status = redisOk ? 200 : 503;
    res.status(status).json({ 
      ok: redisOk, 
      redis: redisOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (err) {
    res.status(503).json({ 
      ok: false, 
      redis: 'error',
      timestamp: new Date().toISOString() 
    });
  }
});

// Routes with specific rate limits
app.use('/auth', authLimiter, authRoutes);
app.use('/world', worldRoutes);
app.use('/actions', heavyActionLimiter, actionsRoutes);
app.use('/defense', defenseRoutes);
app.use('/reports', reportsRoutes);
app.use('/mailbox', mailboxRoutes);
app.use('/admiral', admiralRoutes);
app.use('/espionage', espionageRoutes);
app.use('/coalitions', coalitionRoutes);
app.use('/dev', devRoutes);

async function startServer() {
  // Initialize Socket.IO with Redis adapter
  try {
    await socketService.initialize(httpServer);
    console.log('✅ WebSocket server initialized');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logErrorSync('STARTUP_FAILURE', error, { component: 'socketService' });
    console.error('💡 Make sure Redis is running: sudo docker compose -f infra/docker-compose.yml up -d redis');
    process.exit(1);
  }

  // Start job queue worker (Redis required)
  try {
    createGameEventsWorker();
    await startProbeUpdateScheduler();
    console.log('✅ Game Events Worker started');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logErrorSync('STARTUP_FAILURE', error, { component: 'jobQueue' });
    console.error('💡 Make sure Redis is running: sudo docker compose -f infra/docker-compose.yml up -d redis');
    process.exit(1);
  }

  // Run NPC migration once on startup
  migrateExistingNpcs().catch(err => console.error('Failed to migrate NPCs:', err));

  // Seed black holes and spawn Harvesters
  try {
    await seedBlackHoles();
    await spawnMissingHarvesters();
    console.log('🌌 Black holes and Harvesters initialized');
  } catch (err) {
    console.error('Failed to seed Harvesters:', err);
  }

  // Start listening
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 External access: http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket available at ws://0.0.0.0:${PORT}`);
  });
}

startServer();
