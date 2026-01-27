import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { spawnPlanet } from '../services/planetService';
import { giveStarterGear } from '../services/admiralService';

const router = Router();

interface RegisterBody {
  username: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email: rawEmail, password }: RegisterBody = req.body;
    const email = rawEmail?.toLowerCase();

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
      },
    });

    // Give starter gear to new user
    try {
      await giveStarterGear(user.id);
      console.log(`✅ Gave starter gear to new user: ${user.username}`);
    } catch (error) {
      console.error('Error giving starter gear:', error);
      // Don't fail registration if gear creation fails
    }

    // Spawn starting planet REMOVED - Defer to Manual Spawn Selection
    // await spawnPlanet(user.id, username);

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT secret not configured' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn } as jwt.SignOptions);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    // Check if it's a database connection error
    if (error instanceof Error && error.message.includes('connect')) {
      return res.status(503).json({
        error: 'Database connection failed. Please ensure the database is running.',
        details: 'The PostgreSQL database is not accessible. Start it with: cd infra && sudo docker compose up -d'
      });
    }
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password }: LoginBody = req.body;
    const email = rawEmail?.toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT secret not configured' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn } as jwt.SignOptions);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        xp: user.xp,
        level: user.level,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Current User (Me)
import { authenticateToken } from '../middleware/auth';

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    // req.userId is set by authenticateToken middleware
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      xp: user.xp,
      level: user.level,
      darkMatter: user.darkMatter,
      credits: user.credits,
    });
  } catch (error) {
    console.error('Get Me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

