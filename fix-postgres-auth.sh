#!/bin/bash
# Fix PostgreSQL authentication for the empire user

echo "🔧 Fixing PostgreSQL authentication..."

# Check if user exists, create if not
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='empire';" | grep -q 1
if [ $? -ne 0 ]; then
    echo "Creating user 'empire'..."
    sudo -u postgres psql -c "CREATE USER empire WITH PASSWORD 'empire_dev_password';"
else
    echo "User 'empire' already exists, updating password..."
    sudo -u postgres psql -c "ALTER USER empire WITH PASSWORD 'empire_dev_password';"
fi

# Create database if it doesn't exist
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='empire';" | grep -q 1
if [ $? -ne 0 ]; then
    echo "Creating database 'empire'..."
    sudo -u postgres psql -c "CREATE DATABASE empire OWNER empire;"
else
    echo "Database 'empire' already exists"
fi

# Grant all privileges
echo "Granting privileges..."
sudo -u postgres psql -c "ALTER USER empire CREATEDB;"  # Allow creating shadow database for migrations
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE empire TO empire;"
sudo -u postgres psql -d empire -c "GRANT ALL ON SCHEMA public TO empire;"
sudo -u postgres psql -d empire -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO empire;"
sudo -u postgres psql -d empire -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO empire;"

# Test connection with password
echo ""
echo "Testing connection..."
PGPASSWORD=empire_dev_password psql -U empire -d empire -h localhost -c "SELECT version();" 2>&1 | head -3

if [ $? -eq 0 ]; then
    echo "✅ Connection successful!"
    echo ""
    echo "🔧 Running migrations..."
    cd /home/bone/oldschoolempire/server
    npm run prisma:migrate
    echo ""
    echo "✅ Setup complete! Try registering now."
else
    echo "❌ Connection failed. Checking pg_hba.conf..."
    echo "You may need to configure PostgreSQL to allow password authentication."
    echo "Edit /etc/postgresql/16/main/pg_hba.conf and ensure this line exists:"
    echo "host    all             all             127.0.0.1/32            md5"
fi

