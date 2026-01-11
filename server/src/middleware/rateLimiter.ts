import rateLimit from 'express-rate-limit';

// Global rate limiter - more permissive for game clients with frequent polling
// 300 requests per minute per IP (5 per second average)
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 400,
    message: { error: 'Too many requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limiter - 10 attempts per 15 minutes per IP (for login/register)
// Stricter to prevent brute force, but not too aggressive
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for already authenticated requests (like /auth/me)
    skip: (req) => req.headers.authorization !== undefined,
});

// Heavy action limiter - 60 requests per minute (for fleet dispatch, combat, etc.)
// These are read-heavy with the GET /fleets endpoint being called frequently
export const heavyActionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    message: { error: 'Too many actions, please wait before sending more fleets' },
    standardHeaders: true,
    legacyHeaders: false,
});
