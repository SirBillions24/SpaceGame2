# Balance & Mechanics Review

## Executive Summary
The game implements a surprisingly deep strategy layer for an MVP, featuring a 3-lane combat system, a refined "Rock-Paper-Scissors" unit counters (Triangle System), and a lazy-evaluation economy. The mechanics mimic high-depth strategy games (like Goodgame Empire) effectively. However, the "Death Spiral" potential in the food/desertion mechanic and the relatively low impact of strategic counters may need tuning.

## 1. Combat Mechanics (The "Admiral" System)

### Strengths
- **3-Lane Strategy**: The Left/Center/Right + Courtyard split adds significant depth compared to simple "Force A vs Force B" combat. It rewards scouting and specific lane countering.
- **Triangle System**: The `Melee > Robotic > Ranged` counter system is implemented globally, encouraging mixed unit compositions.
- **Complex Stat Stacking**: The engine correctly aggregates Building Defense, Wall Tools, Unit Stats, and Admiral Bonuses.

### Weaknesses & Tuning Risks
- **Triangle Bonus Power**: The current `TRIANGLE_BONUS` is set to **10%** (`0.10`). In many strategy games, this bonus needs to be significantly higher (25%+) to make "countering" strictly better than "spamming the highest DPS unit." At 10%, a Tier 2 unit might purely outstat its Tier 1 counter.
- **Admiral Scaling**: Bonuses are additive percentages (e.g., `1 + bonus/100`). If players stack multiple sources (Admiral + Gears + Tech), they might reach unkillable thresholds or "one-shot" breakpoints unless soft caps/diminishing returns are enforced.

## 2. Economic Balance

### Strengths
- **Lazy Evaluation**: The `syncPlanetResources` function is a robust way to handle "offline progress" without taxing the server with a global tick.
- **Expansion Scaling**: Exponential costs for grid expansion (`1.5x` multiplier) effectively gate late-game growth, preventing infinite distinct bases.

### Weaknesses & Tuning Risks
- **The "Death Spiral" (Desertion)**: The current desertion logic instantly deletes a percentage of troops (`count * deficitRatio`) whenever `syncPlanetResources` runs and food is negative.
    - **Risk**: A player who logs in 1 minute too late could lose *all* troops instantly. This is extremely punishing.
    - **Recommendation**: Implement a "Grace Period" or a "Starvation Rate" (e.g., lose 5% per hour of starvation) rather than an instant calculation based on total deficit time.
- **Tax/Stability**: The formula `Productivity = SQRT(PublicOrder)` offers diminishing returns on high stability, which is good. However, negative stability penalizes violently.

## 3. Progression

- **XP Curve**: The quadratic curve (`100 * Level^2`) is standard but can become incredibly steep.
- **Gating**: Unit recruitment is gated by `Orbital Garrison` level, which is a good natural dampener on power leveling.

## Recommendations

1.  **Buff the Triangle**: Increase `TRIANGLE_BONUS` to 0.25 (25%) or 0.50 (50%) to enforce the "Rock-Paper-Scissors" meta.
2.  **Soften Desertion**: Change the desertion logic to a "tick-based" decay (simulated) where units die over time, or cap the max loss per session to prevent total wipes from minor miscalculations.
3.  **Tool Consumption**: Ensure tools are correctly deducted from the *Wall* (DefenseLayout) and not just the Inventory to prevent "Ghost Tools" defending forever.
