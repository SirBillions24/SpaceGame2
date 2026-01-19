# Dread Horizon - Deployment & Infrastructure Guide

## Overview

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Production** | `https://dreadhorizon.com` | Beta testers / Live game |
| **Development** | `http://localhost:5173` or `https://dev.dreadhorizon.com` | Your coding sandbox |

---

## Architecture

```
                    Internet
                       │
                       ▼
                ┌─────────────┐
                │    Nginx    │  (Port 80/443)
                │   + SSL     │
                └──────┬──────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   Static Files    /api proxy    /socket.io proxy
   (client/dist)       │              │
                       ▼              ▼
                ┌─────────────────────────┐
                │  prod_backend (Port 3000)│  ← Stable, for users
                └─────────────────────────┘

   [Your Dev Machine]
        │
        ▼
   localhost:5173  ──proxy──▶  backend (Port 3001)  ← Auto-restarts on code changes
```

---

## Systemd Services

All services run as **user services** (no root required).

| Service | Port | Command | Purpose |
|---------|------|---------|---------|
| `prod_backend` | 3000 | `npm start` | **Stable** production backend |
| `backend` | 3001 | `npm run dev` | Development backend (nodemon) |
| `frontend` | 5173 | `npm run dev` | Vite dev server |

### Common Commands

```bash
# Check status of all services
systemctl --user status prod_backend backend frontend

# Restart a single service
systemctl --user restart prod_backend

# View logs (live)
journalctl --user -u prod_backend -f

# Stop a service
systemctl --user stop backend
```

---

## Daily Development Workflow

### 1. Start Coding
Your dev services should already be running. If not:
```bash
systemctl --user start backend frontend
```

### 2. Access Dev Environment
Open `http://localhost:5173` in your browser.
- Frontend changes: **Instant** (Vite hot reload)
- Backend changes: **~2 seconds** (nodemon restarts)

### 3. Deploy to Production
When you're happy with your changes:
```bash
./deploy_to_prod.sh
```

This script:
1. Builds optimized client assets (`npm run build` in client/)
2. Compiles TypeScript server (`npm run build` in server/)
3. Restarts `prod_backend` service

**Downtime**: ~5 seconds (socket reconnects automatically)

---

## File Locations

| What | Path |
|------|------|
| Frontend source | `client/src/` |
| Backend source | `server/src/` |
| Production frontend build | `client/dist/` |
| Production backend build | `server/dist/` |
| Nginx configs | `infra/nginx/` |
| Systemd services | `infra/systemd/` |
| Deploy script | `deploy_to_prod.sh` |

---

## Nginx Configuration

Config files are in `infra/nginx/` and symlinked to `/etc/nginx/sites-enabled/`.

### Production (`dreadhorizon`)
- Serves static files from `client/dist`
- Proxies `/api/*` to `localhost:3000`
- Proxies `/socket.io/*` to `localhost:3000`
- SSL via Let's Encrypt (auto-renews)

### Development (`dev.dreadhorizon`)
- Proxies everything to `localhost:5173` (Vite dev server)
- Vite then proxies `/api` to `localhost:3001`

### Reload Nginx After Config Changes
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## SSL Certificates

Managed by **Certbot** (Let's Encrypt). Auto-renews every 60 days.

```bash
# Check certificate status
sudo certbot certificates

# Force renewal (if needed)
sudo certbot renew --force-renewal

# Add a new domain
sudo certbot --nginx -d newdomain.com
```

---

## Troubleshooting

### Site shows old version
```bash
./deploy_to_prod.sh   # Rebuild and restart
```

### 502 Bad Gateway
Backend is down. Check:
```bash
systemctl --user status prod_backend
journalctl --user -u prod_backend -n 50
```

### 500 Internal Server Error (Nginx)
Usually permissions. Check:
```bash
sudo tail -n 20 /var/log/nginx/error.log
```

### Mixed Content Error (HTTPS)
The `.env` file has a hardcoded `http://` URL. Fix:
```bash
# client/.env should contain:
VITE_API_URL=/api
```
Then redeploy.

### Database Issues
```bash
cd server
npx prisma studio   # Visual DB browser
npx prisma migrate reset   # ⚠️ DESTROYS DATA - resets DB
```

---

## Hotfixes (Emergency Production Edits)

If you need to patch production **without** going through dev:

```bash
# 1. Edit the source file directly
nano server/src/path/to/file.ts

# 2. Rebuild and restart
./deploy_to_prod.sh
```

> ⚠️ **Warning**: This skips testing. Only for critical fixes.

---

## Adding New Features Checklist

1. [ ] Code the feature in dev (`localhost:5173`)
2. [ ] Test thoroughly in dev environment
3. [ ] Run `./deploy_to_prod.sh`
4. [ ] Verify on `https://dreadhorizon.com`
5. [ ] Commit your changes to git

---

## Backups

### Database
```bash
# Export current database
pg_dump dreadhorizon > backup_$(date +%Y%m%d).sql

# Restore from backup
psql dreadhorizon < backup_20260118.sql
```

### Code
```bash
git add -A && git commit -m "Backup before major change"
git push origin main
```

---

## Ports Reference

| Port | Service | Access |
|------|---------|--------|
| 80 | Nginx HTTP | Public (redirects to 443) |
| 443 | Nginx HTTPS | Public |
| 3000 | prod_backend | Internal only |
| 3001 | backend (dev) | Internal only |
| 5173 | Vite dev server | Internal only |
| 5432 | PostgreSQL | Internal only |

---

## Quick Reference Card

```bash
# ═══════════════════════════════════════════════════
#  DREAD HORIZON - QUICK COMMANDS
# ═══════════════════════════════════════════════════

# Deploy to production
./deploy_to_prod.sh

# Check all services
systemctl --user status prod_backend backend frontend

# Restart production backend
systemctl --user restart prod_backend

# View production logs
journalctl --user -u prod_backend -f

# View Nginx errors
sudo tail -f /var/log/nginx/error.log

# Reload Nginx config
sudo nginx -t && sudo systemctl reload nginx
```
