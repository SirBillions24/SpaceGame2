#!/bin/bash
# Redis Health Monitor and Auto-Fix Script
# This script checks Redis status and automatically fixes read-only issues

set -e

REDIS_CONTAINER="empire-redis"
LOG_FILE="/home/bone/oldschoolempire/redis-monitor.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_redis() {
    # Check if Redis container is running
    if ! sudo docker ps | grep -q "$REDIS_CONTAINER"; then
        log "❌ Redis container is not running!"
        return 1
    fi

    # Check if Redis is writable
    if sudo docker exec "$REDIS_CONTAINER" redis-cli SET monitor_test_key "test" > /dev/null 2>&1; then
        sudo docker exec "$REDIS_CONTAINER" redis-cli DEL monitor_test_key > /dev/null 2>&1
        log "✅ Redis is healthy and writable"
        return 0
    else
        log "❌ Redis is read-only or not responding!"
        return 1
    fi
}

fix_redis() {
    log "🔧 Attempting to fix Redis..."
    cd /home/bone/oldschoolempire/infra
    
    # Stop Redis
    sudo docker compose stop redis
    
    # Remove corrupted volume
    sudo docker volume rm infra_redis_data 2>/dev/null || true
    
    # Start fresh
    sudo docker compose up -d redis
    sleep 3
    
    # Verify fix
    if check_redis; then
        log "✅ Redis fixed successfully!"
        # Restart backend
        systemctl --user restart prod_backend backend
        log "✅ Backend services restarted"
        return 0
    else
        log "❌ Failed to fix Redis"
        return 1
    fi
}

# Main execution
if ! check_redis; then
    log "⚠️  Redis health check failed, attempting fix..."
    if fix_redis; then
        log "✅ Redis monitoring and fix completed successfully"
        exit 0
    else
        log "❌ Redis fix failed - manual intervention required"
        exit 1
    fi
fi

exit 0
