# Deploying the Redis Resilience Fix

This document describes how to deploy the fixes for the Redis-related server crashes.

## What Was Changed

### 1. Error Logging System (`server/src/lib/errorLogger.ts`)
- Dedicated error log file at `logs/errors.log`
- JSON Lines format for easy parsing
- Categories: `REDIS_CONNECTION`, `REDIS_READONLY`, `WORKER_ERROR`, `QUEUE_ERROR`, `SOCKET_ERROR`, `UNCAUGHT_EXCEPTION`, `UNHANDLED_REJECTION`, `STARTUP_FAILURE`

### 2. Global Error Handlers (`server/src/index.ts`)
- `process.on('uncaughtException')` - catches unhandled exceptions
- `process.on('unhandledRejection')` - catches unhandled promise rejections
- Updated `/health` endpoint to check Redis connectivity

### 3. Socket.IO Redis Handlers (`server/src/services/socketService.ts`)
- Added error handlers for pub/sub Redis clients
- Added reconnection strategy with exponential backoff
- Added ready/reconnecting event logging

### 4. BullMQ Queue Handlers (`server/src/lib/jobQueue.ts`)
- Added error handlers for queue and queue events
- Added retry strategy for Redis connections
- Added `checkRedisHealth()` function for health endpoint

### 5. Worker Error Handler (`server/src/workers/gameEventWorker.ts`)
- Added `worker.on('error')` to catch connection issues
- Added `worker.on('ready')` and `worker.on('stalled')` events

### 6. Infrastructure Changes
- `docker-compose.yml`: Removed redis_data volume (persistence disabled)
- `prod_backend.service`: Added `StartLimitBurst=5` and `StartLimitIntervalSec=300`
- `backend.service`: Same restart limits

---

## Deployment Steps

### Step 1: Build the Server

```bash
cd /home/bone/oldschoolempire/server
npm run build
```

### Step 2: Restart Redis (Clean State)

```bash
cd /home/bone/oldschoolempire/infra

# Stop Redis and remove old volume
sudo docker compose stop redis
sudo docker volume rm infra_redis_data 2>/dev/null || true

# Start fresh Redis
sudo docker compose up -d redis

# Verify Redis is writable
sudo docker exec empire-redis redis-cli SET test_key "test" && \
sudo docker exec empire-redis redis-cli DEL test_key && \
echo "✅ Redis is writable"
```

### Step 3: Update Systemd Services

```bash
# Copy updated service files
cp /home/bone/oldschoolempire/infra/systemd/prod_backend.service ~/.config/systemd/user/
cp /home/bone/oldschoolempire/infra/systemd/backend.service ~/.config/systemd/user/

# Reload systemd
systemctl --user daemon-reload

# Restart the backend services
systemctl --user restart prod_backend
systemctl --user restart backend
```

### Step 4: (Optional) Enable Redis Monitor Timer

```bash
# Copy timer files (requires root for system-wide)
sudo cp /home/bone/oldschoolempire/infra/systemd/redis-monitor.service /etc/systemd/system/
sudo cp /home/bone/oldschoolempire/infra/systemd/redis-monitor.timer /etc/systemd/system/

# Enable and start timer
sudo systemctl daemon-reload
sudo systemctl enable redis-monitor.timer
sudo systemctl start redis-monitor.timer

# Verify timer is active
sudo systemctl list-timers | grep redis
```

### Step 5: (Optional) Set Up Log Rotation

```bash
sudo cp /home/bone/oldschoolempire/infra/logrotate/empire-errors /etc/logrotate.d/

# Test logrotate config
sudo logrotate -d /etc/logrotate.d/empire-errors
```

---

## Verification

### Check Server Status

```bash
systemctl --user status prod_backend
```

### Check Health Endpoint

```bash
curl http://localhost:3000/health
# Expected: {"ok":true,"redis":"connected","timestamp":"...","uptime":...}
```

### Check Error Logs

```bash
# View recent errors
tail -f /home/bone/oldschoolempire/logs/errors.log | jq .

# Run analysis script
/home/bone/oldschoolempire/scripts/analyze-errors.sh
```

### Check Redis Status

```bash
sudo docker exec empire-redis redis-cli INFO replication | grep role
# Expected: role:master (NOT role:slave)

sudo docker exec empire-redis redis-cli CONFIG GET save
# Expected: save and "" (empty = persistence disabled)
```

---

## Rollback

If issues occur, you can rollback:

```bash
# Restore original service files from git
git checkout infra/systemd/prod_backend.service
git checkout infra/systemd/backend.service

# Reload and restart
systemctl --user daemon-reload
systemctl --user restart prod_backend
```

---

## Monitoring Commands

```bash
# Live server logs
journalctl --user -u prod_backend -f

# Live error logs
tail -f /home/bone/oldschoolempire/logs/errors.log | jq .

# Error analysis
/home/bone/oldschoolempire/scripts/analyze-errors.sh

# Redis health check
sudo docker exec empire-redis redis-cli SET test_key "test" && echo "✅ Writable"
```

