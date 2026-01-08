// server/src/routes/espionage.ts

import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { launchProbe, getProbeData, recallProbe, generateEspionageReport } from '../services/espionageService';
import prisma from '../lib/prisma';

const router = Router();

// Apply authentication to all espionage routes
router.use(authenticateToken);

// Launch a new probe
router.post('/launch', async (req: AuthRequest, res: Response) => {
    try {
        const { fromPlanetId, targetX, targetY, probeType } = req.body;
        const userId = req.userId!;

        const probe = await launchProbe(userId, fromPlanetId, targetX, targetY, probeType);
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

