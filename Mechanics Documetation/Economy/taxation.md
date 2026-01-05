# Taxation System

## Overview
Taxation allows you to generate Credits (C) from your population. However, high taxes reduce Public Order (System Stability), which impacts your overall resource production efficiency.

## Formulas

### Revenue Calculation
Credits are generated hourly based on your population and the current tax rate.

```
Credit Revenue/Hour = Population × (Tax Rate / 100) × 5
```

*Note: The multiplier (5) is a balance factor subject to adjustment.*

### Public Order Penalty
Taxation causes unrest among the population.

```
Public Order Penalty = Tax Rate × 2
```

**Example:**
- Tax Rate 10% -> -20 Public Order
- Tax Rate 50% -> -100 Public Order

## Strategy
- **Low Tax (0-10%)**: Maintains high Public Order for maximum resource productivity and recruitment speed.
- **High Tax (40-50%)**: Generates credits quickly but significantly hurts production due to Public Order penalties.
- **Optimal Balance**: Adjust based on current needs. If you need Credits for recruitment, raise taxes temporarily. If you need Food/Materials, lower taxes.
