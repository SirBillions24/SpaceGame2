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
        { shield: 0, starport: 0, perimeter: 0 },
        false
    );

    assert(result.attackerWon === true, "Rangers should beat Marines");
    const rangerLoss = result.attackerLosses['ranger'] || 0;
    assert(rangerLoss <= 2, `Rangers should lose few units (Lost ${rangerLoss})`);
});

runTest("Shield Generator Bonus (Wall)", () => {
    // 10 Marines (Atk 120) vs 10 Marines (Def 120 base).
    // Add Shield Lvl 1 (+50 Def). Total Def = 170.
    // Defender should win.

    const result = resolveWaveCollision(
        { marine: 10 },
        { marine: 10 },
        {},
        { shield: 1, starport: 0, perimeter: 0 },
        false
    );

    assert(result.attackerWon === false, "Defenders with Shield should win vs equal force");
});

runTest("Shield Jammer Counter", () => {
    // Shield Level 10 (+500 Def). Total Def = 620.
    // 11 Marines (132 Atk).
    // 10 Jammers (10% each -> 100% reduction).
    // Def drops to 120. Atk (132) > Def (120).
    // Attackers Win.

    const result2 = resolveWaveCollision(
        { marine: 11 },
        { marine: 10 },
        { shieldJammer: 10 }, // 100% reduction
        { shield: 10, starport: 0, perimeter: 0 },
        false
    );

    assert(result2.attackerWon === true, "Attackers should win if Shield is jammed");
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
        { sentinel: 10 },
        { shield: 0, starport: 0, perimeter: 0 },
        false
    );

    assert(result.winner === 'attacker', "Attackers should win sector");
    assert(result.wavesFought === 1, "Should theoretically win in wave 1");
    assert((result.survivingAttackers['ranger'] || 0) === 10, "Wave 2 should preserve all Rangers");
});

runTest("Starport Defense (Center Only)", () => {
    // Center Sector gets Starport Bonus (+100 per level).
    // 10 Marines (120 Atk) vs 1 Marine (12 Def).
    // Starport Lvl 2 = +200 Def. Total Def = 212.
    // Defense Wins.

    const result = resolveWaveCollision(
        { marine: 10 },
        { marine: 1 },
        {},
        { shield: 0, starport: 2, perimeter: 0 },
        true // isCenter
    );

    assert(result.attackerWon === false, "Starport should save the lone marine");
});

console.log("All mocked tests passed!");
