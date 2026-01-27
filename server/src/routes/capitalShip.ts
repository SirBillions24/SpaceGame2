/**
 * Capital Ship Routes
 * 
 * API endpoints for Capital Ship management:
 * - GET  /capitalship           - Get user's Capital Ships
 * - GET  /capitalship/visible   - Get all deployed Capital Ships (for map)
 * - GET  /capitalship/:id       - Get specific Capital Ship
 * - POST /capitalship/build     - Start construction
 * - POST /capitalship/:id/donate - Donate resources to build/repair
 * - POST /capitalship/:id/deploy - Deploy to location
 * - POST /capitalship/:id/recall - Begin return journey
 * - POST /capitalship/:id/repair - Start repair after cooldown
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
    startConstruction,
    donateToConstruction,
    deployCapitalShip,
    recallCapitalShip,
    startRepair,
    repairHpDamage,
    loadCapitalShip,
    getUserCapitalShips,
    getAllDeployedCapitalShips,
    getCapitalShip,
    canBuildCapitalShip,
    formatForSocket,
} from '../services/capitalShipService';
import { CAPITAL_SHIP_CONFIG, getPhaseCost, getTotalCost, getHpRepairCost } from '../constants/capitalShipConfig';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// =============================================================================
// GET ROUTES
// =============================================================================

/**
 * GET /capitalship
 * Get all Capital Ships owned by the user
 */
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const ships = await getUserCapitalShips(userId);
        const buildStatus = await canBuildCapitalShip(userId);

        res.json({
            ships: ships.map(formatForSocket),
            slots: buildStatus.slots,
            used: buildStatus.used,
            canBuild: buildStatus.allowed,
            config: {
                commitmentOptions: CAPITAL_SHIP_CONFIG.deployment.commitmentOptions,
                constructionCost: getTotalCost(false),
                repairCost: getTotalCost(true),
            },
        });
    } catch (error: any) {
        console.error('Error fetching Capital Ships:', error);
        res.status(500).json({ error: 'Failed to fetch Capital Ships' });
    }
});

/**
 * GET /capitalship/visible
 * Get all deployed Capital Ships for map display
 */
router.get('/visible', async (req: AuthRequest, res: Response) => {
    try {
        const ships = await getAllDeployedCapitalShips();
        res.json({ ships: ships.map(formatForSocket) });
    } catch (error: any) {
        console.error('Error fetching visible Capital Ships:', error);
        res.status(500).json({ error: 'Failed to fetch visible Capital Ships' });
    }
});

/**
 * GET /capitalship/:id
 * Get a specific Capital Ship
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const ship = await getCapitalShip(id);

        if (!ship) {
            return res.status(404).json({ error: 'Capital Ship not found' });
        }

        res.json({ ship: formatForSocket(ship) });
    } catch (error: any) {
        console.error('Error fetching Capital Ship:', error);
        res.status(500).json({ error: 'Failed to fetch Capital Ship' });
    }
});

// =============================================================================
// POST ROUTES
// =============================================================================

/**
 * POST /capitalship/build
 * Start construction of a new Capital Ship
 */
router.post('/build', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { fromPlanetId } = req.body;

        if (!fromPlanetId) {
            return res.status(400).json({ error: 'fromPlanetId is required' });
        }

        const result = await startConstruction(userId, fromPlanetId);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            phaseCost: getPhaseCost(1, false),
            message: 'Capital Ship construction started. Donate resources to complete each phase.',
        });
    } catch (error: any) {
        console.error('Error starting Capital Ship construction:', error);
        res.status(500).json({ error: 'Failed to start construction' });
    }
});

/**
 * POST /capitalship/:id/donate
 * Donate resources to construction or repair
 */
router.post('/:id/donate', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { fromPlanetId, donation } = req.body;

        if (!fromPlanetId || !donation) {
            return res.status(400).json({ error: 'fromPlanetId and donation are required' });
        }

        const result = await donateToConstruction(userId, id, fromPlanetId, donation);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const progress = result.capitalShip.buildProgress;
        const nextPhaseCost = !result.constructionComplete && progress
            ? getPhaseCost(progress.phase, progress.isRepair)
            : null;

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            phaseComplete: result.phaseComplete,
            constructionComplete: result.constructionComplete,
            nextPhaseCost,
            message: result.constructionComplete
                ? 'Construction complete! Capital Ship is ready for deployment.'
                : result.phaseComplete
                    ? `Phase ${progress?.phase - 1 || 0} complete. Continue donating for phase ${progress?.phase || 'N/A'}.`
                    : 'Resources donated successfully.',
        });
    } catch (error: any) {
        console.error('Error donating to Capital Ship:', error);
        res.status(500).json({ error: 'Failed to donate resources' });
    }
});

/**
 * POST /capitalship/:id/deploy
 * Deploy Capital Ship to a target location
 */
router.post('/:id/deploy', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { targetX, targetY, commitmentDays } = req.body;

        if (targetX === undefined || targetY === undefined || !commitmentDays) {
            return res.status(400).json({ error: 'targetX, targetY, and commitmentDays are required' });
        }

        const result = await deployCapitalShip(userId, id, targetX, targetY, commitmentDays);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // Job queue call is handled in the service

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            arrivalTime: result.arrivalTime.toISOString(),
            message: `Capital Ship deploying to (${targetX}, ${targetY}). ${commitmentDays} day commitment.`,
        });
    } catch (error: any) {
        console.error('Error deploying Capital Ship:', error);
        res.status(500).json({ error: 'Failed to deploy Capital Ship' });
    }
});

/**
 * POST /capitalship/:id/recall
 * Recall a deployed Capital Ship
 */
router.post('/:id/recall', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;

        const result = await recallCapitalShip(userId, id);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // Job queue call is handled in the service

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            arrivalTime: result.arrivalTime.toISOString(),
            message: 'Capital Ship returning to home planet.',
        });
    } catch (error: any) {
        console.error('Error recalling Capital Ship:', error);
        res.status(500).json({ error: 'Failed to recall Capital Ship' });
    }
});

/**
 * POST /capitalship/:id/defense-layout
 * Save defense layout for a Capital Ship
 */
router.post('/:id/defense-layout', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { left, front, right } = req.body;

        if (!left || !front || !right) {
            return res.status(400).json({ error: 'left, front, and right defense sectors are required' });
        }

        const { updateDefenseLayout } = await import('../services/capitalShipService');
        const result = await updateDefenseLayout(userId, id, { left, front, right });

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            success: true,
            message: 'Defense layout saved successfully.',
        });
    } catch (error: any) {
        console.error('Error saving defense layout:', error);
        res.status(500).json({ error: 'Failed to save defense layout' });
    }
});

/**
 * POST /capitalship/:id/repair
 * Start repair after cooldown period
 */
router.post('/:id/repair', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;

        const result = await startRepair(userId, id);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            phaseCost: getPhaseCost(1, true),
            message: 'Repair started. Donate resources to complete each repair phase.',
        });
    } catch (error: any) {
        console.error('Error starting Capital Ship repair:', error);
        res.status(500).json({ error: 'Failed to start repair' });
    }
});

/**
 * POST /capitalship/:id/salvage
 * Permanently delete a destroyed ship to free up the slot
 */
router.post('/:id/salvage', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;

        const { salvageCapitalShip } = await import('../services/capitalShipService');
        const result = await salvageCapitalShip(userId, id);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            success: true,
            message: 'Capital Ship wreckage salvaged. Slot is now available for a new ship.',
        });
    } catch (error: any) {
        console.error('Error salvaging Capital Ship:', error);
        res.status(500).json({ error: 'Failed to salvage ship' });
    }
});

/**
 * POST /capitalship/:id/repairHp
 * Donate resources to repair HP damage (not full reconstruction)
 */
router.post('/:id/repairHp', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { planetId, donation } = req.body;

        if (!planetId) {
            return res.status(400).json({ error: 'planetId is required' });
        }

        if (!donation || typeof donation !== 'object') {
            return res.status(400).json({ error: 'donation object is required' });
        }

        const result = await repairHpDamage(userId, id, planetId, donation);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            success: true,
            newHp: result.newHp,
            hpHealed: result.hpHealed,
            remainingCost: result.remainingCost,
            message: result.hpHealed ? `Repaired ${result.hpHealed} HP` : 'No HP repaired',
        });
    } catch (error: any) {
        console.error('Error repairing Capital Ship HP:', error);
        res.status(500).json({ error: 'Failed to repair HP' });
    }
});

/**
 * POST /capitalship/:id/load
 * Load troops and tools onto a Capital Ship
 */
router.post('/:id/load', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { fromPlanetId, troops = {}, tools = {} } = req.body;

        if (!fromPlanetId) {
            return res.status(400).json({ error: 'fromPlanetId is required' });
        }

        const result = await loadCapitalShip(userId, id, fromPlanetId, troops, tools);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const garrison = result.capitalShip.garrison || { troops: {}, tools: {} };
        const troopCount = Object.values(garrison.troops || {}).reduce((sum: number, n: any) => sum + n, 0);
        const toolCount = Object.values(garrison.tools || {}).reduce((sum: number, n: any) => sum + n, 0);

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            garrison: garrison,
            troopCount,
            toolCount,
            capacity: {
                troops: CAPITAL_SHIP_CONFIG.garrison.baseTroopCapacity,
                tools: CAPITAL_SHIP_CONFIG.garrison.baseToolCapacity,
            },
            message: `Loaded ${Object.values(troops).reduce((s: number, n: any) => s + n, 0)} troops and ${Object.values(tools).reduce((s: number, n: any) => s + n, 0)} tools onto Capital Ship.`,
        });
    } catch (error: any) {
        console.error('Error loading Capital Ship:', error);
        res.status(500).json({ error: 'Failed to load Capital Ship' });
    }
});

/**
 * POST /capitalship/:id/unload
 * Unload troops and tools from a Capital Ship back to a planet
 */
router.post('/:id/unload', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id } = req.params;
        const { toPlanetId, troops = {}, tools = {} } = req.body;

        if (!toPlanetId) {
            return res.status(400).json({ error: 'toPlanetId is required' });
        }

        // Import unloadCapitalShip dynamically (will add to service)
        const { unloadCapitalShip } = await import('../services/capitalShipService');
        const result = await unloadCapitalShip(userId, id, toPlanetId, troops, tools);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const garrison = result.capitalShip.garrison || { troops: {}, tools: {} };

        res.json({
            success: true,
            capitalShip: formatForSocket(result.capitalShip),
            garrison: garrison,
            message: `Unloaded troops and tools to planet.`,
        });
    } catch (error: any) {
        console.error('Error unloading Capital Ship:', error);
        res.status(500).json({ error: 'Failed to unload Capital Ship' });
    }
});

/**
 * POST /capitalship/:id/attack
 * Attack an enemy Capital Ship
 */
router.post('/:id/attack', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { id: targetCapitalShipId } = req.params;
        const { fromPlanetId, units, laneAssignments, tools } = req.body;

        if (!fromPlanetId || !units) {
            return res.status(400).json({ error: 'fromPlanetId and units are required' });
        }

        // Import services dynamically to avoid circular deps
        const prisma = (await import('../lib/prisma')).default;
        const { queueCapitalShipFleetArrival } = await import('../lib/jobQueue');
        const { socketService } = await import('../services/socketService');
        const { BASE_FLEET_SPEED } = await import('../constants/mechanics');
        const { calculateCapitalShipTravelTime } = await import('../constants/capitalShipConfig');

        // 1. Validate target capital ship
        const targetShip = await prisma.capitalShip.findUnique({
            where: { id: targetCapitalShipId },
            include: { owner: { select: { username: true } } },
        });

        if (!targetShip) {
            return res.status(404).json({ error: 'Capital Ship not found' });
        }

        if (targetShip.ownerId === userId) {
            return res.status(400).json({ error: 'Cannot attack your own Capital Ship' });
        }

        if (targetShip.status !== 'deployed') {
            return res.status(400).json({ error: 'Target Capital Ship is not deployed' });
        }

        if (targetShip.x === null || targetShip.y === null) {
            return res.status(400).json({ error: 'Target Capital Ship has no position' });
        }

        // Fetch attacker username for threat notification
        const attacker = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true },
        });

        // 2. Validate source planet
        const sourcePlanet = await prisma.planet.findUnique({
            where: { id: fromPlanetId },
            include: { units: true, tools: true },
        });

        if (!sourcePlanet || sourcePlanet.ownerId !== userId) {
            return res.status(403).json({ error: 'You do not own this planet' });
        }

        // 3. Validate and deduct units
        const totalUnits = Object.values(units as Record<string, number>).reduce((sum, count) => sum + count, 0);
        if (totalUnits === 0) {
            return res.status(400).json({ error: 'Must send at least one unit' });
        }

        // Check unit availability
        for (const [unitType, count] of Object.entries(units as Record<string, number>)) {
            const planetUnit = sourcePlanet.units.find(u => u.unitType === unitType);
            if (!planetUnit || planetUnit.count < count) {
                return res.status(400).json({ error: `Not enough ${unitType} available` });
            }
        }

        // Deduct units from planet
        for (const [unitType, count] of Object.entries(units as Record<string, number>)) {
            await prisma.planetUnit.update({
                where: { planetId_unitType: { planetId: fromPlanetId, unitType } },
                data: { count: { decrement: count } },
            });
        }

        // 4. Handle tools if provided
        let toolsToSend: Record<string, number> = {};
        if (tools && Object.keys(tools).length > 0) {
            for (const [toolType, count] of Object.entries(tools as Record<string, number>)) {
                const planetTool = sourcePlanet.tools.find(t => t.toolType === toolType);
                if (!planetTool || planetTool.count < count) {
                    return res.status(400).json({ error: `Not enough ${toolType} tools available` });
                }
            }
            // Deduct tools
            for (const [toolType, count] of Object.entries(tools as Record<string, number>)) {
                await prisma.toolInventory.update({
                    where: { planetId_toolType: { planetId: fromPlanetId, toolType } },
                    data: { count: { decrement: count } },
                });
            }
            toolsToSend = tools;
        }

        // 5. Calculate travel time
        const dx = targetShip.x - sourcePlanet.x;
        const dy = targetShip.y - sourcePlanet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const travelTimeSeconds = Math.ceil(distance / BASE_FLEET_SPEED);

        const now = new Date();
        const arriveAt = new Date(now.getTime() + travelTimeSeconds * 1000);

        // 6. Create the fleet
        const fleet = await prisma.fleet.create({
            data: {
                ownerId: userId,
                fromPlanetId: fromPlanetId,
                toCapitalShipId: targetCapitalShipId,
                type: 'attack',
                unitsJson: JSON.stringify(units),
                laneAssignmentsJson: laneAssignments ? JSON.stringify(laneAssignments) : null,
                toolsJson: Object.keys(toolsToSend).length > 0 ? JSON.stringify(toolsToSend) : null,
                departAt: now,
                arriveAt: arriveAt,
                status: 'enroute',
            },
            include: {
                fromPlanet: { select: { id: true, x: true, y: true, name: true } },
            },
        });

        // 7. Queue the arrival job
        await queueCapitalShipFleetArrival({
            fleetId: fleet.id,
            capitalShipId: targetCapitalShipId,
        }, arriveAt);

        // 8. Emit socket event for attacker to see fleet
        const fleetData = {
            id: fleet.id,
            type: fleet.type,
            fromPlanet: fleet.fromPlanet,
            toPlanet: null,
            toCapitalShip: {
                id: targetShip.id,
                x: targetShip.x,
                y: targetShip.y,
                ownerName: targetShip.owner?.username,
            },
            units: units,
            departAt: fleet.departAt,
            arriveAt: fleet.arriveAt,
            status: fleet.status,
        };
        socketService.emitToUser(userId, 'fleet:updated', fleetData);

        // 9. Queue threat detection for target owner based on radar level
        // Capital ships use the owner's home planet radar level for detection
        const { queueThreatDetection } = await import('../lib/jobQueue');
        const { getPlanetRadarLevel, getDetectionRange, calculateDetectionTime } = await import('../services/radarService');

        // Get the defender's first planet (earliest created) for radar level calculation
        const defenderHomePlanet = await prisma.planet.findFirst({
            where: {
                ownerId: targetShip.ownerId,
                isNpc: false
            },
            orderBy: { createdAt: 'asc' },
        });

        // Calculate radar level and detection range
        const radarLevel = defenderHomePlanet ? await getPlanetRadarLevel(defenderHomePlanet.id) : 0;
        const detectionRange = getDetectionRange(radarLevel);

        // Calculate when fleet enters detection range
        const fromPos = { x: sourcePlanet.x, y: sourcePlanet.y };
        const toPos = { x: targetShip.x!, y: targetShip.y! };
        const detectionTime = calculateDetectionTime(fromPos, toPos, now, arriveAt, detectionRange);

        // Queue threat detection at the appropriate time
        // Use a special job that handles capital ship targets
        const detectAt = detectionTime || now; // If already in range, detect immediately

        await queueThreatDetection({
            fleetId: fleet.id,
            defenderId: targetShip.ownerId,
            targetPlanetId: `capitalship:${targetCapitalShipId}`, // Special prefix to indicate capital ship target
            attackerName: attacker?.username || 'Unknown Hostile',
            radarLevel,
        }, detectAt);

        console.log(`📡 Queued capital ship threat detection: fleet ${fleet.id} (detection in ${Math.round((detectAt.getTime() - now.getTime()) / 1000)}s, radar level: ${radarLevel})`);

        res.json({
            success: true,
            fleet: fleetData,
            arrivalTime: arriveAt.toISOString(),
            travelTimeSeconds,
            message: `Fleet dispatched to attack ${targetShip.owner?.username}'s Capital Ship`,
        });
    } catch (error: any) {
        console.error('Error attacking Capital Ship:', error);
        res.status(500).json({ error: error.message || 'Failed to attack Capital Ship' });
    }
});

export default router;

