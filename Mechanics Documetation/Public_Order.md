# Public Order System - Good Game Empire

## Overview
**Public Order** represents the general peace or unrest of the population in your castle and outposts. It is a critical economic mechanic that directly affects resource production efficiency, recruitment speed, and healing speed.

### Visual Indicator
Public Order is displayed as a bar at the top of the castle interface, showing current PO level and its effect on productivity.

### Core Impact
- **Positive Public Order**: Increases production, recruitment, and healing speeds
- **Negative Public Order**: Decreases production, recruitment, and healing speeds
- **Neutral (0 PO)**: 100% baseline efficiency

---

## Public Order Effects

### What Public Order Affects

**Resource Production**:
- Wood production (Woodcutter, Forest Lodge, Relic Woodcutter)
- Stone production (Stone Quarry, Stone Works, Relic Quarry)
- Food production (Farmhouse, Granary, Relic Greenhouse, Relic Conservatory)
- Kingdom resources (Charcoal Burner, Olive Grove, Glass Furnace, Iron Mine)

**Military Operations**:
- Soldier recruitment speed (Barracks)
- Tool production speed (Defense Workshop, Siege Workshop)
- Healing speed (Military Hospital)

**What Public Order DOES NOT Affect**:
- Combat strength or defensive power
- Castle storage capacity
- Research speed
- Building construction time
- Loot from attacks

---

## Productivity Calculation Formulas

Public Order uses **two different mathematical formulas** depending on whether PO is positive or negative.

### Formula 1: Positive Public Order (PO ≥ 0)

```
Productivity (P) = √(PO) × 2 + 100
```

**Where**:
- P = Productivity percentage
- PO = Public Order value
- √ = Square root function

**Example Calculations**:

| Public Order | Calculation | Productivity | Effect |
|--------------|-------------|--------------|---------|
| 0 | √(0) × 2 + 100 | 100% | Baseline |
| 100 | √(100) × 2 + 100 | 120% | +20% |
| 400 | √(400) × 2 + 100 | 140% | +40% |
| 900 | √(900) × 2 + 100 | 160% | +60% |
| 1,600 | √(1,600) × 2 + 100 | 180% | +80% |
| 2,500 | √(2,500) × 2 + 100 | 200% | +100% |
| 10,000 | √(10,000) × 2 + 100 | 300% | +200% |

### Formula 2: Negative Public Order (PO < 0)

```
Productivity (P) = 100 × (100 / (100 + 2 × √(-PO)))
```

**Where**:
- P = Productivity percentage
- PO = Public Order value (negative)
- √(-PO) = Square root of absolute value

**Example Calculations**:

| Public Order | Calculation | Productivity | Effect |
|--------------|-------------|--------------|---------|
| 0 | 100 × (100 / 100) | 100% | Baseline |
| -100 | 100 × (100 / 120) | 83.33% | -16.67% |
| -400 | 100 × (100 / 140) | 71.43% | -28.57% |
| -900 | 100 × (100 / 160) | 62.50% | -37.50% |
| -1,600 | 100 × (100 / 180) | 55.56% | -44.44% |
| -2,500 | 100 × (100 / 200) | 50.00% | -50.00% |
| -10,000 | 100 × (100 / 300) | 33.33% | -66.67% |

---

## Detailed Productivity Tables

### Positive Public Order Productivity

| PO | Productivity | Bonus | | PO | Productivity | Bonus |
|----|--------------|-------|-|----|--------------|-------|
| 0 | 100.00% | +0% | | 1,000 | 163.25% | +63.25% |
| 25 | 110.00% | +10% | | 1,100 | 166.33% | +66.33% |
| 50 | 114.14% | +14.14% | | 1,200 | 169.28% | +69.28% |
| 100 | 120.00% | +20% | | 1,300 | 172.11% | +72.11% |
| 150 | 124.49% | +24.49% | | 1,400 | 174.83% | +74.83% |
| 200 | 128.28% | +28.28% | | 1,500 | 177.46% | +77.46% |
| 250 | 131.62% | +31.62% | | 1,600 | 180.00% | +80% |
| 300 | 134.64% | +34.64% | | 1,700 | 182.46% | +82.46% |
| 400 | 140.00% | +40% | | 1,800 | 184.85% | +84.85% |
| 500 | 144.72% | +44.72% | | 1,900 | 187.18% | +87.18% |
| 600 | 148.99% | +48.99% | | 2,000 | 189.44% | +89.44% |
| 700 | 152.92% | +52.92% | | 2,500 | 200.00% | +100% |
| 800 | 156.57% | +56.57% | | 3,000 | 209.54% | +109.54% |
| 900 | 160.00% | +60% | | 5,000 | 241.42% | +141.42% |

### Negative Public Order Productivity

| PO | Productivity | Penalty | | PO | Productivity | Penalty |
|-----|--------------|---------|------|--------------|---------|
| 0 | 100.00% | 0% | | -1,000 | 61.27% | -38.73% |
| -25 | 90.91% | -9.09% | | -1,100 | 60.15% | -39.85% |
| -50 | 87.64% | -12.36% | | -1,200 | 59.11% | -40.89% |
| -100 | 83.33% | -16.67% | | -1,300 | 58.14% | -41.86% |
| -150 | 80.33% | -19.67% | | -1,400 | 57.24% | -42.76% |
| -200 | 77.97% | -22.03% | | -1,500 | 56.39% | -43.61% |
| -250 | 75.97% | -24.03% | | -1,600 | 55.56% | -44.44% |
| -300 | 74.26% | -25.74% | | -1,700 | 54.78% | -45.22% |
| -400 | 71.43% | -28.57% | | -1,800 | 54.05% | -45.95% |
| -500 | 69.08% | -30.92% | | -1,900 | 53.35% | -46.65% |
| -600 | 67.11% | -32.89% | | -2,000 | 52.70% | -47.30% |
| -700 | 65.45% | -34.55% | | -2,500 | 50.00% | -50% |
| -800 | 64.00% | -36.00% | | -3,000 | 47.73% | -52.27% |
| -900 | 62.50% | -37.50% | | -5,000 | 41.42% | -58.58% |

---

## Mathematical Properties

### Diminishing Returns (Positive PO)

**Square root relationship** means diminishing returns on investment:

| PO Increase | Starting PO | Ending PO | Productivity Gain |
|-------------|-------------|-----------|-------------------|
| +100 | 0 | 100 | +20% (0% → 20%) |
| +100 | 100 | 200 | +8.28% (20% → 28.28%) |
| +100 | 900 | 1,000 | +3.25% (60% → 63.25%) |
| +100 | 2,400 | 2,500 | +1.55% (98.45% → 100%) |

**Implication**: Early PO investments are highly valuable; late investments provide minimal benefit.

### Accelerating Penalties (Negative PO)

**Square root in denominator** creates accelerating penalties:

| PO Decrease | Starting PO | Ending PO | Productivity Loss |
|-------------|-------------|-----------|-------------------|
| -100 | 0 | -100 | -16.67% (100% → 83.33%) |
| -100 | -100 | -200 | -5.36% (83.33% → 77.97%) |
| -100 | -900 | -1,000 | -1.23% (62.50% → 61.27%) |
| -100 | -2,400 | -2,500 | -0.55% (50.55% → 50%) |

**Implication**: Initial negative PO is very damaging; deeper negative values matter less.

### Critical PO Thresholds

**Positive PO Goals**:
- **100 PO**: +20% efficiency (good early target)
- **400 PO**: +40% efficiency (solid mid-game)
- **900 PO**: +60% efficiency (strong end-game)
- **2,500 PO**: +100% efficiency (double production, maximum practical goal)

**Negative PO Danger Zones**:
- **-100 PO**: -16.67% efficiency (noticeable slowdown)
- **-400 PO**: -28.57% efficiency (significant impact)
- **-900 PO**: -37.50% efficiency (major handicap)
- **-2,500 PO**: -50% efficiency (half production, critical problem)

---

## Ways to Increase Public Order

### 1. Decorative Items (Primary Method)

**Standard Decorations**:
- Basic decorations: +10 to +50 PO each
- Mid-tier decorations: +100 to +500 PO each
- Premium decorations: +1,000+ PO each

**Event Decorations** (Most Powerful):
- Individual Rewards (3rd place or better): +2,500 to +5,000 PO
- Alliance Rewards (Top 5): +3,000 to +10,000 PO
- Difficulty Mode rewards: Higher PO bonuses

**Event Sources**:
- War of the Realms
- Nomad Invasion
- Bloodcrow Invasion
- Samurai Invasion
- Berimond Events

**Decoration Management**:
- Store decorations in Storehouse when not needed
- Move between castles/outposts as needed
- Apply strategically to production-focused locations

### 2. Fusion Forges

**Mechanic**: Upgrade decorations to higher levels
- Level 2 decoration: Increased PO bonus
- Level 3 decoration: Further increased PO
- Exponential PO growth per fusion level

**Investment**: Requires Fusion Forge building and upgrade materials

### 3. Defense Upgrades

**Buildings that provide PO when upgraded**:
- Keep
- Castle Gate
- Castle Walls
- Towers
- Moat
- Other defensive structures

**Typical PO Bonuses**: +10 to +100 PO per building level

### 4. Relic Castellan Equipment

**Specific castellans** provide PO bonuses when equipped:
- Economic-focused castellan sets
- Not all castellans have this effect
- Must be actively equipped to gain benefit

**Warning**: Verify castellan has "Public Order" in economy effects before purchasing/using

### 5. Building Repairs

**Fire Damage**: Burned buildings cause negative PO
**Solution**: Repair all burned buildings immediately
**Cost**: Resources to repair
**PO Recovery**: Restores lost PO from fire damage

### 6. Build Items (Appearance Items)

**Temporary Build Items**:
- Some provide PO bonuses when attached
- Typically +50 to +200 PO per item
- Can be moved between buildings

### 7. Storehouse Application

**Mechanic**: Apply stored decorations to active castles/outposts
**Benefit**: Activate dormant PO bonuses
**Flexibility**: Move decorations based on current production needs

### 8. Alliance Subscription

**Premium Feature**: Alliance-wide PO bonus
**Benefit**: Passive PO increase for all alliance members
**Cost**: Real money subscription

---

## Ways to Decrease Public Order

### 1. Population Buildings (Primary Cause)

**Dwellings**:
- Level 1: -10 PO
- Level 6: -35 PO
- Level 12: -85 PO

**Town Houses**:
- Same PO penalties as Dwellings
- Cannot be burned but still reduce PO

**Problem Scaling**: Multiple dwellings compound the penalty
- 5× Level 12 Dwellings = -425 PO total
- 10× Level 12 Dwellings = -850 PO total

### 2. Unrest from Attacks

**Fire Damage**:
- Looting attacks can burn buildings
- Sabotage can cause fires
- Plague from Plague Camp

**PO Impact**: Each burned building = significant negative PO
**Duration**: Until repaired
**Mitigation**: Quick repairs, fire protection buildings

### 3. Decoration Management

**Storing Decorations**: Removes PO bonus from castle
**Selling Decorations**: Permanent loss of PO source
**Demolishing Decorations**: Same as selling

**Risk**: Accidentally reducing PO below optimal levels

### 4. Building Demolition

**Effect**: Buildings with PO bonuses lose that bonus when demolished
**Examples**: Defense buildings, certain decorations
**Impact**: Permanent until rebuilt

### 5. Equipment Changes

**Unequipping Relic Castellan**: Loses PO bonus
**Switching to Combat Castellan**: May lose economic PO bonus
**Solution**: Maintain economic castellan in production castles

### 6. Build Item Removal

**Disassembling Appearance Items**: Removes PO bonus
**Storage**: Items in storage don't provide PO
**Management**: Track which items provide PO before removing

---

## Practical Impact Examples

### Example 1: Resource Production

**Scenario**: Castle with 10 Level 11 Woodcutters (72 wood/hour each)

| Public Order | Productivity | Total Wood/Hour | Difference vs Baseline |
|--------------|--------------|-----------------|------------------------|
| +2,500 | 200% | 1,440/hour | +720/hour |
| +900 | 160% | 1,152/hour | +432/hour |
| +400 | 140% | 1,008/hour | +288/hour |
| 0 | 100% | 720/hour | Baseline |
| -400 | 71.43% | 514/hour | -206/hour |
| -900 | 62.50% | 450/hour | -270/hour |
| -2,500 | 50% | 360/hour | -360/hour |

**Daily Impact** (+2,500 PO vs -2,500 PO):
- 1,440/hour vs 360/hour = 4× production difference
- Daily: 34,560 wood vs 8,640 wood
- **Extra production**: 25,920 wood per day

### Example 2: Military Hospital Healing

**Scenario**: 10,000 injured soldiers, 24-hour heal time at 100% productivity

| Public Order | Productivity | Actual Heal Time | Time Saved/Lost |
|--------------|--------------|------------------|-----------------|
| +2,500 | 200% | 12 hours | -12 hours |
| +900 | 160% | 15 hours | -9 hours |
| +400 | 140% | 17.14 hours | -6.86 hours |
| 0 | 100% | 24 hours | Baseline |
| -400 | 71.43% | 33.6 hours | +9.6 hours |
| -900 | 62.50% | 38.4 hours | +14.4 hours |
| -2,500 | 50% | 48 hours | +24 hours |

**Impact**: At -2,500 PO, healing takes **double** the time compared to 0 PO, and **quadruple** compared to +2,500 PO.

### Example 3: Soldier Recruitment

**Scenario**: Training 1,000 soldiers, 10-hour base time

| Public Order | Productivity | Actual Time | Soldiers/Day (Continuous) |
|--------------|--------------|-------------|---------------------------|
| +2,500 | 200% | 5 hours | 4,800 |
| +900 | 160% | 6.25 hours | 3,840 |
| +400 | 140% | 7.14 hours | 3,360 |
| 0 | 100% | 10 hours | 2,400 |
| -400 | 71.43% | 14 hours | 1,714 |
| -900 | 62.50% | 16 hours | 1,500 |
| -2,500 | 50% | 20 hours | 1,200 |

**Long-term Impact**: Over 30 days, +2,500 PO produces **144,000 soldiers** vs **36,000 soldiers** at -2,500 PO (4× difference).

---

## Strategic PO Management

### Optimal PO Targets by Castle Type

**Production Castle** (Main/Resource Outposts):
- **Minimum Target**: +400 PO (+40% production)
- **Recommended**: +900 PO (+60% production)
- **Optimal**: +2,500 PO (+100% production)
- **Strategy**: Maximize event decorations, avoid dwellings

**Military Castle** (Troop Training Focus):
- **Minimum Target**: +400 PO
- **Recommended**: +900 to +1,600 PO
- **Strategy**: Balance recruitment speed with barracks capacity

**Tax Castle** (If using dwelling strategy):
- **Expected PO**: Often negative due to dwellings
- **Mitigation**: Use event decorations to offset
- **Goal**: Get as close to 0 PO as possible
- **Realistic**: -200 to +200 PO range

**Defensive Castle** (Combat-focused):
- **PO Priority**: Low (combat unaffected by PO)
- **Acceptable Range**: -500 to +500 PO
- **Strategy**: Focus on defenses over decorations

### PO Investment Priority

**Phase 1: Foundation (0 to +400 PO)**
- Use basic decorations from quests/early game
- Build and upgrade defensive structures
- Avoid building dwellings
- **ROI**: Highest return per PO point

**Phase 2: Optimization (+400 to +900 PO)**
- Participate in events for premium decorations
- Use Fusion Forges on best decorations
- Equip economic castellans
- **ROI**: Good return, noticeable impact

**Phase 3: Maximization (+900 to +2,500 PO)**
- Collect all event decorations (top rankings)
- Max fusion levels on premium items
- Alliance subscriptions
- **ROI**: Diminishing returns, but reaches maximum efficiency

**Phase 4: Diminishing Returns (+2,500+ PO)**
- Very limited practical benefit
- Only for completionists
- **ROI**: Minimal, not recommended focus

---

## Common PO Mistakes

### Mistake 1: Building Too Many Dwellings

**Problem**: Each Level 12 Dwelling = -85 PO
**Impact**: 5 dwellings = -425 PO = ~30% production loss

**Solution**:
- Limit dwellings to essential minimum
- Use Town Houses if building dwellings (cannot burn)
- Consider Storm Islands for dwelling placement (separate PO)

### Mistake 2: Ignoring Fire Damage

**Problem**: Burned buildings cause ongoing negative PO
**Impact**: Can drop PO by -100 to -500 depending on damage

**Solution**:
- Build Fire Station for fire protection
- Repair fires immediately when they occur
- Use fire-resistant layouts

### Mistake 3: Selling Event Decorations

**Problem**: Event decorations worth +2,500 to +10,000 PO
**Impact**: Permanent loss of massive PO source

**Solution**:
- Never sell event decorations
- Store in Storehouse if space needed
- Move to outposts rather than delete

### Mistake 4: Not Using Storehouse

**Problem**: Decorations sitting in storage don't provide PO
**Impact**: Missing potential +1,000 to +10,000 PO

**Solution**:
- Apply all decorations to active castles
- Rotate decorations based on production needs
- Use outposts to place extra decorations

### Mistake 5: Wrong Castellan Equipment

**Problem**: Combat castellan in production castle
**Impact**: Missing potential +100 to +500 PO from economic castellan

**Solution**:
- Use economic castellans in production castles
- Save combat castellans for defensive outposts
- Verify castellan bonuses before equipping

---

## Advanced PO Strategies

### Strategy 1: Event Decoration Farming

**Goal**: Collect maximum PO decorations from events

**Method**:
1. Participate in all major events (War of Realms, Nomad, etc.)
2. Target at least 3rd place individual rewards
3. Alliance should aim for Top 5 rewards
4. Store decorations long-term

**Expected Gain**: +5,000 to +20,000 PO per event
**Time Investment**: 3-7 days per event
**Frequency**: Events occur monthly

### Strategy 2: Outpost Specialization

**Production Outpost**:
- Maximum PO (+2,500 goal)
- All event decorations applied
- No dwellings
- Economic castellan

**Military Outpost**:
- Moderate PO (+900)
- Focus on recruitment speed
- Some decorations

**Tax Outpost** (Storm Islands):
- Accept negative PO
- Place all dwellings here
- Separate PO from main castle

### Strategy 3: Fusion Forge Prioritization

**Best Decorations to Fuse**:
1. Event decorations (+2,500+ base)
2. Premium decorations (+1,000+ base)
3. High-value standard decorations (+500+)

**Fusion Math Example**:
- Base decoration: +2,500 PO
- Fused to Level 2: +5,000 PO (estimated)
- Fused to Level 3: +10,000 PO (estimated)

**Resource Investment**: Significant, but permanent boost

### Strategy 4: Alliance Coordination

**Alliance Benefits**:
- Top 5 alliance event rewards
- Alliance subscription PO bonus
- Shared decoration trading (if available)

**Coordination**:
- Entire alliance targets same events
- Maximize alliance reward tiers
- Share strategies for PO optimization

---

## PO Break-Even Analysis

### Dwelling PO Cost Analysis

**Question**: How many event decorations needed to offset dwellings?

**Calculation**:
- 5× Level 12 Dwellings = -425 PO
- Need +425 PO to break even
- 1× event decoration (+2,500 PO) = surplus of +2,075 PO

**Conclusion**: A single top-tier event decoration exceeds penalty from 5 max-level dwellings.

### ROI: Event Participation for PO

**Event Time Investment**: 20-40 hours over event duration

**PO Gain**: +2,500 to +10,000 PO

**Production Increase**:
- +2,500 PO = +100% production (double)
- 10× Level 11 Woodcutters = +720 wood/hour
- Daily bonus: +17,280 wood
- Monthly bonus: +518,400 wood

**Value**: Single event decoration worth millions of resources over time

---

## Public Order FAQ

### Q: Does Public Order affect combat?
**A**: No. PO only affects economic activities (production, recruitment, healing). Defense and attack power are unaffected.

### Q: Is negative PO ever acceptable?
**A**: Situationally, yes:
- Tax-focused castles (dwelling strategy)
- Storm Islands outposts (separate PO pool)
- Temporary situations (fire damage being repaired)
- Generally, avoid negative PO in production castles

### Q: What's the practical maximum PO?
**A**: +2,500 to +5,000 PO is realistic maximum for dedicated players
- Requires all top event decorations
- Fusion Forge upgrades
- Alliance subscriptions
- Economic castellan

**Beyond +5,000 PO**: Possible but diminishing returns make it impractical

### Q: How much PO do I need?
**A**: Depends on castle purpose:
- **Production castle**: +900 to +2,500 PO
- **Military castle**: +400 to +900 PO
- **Defensive castle**: 0 to +400 PO acceptable
- **Tax castle**: -200 to +200 PO acceptable

### Q: Can I transfer decorations between castles?
**A**: Yes, using the Storehouse:
1. Store decoration from Castle A
2. Go to Castle B
3. Place decoration from Storehouse

### Q: Do decorations stack?
**A**: Yes. All decoration PO values sum together:
- 5× decorations at +2,500 each = +12,500 total PO

### Q: What happens at exactly 0 PO?
**A**: 100% baseline productivity. Neither bonus nor penalty.

---

## Mathematical Deep Dive

### Why Square Root Functions?

**Design Choice**: Square root creates natural balance
- **Early PO**: High marginal value (encourages investment)
- **Late PO**: Diminishing returns (prevents infinite scaling)
- **Negative PO**: Harsh initial penalty (discourages neglect)

### Formula Comparison

**At +1,600 PO**:
- √(1,600) × 2 + 100 = 180% productivity
- 40 × 2 + 100 = 180%

**At -1,600 PO**:
- 100 × (100 / (100 + 2 × √(1,600)))
- 100 × (100 / (100 + 80))
- 100 × (100 / 180)
- 55.56% productivity

**Symmetry Note**: Formulas are NOT symmetric. Negative PO is more forgiving than positive PO is generous at extreme values.

### Derivative Analysis (Advanced)

**Positive PO derivative**:
```
dP/dPO = 1/√(PO)
```
- At PO=100: Rate = 0.10 (10% productivity per 100 PO)
- At PO=2,500: Rate = 0.02 (2% productivity per 100 PO)
- Shows diminishing marginal returns

**Negative PO derivative**:
```
dP/dPO = 100 × (100 / (100 + 2√(-PO))²) × (1/√(-PO))
```
- Complex function showing accelerating damage initially
- Then diminishing additional penalty at extreme negative

---

## Quick Reference Tables

### PO Goals by Player Type

| Player Type | Target PO | Method |
|-------------|-----------|--------|
| New Player | +100 to +400 | Basic decorations, quest rewards |
| Casual Player | +400 to +900 | Event participation, some decorations |
| Active Player | +900 to +1,600 | Regular events, fusion forges |
| Hardcore Player | +1,600 to +2,500 | Top event rankings, max decorations |
| Whale | +2,500+ | Everything maxed, alliance subscription |

### PO Sources Priority List

1. **Event Decorations** (3rd+ place): +2,500 to +10,000 each
2. **Fusion Forges**: 2-4× multiplier on existing decorations
3. **Alliance Top 5 Rewards**: +3,000 to +10,000
4. **Economic Castellan**: +100 to +500
5. **Defense Upgrades**: +10 to +100 per building
6. **Standard Decorations**: +10 to +500 each
7. **Alliance Subscription**: Variable bonus

### PO Penalties to Avoid

1. **Dwellings**: -10 to -85 each (worst offender)
2. **Fire Damage**: -20 to -100 per burned building
3. **Town Houses**: -10 to -85 each (same as dwellings)
4. **Missing Decorations**: 0 (opportunity cost)

---

## Conclusion

Public Order is a **critical but often overlooked** economic mechanic in Good Game Empire. The difference between optimized PO (+2,500) and poor PO (-2,500) can mean:
- **4× resource production** difference
- **4× recruitment speed** difference  
- **4× healing speed** difference

**Key Takeaway**: Invest heavily in event decorations, avoid dwellings in production castles, and maintain +400 to +2,500 PO depending on castle purpose.

The square root formulas create a balanced system where:
- Early PO investment is highly valuable
- Mid-range PO (400-900) provides strong benefits
- Extreme PO (+2,500+) offers diminishing but still worthwhile returns
- Negative PO should be avoided at nearly all costs

Mastering Public Order management is essential for competitive play and efficient resource generation.
