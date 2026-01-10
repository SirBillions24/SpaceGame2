import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { syncPlanetResources } from '../services/planetService';

const router = Router();

// Environment variable to control dev routes access
// Default: enabled for alpha testing. Set ENABLE_DEV_ROUTES=false to disable.
const devRoutesEnabled = process.env.ENABLE_DEV_ROUTES !== 'false';

if (!devRoutesEnabled) {
    console.log('🔒 Dev routes are disabled (ENABLE_DEV_ROUTES=false)');
    router.all('*', (_req, res: Response) => {
        res.status(404).json({ error: 'Not found' });
    });
} else {
    console.log('⚠️ Dev routes are ENABLED - set ENABLE_DEV_ROUTES=false to disable');

    // Add resources to a planet
    router.post('/add-resources', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId, amount } = req.body;

            if (!planetId || amount === undefined) {
                return res.status(400).json({ error: 'Missing parameters' });
            }

            // Validate ownership (for now, everyone can use dev tools)
            const planet = await prisma.planet.findUnique({ where: { id: planetId } });
            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            const updated = await prisma.planet.update({
                where: { id: planetId },
                data: {
                    carbon: { increment: amount },
                    titanium: { increment: amount },
                    food: { increment: amount },
                    credits: { increment: amount },
                }
            });

            res.json({ message: 'Resources added', resources: { carbon: updated.carbon, titanium: updated.titanium, food: updated.food, credits: updated.credits } });
        } catch (error) {
            console.error('Dev resource error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Fast-forward all timers on a planet
    router.post('/fast-forward', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId } = req.body;

            if (!planetId) {
                return res.status(400).json({ error: 'Missing planetId' });
            }

            const planet = await prisma.planet.findUnique({
                where: { id: planetId },
                include: {
                    units: true
                }
            });

            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            // 1. Instantly complete building construction
            const buildUpdate = planet.isBuilding ? {
                buildFinishTime: new Date()
            } : {};

            // 2. Instantly complete recruitment queue
            let recruitmentQueue = [];
            if (planet.recruitmentQueue) {
                try {
                    recruitmentQueue = JSON.parse(planet.recruitmentQueue as any);
                    recruitmentQueue = recruitmentQueue.map((item: any) => ({
                        ...item,
                        finishTime: new Date().toISOString()
                    }));
                } catch (e) { }
            }

            // 3. Instantly complete manufacturing queue
            let manufacturingQueue = [];
            if (planet.manufacturingQueue) {
                try {
                    manufacturingQueue = JSON.parse(planet.manufacturingQueue as any);
                    manufacturingQueue = manufacturingQueue.map((item: any) => ({
                        ...item,
                        finishTime: new Date().toISOString()
                    }));
                } catch (e) { }
            }

            // 4. Instantly complete turret construction queue
            let turretQueue = [];
            if ((planet as any).turretConstructionQueue) {
                try {
                    turretQueue = JSON.parse((planet as any).turretConstructionQueue);
                    turretQueue = turretQueue.map((item: any) => ({
                        ...item,
                        finishTime: new Date().toISOString()
                    }));
                } catch (e) { }
            }

            await prisma.planet.update({
                where: { id: planetId },
                data: {
                    ...buildUpdate,
                    recruitmentQueue: recruitmentQueue.length > 0 ? JSON.stringify(recruitmentQueue) : planet.recruitmentQueue,
                    manufacturingQueue: manufacturingQueue.length > 0 ? JSON.stringify(manufacturingQueue) : planet.manufacturingQueue,
                    turretConstructionQueue: turretQueue.length > 0 ? JSON.stringify(turretQueue) : (planet as any).turretConstructionQueue
                }
            });

            // Trigger sync to process the newly "finished" timers
            const finalPlanet = await syncPlanetResources(planetId);

            res.json({ message: 'All timers fast-forwarded', planet: finalPlanet });
        } catch (error) {
            console.error('Dev fast-forward error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

export default router;
