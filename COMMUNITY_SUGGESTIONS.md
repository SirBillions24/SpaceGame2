# Community Suggestions Analysis

> **Last Updated:** January 13, 2026  
> **Status:** Under Review

This document tracks community-suggested features and mechanics changes. Each suggestion is analyzed for feasibility, implementation difficulty, and potential impact on game balance.

## Status Legend

| Status | Meaning |
|--------|---------|
| 🟢 **Approved** | Ready for implementation |
| 🟡 **Under Review** | Needs further discussion |
| 🔴 **Rejected** | Will not be implemented |
| ⚪ **Pending** | Not yet reviewed |

---

## 1. Mobile Outpost Ship

**Status:** 🟡 Under Review  
**Priority:** High  
**Complexity:** ★★★★☆ (4/5)

### Concept Summary

A deployable capital-scale logistics ship that acts as a forward operating base. Players commit the ship to a location for a declared duration, enabling regional warfare mechanics.

### Proposed Mechanics

| Feature | Details |
|---------|---------|
| **Deployment** | Player selects target location + commitment duration (3/7 days) |
| **Travel** | Uses normal fleet travel rules (not instant) |
| **Lock-in** | Once arrived, ship cannot move until duration expires |
| **Benefits** | Reduces travel time from ship position, enables local attack staging |
| **Risk** | Ship is attackable and destructible |
| **Rebuild** | Long build time + expensive resources + cooldown before redeploy |

### Feasibility Analysis

> [!TIP]
> This is architecturally feasible and aligns well with existing fleet and planet systems.

**What We Already Have:**
- Fleet travel system in `fleetService.ts` with configurable `BASE_FLEET_SPEED` and `MIN_TRAVEL_TIME`
- Planet coordinate system (5000x5000 map)
- BullMQ job queue for timed events (arrival, return, duration expiry)
- Admiral attachment to fleets

**New Systems Required:**

| Component | Effort | Description |
|-----------|--------|-------------|
| **New Entity Type** | Medium | `outpost_ship` table with position, state, owner, deployed_until |
| **Travel Time Modifier** | Low | Query outpost position when calculating fleet travel times |
| **Combat Against Outposts** | Medium | Extend combat system to handle outpost targets |
| **Duration Lock System** | Low | BullMQ job scheduled on deployment to unlock ship |
| **Build Queue Extension** | Low | Special build type with cooldown tracking |

**Files Likely Affected:**
- `server/src/services/fleetService.ts` - Travel time calculations
- `server/src/services/combatService.ts` - Outpost as combat target
- New: `server/src/services/outpostService.ts`
- New: `server/src/constants/outpostConfig.ts`
- `client/src/components/` - New OutpostPanel UI

### Implications

> [!WARNING]
> **Balance Considerations:**
> - Could dramatically shift power toward established alliances
> - Needs careful tuning of rebuild friction vs accessibility
> - May require alliance-based visibility mechanics

**Positive:**
- Creates visible battle lines and regional conflict
- Makes map geography meaningful
- Supports attrition warfare naturally
- Prevents teleport abuse without removing strategic mobility

**Risks:**
- Could enable griefing if rebuild is too easy
- May create "must have" requirements splitting F2P vs P2W
- Alliance coordination could make solo players non-competitive

### Implementation Recommendation

```diff
+ Strong contender - recommend prototyping
+ Start with basic deploy/lock/attack mechanics
+ Iterate on rebuild costs and travel bonuses based on testing
- Defer alliance proximity buffs until core works
```

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## 2. Travel Time & Map Pressure Rework

**Status:** 🟡 Under Review  
**Priority:** High  
**Complexity:** ★★★☆☆ (3/5)

### Problems Identified

| Issue | Impact |
|-------|--------|
| 100+ clicks = painful even with maxed travel upgrades | Player frustration |
| 40-50 min travel for mid accounts | PvP dead on arrival |
| Long travel discourages scouting, retaliation, conflict | Stagnant meta |

### Proposed Solutions

#### Option A: Distance-Scaled Speed Curve

Non-linear speed that accelerates over distance.

```
Current: time = distance / BASE_FLEET_SPEED
Proposed: time = distance^0.7 / BASE_FLEET_SPEED
```

**Feasibility:** ✅ Easy - Single formula change in `fleetService.ts`

**Impact Analysis:**

| Distance | Current (50 speed) | With ^0.7 curve |
|----------|-------------------|-----------------|
| 100 px | 2 sec | 1.3 sec |
| 500 px | 10 sec | 4.3 sec |
| 2000 px | 40 sec | 11.7 sec |
| 5000 px | 100 sec | 22.1 sec |

#### Option B: Soft Warp System (F2P Friendly)

Consumable item that reduces travel time for a single trip.

**Feasibility:** ✅ Medium - New item type + fleet dispatch modification

**Implementation:**
- Add `warp_fuel` resource to player inventory
- On dispatch, optionally consume fuel for % time reduction
- Fuel obtainable through gameplay (NPC loot, events)

#### Option C: Regional Conflict Zones / "Near Home" Bonuses

Speed boost when fighting within X distance of owned planets.

**Current Constants:**
```typescript
// mechanics.ts
export const BASE_FLEET_SPEED = 50;
export const MIN_TRAVEL_TIME = 5;
```

**Proposed Addition:**
```typescript
export const HOME_TERRITORY_RADIUS = 500;      // pixels
export const HOME_TERRITORY_SPEED_BONUS = 0.5; // +50% speed
```

**Feasibility:** ✅ Easy - Query player's planet positions, check if target is within radius

### Implementation Recommendation

```diff
+ Option A (distance curve) is lowest effort, highest impact
+ Option C (home bonus) encourages regional conflict naturally
- Option B requires economy balancing for warp fuel drop rates
```

| Priority | Action |
|----------|--------|
| **Phase 1** | Implement distance^0.7 curve |
| **Phase 2** | Add home territory bonus |
| **Phase 3** | Consider soft warp if still needed |

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## 3. Troop Scale & Damage Meaning

**Status:** 🟡 Under Review  
**Priority:** Medium  
**Complexity:** ★★★★★ (5/5)

### Problems Identified

| Issue | Impact |
|-------|--------|
| 30M troop stacks | Absurd numbers, hard to reason about |
| Small hits feel irrelevant | Discourages guerrilla tactics |
| Large hits impossible solo (F2P) | Power gap frustration |

### Proposed Solutions

#### Option A: Exponential Cost Scaling (Soft Cap)

Make units progressively more expensive as you accumulate them.

```typescript
// Concept: cost multiplier based on total army size
function getRecruitmentCostMultiplier(totalTroops: number): number {
    const threshold = 5000;
    if (totalTroops < threshold) return 1.0;
    return 1 + Math.log10(totalTroops / threshold);
}
```

**Impact at Different Scales:**

| Army Size | Cost Multiplier |
|-----------|-----------------|
| 1,000 | 1.0x |
| 5,000 | 1.0x |
| 50,000 | 2.0x |
| 500,000 | 3.0x |
| 5,000,000 | 4.0x |

**Warning:**
> [!CAUTION]
> This is a MAJOR economy change. Existing players with large armies would face massive cost inflation for replacements. Needs careful migration strategy.

#### Option B: Attrition Model

Small repeated hits degrade economy/morale/efficiency, not just kill troops.

**New Mechanics:**
- `war_exhaustion` stat per planet (0-100)
- Each attack adds exhaustion based on attacker strength
- Exhaustion reduces production efficiency and stability
- Decays slowly over time

**Feasibility:** ⚠️ Medium-High - New stat, combat aftermath logic, UI display

#### Option C: Early-Game Scale Reset

Rebalance entire unit cost/power curve for 1k-5k meaningful fights.

**Current Unit Costs (sample):**
```typescript
marine: { credits: 10 }
guardian: { carbon: 200, titanium: 150, credits: 25 }
```

> [!IMPORTANT]
> This would require a FULL WIPE or parallel "Season 2" server. Not recommended mid-development.

### Implementation Recommendation

```diff
+ Option B (attrition) adds depth without breaking existing economy
+ Option A could work with grandfathering existing armies
- Option C requires full wipe - defer to major launch decision
```

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## 4. HOL / Specialization Systems

**Status:** 🟡 Under Review  
**Priority:** Medium  
**Complexity:** ★★★★☆ (4/5)

### Problems Identified

| Issue | Current State |
|-------|---------------|
| Universal meta builds | Everyone converges on same optimal setup |
| Power creep over strategy | Bigger numbers win, not better decisions |
| No rock-paper-scissors | Faction triangle exists but may not be impactful enough |

### Current System

We already have a faction triangle:
```typescript
// combatBalanceData.ts
FACTION_TRIANGLE = {
    bonus: 0.25,  // 25% damage bonus
    advantages: {
        human: 'mech',
        mech: 'exo',
        exo: 'human',
    }
}
```

### Proposed Enhancements

#### Option A: Mutually Exclusive Skill Branches

Player chooses specialization that locks out alternatives.

**Example Branches:**

| Branch | Bonus | Locked Out |
|--------|-------|------------|
| **Siege Master** | +30% attack power | -20% defense, no access to defensive tools |
| **Fortress Lord** | +40% defense | -30% attack, no access to siege tools |
| **Raider** | +50% fleet speed | -20% loot capacity, -10% combat stats |

**Feasibility:** ⚠️ Medium - New player attribute, unlock system, UI for selection

#### Option B: Amplify Existing Faction Triangle

Increase faction bonus from 25% to 40-50%, making composition choices decisive.

**Change:**
```diff
- bonus: 0.25
+ bonus: 0.40
```

**Feasibility:** ✅ Trivial - Single constant change

**Impact:** Correct faction choice becomes ~2x more important

#### Option C: Defense Archetype Detection

Give attackers hints about defender composition, allowing strategic counters.

**Example:** Intel from espionage shows "Primary faction: Mech (65%)"

**Feasibility:** ✅ Low - Aggregate defender unit factions in espionage report

### Implementation Recommendation

```diff
+ Option B is zero-effort and immediately testable
+ Option C adds strategic depth with minimal work
- Option A requires significant UI/UX work and player education
```

| Priority | Action |
|----------|--------|
| **Phase 1** | Bump faction bonus to 0.40, test impact |
| **Phase 2** | Add faction composition to espionage reports |
| **Phase 3** | Design mutually exclusive branches if still needed |

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## 5. Attack Variety & Tooling

**Status:** 🟡 Under Review  
**Priority:** Medium  
**Complexity:** ★★★☆☆ (3/5)

### Problems Identified

| Issue | Impact |
|-------|--------|
| One "best" tool per slot | No meaningful choice |
| One "best" wave setup | Solved meta |
| Variety exists only in theory | Stale gameplay |

### Current Tool System

```typescript
// toolData.ts - Current tools
'invasion_anchors': { bonusType: 'canopy_reduction', bonusValue: 0.15 }
'plasma_breachers': { bonusType: 'hub_reduction', bonusValue: 0.15 }
'stealth_field_pods': { bonusType: 'ranged_reduction', bonusValue: 0.15 }
```

### Proposed Enhancements

#### Option A: Situational Tool Design

Add tools with pros AND cons, making choice situational.

**Example New Tools:**

| Tool | Pro | Con |
|------|-----|-----|
| **Heavy Breachers** | +30% hub reduction | Attack wave 20% slower |
| **Decoy Swarm** | Absorbs first ranged volley | Takes cargo space (less loot) |
| **EMP Pulse** | Disables mech faction bonus | Damages own mech units |

**Feasibility:** ⚠️ Medium - Extend combat logic to handle conditional effects

#### Option B: Counter-Intelligence Tools

Tools that counter specific defender setups, creating information warfare.

**Examples:**
- **Scanner Drone**: Reveals defender tool loadout before attack lands
- **Jammer Array**: Nullifies one random defender tool type
- **Adaptive Coating**: Reduces effectiveness of defender's most-used defense tool

**Feasibility:** ⚠️ Medium - Requires combat pre-flight visibility mechanics

#### Option C: Fakeouts & Decoys

Misdirection mechanics that add mind games.

**Examples:**
- **Feint Attack**: Costs resources, shows as incoming attack, but cancels before arrival
- **Ghost Fleet**: Fleet appears 2x larger on defender's radar
- **Scrambled Intel**: Defender sees wrong tool loadout

**Feasibility:** ⚠️ Medium-High - New fleet states and defender notification logic

### Implementation Recommendation

```diff
+ Option A (situational tools) adds depth with existing framework
+ Start with 2-3 new tools with clear tradeoffs
- Options B/C require more infrastructure (intel reveals, fake fleets)
```

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## 6. Combat Complexity Balance

**Status:** 🟡 Under Review  
**Priority:** Medium  
**Complexity:** ★★★☆☆ (3/5)

### The Challenge

> "I want this to be complex" vs "Learning curve skyrockets"

### Current System

We have three factions with four unit types each:
- **Human:** Marine, Sniper, Guardian, Commando
- **Mech:** Drone, Automaton, Sentinel, Interceptor  
- **Exo:** Stalker, Spitter, Brute, Ravager

Unit types: `melee`, `ranged`, `heavy`, `elite`, `support`

### Proposed Approach: Layered Mastery

#### Layer 1: New Player (Brute Force Works)
- Any army composition can beat lower-level NPCs
- Faction triangle provides marginal advantage
- UI clearly shows "bring more troops than defender"

#### Layer 2: Intermediate (Composition Matters)
- NPCs have visible faction bias (e.g., "Mech Bastion: 80% Mech units")
- Countering with correct faction gives 40% advantage
- UI teaches "bring Human units against Mech enemies"

#### Layer 3: Advanced (Precision Required)
- High-level NPCs and players use optimized compositions
- Wave timing and tool selection become crucial
- Defender sector assignment requires thought

### Implementation Path

**Current UI Teaches:**
- ❌ Faction advantages (no visible indicator)
- ✅ Wave assignment
- ✅ Tool selection

**Proposed UI Improvements:**

| Feature | Effort | Impact |
|---------|--------|--------|
| Faction indicator on units | Low | High |
| NPC faction breakdown in intel | Low | High |
| "Suggested counter" hint | Medium | Medium |
| Combat preview simulator | High | High |

### Implementation Recommendation

```diff
+ Add faction color-coding to unit icons (trivial)
+ Show NPC faction breakdown in espionage reports
+ Add "effectiveness" rating when selecting troops
- Defer combat simulator until core mechanics stabilize
```

### Decision

- [ ] Approve for implementation
- [ ] Needs design revision
- [ ] Reject

**Notes:**  
_Add discussion notes here_

---

## Implementation Priority Matrix

| Suggestion | Impact | Effort | Recommended Priority |
|------------|--------|--------|---------------------|
| Mobile Outpost Ship | High | High | P2 - After core stable |
| Travel Time Rework | High | Low | **P1 - Quick Win** |
| Troop Scale (Attrition) | Medium | High | P3 - Requires design |
| Faction Triangle Buff | Medium | Trivial | **P1 - Quick Win** |
| Situational Tools | Medium | Medium | P2 |
| Combat UI Improvements | Medium | Low | **P1 - Quick Win** |

---

## Quick Wins (Can Ship This Week)

1. **Increase faction triangle bonus** from 0.25 → 0.40 in `combatBalanceData.ts`
2. **Add distance curve** for travel time: `distance^0.7` in `fleetService.ts`
3. **Add faction to espionage reports** showing defender army composition breakdown

---

## Discussion Log

### January 13, 2026
- Initial document created from community feedback
- Awaiting team review and prioritization decisions

---

> **How to Update This Document:**
> 1. Add new suggestions as new sections following the template above
> 2. Update status emoji when decisions are made
> 3. Check off decision boxes when approved/rejected
> 4. Add dated entries to Discussion Log
