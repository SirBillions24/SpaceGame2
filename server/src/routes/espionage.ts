// server/src/routes/espionage.ts

import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { launchProbe, getProbeData, recallProbe, generateEspionageReport } from '../services/espionageService';
import prisma from '../lib/prisma';
import { socketService } from '../services/socketService';

const router = Router();

/**
 * Format probe data for socket emission (matches client Probe interface)
 */
function formatProbeForSocket(probe: any) {
    return {
        id: probe.id,
        type: probe.type,
        targetX: probe.targetX,
        targetY: probe.targetY,
        status: probe.status,
        startTime: probe.startTime,
        arrivalTime: probe.arrivalTime,
        returnTime: probe.returnTime,
        lastUpdateTime: probe.lastUpdateTime,
        radius: probe.radius,
        fromPlanet: probe.fromPlanet ? { x: probe.fromPlanet.x, y: probe.fromPlanet.y } : null,
    };
}

// Apply authentication to all espionage routes
router.use(authenticateToken);

// Launch a new probe
router.post('/launch', async (req: AuthRequest, res: Response) => {
    try {
        const { fromPlanetId, targetX, targetY, probeType } = req.body;
        const userId = req.userId!;

        const probe = await launchProbe(userId, fromPlanetId, targetX, targetY, probeType);
        
        // Fetch probe with fromPlanet for socket emission
        const probeWithPlanet = await prisma.reconProbe.findUnique({
            where: { id: probe.id },
            include: { fromPlanet: { select: { x: true, y: true } } }
        });
        
        if (probeWithPlanet) {
            socketService.emitToUser(userId, 'probe:updated', formatProbeForSocket(probeWithPlanet));
        }
        
        res.json(probe);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Recall a probe
router.post('/recall/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const probeId = req.params.id;

        const probe = await recallProbe(userId, probeId);
        
        // Fetch probe with fromPlanet for socket emission
        const probeWithPlanet = await prisma.reconProbe.findUnique({
            where: { id: probe.id },
            include: { fromPlanet: { select: { x: true, y: true } } }
        });
        
        if (probeWithPlanet) {
            socketService.emitToUser(userId, 'probe:updated', formatProbeForSocket(probeWithPlanet));
        }
        
        res.json(probe);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Generate an espionage report
router.post('/report/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const probeId = req.params.id;

        const report = await generateEspionageReport(userId, probeId);
        res.json(report);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get all probes for the user
router.get('/probes', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const probes = await prisma.reconProbe.findMany({
            where: { ownerId: userId },
            include: { fromPlanet: { select: { x: true, y: true, name: true } } },
            orderBy: { startTime: 'desc' }
        });
        res.json(probes);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get detailed data for a specific probe
router.get('/probes/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const probeId = req.params.id;

        const data = await getProbeData(userId, probeId);
        res.json(data);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Delete a probe (e.g., if discovered or no longer needed)
router.delete('/probes/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const probeId = req.params.id;

        await prisma.reconProbe.delete({
            where: { id: probeId, ownerId: userId }
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;

