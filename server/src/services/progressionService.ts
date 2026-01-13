
import prisma from '../lib/prisma';
import { XP_CURVE } from '../constants/playerConfig';

/**
 * Calculate XP required to reach the next level.
 * Formula: XP = baseXp × (level ^ exponent)
 * 
 * Adjust XP_CURVE in playerConfig.ts to change progression speed.
 */
export const calculateXpForLevel = (level: number): number => {
    return XP_CURVE.baseXp * Math.pow(level, XP_CURVE.exponent);
};

export const addXp = async (userId: string, amount: number) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    let newXp = user.xp + amount;
    let newLevel = user.level;
    let leveledUp = false;

    // Check for level up(s)
    let nextLevelXp = calculateXpForLevel(newLevel);
    while (newXp >= nextLevelXp) {
        newLevel++;
        leveledUp = true;
        nextLevelXp = calculateXpForLevel(newLevel);
    }

    if (leveledUp) {
        console.log(`User ${user.username} leveled up to ${newLevel}!`);
        // TODO: Grant level up rewards (Rubies, etc.)
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            xp: newXp,
            level: newLevel
        }
    });

    return {
        user: updatedUser,
        leveledUp,
        xpToNextLevel: nextLevelXp - newXp
    };
};
