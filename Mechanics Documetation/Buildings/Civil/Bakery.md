# Bakery - Good Game Empire

## Overview
The **Bakery** is a premium civil building that reduces food consumption of soldiers. It is widely considered one of the **most valuable buildings** in the game despite its high ruby cost.

### Building Characteristics
- **Maximum Levels**: 8
- **Category**: Civil Building (Ruby Only)
- **Cost Type**: Rubies only
- **Maximum Reduction**: -40% food consumption (Level 8)
- **Special Property**: **Cannot be demolished** once built
- **Relic Counterpart**: Relic Bakery (5 levels, -25% reduction)

---

## Core Mechanics

### Food Consumption Reduction
The Bakery applies a **percentage reduction** to all soldier food consumption:

**Formula**: 
```
Actual Food Consumed = Base Food Cost × (1 - Bakery Reduction %)
```

**Example with Level 8 Bakery (-40%):**
- Soldier with 10 food/hour base → 6 food/hour actual
- Soldier with 5 food/hour base → 3 food/hour actual
- Soldier with 4 food/hour base → 2.4 food/hour actual

### Stacking with Relic Bakery
**Combined Effect**: Bakery + Relic Bakery = Multiplicative reduction

**Formula**:
```
Total Reduction = 1 - [(1 - Bakery %) × (1 - Relic Bakery %)]
Total Reduction = 1 - [(1 - 0.40) × (1 - 0.25)]
Total Reduction = 1 - [0.60 × 0.75]
Total Reduction = 1 - 0.45 = 0.55 = 55% reduction
```

**Maximum Combined Reduction**: **-65%** (Level 8 Bakery + Level 5 Relic Bakery)

**Example with both buildings:**
- 1,000 units eating 5 food each = 5,000 food/hour base
- Without buildings: 5,000 food/hour
- With Level 8 Bakery only: 3,000 food/hour
- With Level 8 Bakery + Level 5 Relic Bakery: 1,750 food/hour
- **Savings: 3,250 food/hour (65% reduction)**

---

## Level Progression Stats

| Level | Player Level Required | Ruby Cost | XP | Food Consumption Reduction |
|-------|----------------------|-----------|-----|----------------------------|
| 1 | 10 | 650 | 7 | -5% |
| 2 | 11 | 1,250 | 14 | -10% |
| 3 | 13 | 3,650 | 21 | -15% |
| 4 | 17 | 6,250 | 28 | -20% |
| 5 | 23 | 9,450 | 35 | -25% |
| 6 | 27 | 12,500 | 40 | -30% |
| 7 | 33 | 14,750 | 46 | -35% |
| 8 | 40 | 17,000 | 51 | -40% |
| **TOTAL** | - | **65,500** | - | - |

### Cost Progression Analysis
- **Total Ruby Investment**: 65,500 rubies for Level 8
- **Most Expensive Levels**: Level 8 (17,000), Level 7 (14,750), Level 6 (12,500)
- **Early Levels**: Relatively affordable (650-1,250 rubies)
- **Mid-Game Jump**: Level 2→3 increases from 1,250 to 3,650 rubies (+192%)

### Reduction Efficiency

| Level | Cumulative Cost | Reduction | Ruby per 1% Reduction |
|-------|----------------|-----------|----------------------|
| 1 | 650 | -5% | 130 |
| 2 | 1,900 | -10% | 190 |
| 3 | 5,550 | -15% | 370 |
| 4 | 11,800 | -20% | 590 |
| 5 | 21,250 | -25% | 850 |
| 6 | 33,750 | -30% | 1,125 |
| 7 | 48,500 | -35% | 1,386 |
| 8 | 65,500 | -40% | 1,638 |

**Analysis**: Each additional percentage point becomes progressively more expensive in rubies.

---

## Low Level Building System

### Level 1 Bakery - Low Level Stats

| Player Level | Cost | Build Time (hh:mm:ss) |
|--------------|------|----------------------|
| 10 | 650 Rubies | 00:30:00 |
| 11 | 650 Rubies | 01:00:00 |
| 12 | 650 Rubies | 01:10:00 |

### Level 2 Bakery - Low Level Stats

| Player Level | Cost | Build Time (hh:mm:ss) |
|--------------|------|----------------------|
| 11 | 1,250 Rubies | 01:10:00 |
| 12 | 1,250 Rubies | 01:30:00 |

### Level 3 Bakery - Low Level Stats

| Player Level | Cost | Build Time (hh:mm:ss) |
|--------------|------|----------------------|
| 12 | 3,650 Rubies | 01:52:30 |
| 13 | 3,650 Rubies | 03:07:30 |

---

## Historical Updates (Changelog)

### 2011 (?) - Initial Release
- **Exact date unknown**
- Building introduced as ruby-only structure

### February 29, 2012 - First Level Cap Increase
- **Level cap raised from 3 to 4**
- Level 4 Bakery introduced with new appearance
- Implemented between 8:00 a.m. and 12:00 p.m.

### February 20, 2013 - Cost Reduction
- **Level 4 cost reduced from 17,000 to 13,000 rubies**
- Significant affordability improvement
- Implemented between 8:30 a.m. and 11:00 a.m.

### May 20, 2014 - Construction Time Adjustment
- Adjusted construction time for all Bakery levels
- Implemented at around 9:00 a.m.

### October 30, 2014 - Second Level Cap Increase
- **Level cap raised from 4 to 8**
- Major expansion adding 4 new levels
- Implemented between 9:00 a.m. and 11:00 a.m. CET
- **Note**: Empire: Four Kingdoms (sister game) received this update on March 11, 2022

### July 30, 2020 - Storage Feature
- Can now be stored inside Trade District
- Implemented between 8:30 a.m. and 11:00 a.m.

---

## Strategic Analysis

### Why Bakery is Considered the Best Building

**1. Army Sustainability**
- Large armies consume massive amounts of food
- 40% reduction = 40% less food production needed
- Allows maintaining bigger armies with same food infrastructure

**2. Resource Efficiency**
- Reduces need for additional food buildings
- Frees up building slots for other structures
- Lowers dependency on food imports/farming

**3. Universal Application**
- Affects **all soldiers** (melee, ranged, siege, etc.)
- Permanent passive benefit
- No maintenance or upkeep required

**4. Synergy with Relic Bakery**
- Combined 65% reduction transforms food economy
- Makes previously unsustainable armies viable
- Critical for end-game army compositions

### Food Consumption Examples

#### Small Army (1,000 soldiers @ 5 food each)

| Situation | Food per Hour | Daily Food | Monthly Food |
|-----------|---------------|------------|--------------|
| No Bakery | 5,000 | 120,000 | 3,600,000 |
| Level 4 Bakery (-20%) | 4,000 | 96,000 | 2,880,000 |
| Level 8 Bakery (-40%) | 3,000 | 72,000 | 2,160,000 |
| L8 Bakery + L5 Relic (-65%) | 1,750 | 42,000 | 1,260,000 |

**Monthly Savings (Level 8 Bakery)**: 1,440,000 food

#### Large Army (10,000 soldiers @ 5 food each)

| Situation | Food per Hour | Daily Food | Monthly Food |
|-----------|---------------|------------|--------------|
| No Bakery | 50,000 | 1,200,000 | 36,000,000 |
| Level 4 Bakery (-20%) | 40,000 | 960,000 | 28,800,000 |
| Level 8 Bakery (-40%) | 30,000 | 720,000 | 21,600,000 |
| L8 Bakery + L5 Relic (-65%) | 17,500 | 420,000 | 12,600,000 |

**Monthly Savings (Level 8 Bakery)**: 14,400,000 food

### Cost-Benefit Analysis

**Initial Investment**: 65,500 rubies

**Break-even calculation** (example):
- Large army (10,000 units @ 5 food) saves 20,000 food/hour
- If food production buildings cost 50,000 resources each and produce 1,000 food/hour
- Bakery saves equivalent of 20 food production buildings
- Total resource savings: 1,000,000+ resources over time

**Verdict**: Despite high ruby cost, Bakery pays for itself through:
1. Reduced building slot usage
2. Eliminated need for additional food structures
3. Enhanced army sustainability
4. Enabled growth without food constraints

---

## Build Priority Recommendations

### For Ruby Buyers

**Priority Level: HIGHEST**

**Recommended upgrade path:**
1. **Level 1-4** (11,800 rubies): Essential baseline (-20%)
2. **Level 5-6** (21,950 rubies): Strong mid-game (-30%)
3. **Level 7-8** (31,750 rubies): End-game optimization (-40%)

**Build order among ruby buildings:**
1. **Bakery** (top priority)
2. Relic Bakery (if available)
3. Flour Mill (food production boost)
4. Town Houses (if population needed)
5. Other premium buildings

### For F2P Players

**Situation: Harsh Reality**
- 65,500 rubies extremely difficult to obtain free
- Would take months/years of daily ruby collection
- Often not realistic for pure F2P

**Compromise strategies:**
1. **Save for Level 1-2** (1,900 rubies): Achievable goal, provides -10%
2. **Event rubies**: Stockpile from events and achievements
3. **Long-term goal**: Treat Level 8 as multi-year objective
4. **Alternative**: Focus on maximizing food production instead

---

## Advanced Mechanics

### Flour Mill Synergy

**Flour Mill**: Increases food production from:
- Farmhouses
- Granaries
- Relic Greenhouse
- Relic Conservatory

**Combined Strategy**:
- **Flour Mill**: Increases food production (+%)
- **Bakery**: Decreases food consumption (-%)
- **Net Effect**: Dramatically improves food balance

**Example**:
- Base food production: 10,000/hour
- Flour Mill (+25%): 12,500/hour production
- Base food consumption: 8,000/hour
- Bakery (-40%): 4,800/hour consumption
- **Net surplus**: 7,700/hour (vs 2,000/hour without)

### Trade District Storage

**Feature**: Bakery can be stored in Trade District

**Benefits**:
- Temporarily remove Bakery if needed
- Move between castles/outposts
- Reorganize castle layout without losing building

**Limitations**:
- Still cannot be demolished permanently
- Storage only, not deletion
- Must have Trade District building

---

## Comparative Building Values

### Ruby Cost vs Benefit (Subjective Rankings)

| Building | Ruby Cost | Benefit | Value Rating |
|----------|-----------|---------|--------------|
| Bakery (L8) | 65,500 | -40% food consumption | ★★★★★ |
| Relic Bakery (L5) | Varies | -25% food consumption | ★★★★★ |
| Town House (L12) | 52,790 | +115 population | ★★☆☆☆ |
| Flour Mill | Varies | +% food production | ★★★★☆ |

**Reasoning**: Bakery provides universal, permanent, and scalable benefit that affects core gameplay mechanic (army sustainability).

---

## Common Questions

### Q: Should I build Bakery before or after military buildings?
**A**: Early-mid game, focus on military buildings first. Once you have substantial army (5,000+ troops), Bakery becomes critical.

### Q: Which level should I target as a casual ruby buyer?
**A**: Level 4 (-20%) provides good value at 11,800 rubies. Level 6 (-30%) at 33,750 rubies is optimal mid-tier goal.

### Q: Is Level 8 worth the extra 32,750 rubies over Level 6?
**A**: For large armies (20,000+), yes. For smaller armies (<10,000), Level 6 may be sufficient.

### Q: Can I delete/demolish Bakery?
**A**: No. Once built, it's permanent (though can be stored in Trade District).

### Q: Does Bakery affect outpost soldiers?
**A**: Yes, if built in an outpost. If built in main castle, only affects main castle soldiers.

### Q: Should I build multiple Bakeries?
**A**: No! Effects do NOT stack. Maximum 1 Bakery per castle/outpost.

---

## Food Consumption Detailed Examples

### Relic Units (High-Tier Soldiers)

**Example**: 1,000 Relic units (5 food each)

| Scenario | Food/Hour | Daily | Weekly | Monthly |
|----------|-----------|-------|--------|---------|
| No Bakery | 5,000 | 120,000 | 840,000 | 3,600,000 |
| L4 Bakery (-20%) | 4,000 | 96,000 | 672,000 | 2,880,000 |
| L8 Bakery (-40%) | 3,000 | 72,000 | 504,000 | 2,160,000 |
| L8 + Relic L5 (-65%) | 1,750 | 42,000 | 294,000 | 1,260,000 |

**Savings with L8 Bakery**: 
- 2,000 food/hour
- 1,440,000 food/month
- Equivalent to **60 days** of 24-hour food production from a Level 11 Farmhouse

### Mixed Army Composition

**Army**: 
- 5,000 light units (3 food each) = 15,000 food/hour
- 3,000 medium units (4 food each) = 12,000 food/hour
- 2,000 heavy units (5 food each) = 10,000 food/hour
- **Total**: 37,000 food/hour

| Bakery Level | Reduction | Food/Hour | Daily Food | Monthly Savings vs No Bakery |
|--------------|-----------|-----------|------------|------------------------------|
| None | 0% | 37,000 | 888,000 | 0 |
| L4 | -20% | 29,600 | 710,400 | 5,328,000 |
| L6 | -30% | 25,900 | 621,600 | 7,992,000 |
| L8 | -40% | 22,200 | 532,800 | 10,656,000 |

**Analysis**: For large mixed armies, Level 8 Bakery saves over **10 million food per month**.

---

## Final Verdict

### Overall Assessment: ★★★★★ (5/5)

**Bakery is the single most important ruby building in Good Game Empire.**

**Strengths:**
- Universal benefit to all military gameplay
- Permanent passive effect
- Scales with army size
- Critical for late-game viability
- Synergizes with multiple other buildings
- Cannot be destroyed in attacks

**Weaknesses:**
- Extremely expensive (65,500 rubies for max)
- Cannot be demolished if regretted
- F2P accessibility very limited
- Diminishing returns at higher levels

**Recommendation Tiers:**

**ESSENTIAL**: 
- Players with 10,000+ troops
- End-game content focus
- Competitive/PvP oriented
- Ruby purchasers

**HIGHLY RECOMMENDED**:
- Players with 5,000+ troops
- Mid-to-late game progression
- Casual ruby buyers
- Long-term players

**LOW PRIORITY**:
- Early game players (<2,000 troops)
- Pure F2P with no ruby income
- Players with small armies
- Casual/intermittent players

**SKIP**:
- Brand new players
- Players not focused on military
- Those with very limited resources

---

## Investment Timeline for F2P Players

Assuming 50 rubies per day from daily tasks/events:

| Goal | Ruby Cost | Days Required | Months |
|------|-----------|---------------|--------|
| Level 1 | 650 | 13 | 0.4 |
| Level 2 | 1,250 | 25 | 0.8 |
| Level 4 | 6,250 | 125 | 4.2 |
| Level 6 | 12,500 | 250 | 8.3 |
| Level 8 | 17,000 | 340 | 11.3 |
| **Total** | 65,500 | **1,310** | **43.7** |

**Reality Check**: F2P players need almost **4 years** of consistent daily ruby earning to max Bakery. This makes it a **very long-term goal** requiring patience and dedication.
