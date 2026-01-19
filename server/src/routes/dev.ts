import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { syncPlanetResources } from '../services/planetService';
import { BUILDING_DATA } from '../constants/buildingData';

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

    // Add resources to a planet (local resources) and global currencies to user
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

            // Update local planet resources
            const updated = await prisma.planet.update({
                where: { id: planetId },
                data: {
                    carbon: { increment: amount },
                    titanium: { increment: amount },
                    food: { increment: amount },
                }
            });

            // Update global user resources (credits are now on User)
            const user = await prisma.user.update({
                where: { id: userId },
                data: {
                    credits: { increment: amount },
                }
            });

            res.json({
                message: 'Resources added',
                resources: { carbon: updated.carbon, titanium: updated.titanium, food: updated.food },
                globalCredits: user.credits
            });
        } catch (error) {
            console.error('Dev resource error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Add Dark Matter to user
    router.post('/add-dark-matter', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { amount } = req.body;

            const user = await prisma.user.update({
                where: { id: userId },
                data: { darkMatter: { increment: amount || 1000 } }
            });

            res.json({ message: 'Dark Matter added', darkMatter: user.darkMatter });
        } catch (error) {
            console.error('Dev dark matter error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Instant max upgrade a building
    router.post('/max-upgrade-building', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId, buildingId } = req.body;

            if (!planetId || !buildingId) {
                return res.status(400).json({ error: 'Missing parameters' });
            }

            const planet = await prisma.planet.findUnique({
                where: { id: planetId },
                include: { buildings: true }
            });

            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            const building = planet.buildings.find(b => b.id === buildingId);
            if (!building) {
                return res.status(404).json({ error: 'Building not found' });
            }

            const buildingData = BUILDING_DATA[building.type];
            if (!buildingData) {
                return res.status(400).json({ error: 'Unknown building type' });
            }

            const maxLevel = Math.max(...Object.keys(buildingData.levels).map(Number));

            await prisma.building.update({
                where: { id: buildingId },
                data: { level: maxLevel, status: 'active' }
            });

            // Update defensive building levels if applicable
            if (building.type === 'canopy_generator') {
                await prisma.planet.update({
                    where: { id: planetId },
                    data: { energyCanopyLevel: maxLevel }
                });
            }
            if (building.type === 'orbital_minefield') {
                await prisma.planet.update({
                    where: { id: planetId },
                    data: { orbitalMinefieldLevel: maxLevel }
                });
            }
            if (building.type === 'docking_hub') {
                await prisma.planet.update({
                    where: { id: planetId },
                    data: { dockingHubLevel: maxLevel }
                });
            }

            res.json({ message: `${buildingData.name} upgraded to level ${maxLevel}` });
        } catch (error) {
            console.error('Dev max upgrade error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Toggle Free Build mode for a user (stored in session/memory for simplicity)
    const freeBuildUsers = new Set<string>();

    router.post('/toggle-free-build', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const isEnabled = freeBuildUsers.has(userId);

            if (isEnabled) {
                freeBuildUsers.delete(userId);
                res.json({ message: 'Free Build mode DISABLED', freeBuildEnabled: false });
            } else {
                freeBuildUsers.add(userId);
                res.json({ message: 'Free Build mode ENABLED', freeBuildEnabled: true });
            }
        } catch (error) {
            console.error('Dev free build error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/free-build-status', authenticateToken, async (req: AuthRequest, res: Response) => {
        const userId = req.userId!;
        res.json({ freeBuildEnabled: freeBuildUsers.has(userId) });
    });

    // Export for use by other services
    (global as any).isFreeBuildEnabled = (userId: string) => freeBuildUsers.has(userId);

    // Add units directly (for testing combat)
    router.post('/add-units', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId, unitType, count } = req.body;

            if (!planetId || !unitType || !count) {
                return res.status(400).json({ error: 'Missing parameters' });
            }

            const planet = await prisma.planet.findUnique({ where: { id: planetId } });
            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            await prisma.planetUnit.upsert({
                where: { planetId_unitType: { planetId, unitType } },
                update: { count: { increment: count } },
                create: { planetId, unitType, count }
            });

            res.json({ message: `Added ${count} ${unitType}` });
        } catch (error) {
            console.error('Dev add units error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Add all unit types at once
    router.post('/add-army', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId, count } = req.body;

            if (!planetId) {
                return res.status(400).json({ error: 'Missing planetId' });
            }

            const planet = await prisma.planet.findUnique({ where: { id: planetId } });
            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            // Use unit types from the official UNIT_DATA constant
            const { UNIT_DATA } = await import('../constants/unitData');
            const unitTypes = Object.keys(UNIT_DATA);
            const unitCount = count || 100;

            for (const unitType of unitTypes) {
                await prisma.planetUnit.upsert({
                    where: { planetId_unitType: { planetId, unitType } },
                    update: { count: { increment: unitCount } },
                    create: { planetId, unitType, count: unitCount }
                });
            }

            res.json({ message: `Added ${unitCount} of each unit type` });
        } catch (error) {
            console.error('Dev add army error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Clean up invalid units (remove old unit types that no longer exist)
    router.post('/clean-units', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { planetId } = req.body;

            if (!planetId) {
                return res.status(400).json({ error: 'Missing planetId' });
            }

            const planet = await prisma.planet.findUnique({ where: { id: planetId } });
            if (!planet || planet.ownerId !== userId) {
                return res.status(403).json({ error: 'You do not own this planet' });
            }

            // Get current valid unit types
            const { UNIT_DATA } = await import('../constants/unitData');
            const validUnitTypes = new Set(Object.keys(UNIT_DATA));

            // Get all units on the planet
            const planetUnits = await prisma.planetUnit.findMany({
                where: { planetId }
            });

            // Find invalid units
            const invalidUnits = planetUnits.filter(u => !validUnitTypes.has(u.unitType));
            const validUnits = planetUnits.filter(u => validUnitTypes.has(u.unitType));

            // Delete invalid units
            if (invalidUnits.length > 0) {
                await prisma.planetUnit.deleteMany({
                    where: {
                        planetId,
                        unitType: { in: invalidUnits.map(u => u.unitType) }
                    }
                });
            }

            res.json({
                message: `Cleaned ${invalidUnits.length} invalid unit types`,
                removed: invalidUnits.map(u => ({ type: u.unitType, count: u.count })),
                remaining: validUnits.map(u => ({ type: u.unitType, count: u.count })),
                validUnitTypes: Array.from(validUnitTypes)
            });
        } catch (error) {
            console.error('Dev clean units error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Level up user
    router.post('/level-up', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.userId!;
            const { levels } = req.body;

            const user = await prisma.user.update({
                where: { id: userId },
                data: { level: { increment: levels || 10 } }
            });

            res.json({ message: `Leveled up to ${user.level}`, level: user.level });
        } catch (error) {
            console.error('Dev level up error:', error);
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
