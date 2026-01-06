#!/bin/bash
# Script to set up the existing PostgreSQL instance for the game

echo "🔧 Setting up existing PostgreSQL database..."

# Create user (will fail if already exists, that's ok)
sudo -u postgres psql -c "CREATE USER empire WITH PASSWORD 'empire_dev_password';" 2>/dev/null || echo "User 'empire' may already exist"

# Create database (will fail if already exists, that's ok)
sudo -u postgres psql -c "CREATE DATABASE empire OWNER empire;" 2>/dev/null || echo "Database 'empire' may already exist"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE empire TO empire;" 2>/dev/null

# Grant schema privileges
sudo -u postgres psql -d empire -c "GRANT ALL ON SCHEMA public TO empire;" 2>/dev/null

echo "✅ Database setup complete!"
echo ""
echo "🔧 Running migrations..."
cd /home/bone/oldschoolempire/server
npm run prisma:migrate

echo ""
echo "✅ Done! Try registering again in your browser!"





