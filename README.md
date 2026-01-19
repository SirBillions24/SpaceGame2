# Dread Horizon

A browser-based, persistent, multiplayer strategy game inspired by classic empire-building games like Goodgame Empire. Features deep sci-fi economy, tactical 3-sector combat with tools and admirals, and procedural NPC raider bases.

## 🎮 Game Features

### Core Gameplay
- **Colonize Planets**: Expand your grid-based colony with buildings that generate resources
- **Build Economy**: Carbon, Titanium, Food, Credits - manage resources strategically
- **Train Military**: Marines, Rangers, Sentinels, Armored Units - each with unique stats
- **Research & Upgrades**: Unlock higher-tier buildings and units

### Combat System
- **3-Sector Warfare**: Deploy forces across Front, Left, and Right sectors
- **Multi-Wave Attacks**: Configure wave-based assault strategies
- **Combat Tools**: Breach Pods, Plasma Grenades, Auto Turrets
- **Admiral System**: Equip gear, earn bonuses, lead your fleets
- **Defense Layout**: Position turrets and defensive structures

### Advanced Features
- **Espionage**: Launch probes to scout enemy defenses
- **PVE Raider Bases**: Attack procedurally generated NPC targets
- **Fleet Operations**: Send attack, support, or scout missions
- **Battle Reports**: Detailed combat logs with sector breakdowns
- **Tax System**: Balance population happiness with revenue

---

## 🏗️ Project Structure

```
dread-horizon/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/   # UI components
│       ├── lib/          # API client, utilities
│       └── assets/       # Images, icons
├── server/          # Node.js + Express + TypeScript backend
│   └── src/
│       ├── routes/       # API endpoints
│       ├── services/     # Business logic
│       ├── workers/      # BullMQ job workers
│       ├── lib/          # Database, queue config
│       ├── middleware/   # Auth, validation, rate limiting
│       └── schemas/      # Zod validation schemas
├── infra/           # Docker Compose for Postgres + Redis
├── project_review/  # Architecture review documents
└── JOB_QUEUE.md     # Job queue system documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker & Docker Compose** (for Postgres and Redis)
- **Node.js 18+**
- **npm**

### Quick Start

```bash
# 1. Start infrastructure (Postgres + Redis)
cd infra
sudo docker compose up -d

# 2. Set up backend
cd ../server
npm install
npx prisma db push    # Apply schema to database
npm run dev           # Start server (requires Redis!)

# 3. Set up frontend (new terminal)
cd ../client
npm install
npm run dev

# 4. Open browser
# Frontend: http://localhost:5173
# API: http://localhost:3000
```

### Running in the Background (Recommended)

To run the frontend and backend in the background so you can close your terminal, use the provided `systemd` user services. These handle auto-restarts and log rotation automatically.

**Management Commands:**
```bash
# Start both services
systemctl --user start frontend backend

# Restart services (useful after code changes if not auto-detected)
systemctl --user restart frontend backend

# Check status
systemctl --user status frontend backend

# Stop services
systemctl --user stop frontend backend
```

**Viewing Logs:**
Logs are managed by `journald` and will not fill up your disk.
```bash
# Tail frontend logs
journalctl --user -u frontend -f

# Tail backend logs
journalctl --user -u backend -f
```

### Environment Variables

Create `server/.env`:
```env
DATABASE_URL=postgresql://empire:empire_dev_password@localhost:5432/empire
JWT_SECRET=your-secret-key-here
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 🔧 Development

### Running the Server

The server requires Redis for the job queue. There is no fallback mode.

```bash
# Make sure Redis is running!
sudo docker compose -f infra/docker-compose.yml up -d redis

# Start server
cd server && npm run dev
```

### Testing

```bash
# Job queue integration tests
cd server
npx ts-node src/scripts/testJobQueue.ts

# Custom game logic tests
npx ts-node src/scripts/verifyCombat.ts
npx ts-node src/scripts/verifyEconomy.ts
```

### Database Operations

```bash
# Reset database (wipes all data!)
cd server
npx prisma db push --force-reset

# View database
npx prisma studio
```

---

## 📦 Architecture

### Backend Stack
- **Express.js** - HTTP API
- **Prisma** - PostgreSQL ORM
- **BullMQ** - Redis-based job queue
- **Zod** - Request validation
- **JWT** - Authentication

### Frontend Stack
- **React 18** - UI framework
- **Vite** - Build tool
- **PixiJS** - Galaxy map rendering
- **TanStack Query** - Data fetching

### Job Queue System

Fleet arrivals, combat resolution, and loot transfers are processed asynchronously via BullMQ workers. See `JOB_QUEUE.md` for details.

```
API Server → Redis Queue → Game Events Worker → Database
```

Workers can run:
- **In-process**: Alongside the main server
- **Standalone**: As separate processes for horizontal scaling

---

## 🛡️ Security Features

- **Rate Limiting**: Global (300/min), Auth (10/15min), Actions (60/min)
- **Input Validation**: Zod schemas on all endpoints
- **Atomic Transactions**: Prisma transactions for resource operations
- **Data Sanitization**: Defense visibility tiers, no password hash leaks
- **Dev Route Control**: `ENABLE_DEV_ROUTES=false` to disable

---

## 📚 Documentation

| Document | Purpose |
|:---------|:--------|
| `JOB_QUEUE.md` | Job queue system, distributed workers, scaling |
| `DEVELOPER_QUICKSTART.md` | Getting started for developers |
| `UI_USER_GUIDE.md` | Frontend UI documentation |
| `game_vision.md` | Original game design document |
| `project_review/` | Architecture review and implementation plan |

---

## 🎯 Roadmap

### Completed ✅
- Core economy loop (resources, buildings, units)
- 3-sector combat system with tools and waves
- Admiral gear system
- Espionage and probing
- PVE raider bases
- BullMQ job queue
- Security hardening (rate limiting, validation, transactions)
- Database indexing

### Planned 🔲
- PVE respawn cooldowns
- WebSocket real-time updates
- Alliance system
- Trade routes
- Mobile-responsive UI

---

## 🤝 Contributing

This is an early alpha project. Key areas for contribution:
- Converting test scripts to Vitest
- UI/UX improvements
- Game balance tuning
- Performance optimization

---

## 📞 Support

For development questions, see the `project_review/` directory for architecture decisions and implementation rationale.
