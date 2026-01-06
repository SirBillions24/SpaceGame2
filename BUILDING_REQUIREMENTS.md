# Building Requirements Guide

## 🏗️ Building Prerequisites for Features

### Defense System Access

**To Access Defense Panel (Defensive Strategy):**
- **Required Building:** Naval Academy (`academy`)
- **Cost:** 500 Carbon, 500 Titanium
- **Size:** 3×3 tiles
- **What it unlocks:**
  - Defense Panel (Defensive Strategy button)
  - Unit Recruitment (Recruitment Console)
  - Defense Turret management (Add Turret button in Defense Panel)

**Note:** The Defensive Grid (`shield_generator`) does NOT unlock the Defense Panel. It only increases your defensive grid level when built/upgraded.

---

### Workshop Access

**Systems Workshop (`defense_workshop`):**
- **Cost:** 400 Carbon, 300 Titanium
- **Size:** 2×2 tiles
- **What it unlocks:**
  - Systems Workshop panel
  - Ability to manufacture defense tools:
    - Auto-Turret (+Shield Generator Power)
    - Blast Door (+Starport Integrity)
    - Targeting Array (+Ranged Unit Power)

**Munitions Factory (`siege_workshop`):**
- **Cost:** 400 Carbon, 300 Titanium
- **Size:** 2×2 tiles
- **What it unlocks:**
  - Munitions Factory panel
  - Ability to manufacture siege tools:
    - Signal Jammer (-Enemy Shield Generator Power)
    - Breach Cutter (-Enemy Starport Integrity)
    - Holo-Decoy (-Enemy Ranged Power)

---

## 📋 Complete Building Reference

### Resource Buildings (No Prerequisites)
- **Carbon Processor** - Produces Carbon
- **Titanium Extractor** - Produces Titanium
- **Hydroponics** - Produces Food

### Military Buildings

**Naval Academy (`academy`):**
- **Required for:**
  - Defense Panel access
  - Unit Recruitment
  - Defense Turret management
- **Cost:** 500 Carbon, 500 Titanium
- **Size:** 3×3 tiles

**Defensive Grid (`shield_generator`):**
- **Effect:** Increases defensive grid level (wall level)
- **Does NOT unlock:** Defense Panel (you need Naval Academy for that)
- **Cost:** 500 Carbon, 1000 Titanium
- **Size:** 2×2 tiles

**Systems Workshop (`defense_workshop`):**
- **Required for:** Manufacturing defense tools
- **Cost:** 400 Carbon, 300 Titanium
- **Size:** 2×2 tiles

**Munitions Factory (`siege_workshop`):**
- **Required for:** Manufacturing siege tools
- **Cost:** 400 Carbon, 300 Titanium
- **Size:** 2×2 tiles

### Other Buildings

**Intelligence Hub (`tavern`):**
- **Cost:** 300 Carbon, 200 Titanium
- **Size:** 2×2 tiles
- **Purpose:** Intelligence/spy operations (future feature)

**Residential Block (`housing_unit`):**
- **Cost:** 150 Carbon, 0 Titanium
- **Size:** 2×2 tiles
- **Purpose:** Increases population capacity

**Holo-Monument (`monument`):**
- **Cost:** 500 Carbon, 0 Titanium
- **Size:** 1×1 tile
- **Purpose:** Decorative/prestige

**Colony Hub (`colony_hub`):**
- **Cost:** 0 Carbon, 0 Titanium (starting building)
- **Size:** 4×4 tiles
- **Purpose:** Main colony building

---

## 🎯 Quick Access Guide

| Feature | Required Building | Building Type |
|---------|------------------|---------------|
| **Defense Panel** | Naval Academy | `academy` |
| **Add Defense Turrets** | Naval Academy | `academy` |
| **Recruit Units** | Naval Academy | `academy` |
| **Manufacture Defense Tools** | Systems Workshop | `defense_workshop` |
| **Manufacture Siege Tools** | Munitions Factory | `siege_workshop` |
| **Increase Wall Level** | Defensive Grid | `shield_generator` |

---

## ⚠️ Common Confusion

**"I built Defensive Grid but can't access Defense Panel"**
- **Solution:** Build a **Naval Academy** (`academy`)
- The Defensive Grid only increases your wall level, it doesn't unlock the Defense Panel

**"I can't recruit units"**
- **Solution:** Build a **Naval Academy** (`academy`)

**"I can't manufacture tools"**
- **Solution:** Build the appropriate workshop:
  - **Systems Workshop** for defense tools
  - **Munitions Factory** for siege tools

---

## 🏗️ Building Status

**Important:** Buildings must be **active** (not "constructing" or "upgrading") to provide their benefits.

- **Constructing:** Building is being built (wait for timer)
- **Upgrading:** Building is being upgraded (wait for timer)
- **Active:** Building is operational and provides benefits ✅

Check building status by clicking on the building in your colony grid.




