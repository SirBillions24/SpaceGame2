# Job Queue System Documentation

This document describes the BullMQ-based job queue system used for asynchronous game event processing.

> **Note**: The job queue is REQUIRED for running the game server. Redis must be running before starting the server.

---

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│     API Server      │     │                 │     │   Game Events       │
│  (Express Routes)   │────▶│   Redis Queue   │────▶│   Worker            │
│   178.236.183.196   │     │  (Shared Redis) │     │   10.10.100.100     │
│                     │     │                 │     │                     │
│  - Fleet dispatch   │     │  - Delayed jobs │     │  - Combat resolution│
│  - User actions     │     │  - Priority     │     │  - Loot transfer    │
│                     │     │  - Retries      │     │  - Unit updates     │
└─────────────────────┘     └─────────────────┘     └─────────────────────┘
                                    │
                                    │ (Can be on any server)
                                    ▼
                        ┌─────────────────────┐
                        │  Additional Workers │
                        │  (Scale as needed)  │
                        └─────────────────────┘
```

### Key Components

| File | Purpose |
|:-----|:--------|
| `lib/jobQueue.ts` | Queue configuration, connection options, job helpers |
| `workers/gameEventWorker.ts` | Processes fleet arrivals, returns, combat |
| `scripts/testJobQueue.ts` | Integration tests for the queue system |

---

## Startup Procedures

### Prerequisites
Redis MUST be running before starting the server.

```bash
# Start Redis (on game server or dedicated Redis server)
sudo docker compose -f infra/docker-compose.yml up -d redis
```

### Development
```bash
cd server
npm run dev
# Output: 📦 Job Queue mode enabled
# Output: 🔧 Game Events Worker started
```

### Production
```bash
# Environment variables
export REDIS_HOST=localhost  # Or remote Redis IP
export REDIS_PORT=6379

# Start server
npm start
```

---

## Distributed Worker Setup

Run workers on a separate server to offload game processing from the main API server.

### Scenario
- **Game Server**: `178.236.183.196` - Runs API, Redis, in-process worker
- **Worker Server**: `10.10.100.100` - Runs additional worker(s)

### Step 1: Copy Server Code to Worker Machine

```bash
# On worker server (10.10.100.100)
git clone <your-repo> /opt/galactic-conquest
cd /opt/galactic-conquest/server
npm install
```

Only the `server/` directory is needed. The worker doesn't serve HTTP requests.

### Step 2: Configure Environment

Create `/opt/galactic-conquest/server/.env`:
```bash
# Point to Redis on game server
REDIS_HOST=178.236.183.196
REDIS_PORT=6379

# Database connection (same as main server)
DATABASE_URL=postgresql://empire:password@178.236.183.196:5432/empire
```

### Step 3: Start Standalone Worker

```bash
cd /opt/galactic-conquest/server
npx ts-node src/workers/gameEventWorker.ts
```

Output:
```
🚀 Starting Game Events Worker as standalone process...
🔧 Game Events Worker started
```

### Step 4: Run as System Service (Production)

Create `/etc/systemd/system/galactic-worker.service`:
```ini
[Unit]
Description=Galactic Conquest Game Worker
After=network.target

[Service]
Type=simple
User=gameserver
WorkingDirectory=/opt/galactic-conquest/server
Environment=REDIS_HOST=178.236.183.196
Environment=DATABASE_URL=postgresql://empire:password@178.236.183.196:5432/empire
ExecStart=/usr/bin/npx ts-node src/workers/gameEventWorker.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable galactic-worker
sudo systemctl start galactic-worker
sudo systemctl status galactic-worker
```

### Step 5: Verify Worker is Processing

On the game server, check queue stats or watch worker logs:
```bash
# Game server
curl http://localhost:3000/health

# Worker server
journalctl -u galactic-worker -f
```

### Network Requirements

| From | To | Port | Purpose |
|:-----|:---|:-----|:--------|
| Worker Server | Game Server | 6379 | Redis connection |
| Worker Server | Game Server | 5432 | PostgreSQL connection |

> **Security**: Use firewall rules or VPN to restrict Redis/Postgres access to trusted IPs only.

---

## Adding New Job Types

### Step 1: Define the Job Interface

In `lib/jobQueue.ts`:
```typescript
export interface MyNewJob {
  someId: string;
  someData: object;
}
```

### Step 2: Create a Queue Helper

In `lib/jobQueue.ts`:
```typescript
export async function queueMyNewJob(data: MyNewJob, processAt?: Date) {
  const delay = processAt 
    ? Math.max(0, processAt.getTime() - Date.now()) 
    : 0;
  
  await gameEventsQueue.add('my-new-job', data, {
    delay,
    jobId: `my-new-job-${data.someId}`, // Prevents duplicates
  });
}
```

### Step 3: Add Worker Handler

In `workers/gameEventWorker.ts`, add to the switch statement:
```typescript
case 'my-new-job':
  await processMyNewJob(job as Job<MyNewJob>);
  break;
```

### Step 4: Implement the Handler

```typescript
async function processMyNewJob(job: Job<MyNewJob>) {
  const { someId, someData } = job.data;
  
  // Idempotency check - verify job hasn't been processed
  // Do your business logic
  // Update database atomically
}
```

### Step 5: Call from Route

```typescript
const { queueMyNewJob } = await import('../lib/jobQueue');
await queueMyNewJob({ someId, someData }, scheduledTime);
```

---

## Guidelines

### Idempotency
Jobs may be retried. Always check if work was already done:
```typescript
// Check status before processing
if (record.status !== 'pending') {
  console.log('Already processed, skipping');
  return;
}

// Mark as processing first
await prisma.record.update({ 
  where: { id }, 
  data: { status: 'processing' } 
});
```

### Atomic Database Operations
Use transactions for multi-step operations:
```typescript
await prisma.$transaction(async (tx) => {
  // All operations in same transaction
  await tx.fleet.update(...);
  await tx.planet.update(...);
});
```

### Error Handling
- Throw errors to trigger retries
- Return silently for skip conditions
```typescript
if (notFound) {
  console.warn('Item not found, skipping');
  return; // Job marked complete
}

if (unexpectedError) {
  throw error; // Job will retry (up to 3 times)
}
```

### Job IDs
Use predictable IDs to prevent duplicate jobs:
```typescript
await queue.add('job-name', data, {
  jobId: `fleet-arrival-${fleetId}`, // Same ID = no duplicate
});
```

---

## Scalability Guide

### Horizontal Scaling

Run multiple worker instances to process jobs in parallel:

```bash
# Game server - runs API + 1 worker
npm start

# Worker server 1
REDIS_HOST=178.236.183.196 npx ts-node src/workers/gameEventWorker.ts

# Worker server 2
REDIS_HOST=178.236.183.196 npx ts-node src/workers/gameEventWorker.ts
```

All workers consume from the same Redis queue. BullMQ ensures each job is processed exactly once.

### Concurrency Settings

In `workers/gameEventWorker.ts`:
```typescript
const worker = new Worker('GameEvents', processor, {
  connection: redisConnectionOptions,
  concurrency: 5, // Process 5 jobs simultaneously per worker
});
```

Adjust based on:
- **Low**: 1-2 for heavy database operations
- **Medium**: 5-10 for standard game events
- **High**: 20+ for lightweight jobs

### Queue Monitoring

```typescript
import { getQueueStats } from '../lib/jobQueue';

const stats = await getQueueStats();
console.log(stats);
// { waiting: 5, active: 2, completed: 100, failed: 1, delayed: 10 }
```

### Redis High Availability

For production, consider:
- **Redis Sentinel**: Automatic failover
- **Redis Cluster**: Horizontal data sharding
- **Managed Redis**: AWS ElastiCache, Redis Cloud

---

## Testing

### Run Integration Tests
```bash
cd server
npx ts-node src/scripts/testJobQueue.ts
```

### Expected Output
```
🧪 BullMQ Integration Tests
📡 Connecting to Redis at localhost:6379

✅ Redis Connection (38ms)
✅ Queue Job Creation (19ms)
✅ Delayed Job Scheduling (12ms)
✅ Worker Processing (1035ms)
✅ Custom Job ID (Idempotency) (10ms)
✅ GameEvents Queue Access (45ms)

==================================================
✅ All 6 tests passed!
```

---

## Troubleshooting

### "READONLY You can't write against a read only replica"
Redis is misconfigured as a replica. Fix:
```bash
sudo docker compose -f infra/docker-compose.yml down redis
sudo docker volume rm infra_redis_data
sudo docker compose -f infra/docker-compose.yml up -d redis
```

### "Connection refused"
Redis is not running:
```bash
sudo docker compose -f infra/docker-compose.yml up -d redis
```

### Jobs not processing
1. Verify worker started: Look for "🔧 Game Events Worker started"
2. Check Redis connection in logs
3. Check `REDIS_HOST` environment variable

### Jobs stuck in "active"
Worker crashed mid-job. BullMQ will auto-recover stalled jobs after ~30 seconds.

---

## Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | - | Redis password (optional) |

---

## Current Job Types

| Job Name | Purpose | Triggered By |
|:---------|:--------|:-------------|
| `fleet:arrival` | Process fleet arriving at destination | Fleet dispatch |
| `fleet:return` | Process fleet returning home with loot | Combat completion |
| `npc:respawn` | Respawn NPC after defeat | NPC death |
| `probe:update` | Update probe states (arrivals, returns, accuracy, discovery) | Repeatable (60s) |
