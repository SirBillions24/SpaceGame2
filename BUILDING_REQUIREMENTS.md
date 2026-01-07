# Building Requirements Guide

## 🏗️ Building Prerequisites for Features

### Defense System Access

**To Access Defense Panel (Defensive Strategy):**
- **Required Building:** None (Always available)
- **What it allows:**
  - Assign units to flanks
  - Assign defense modules (tools)
  - Configure defensive distribution

**Note:** To add persistent **Defense Turrets** to your grid, you still require a **Naval Academy** (`naval_academy`).

---

### Unit Recruitment Access

**To Recruit Units (Recruitment Console):**
- **Required Building:** Orbital Garrison (`orbital_garrison`)
- **Cost:** 40 Carbon, 20 Titanium
- **Size:** 4×4 tiles
- **What it unlocks:**
  - Unit Recruitment (Recruitment Console)
  - Recruitment Speed Bonus (5% per level)

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

**Naval Academy (`naval_academy`):**
- **Required for:**
  - Defense Panel access
  - Admiral Panel access
  - Defense Turret management
- **Cost:** 100 Carbon, 100 Titanium
- **Size:** 3×3 tiles

**Orbital Garrison (`orbital_garrison`):**
- **Required for:**
  - Unit Recruitment
  - Recruitment Speed Bonuses
- **Cost:** 40 Carbon, 20 Titanium
- **Size:** 4×4 tiles

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
| **Defense Panel** | None | - |
| **Add Defense Turrets** | Naval Academy | `naval_academy` |
| **Recruit Units** | Orbital Garrison | `orbital_garrison` |
| **Admiral Command** | Naval Academy | `naval_academy` |
| **Manufacture Defense Tools** | Systems Workshop | `defense_workshop` |
| **Manufacture Siege Tools** | Munitions Factory | `siege_workshop` |
| **Increase Wall Level** | Energy Canopy | `canopy_generator` |

---

## ⚠️ Common Confusion

**"I built Energy Canopy but can't see Defense Turret options"**
- **Solution:** Build a **Naval Academy** (`naval_academy`)
- The Energy Canopy only increases your wall level. Defense Turret management requires the Academy.

**"I can't recruit units"**
- **Solution:** Build an **Orbital Garrison** (`orbital_garrison`)

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




