import { z } from 'zod';

/**
 * Validation schemas for WebSocket events.
 * Reuses patterns from actionSchemas.ts for consistency.
 */

export const ChatSendSchema = z.object({
    content: z.string().min(1).max(500).transform((s) => s.trim()),
});

export type ChatSendInput = z.infer<typeof ChatSendSchema>;

export const DMSendSchema = z.object({
    receiverId: z.string().uuid(),
    content: z.string().min(1).max(500).transform((s) => s.trim()),
});

export type DMSendInput = z.infer<typeof DMSendSchema>;
