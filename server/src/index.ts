import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import worldRoutes from './routes/world';
import actionsRoutes from './routes/actions';
import defenseRoutes from './routes/defense';
import reportsRoutes from './routes/reports';
import mailboxRoutes from './routes/mailbox';
import admiralRoutes from './routes/admiral';
import espionageRoutes from './routes/espionage';
import devRoutes from './routes/dev';
import { migrateExistingNpcs } from './services/pveService';
import { globalLimiter, authLimiter, heavyActionLimiter } from './middleware/rateLimiter';
import { createGameEventsWorker } from './workers/gameEventWorker';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Apply global rate limiting
app.use(globalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
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
app.use('/dev', devRoutes);

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 External access: http://0.0.0.0:${PORT}`);

  // Start job queue worker (Redis required)
  try {
    createGameEventsWorker();
    console.log('✅ Game Events Worker started');
  } catch (err) {
    console.error('❌ FATAL: Failed to start job queue worker:', err);
    console.error('💡 Make sure Redis is running: sudo docker compose -f infra/docker-compose.yml up -d redis');
    process.exit(1);
  }

  // Run NPC migration once on startup
  migrateExistingNpcs().catch(err => console.error('Failed to migrate NPCs:', err));
});
