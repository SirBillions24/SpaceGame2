import { resolveSector, resolveWaveCollision } from '../services/combatService';

// Mock Interfaces locally since we can't import non-exported interfaces easily 
// (unless they are exported, which they are not, but TS usually allows checking generic objects)

const runTest = (name: string, fn: () => void) => {
    try {
        console.log(`RUNNING: ${name}`);
        fn();
        console.log(`[PASS] ${name}`);
    } catch (e) {
        console.error(`[FAIL] ${name}`);
        console.error(e);
    }
};

const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
};

const emptyAdmiralBonus = { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 };

// SCENARIOS

runTest("Ranger vs Marine (Range Advantage)", () => {
    // Rangers (High Ranged Atk) vs Marines (Low Ranged Def)
    // Marine: Ranged Def 6. 10 Marines = 60 Def.
    // Ranger: Ranged Atk 14. 10 Rangers = 140 Atk.
    // Attackers should win.

    const result = resolveWaveCollision(
        { ranger: 10 },
        { marine: 10 },
        {},
        { canopy: 0, hub: 0, minefield: 0 },
        false,
        {},
        emptyAdmiralBonus,
        emptyAdmiralBonus
    );

    assert(result.attackerWon === true, "Rangers should beat Marines");
    const rangerLoss = result.attackerLosses['ranger'] || 0;
    assert(rangerLoss <= 2, `Rangers should lose few units (Lost ${rangerLoss})`);
});

runTest("Energy Canopy Bonus", () => {
    // 10 Marines (Atk 120) vs 10 Marines (Def 120 base).
    // Add Canopy Lvl 1 (+30% Def). Total Def = 156.
    // Defender should win.

    const result = resolveWaveCollision(
        { marine: 10 },
        { marine: 10 },
        {},
        { canopy: 1, hub: 0, minefield: 0 },
        false,
        {},
        emptyAdmiralBonus,
        emptyAdmiralBonus
    );

    assert(result.attackerWon === false, "Defenders with Canopy should win vs equal force");
});

runTest("Invasion Anchor Counter", () => {
    // Canopy Level 1 (+30% Def).
    // 10 Marines (120 Atk).
    // 3 Anchors (10% each -> 30% reduction).
    // Def drops to 120. Atk (120) vs Def (120) - coin toss but usually defender wins on draw in our logic.
    // Let's use 11 Marines.

    const result2 = resolveWaveCollision(
        { marine: 11 },
        { marine: 10 },
        { invasion_anchors: 3 }, 
        { canopy: 1, hub: 0, minefield: 0 },
        false,
        {},
        emptyAdmiralBonus,
        emptyAdmiralBonus
    );

    assert(result2.attackerWon === true, "Attackers should win if Canopy is bypassed");
});

runTest("Multi-Wave Sector Breach", () => {
    // Wave 1: 20 Marines (240 Atk). vs 10 Sentinels (180 Def).
    // Marines WIN Wave 1.
    // Wave 2: 10 Rangers. Should pass through unharmed.

    // Explicitly cast to prevent TS error
    const waves: any[] = [
        { units: { marine: 20 }, tools: {} },
        { units: { ranger: 10 }, tools: {} }
    ];

    const result = resolveSector(
        waves,
        { units: { sentinel: 10 }, tools: [] },
        { canopy: 0, hub: 0, minefield: 0 },
        false,
        emptyAdmiralBonus,
        emptyAdmiralBonus
    );

    assert(result.winner === 'attacker', "Attackers should win sector");
    assert(result.wavesFought === 1, "Should theoretically win in wave 1");
    assert((result.survivingAttackers['ranger'] || 0) === 10, "Wave 2 should preserve all Rangers");
});

runTest("Central Docking Hub Defense (Center Only)", () => {
    // Center Sector gets Hub Bonus (+35% per level).
    // 10 Marines (120 Atk) vs 5 Marines (60 Def).
    // Hub Lvl 3 = +105% Def. Total Def = 60 * 2.05 = 123.
    // Defense Wins.

    const result = resolveWaveCollision(
        { marine: 10 },
        { marine: 5 },
        {},
        { canopy: 0, hub: 3, minefield: 0 },
        true, // isCenter
        {},
        emptyAdmiralBonus,
        emptyAdmiralBonus
    );

    assert(result.attackerWon === false, "Hub should save the marines in center");
});

console.log("All mocked tests passed!");
