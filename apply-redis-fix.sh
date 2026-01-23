#!/bin/bash
# Apply Redis persistence fix
# This will restart Redis with persistence disabled to prevent midnight crashes

set -e

echo "🔧 Applying Redis persistence fix..."
echo "This will disable Redis persistence to prevent read-only replica issues"
echo ""

cd /home/bone/oldschoolempire/infra

# Stop Redis
echo "1. Stopping Redis container..."
sudo docker compose stop redis

# Remove the volume with corrupted persistence data
echo "2. Removing Redis data volume (contains corrupted persistence files)..."
sudo docker volume rm infra_redis_data 2>/dev/null || echo "   (Volume may not exist)"

# Start Redis with new configuration (persistence disabled)
echo "3. Starting Redis with persistence disabled..."
sudo docker compose up -d redis

# Wait for Redis to start
sleep 3

# Verify Redis is running and writable
echo "4. Verifying Redis is healthy..."
if sudo docker exec empire-redis redis-cli SET test_key "test" > /dev/null 2>&1; then
    sudo docker exec empire-redis redis-cli DEL test_key > /dev/null 2>&1
    echo "✅ Redis is writable!"
    
    # Check persistence is disabled
    echo ""
    echo "5. Verifying persistence is disabled..."
    SAVE_CONFIG=$(sudo docker exec empire-redis redis-cli CONFIG GET save 2>&1 | grep -v "^save$" | tail -1)
    AOF_CONFIG=$(sudo docker exec empire-redis redis-cli CONFIG GET appendonly 2>&1 | grep -v "^appendonly$" | tail -1)
    
    if [ "$SAVE_CONFIG" = '""' ] && [ "$AOF_CONFIG" = "no" ]; then
        echo "✅ Persistence is disabled (save: $SAVE_CONFIG, appendonly: $AOF_CONFIG)"
    else
        echo "⚠️  Warning: Persistence may still be enabled (save: $SAVE_CONFIG, appendonly: $AOF_CONFIG)"
    fi
else
    echo "❌ Redis is still not writable!"
    exit 1
fi

# Restart backend services
echo ""
echo "6. Restarting backend services..."
systemctl --user restart prod_backend backend

echo ""
echo "✅ Fix applied successfully!"
echo ""
echo "📊 Redis will no longer save snapshots, preventing midnight crashes"
echo "⚠️  Note: Job queue data is ephemeral (this is safe - game data is in PostgreSQL)"
