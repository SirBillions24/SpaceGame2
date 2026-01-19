import prisma from '../lib/prisma';
import { socketService } from './socketService';

/**
 * Get paginated conversation between two users
 * Designed for reuse in future dedicated DM window
 */
export async function getConversation(userId: string, partnerId: string, cursor?: string, limit = 50) {
    const messages = await prisma.directMessage.findMany({
        where: {
            OR: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId }
            ]
        },
        include: {
            sender: { select: { id: true, username: true } },
            receiver: { select: { id: true, username: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
    });

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? resultMessages[resultMessages.length - 1]?.id : undefined;

    return {
        messages: resultMessages,
        nextCursor,
        hasMore
    };
}

/**
 * Send a DM to another user
 */
export async function sendDirectMessage(senderId: string, receiverId: string, content: string) {
    // Validate content
    const sanitized = content.trim();
    if (!sanitized) throw new Error('Message content is required');
    if (sanitized.length > 500) throw new Error('Message too long (max 500 characters)');

    // Validate receiver exists
    const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true, username: true }
    });

    if (!receiver) throw new Error('User not found');
    if (receiverId === senderId) throw new Error('Cannot send message to yourself');

    const message = await prisma.directMessage.create({
        data: {
            senderId,
            receiverId,
            content: sanitized
        },
        include: {
            sender: { select: { id: true, username: true } },
            receiver: { select: { id: true, username: true } }
        }
    });

    // Emit real-time DM to receiver
    socketService.emitToUser(receiverId, 'dm:message', {
        id: message.id,
        senderId: message.senderId,
        senderUsername: message.sender.username,
        content: message.content,
        createdAt: message.createdAt,
    });

    return message;
}

/**
 * Get list of all conversation partners with unread counts
 * For the coalition panel, this filters to only coalition members
 */
export async function getConversationList(userId: string, coalitionMemberIds?: string[]) {
    // Get all conversations for this user
    const conversations = await prisma.directMessage.findMany({
        where: {
            OR: [
                { senderId: userId },
                { receiverId: userId }
            ],
            // If filtering to coalition members, include those IDs
            ...(coalitionMemberIds ? {
                AND: {
                    OR: [
                        { senderId: { in: coalitionMemberIds } },
                        { receiverId: { in: coalitionMemberIds } }
                    ]
                }
            } : {})
        },
        select: {
            senderId: true,
            receiverId: true,
            isRead: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' }
    });

    // Group by conversation partner
    const partnerMap = new Map<string, { unreadCount: number; lastMessageAt: Date }>();

    for (const msg of conversations) {
        const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;

        if (!partnerMap.has(partnerId)) {
            partnerMap.set(partnerId, { unreadCount: 0, lastMessageAt: msg.createdAt });
        }

        // Count unread messages received by this user
        if (msg.receiverId === userId && !msg.isRead) {
            const current = partnerMap.get(partnerId)!;
            current.unreadCount++;
        }
    }

    // Convert to array and fetch usernames
    const partnerIds = Array.from(partnerMap.keys());
    const users = await prisma.user.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, username: true }
    });

    const userMap = new Map(users.map(u => [u.id, u.username]));

    return partnerIds.map(partnerId => ({
        partnerId,
        username: userMap.get(partnerId) || 'Unknown',
        unreadCount: partnerMap.get(partnerId)!.unreadCount,
        lastMessageAt: partnerMap.get(partnerId)!.lastMessageAt
    })).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

/**
 * Mark all messages from a partner as read
 */
export async function markConversationRead(userId: string, partnerId: string) {
    return prisma.directMessage.updateMany({
        where: {
            senderId: partnerId,
            receiverId: userId,
            isRead: false
        },
        data: { isRead: true }
    });
}
