# Redis Failure Diagnosis

## Root Cause
Redis is entering read-only replica mode around midnight due to **RDB snapshot failures**.

## Why It's Happening Now
1. **Redis default persistence**: Redis 7 saves RDB snapshots periodically
2. **Midnight snapshots**: Default Redis config triggers snapshots at specific times (including midnight)
3. **Snapshot failures**: When disk I/O fails, disk fills, or filesystem issues occur during snapshot, Redis enters read-only mode to prevent data corruption
4. **Why it worked for 2+ weeks**: The Redis data volume accumulated enough data/changes that snapshots started failing

## Evidence
- Error: `instance state changed (master -> replica?)` at 00:30:35
- Pattern: Fails consistently around midnight
- Fix: Resetting Redis volume clears the issue temporarily

## Solution Applied
Updated `docker-compose.yml` to disable Redis persistence:
- `--appendonly no` - Disables AOF (Append-Only File)
- `--save ""` - Disables RDB snapshots
- `restart: unless-stopped` - Auto-restart on failure

## Next Steps
1. **Apply the fix**: Restart Redis with new configuration
2. **Monitor**: Set up health checks to detect read-only mode early
3. **Alternative**: If persistence is needed, use Redis Sentinel or external backups

## Why This Is Safe
- Job queue data is ephemeral (can be regenerated)
- Socket.IO state is ephemeral (clients reconnect)
- Game state is in PostgreSQL (not affected)
- Only temporary queue data is lost (fleet arrivals will be re-queued)
