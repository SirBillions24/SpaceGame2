# Scalability Implementation Plan: Indexing & Job Queue

## 1. Database Indexing Strategy
To address the bottlenecks found in the Fleet Timer and general querying, we will apply the following database schema changes.

### Critical Indexes
These indexes target the highest-frequency queries (Timer Worker polling).

```prisma
// server/prisma/schema.prisma

model Fleet {
  // ... existing fields
  
  // SUPPORT: Timer Worker polling
  // "Find all fleets enroute/returning that have arrived"
  // Query: status IN [...] AND arriveAt <= NOW
  @@index([status, arriveAt]) 
  
  // SUPPORT: "Get my fleets" UI view
  @@index([ownerId, status])
  
  // SUPPORT: "Get incoming attacks" (For flashing red screens)
  @@index([toPlanetId, status, arriveAt])
}

model Planet {
  // ...
  // SUPPORT: "Get my planets"
  @@index([ownerId])
}
```

**Deployment**:
1.  Update `schema.prisma`.
2.  Run `npx prisma migrate dev --name add_performance_indexes`.

## 2. Asynchronous Job Queue (BullMQ)
To remove the `timerWorker` bottleneck and ensure atomic, scalable combat resolution.

### Architectural Change
- **Current**: `setInterval` -> Poll DB -> Execute Logic -> Update DB (All in Main Thread).
- **New**: `setInterval` -> Poll DB -> **Dispatch Job to Redis** -> **Worker Process** picks up Job -> Execute Logic.

### Technology Stack
- **Queue**: [BullMQ](https://docs.bullmq.io/) (Redis-based, robust, supports retries/delays).
- **Storage**: Redis (Required infrastructure addition).

### Implementation Steps

#### Step 1: Infrastructure
Add Redis to `infra/docker-compose.yml`.
```yaml
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

#### Step 2: Queue Setup (`server/src/lib/queue.ts`)
```typescript
import { Queue, Worker } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379
};

// Queue for high-priority game events (Combat, Arrivals)
export const gameEventQueue = new Queue('GameEvents', { connection });
```

#### Step 3: Worker Implementation (`server/src/workers/gameEventWorker.ts`)
Isolate the heavy `combatService` logic here.
```typescript
import { Worker } from 'bullmq';
import { resolveCombat } from '../services/combatService';

const worker = new Worker('GameEvents', async job => {
  if (job.name === 'processArrival') {
    const { fleetId } = job.data;
    // Execute the heavy combat logic
    await resolveCombat(fleetId);
  }
}, { connection });
```

#### Step 4: Refactor Timer Poller
The `timerWorker` now becomes a lightweight dispatcher. It checks for arrivals and **only queues IDs**.
```typescript
// server/src/services/timerWorker.ts
// ...
    for (const fleet of arrivedFleets) {
        // Mark as 'processing' so we don't pick it up again
        await prisma.fleet.update({ where: { id: fleet.id }, data: { status: 'processing' } });
        
        // Dispatch
        await gameEventQueue.add('processArrival', { fleetId: fleet.id });
    }
// ...
```

### Benefits
1.  **Non-Blocking**: The API server stays responsive even if 1000 battles resolve at once.
2.  **Scalability**: You can spin up 10 `gameEventWorker` processes on different machines to process the Redis queue in parallel.
3.  **Reliability**: BullMQ handles retries if a job crashes, ensuring the fleet isn't "lost" in a `processing` limbo forever.
