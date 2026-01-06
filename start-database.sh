#!/bin/bash
# Script to start the database and run migrations

echo "🔴 Starting PostgreSQL database..."
cd /home/bone/oldschoolempire/infra
sudo docker compose up -d

echo "⏳ Waiting for database to be ready..."
sleep 5

echo "📊 Checking if database is running..."
sudo docker ps | grep postgres

echo "🔧 Running database migrations..."
cd /home/bone/oldschoolempire/server
npm run prisma:migrate

echo "✅ Done! Database should be ready."
echo "Now try registering again in your browser!"






