# Old School Empire

A browser-based, persistent, multiplayer strategy game with a deep sci-fi economy and tactical combat.

## Project Structure

- `server/` - Backend API (Node.js + Express + TypeScript)
- `client/` - Frontend (React + PixiJS)
- `infra/` - Infrastructure (Docker Compose, database configs)

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- npm or yarn

### Setup

1. Start the database:
   ```bash
   cd infra
   docker compose up -d
   ```

2. Set up the backend:
   ```bash
   cd server
   npm install
   npx prisma migrate dev
   npm run dev
   ```

3. Set up the frontend:
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Development Roadmap

- [x] Project skeleton
- [x] Database setup
- [x] Backend health check
- [x] Database schema
- [x] Authentication
- [x] Castle spawning
- [x] World state endpoint
- [ ] Map UI
- [ ] March system
- [ ] Combat mechanics
- [ ] Reports & notifications






