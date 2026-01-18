import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import prisma from '../lib/prisma';
import * as coalitionService from '../services/coalitionService';
import { COALITION_MAX_MEMBERS } from '../constants/mechanics';

const router = Router();

router.use(authenticateToken);

// Get coalition constants (for client to stay in sync)
router.get('/constants', async (_req: AuthRequest, res: Response) => {
    res.json({ maxMembers: COALITION_MAX_MEMBERS });
});

// Search coalitions
router.get('/search', async (req: AuthRequest, res: Response) => {
    try {
        const { query } = req.query;
        const results = await coalitionService.searchCoalitions(query as string || '');
        res.json({ coalitions: results });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Create coalition
router.post('/create', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { name, tag, description } = req.body;

        if (!name || !tag) throw new Error('Name and Tag are required');
        if (tag.length < 3 || tag.length > 5) throw new Error('Tag must be 3-5 characters');

        const coalition = await coalitionService.createCoalition(userId, name, tag, description);
        res.json({ message: 'Coalition founded successfully', coalition });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Join coalition
router.post('/join/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const coalitionId = req.params.id;
        await coalitionService.joinCoalition(userId, coalitionId);
        res.json({ message: 'Joined coalition successfully' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Leave coalition
router.post('/leave', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        await coalitionService.leaveCoalition(userId);
        res.json({ message: 'Left coalition successfully' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Settings
router.patch('/settings', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { isLocked, description } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const updated = await coalitionService.updateCoalitionSettings(userId, user.coalitionId, { isLocked, description });
        res.json({ message: 'Settings updated', coalition: updated });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Member Management
router.post('/promote', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { targetUserId } = req.body;
        await coalitionService.promoteMember(userId, targetUserId);
        res.json({ message: 'Member promoted to Officer' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/demote', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { targetUserId } = req.body;
        await coalitionService.demoteMember(userId, targetUserId);
        res.json({ message: 'Officer demoted to Member' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/kick', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { targetUserId } = req.body;
        await coalitionService.kickMember(userId, targetUserId);
        res.json({ message: 'Member kicked from coalition' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Invites
router.post('/invite', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { username } = req.body;
        const invite = await coalitionService.invitePlayer(userId, username);
        res.json({ message: 'Invitation sent', invite });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/invite/respond', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { inviteId, accept } = req.body;
        await coalitionService.respondToInvite(userId, inviteId, accept);
        res.json({ message: accept ? 'Joined coalition' : 'Invitation declined' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Rankings
router.get('/rankings', async (req: AuthRequest, res: Response) => {
    try {
        const rankings = await coalitionService.getCoalitionRankings();
        res.json({ rankings });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get my coalition details
router.get('/my', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) {
            return res.json({ coalition: null });
        }

        const details = await coalitionService.getCoalitionDetails(user.coalitionId);
        res.json({ coalition: details });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Chat history (with cursor-based pagination)
router.get('/chat', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const cursor = req.query.cursor as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const result = await coalitionService.getCoalitionChat(user.coalitionId, cursor, limit);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});


// Send message (with content validation)
router.post('/chat', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { content } = req.body;

        // Content validation
        if (!content || typeof content !== 'string') {
            throw new Error('Message content is required');
        }

        const sanitizedContent = content.trim();
        if (!sanitizedContent) throw new Error('Message content is required');
        if (sanitizedContent.length > 500) throw new Error('Message too long (max 500 characters)');

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const message = await coalitionService.sendCoalitionMessage(userId, user.coalitionId, sanitizedContent);
        res.json({ message });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// =============== DIRECT MESSAGES ===============
import * as dmService from '../services/dmService';

// Get list of DM conversations (for unread badges)
// IMPORTANT: This must come BEFORE /dm/:partnerId to match correctly
router.get('/dm', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        // Get coalition members
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const coalitionMembers = await prisma.user.findMany({
            where: { coalitionId: user.coalitionId },
            select: { id: true }
        });

        const memberIds = coalitionMembers.map(m => m.id);
        const conversations = await dmService.getConversationList(userId, memberIds);
        res.json({ conversations });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get DM conversation with a partner (within coalition context for now)
router.get('/dm/:partnerId', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { partnerId } = req.params;
        const cursor = req.query.cursor as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

        // Verify user is in a coalition and partner is a member
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const partner = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { coalitionId: true }
        });

        if (!partner || partner.coalitionId !== user.coalitionId) {
            throw new Error('User is not in your coalition');
        }

        const result = await dmService.getConversation(userId, partnerId, cursor, limit);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Send DM to a coalition member
router.post('/dm/:partnerId', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { partnerId } = req.params;
        const { content } = req.body;

        // Verify user is in a coalition and partner is a member
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { coalitionId: true }
        });

        if (!user?.coalitionId) throw new Error('Not in a coalition');

        const partner = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { coalitionId: true }
        });

        if (!partner || partner.coalitionId !== user.coalitionId) {
            throw new Error('User is not in your coalition');
        }

        const message = await dmService.sendDirectMessage(userId, partnerId, content);
        res.json({ message });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});


// Mark conversation as read
router.post('/dm/:partnerId/read', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { partnerId } = req.params;
        await dmService.markConversationRead(userId, partnerId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get specific coalition details (publicly accessible)
// IMPORTANT: This route must be LAST since /:id matches any path segment
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const coalitionId = req.params.id;
        const details = await coalitionService.getCoalitionDetails(coalitionId);
        if (!details) throw new Error('Coalition not found');
        res.json({ coalition: details });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
