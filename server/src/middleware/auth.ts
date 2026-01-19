import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

// Throttle activity updates to once per minute per user (in-memory cache)
const lastActivityUpdate = new Map<string, number>();
const ACTIVITY_THROTTLE_MS = 60 * 1000; // 1 minute

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret not configured' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    req.userId = decoded.userId;

    // Track user activity (throttled)
    const now = Date.now();
    const lastUpdate = lastActivityUpdate.get(decoded.userId) || 0;
    if (now - lastUpdate > ACTIVITY_THROTTLE_MS) {
      lastActivityUpdate.set(decoded.userId, now);
      prisma.user.update({
        where: { id: decoded.userId },
        data: { lastActiveAt: new Date() }
      }).catch(() => { }); // Fire-and-forget, don't block request
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuthenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    // If token is invalid, just proceed without userId
    next();
  }
};






