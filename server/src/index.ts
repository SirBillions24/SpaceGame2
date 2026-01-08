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
import { startTimerWorker } from './services/timerWorker';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/world', worldRoutes);
app.use('/actions', actionsRoutes);
app.use('/defense', defenseRoutes);
app.use('/reports', reportsRoutes);
app.use('/mailbox', mailboxRoutes);
app.use('/admiral', admiralRoutes);
app.use('/espionage', espionageRoutes);
app.use('/dev', devRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 External access: http://0.0.0.0:${PORT}`);
  
  // Start timer worker to process marches
  startTimerWorker();
});

