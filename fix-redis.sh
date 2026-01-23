#!/bin/bash
# Fix Redis read-only replica issue
# This script ONLY touches Redis - PostgreSQL database is completely safe

set -e  # Exit on error

echo "🔧 Fixing Redis read-only replica issue..."
echo "⚠️  This will reset Redis (job queues, Socket.IO state)"
echo "✅ PostgreSQL database will NOT be touched"
echo ""

cd /home/bone/oldschoolempire/infra

# Stop only Redis (PostgreSQL stays running)
echo "1. Stopping Redis container..."
sudo docker compose stop redis

# Remove only Redis volume (PostgreSQL volume stays intact)
echo "2. Removing Redis data volume..."
sudo docker volume rm infra_redis_data 2>/dev/null || echo "   (Volume may not exist, that's okay)"

# Start Redis fresh
echo "3. Starting fresh Redis instance..."
sudo docker compose up -d redis

# Wait a moment for Redis to start
sleep 2

# Verify Redis is running
echo "4. Verifying Redis is running..."
if sudo docker compose ps redis | grep -q "Up"; then
    echo "✅ Redis is running!"
    echo ""
    echo "5. Testing Redis write capability..."
    if sudo docker exec empire-redis redis-cli SET test_key "test_value" > /dev/null 2>&1; then
        sudo docker exec empire-redis redis-cli DEL test_key > /dev/null 2>&1
        echo "✅ Redis is writable!"
    else
        echo "❌ Redis still read-only - may need manual intervention"
        exit 1
    fi
else
    echo "❌ Redis failed to start"
    exit 1
fi

echo ""
echo "✅ Redis fix complete!"
echo "🔄 Restarting backend services..."
systemctl --user restart prod_backend backend

echo ""
echo "✅ Done! Backend services should start successfully now."
echo "📊 Check status with: systemctl --user status prod_backend"
