#!/bin/bash

# Dread Horizon - Easy Deploy to Prod
# This script builds your current dev code and pushes it to the stable production environment.

echo "🚀 Deploying to Production (dreadhorizon.com)..."

# 1. Build Client (Frontend)
echo "📦 Building Client..."
cd /home/bone/oldschoolempire/client
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Client build failed!"
    exit 1
fi

# 2. Build Server (Backend)
echo "📦 Building Server..."
cd /home/bone/oldschoolempire/server
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Server build failed!"
    exit 1
fi

# 3. Restart Production Service
echo "🔄 Restarting Production Backend..."
systemctl --user restart prod_backend

echo "✅ DEPLOYMENT COMPLETE!"
echo "👉 Verify at https://dreadhorizon.com"
