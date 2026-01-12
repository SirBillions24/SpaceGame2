# Workforce Economy System

A production system where population acts as workers for resource-generating buildings, creating strategic depth through a three-way tension between production, housing, and stability.

## Overview

Production buildings require workers to operate efficiently. Without sufficient population, production rates decrease. Excess workers provide small bonuses. This creates meaningful choices:

| Build more... | Benefit | Cost |
|--------------|---------|------|
| **Production buildings** | Higher base output | Need workers to staff them |
| **Housing units** | More workers + tax income | Stability penalty → reduced efficiency |
| **Stability buildings** | Higher worker efficiency | Uses grid space |
| **Colony Hub upgrades** | Population + Stability | Expensive but dual benefit |

---

## Core Formulas

### Staffing Efficiency

```typescript
// From planetService.ts calculatePlanetRates()

// If no production buildings, efficiency is 1.0 (100%)
if (workforceRequired > 0) {
    staffingRatio = Math.min(1.0, population / workforceRequired);
    
    // Bonus from surplus workers (diminishing returns)
    surplusWorkers = Math.max(0, population - workforceRequired);
    overstaffBonus = Math.min(
        OVERSTAFFING_BONUS_CAP,  // 0.20 max
        Math.log10(1 + surplusWorkers / workforceRequired) * 0.15
    );
    
    // Final efficiency (minimum UNDERSTAFFED_MINIMUM = 0.25)
    workforceEfficiency = Math.max(UNDERSTAFFED_MINIMUM, staffingRatio + overstaffBonus);
}
```

### Production Rate

```typescript
finalRate = (BASE_PRODUCTION + buildingProduction) * workforceEfficiency * stabilityMultiplier
```

Where:
- `BASE_PRODUCTION` = 100 (constant from mechanics.ts)
- `buildingProduction` = sum of production values from all buildings of that type
- `stabilityMultiplier` = productivity / 100 (from existing stability formula)

---

## Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `BASE_STAFFING_REQUIREMENT` | 3 | mechanics.ts | Workers per production building at level 1 |
| `STAFFING_PER_LEVEL` | 2 | mechanics.ts | Additional workers per building level |
| `OVERSTAFFING_BONUS_CAP` | 0.20 | mechanics.ts | Max 20% bonus from excess workers |
| `UNDERSTAFFED_MINIMUM` | 0.25 | mechanics.ts | Buildings always produce at least 25% |

---

## Population Sources

### Colony Hub

Provides both stability AND population per level:

| Level | Stability | Population |
|-------|-----------|------------|
| 1 | +100 | +20 |
| 2 | +150 | +35 |
| 3 | +200 | +50 |
| 4 | +300 | +75 |
| 5 | +500 | +100 |

### Housing Units

Provide population but decrease stability:

| Level | Population | Stability |
|-------|------------|-----------|
| 1 | +10 | -10 |
| 2 | +15 | -15 |
| ... | ... | ... |
| 12 | +85 | -85 |

---

## Staffing Requirements

Production buildings have `staffingRequirement` field in their level stats:

| Building | Level 1 | Level 5 | Level 10 |
|----------|---------|---------|----------|
| Carbon Processor | 3 | 11 | 21 |
| Titanium Extractor | 3 | 11 | 21 |
| Hydroponics | 4 | 12 | 22 |

Default fallback formula if not specified: `BASE_STAFFING_REQUIREMENT + (level - 1) * STAFFING_PER_LEVEL`

---

## File Locations

### Server

| File | Purpose |
|------|---------|
| `server/src/constants/mechanics.ts` | Workforce economy constants |
| `server/src/constants/buildingData.ts` | Building stats including `staffingRequirement` and Colony Hub `population` |
| `server/src/services/planetService.ts` | `calculatePlanetRates()` - core calculation logic |

### Client

| File | Purpose |
|------|---------|
| `client/src/components/GlobalHUD.tsx` | Workforce efficiency indicator in top bar |
| `client/src/components/GlobalHUD.css` | `.workforce-group` styles |
| `client/src/components/PlanetInterior.tsx` | Workforce stat in resources bar + detailed modal panel |

---

## API Response

The `calculatePlanetRates()` function returns new fields for UI consumption:

```typescript
{
  // ...existing fields
  workforceRequired: number,      // Total workers needed by production buildings
  workforceEfficiency: number,    // 0.25 to ~1.20 (after bonus cap)
  staffingRatio: number,          // population / required (capped at 1.0)
  overstaffBonus: number          // 0 to 0.20 bonus from excess workers
}
```

These are available in the client via `planetData?.stats?.workforceEfficiency` etc.

---

## UI Components

### GlobalHUD Indicator

Located next to the stability indicator:
- **Icon**: 👷 worker emoji
- **Color**: Green (≥100%), Yellow (50-99%), Red (<50%)
- **Hover dropdown**: Shows workers available, required, staffing ratio, bonus

### PlanetInterior Resources Bar

Shows `population/required` with efficiency percentage. Clickable to open detailed panel.

### Workforce Details Panel

Modal showing:
1. Workers Available / Workers Required summary cards
2. Efficiency calculation breakdown
3. Population sources (Colony Hub, Housing Units by level)
4. Staffing requirements (each production building by level)
5. Tips section

---

## Testing

### Automated Verification

```bash
cd server && npx ts-node src/scripts/verifyWorkforce.ts
```

Tests:
- Colony Hub provides population
- Production buildings create staffing requirements
- Understaffing reduces efficiency (down to 25% minimum)
- Overstaffing provides bonus (up to 20%)
- Housing units add population

### Manual Testing

1. Build production buildings → workforce requirement increases
2. Build housing → workforce improves
3. Upgrade Colony Hub → both population and stability increase
4. Click workforce indicator → see detailed breakdown
5. Verify production rates match calculations

---

## Design Rationale

### Why Three-Way Tension?

The previous system (similar to Goodgame Empire) had diminishing returns on production buildings but NOT on stability buildings, leading to "solved" optimal strategies where players just spam stability buildings.

This system creates actual tradeoffs:
- More production buildings need more workers
- More housing gives workers but hurts stability
- Stability multiplies worker efficiency

### Why Colony Hub Provides Both?

As the only starting building, Colony Hub provides enough population (20) and stability (100) for early game without requiring housing. Upgrading it is expensive but provides the most efficient population/stability ratio, rewarding long-term investment.

### Why Minimum 25% Production?

Prevents completely dead buildings. Even severely understaffed buildings produce something, avoiding frustrating zero-production scenarios.

### Why Log-Based Overstaffing Bonus?

Diminishing returns prevent "population spam" from being optimal. The log function provides decent early bonus that flattens quickly:
- 2x population → ~5% bonus
- 3x population → ~7% bonus
- 10x population → ~15% bonus (approaching 20% cap)
