# Comprehensive Implementation Strategy & Risk Mitigation Guide

## Executive Summary
This document outlines the step-by-step roadmap for implementing the recommendations from the Project Feature Review. The specific goal is to **mitigate risk** by breaking large changes into isolated, testable phases.

**Golden Rule**: Do not proceed to the next Phase until the current Phase is verified in Staging.

---

## Phase 1: Critical Security & Integrity (Immediate)
**Goal**: Stop data leaks, prevent "infinite resource" cheating, and fix race conditions.
**Risk**: Medium (Changes core service logic).

### 1.1. Sanitize Data Leaks (Espionage & World)
*   **The Change**: Modify `espionageService.ts` and `world.ts`.
*   **Implementation**:
    *   Replace `include: { owner: true }` with `select: { owner: { select: { username: true } } }`.
    *   In `world.ts`, verify `req.userId` against `planet.ownerId`. If false, map `buildings` to a simpler object (hide `level`, `stats`) and set `defense` levels to specific "Unknown" or range values.
*   **Verification**:
    *   Login as User A.
    *   Spy on User B.
    *   Inspect Network Response. Ensure `passwordHash` and `email` are MISSING.

### 1.2. Close Developer Routes
*   **The Change**: In `routes/dev.ts`, add a check for `process.env.ENABLE_DEV_ROUTES === 'true'` OR implement strict Admin IP whitelisting.
*   **Implementation**: Wrap the router definitions in a conditional block or adding a middleware `requireAdmin` (even if hardcoded ID for now).
*   **Verification**: Attempt to `POST /dev/add-resources`. Expect `403 Forbidden`.

### 1.3. Atomic Transactions for Resources
*   **The Change**: Rewrite `deductResources` inside `planetService` and `combatService`.
*   **Implementation**:
    *   Use `prisma.$transaction(async (tx) => { ... })`.
    *   Perform the check (`if money < cost`) AND the update (`decrement`) inside the transaction scope.
*   **Verification**: Rapidly spam the "Build" button (scripted). Ensure resources never drop below zero.

---

## Phase 2: Input Validation & Type Safety (Short Term)
**Goal**: Prevent "Type Confusion" exploits and crashes due to bad JSON.
**Risk**: Low (Mostly additive middleware).

### 2.1. Zod Schema Implementation
*   **The Change**: Create `server/src/schemas/*.ts`.
*   **Implementation**:
    *   Define `FleetDispatchSchema`, `BuildSchema`, etc.
    *   Add a middleware `validateRequest(Schema)` to `routes/actions.ts`.
*   **Verification**: Send `{ count: "100" }` (string) to an endpoint expecting number. Expect `400 Bad Request`.

### 2.2. Typed Service Wrappers
*   **The Change**: Stop passing `any` or raw JSON logic in Services.
*   **Implementation**: Refactor `combatService.ts` to use typed interfaces internally.
*   **Verification**: Run existing `verifyCombat.ts` scripts.

---

## Phase 3: Scalability Refactor (Medium Term)
**Goal**: Prepare the server for >1000 concurrent players.
**Risk**: High (Architectural change).

### 3.1. Database Indexing
*   **The Change**: run `prisma migrate` with new indexes.
*   **Implementation**: Add `@@index([status, arriveAt])` to Fleet.
*   **Verification**: Run `EXPLAIN ANALYZE` on the Timer Worker query. Ensure it uses the Index Scan, not Seq Scan.

### 3.2. Migration to Job Queue (BullMQ)
*   **The Change**: Decompose `timerWorker.ts`.
*   **Step-by-Step**:
    1.  **Parallel Run**: Set up Redis and BullMQ alongside the existing `setInterval`.
    2.  **Dispatch Only**: Change `timerWorker` to ONLY find Fleets and `queue.add('resolve-fleet', { id })`.
    3.  **Process**: Move `resolveCombat` logic into the Worker Processor.
    4.  **Cutover**: Deploy.
*   **Verification**:
    *   Send 10 fleets to arrive at `T+10s`.
    *   Monitor Redis. Ensure 10 jobs appear and complete successfully.
    *   Ensure Battle Reports are generated.

---

## Phase 4: Mechanics & Gameplay Refinement (Long Term)
**Goal**: Deepen strategy and fix "Death Spirals".
**Risk**: Medium (Game Balance).

### 4.1. "GameConfig" System
*   **The Change**: Move constants from `mechanics.ts` to DB.
*   **Implementation**:
    *   Create `GameConfig` table.
    *   Create `ConfigService` with caching (1-minute TTL).
    *   Replace `TRIANGLE_BONUS` with `ConfigService.get('TRIANGLE_BONUS')`.
*   **Verification**: Change value in DB. Wait 1 min. Verify combat numbers change in game.

### 4.2. PVE Loop Refactor
*   **The Change**: Prevent infinite farming.
*   **Implementation**:
    *   Add `respawnAt: DateTime` to `Planet` (nullable).
    *   When NPC dies, set `respawnAt = Now + 4 hours`, hide planet (or make inactive).
    *   Timer Worker checks for `respawnAt < Now` to "Revive" it.
*   **Verification**: Kill pirate. Ensure it disappears. Fast forward time. Ensure it reappears.

### 4.3. Combat Fog of War
*   **The Change**: Hide exact defender numbers in reports.
*   **Implementation**:
    *   In `combatService`, before `prisma.battleReport.create`:
    *   If `attackerWonLane == false`, map `sectorResult.defenderSnapshot` to `{ unit: '???', count: '???' }`.
*   **Verification**: Lose a battle. Check Report. Confirm masked data.

---

## Testing & Validation Matrix

| Change Type | Test Method | Success Criteria |
| :--- | :--- | :--- |
| **Security Fixes** | Manual Pentest / Scripted Exploits | No sensitive fields in JSON response. "Cheat" scripts fail with 403/400. |
| **Race Conditions** | `scripts/verifyConcurrency.ts` (New Script) | 100 parallel requests result in exact math (0 balance, not -500). |
| **Mechanics** | `scripts/verifyCombatV2.ts` | Outcomes match Excel/Spreadsheet calculations. |
| **Infrastructure** | Load Test (k6 / Artillery) | Server stays responsive (<200ms latency) during 1000 fleet arrivals/min. |

## Recommended First Step
Start **Phase 1.2 (Dev Routes)** and **Phase 1.1 (Sanitization)** immediately. These require no database changes and provide the highest security ROI.
