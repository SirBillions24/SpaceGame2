// server/src/routes/mailbox.ts

import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const [battleReports, espionageReports, messages] = await Promise.all([
            prisma.battleReport.findMany({
                where: { OR: [{ attackerId: userId }, { defenderId: userId }] },
                include: { fleet: { include: { fromPlanet: true, toPlanet: true } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.espionageReport.findMany({
                where: { ownerId: userId },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.inboxMessage.findMany({
                where: { userId: userId },
                orderBy: { createdAt: 'desc' }
            })
        ]);

        // Combine into a single list of summaries
        const items = [
            ...battleReports.map(br => ({
                id: br.id,
                type: 'battle',
                title: br.attackerId === userId
                    ? `Attack on ${br.fleet.toPlanet?.name ?? 'Capital Ship'}`
                    : `Defense against ${br.fleet.fromPlanet?.name ?? 'Capital Ship'}`,
                winner: br.winner,
                isAttacker: br.attackerId === userId,
                createdAt: br.createdAt,
                attackerPlanet: br.fleet.fromPlanet,
                defenderPlanet: br.fleet.toPlanet,
            })),
            ...espionageReports.map(er => ({
                id: er.id,
                type: 'espionage',
                title: `Espionage Data [${er.targetX}, ${er.targetY}]`,
                createdAt: er.createdAt,
                targetX: er.targetX,
                targetY: er.targetY,
                accuracy: er.accuracy,
            })),
            ...messages.map(m => ({
                id: m.id,
                type: 'message',
                subType: m.type,
                title: m.title,
                content: m.content,
                isRead: m.isRead,
                createdAt: m.createdAt,
            }))
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({ items });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/espionage/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const reportId = req.params.id;

        const report = await prisma.espionageReport.findUnique({
            where: { id: reportId, ownerId: userId }
        });

        if (!report) throw new Error('Report not found');

        res.json({
            ...report,
            data: JSON.parse(report.dataJson)
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/message/:id/read', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const messageId = req.params.id;

        await prisma.inboxMessage.update({
            where: { id: messageId, userId: userId },
            data: { isRead: true }
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;

