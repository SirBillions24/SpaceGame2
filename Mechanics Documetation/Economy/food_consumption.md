# Food Consumption & Variable Upkeep

## Overview
Units consume Food hourly. Different unit types consume food at different rates (Variable Upkeep). Maintaining a positive food balance is critical to prevent **Desertion**.

## Unit Upkeep Rates (Food/Hour)

| Unit Type | Upkeep | Role |
|-----------|--------|------|
| **Marine** | 4 | Standard Infantry |
| **Ranger** | 3 | Light/Ranged |
| **Sentinel** | 6 | Heavy/Defense |
| **Interceptor** | 10 | Light Fleet |
| **Cruiser** | 50 | Heavy Fleet |

*Rates are defined in `server/src/constants/mechanics.ts`.*

## Net Production Calculation

```
Net Food = (Total Food Production × Productivity%) - Total Upkeep
```

- **Food Production**: Base production from Hydroponics buildings + Research + Bakery bonuses.
- **Productivity**: Determined by Public Order (System Stability).
- **Total Upkeep**: Sum of all stationed units' upkeep.

## Desertion Mechanics
If `Food` reaches 0 and `Net Food` is negative (Consumption > Production), troops will desert.

1.  **Sustainable Limit**: Calculated based on current Food Production.
2.  **Deficit Ratio**: `Sustainable / Total Upkeep`.
3.  **Desertion**: Troops are removed until total upkeep matches sustainable production.

> [!WARNING]
> Desertion happens instantly when food runs out. Always keep a buffer or Station troops in Outposts with high food production.
