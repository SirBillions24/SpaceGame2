import prisma from '../lib/prisma';
import { COALITION_FOUNDING_COST, COALITION_MAX_MEMBERS } from '../constants/mechanics';
import { socketService } from './socketService';

export async function createCoalition(userId: string, name: string, tag: string, description?: string) {
    // 1. Check if user already in a coalition
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, coalitionId: true, credits: true }
    });

    if (!user) throw new Error('User not found');
    if (user.coalitionId) throw new Error('You are already in a coalition');

    // 2. Check if name/tag taken
    const existing = await prisma.coalition.findFirst({
        where: {
            OR: [
                { name: { equals: name, mode: 'insensitive' } },
                { tag: { equals: tag, mode: 'insensitive' } }
            ]
        }
    });

    if (existing) {
        if (existing.name.toLowerCase() === name.toLowerCase()) throw new Error('Coalition name already taken');
        throw new Error('Coalition tag already taken');
    }

    // 3. Check credits
    if (user.credits < COALITION_FOUNDING_COST) {
        throw new Error(`Insufficient credits to found a coalition. Required: ${COALITION_FOUNDING_COST.toLocaleString()}`);
    }

    // 4. Create coalition and update user atomically
    const coalition = await prisma.$transaction(async (tx) => {
        // Deduct credits from user
        await tx.user.update({
            where: { id: userId },
            data: {
                credits: { decrement: COALITION_FOUNDING_COST },
                coalitionId: undefined // Will be set below
            }
        });

        // Create coalition
        const newCoalition = await tx.coalition.create({
            data: {
                name,
                tag,
                description,
                founderId: userId,
                members: {
                    connect: { id: userId }
                }
            }
        });

        // Set user role to LEADER
        await tx.user.update({
            where: { id: userId },
            data: { coalitionRole: 'LEADER' }
        });

        return newCoalition;
    });

    return coalition;
}

export async function joinCoalition(userId: string, coalitionId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, coalitionId: true }
    });

    if (!user) throw new Error('User not found');
    if (user.coalitionId) throw new Error('You are already in a coalition');

    const coalition = await prisma.coalition.findUnique({
        where: { id: coalitionId },
        include: { _count: { select: { members: true } } }
    });

    if (!coalition) throw new Error('Coalition not found');
    if (coalition.isLocked) throw new Error('This coalition is invite-only');
    if (coalition._count.members >= COALITION_MAX_MEMBERS) {
        throw new Error('Coalition is full');
    }

    return prisma.user.update({
        where: { id: userId },
        data: {
            coalitionId: coalition.id,
            coalitionRole: 'MEMBER'
        }
    });
}

export async function leaveCoalition(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!user || !user.coalitionId) throw new Error('You are not in a coalition');

    // Check if user is leader
    if (user.coalitionRole === 'LEADER') {
        const otherMembers = await prisma.user.findMany({
            where: { coalitionId: user.coalitionId, id: { not: userId } },
            orderBy: { createdAt: 'asc' }, // Transfer to oldest member
            take: 1
        });

        if (otherMembers.length > 0) {
            await prisma.$transaction([
                prisma.coalition.update({
                    where: { id: user.coalitionId },
                    data: { founderId: otherMembers[0].id }
                }),
                prisma.user.update({
                    where: { id: otherMembers[0].id },
                    data: { coalitionRole: 'LEADER' }
                })
            ]);
        } else {
            // Last member leaving - disband
            await prisma.coalition.delete({
                where: { id: user.coalitionId }
            });
        }
    }

    return prisma.user.update({
        where: { id: userId },
        data: {
            coalitionId: null,
            coalitionRole: 'MEMBER'
        }
    });
}

export async function updateCoalitionSettings(userId: string, coalitionId: string, data: { isLocked?: boolean, description?: string }) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!user || user.coalitionId !== coalitionId) throw new Error('Not authorized');
    if (user.coalitionRole !== 'LEADER' && user.coalitionRole !== 'OFFICER') {
        throw new Error('Insufficient permissions to change settings');
    }

    return prisma.coalition.update({
        where: { id: coalitionId },
        data
    });
}

export async function promoteMember(userId: string, targetUserId: string) {
    const leader = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!leader || leader.coalitionRole !== 'LEADER') throw new Error('Only the Leader can promote members');

    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!target || target.coalitionId !== leader.coalitionId) throw new Error('Target user not in your coalition');
    if (target.coalitionRole !== 'MEMBER') throw new Error('Member is already an Officer or Leader');

    return prisma.user.update({
        where: { id: targetUserId },
        data: { coalitionRole: 'OFFICER' }
    });
}

export async function demoteMember(userId: string, targetUserId: string) {
    const leader = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!leader || leader.coalitionRole !== 'LEADER') throw new Error('Only the Leader can demote members');

    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!target || target.coalitionId !== leader.coalitionId) throw new Error('Target user not in your coalition');
    if (target.coalitionRole !== 'OFFICER') throw new Error('Member is not an Officer');

    return prisma.user.update({
        where: { id: targetUserId },
        data: { coalitionRole: 'MEMBER' }
    });
}

export async function kickMember(userId: string, targetUserId: string) {
    const kicker = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!kicker || (kicker.coalitionRole !== 'LEADER' && kicker.coalitionRole !== 'OFFICER')) {
        throw new Error('Insufficient permissions to kick members');
    }

    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { coalitionId: true, coalitionRole: true }
    });

    if (!target || target.coalitionId !== kicker.coalitionId) throw new Error('Target user not in your coalition');

    // Leadership protection: Officers can't kick Leaders or other Officers
    if (kicker.coalitionRole === 'OFFICER' && target.coalitionRole !== 'MEMBER') {
        throw new Error('Officers can only kick standard members');
    }

    if (target.coalitionRole === 'LEADER') throw new Error('The Leader cannot be kicked');

    return prisma.user.update({
        where: { id: targetUserId },
        data: {
            coalitionId: null,
            coalitionRole: 'MEMBER'
        }
    });
}

export async function invitePlayer(senderId: string, username: string) {
    const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, coalitionId: true, coalitionRole: true, username: true }
    });

    if (!sender || !sender.coalitionId || (sender.coalitionRole !== 'LEADER' && sender.coalitionRole !== 'OFFICER')) {
        throw new Error('Insufficient permissions to invite players');
    }

    const target = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: { id: true, coalitionId: true }
    });

    if (!target) throw new Error('User not found');
    if (target.coalitionId) throw new Error('User is already in a coalition');

    // Check if there's already a pending invite
    const existingInvite = await prisma.coalitionInvite.findFirst({
        where: {
            coalitionId: sender.coalitionId,
            userId: target.id,
            status: 'PENDING'
        }
    });

    if (existingInvite) throw new Error('An invite is already pending for this player');

    const coalition = await prisma.coalition.findUnique({ where: { id: sender.coalitionId } });

    // Create invite record
    const invite = await prisma.coalitionInvite.create({
        data: {
            coalitionId: sender.coalitionId,
            userId: target.id,
            senderId: sender.id,
            status: 'PENDING'
        }
    });

    // Create inbox message for target
    await prisma.inboxMessage.create({
        data: {
            userId: target.id,
            type: 'coalition_invite',
            title: 'Coalition Invitation',
            content: JSON.stringify({
                inviteId: invite.id,
                coalitionId: coalition!.id,
                coalitionName: coalition!.name,
                coalitionTag: coalition!.tag,
                senderName: sender.username
            })
        }
    });

    return invite;
}

export async function respondToInvite(userId: string, inviteId: string, accept: boolean) {
    const invite = await prisma.coalitionInvite.findUnique({
        where: { id: inviteId },
        include: { coalition: true }
    });

    if (!invite || invite.userId !== userId || invite.status !== 'PENDING') {
        throw new Error('Invalid or expired invitation');
    }

    if (!accept) {
        return prisma.coalitionInvite.update({
            where: { id: inviteId },
            data: { status: 'REJECTED' }
        });
    }

    // Accept Invite
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { coalitionId: true } });
    if (user?.coalitionId) throw new Error('You are already in a coalition');

    const memberCount = await prisma.user.count({ where: { coalitionId: invite.coalitionId } });
    if (memberCount >= COALITION_MAX_MEMBERS) throw new Error('Coalition is full');

    return await prisma.$transaction(async (tx) => {
        // Update invite status
        await tx.coalitionInvite.update({
            where: { id: inviteId },
            data: { status: 'ACCEPTED' }
        });

        // Add user to coalition
        return tx.user.update({
            where: { id: userId },
            data: {
                coalitionId: invite.coalitionId,
                coalitionRole: 'MEMBER'
            }
        });
    });
}

export async function getCoalitionRankings() {
    const coalitions = await prisma.coalition.findMany({
        include: {
            members: {
                select: { xp: true }
            },
            _count: { select: { members: true } }
        }
    });

    const ranked = coalitions.map(c => {
        const totalXp = c.members.reduce((sum, m) => sum + m.xp, 0);
        return {
            id: c.id,
            name: c.name,
            tag: c.tag,
            founderId: c.founderId,
            memberCount: c._count.members,
            totalXp,
            createdAt: c.createdAt
        };
    }).sort((a, b) => b.totalXp - a.totalXp);

    return ranked;
}

export async function getCoalitionDetails(coalitionId: string) {
    return prisma.coalition.findUnique({
        where: { id: coalitionId },
        include: {
            members: {
                select: {
                    id: true,
                    username: true,
                    level: true,
                    xp: true,
                    coalitionRole: true,
                    lastActiveAt: true
                }
            }
        }
    });
}

export async function searchCoalitions(query: string) {
    return prisma.coalition.findMany({
        where: {
            OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { tag: { contains: query, mode: 'insensitive' } }
            ]
        },
        include: { _count: { select: { members: true } } },
        take: 20
    });
}

export async function sendCoalitionMessage(userId: string, coalitionId: string, content: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { coalitionId: true }
    });

    if (!user || user.coalitionId !== coalitionId) {
        throw new Error('You are not a member of this coalition');
    }

    const message = await prisma.coalitionMessage.create({
        data: {
            coalitionId,
            userId,
            content
        },
        include: {
            user: {
                select: { username: true }
            }
        }
    });

    // Emit real-time chat message to coalition room
    socketService.emitToCoalition(coalitionId, 'chat:message', {
        id: message.id,
        userId: message.userId,
        username: message.user.username,
        content: message.content,
        createdAt: message.createdAt,
    });

    return message;
}

export async function getCoalitionChat(coalitionId: string, cursor?: string, limit = 50) {
    const messages = await prisma.coalitionMessage.findMany({
        where: { coalitionId },
        include: {
            user: {
                select: { username: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // Fetch one extra to determine if there's a next page
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
    });

    // Check if there's a next page
    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? resultMessages[resultMessages.length - 1]?.id : undefined;

    return {
        messages: resultMessages,
        nextCursor,
        hasMore
    };
}


