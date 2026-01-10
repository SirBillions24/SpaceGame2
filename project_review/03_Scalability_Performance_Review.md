# Scalability & Performance Review

## Executive Summary
 The application's architecture (Node.js + Prisma + Postgres) provides a solid foundation. The decision to use **Lazy Evaluation** for resource production is a massive scalability win, avoiding the "O(N) per second" server load typical of RTS games. However, specific bottlenecks in the Fleet Timer Worker and Database Indexing threaten stability under load.

## 1. Database Performance & Indexing

### Strengths
- **Spatial Queries**: The `Planet` table enforces `@@unique([x, y])`, which acts as an index for coordinate lookups.
- **Relational Integrity**: Foreign Keys are largely established.

### Weaknesses & Risks
- **Missing Indexes on Hot Columns**:
    - **Crucial**: The `Fleet` table likely needs a composite index `[status, arriveAt]` (or `[arriveAt]`) to support the frequent polling of "fleets that have arrived". Without this, the timer worker performs a full table scan or inefficient filter every tick (or second).
    - **FK Indexes**: Prisma does not automatically create indexes for foreign keys (e.g., `ownerId` on `Fleet` or `Planet`). Queries like "Get all fleets for user" will be slow as the table grows.
- **Json Columns**: Heavy reliance on `unitsJson`, `laneAssignmentsJson` prevents efficient querying. You cannot easily ask "Find all battles where > 100 Marines died" without full scans.

## 2. Server-Side Bottlenecks

### Strengths
- **Lazy Eval**: As noted, this scales O(1) with respect to *inactive* users. Server load is proportional to *active* user actions, not total user count.

### Weaknesses & Risks
- **The Timer Worker (`timerWorker.ts`)**: This is a Single Point of Failure and Bottleneck.
    - If it runs in the main Node process, it blocks the event loop during heavy combat resolution.
    - If it runs as a separate cron/process, it must be robust against crashing.
    - **Concurrency**: If the worker takes > 1 second to process arrivals (due to complex combat logic), it might overlap with the next tick or fall behind (Time Dilation).
- **Synchronous Combat Resolution**: `resolveCombat` is potentially heavy (lots of loops, math, and DB updates). Doing this *inside* the API request (or the single worker thread) will hang the server for other players if 100 battles land simultaneously.

## Recommendations

1.  **Add Indexes**: Immediately add indexes to `Fleet(status, arriveAt)`, `Fleet(ownerId)`, and `Planet(ownerId)`.
2.  **Job Queue**: Move combat resolution to a proper Job Queue (e.g., BullMQ + Redis). The Timer Worker should only *dispatch* jobs, not *execute* the heavy combat logic. Benefits:
    - Parallel processing (multiple workers).
    - Retries on failure.
    - Non-blocking.
3.  **Read Replicas**: Prepare config to split generic READs (getting user profile) from WRITEs (moving fleets) if user count explodes.
