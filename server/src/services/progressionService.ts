
import prisma from '../lib/prisma';

// XP Curve: Required XP to reach next Level = 100 * (CurrentLevel)^2
// e.g. Lv 1->2: 100 XP
// Lv 2->3: 400 XP (Total)
// Lv 3->4: 900 XP (Total)
export const calculateXpForLevel = (level: number): number => {
    return 100 * Math.pow(level, 2);
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
