# User Guide: New UI Features

## 🚀 How to Use the New Features

### 1. Expanding Your Colony

**Step-by-Step:**

1. **Open Your Planet**
   - Click on your planet on the World Map
   - Click "Enter Colony" in the planet banner
   - This opens the **Planet Interior** view

2. **Find the Expansion Button**
   - Look at the **top header** of the Planet Interior window
   - You'll see several buttons including:
     - "Move Buildings" (orange when active)
     - **"Expand Colony"** (blue button) ← **This is the one!**
     - "×" (close button)

3. **Click "Expand Colony"**
   - A modal window will open showing:
     - Current grid size (e.g., "10 × 10")
     - Maximum size (50 × 50)
     - Two expansion options:
       - **Expand Width (X)** - Makes your colony wider
       - **Expand Height (Y)** - Makes your colony taller

4. **Select Expansion Direction**
   - Click on either the "Expand Width" or "Expand Height" card
   - The selected option will highlight in cyan
   - You'll see:
     - Preview of new size (e.g., "10×10 → 20×10")
     - Cost in Carbon and Titanium

5. **Confirm Expansion**
   - Review the cost
   - Click **"Expand Colony"** button at the bottom
   - Your resources will be deducted
   - The grid will automatically update to the new size

**Visual Indicators:**
- Grid size is shown in the resource bar: "Grid: 10 × 10"
- After expansion, this updates to show new size
- The building grid automatically expands

**Cost Scaling:**
- First expansion: ~1,000 Carbon, 500 Titanium
- Each subsequent expansion costs 50% more
- Costs scale independently for X and Y directions

---

### 2. Building Defense Turrets

**Step-by-Step:**

1. **Open Defense Panel**
   - In Planet Interior, look for the **"Defense"** button or section
   - Click it to open the **Defense Panel**

2. **Find the "Add Turret" Button**
   - At the **top of the Defense Panel header**
   - You'll see:
     - "Defensive Structure (Wall Lvl X)" title
     - Defense stats showing capacity and turret count
     - **"Add Turret"** button (blue) ← **This is the one!**

3. **Click "Add Turret"**
   - A modal window will open showing:
     - Current turret count (e.g., "5 / 20")
     - Current total capacity (e.g., "50 troops per lane")
     - Four turret level options:
       - **Level 1**: +10 capacity (cheapest)
       - **Level 2**: +20 capacity
       - **Level 3**: +30 capacity
       - **Level 4**: +40 capacity (most expensive)

4. **Select Turret Level**
   - Click on the level card you want
   - The selected level will highlight
   - You'll see:
     - Base cost for that level
     - Calculated cost (scales with existing turrets)
     - Preview of new total capacity

5. **Confirm Addition**
   - Review the cost
   - Click **"Add Turret"** button at the bottom
   - Your resources will be deducted
   - The turret is added to your planet
   - Defense capacity automatically updates

**Visual Indicators:**
- Defense Panel header shows:
  - "Capacity: X troops per lane"
  - "Y Turrets" (count of turrets)
- Each lane shows: "Units: X / Y" (current / capacity limit)
- If you try to assign more units than capacity, you'll get an error

**Cost Scaling:**
- Base cost: 500 Carbon × level, 250 Titanium × level
- Additional cost: +10% per existing turret
- Example: 6th turret (Level 2) costs more than the 1st turret (Level 2)

---

## 📍 Where to Find Everything

### Planet Interior View
```
┌─────────────────────────────────────┐
│ Planet Name              [Buttons] × │
├─────────────────────────────────────┤
│ Resources:                          │
│ Carbon: 1000  Titanium: 500          │
│ Grid: 10 × 10  ← Shows current size  │
├─────────────────────────────────────┤
│ [Building Grid - 10×10]             │
│                                     │
│ [Build Dock with building buttons]  │
└─────────────────────────────────────┘
```

**Header Buttons:**
- **"Move Buildings"** - Reposition buildings
- **"Expand Colony"** ← **NEW!** Opens expansion modal
- **"×"** - Close planet view

### Defense Panel View
```
┌─────────────────────────────────────┐
│ Defensive Structure (Wall Lvl 1)    │
│ Capacity: 0 troops per lane          │
│ 0 Turrets                            │
│                    [Add Turret] ×   │ ← NEW!
├─────────────────────────────────────┤
│ [Left Flank]  [Front]  [Right]      │
│ Units: 0 / 0  Units: 0 / 0  Units: 0/0│
│                                     │
│ [Unit assignment inputs]            │
│                                     │
│ [Establish Defense Button]          │
└─────────────────────────────────────┘
```

---

## 💡 Tips & Tricks

### Expansion Strategy
- **Start Small**: Expand only when you need more building space
- **Cost Awareness**: Later expansions cost significantly more
- **Direction Matters**: 
  - Expand X if you need horizontal space
  - Expand Y if you need vertical space
  - You can expand both directions independently

### Turret Strategy
- **Early Game**: Level 1 turrets are cost-effective
- **Mid Game**: Mix of Level 2-3 turrets for good capacity
- **Late Game**: Level 4 turrets maximize capacity
- **Capacity Planning**: Each lane can hold up to total capacity
  - If you have 100 total capacity, each lane can use up to 100 units

### Visual Feedback
- **Grid Size**: Always visible in resource bar
- **Capacity**: Shown in Defense Panel header and per lane
- **Turret Count**: Displayed in Defense Panel header
- **Errors**: Clear messages if you exceed limits or lack resources

---

## 🔧 Troubleshooting

### "Expand Colony" button not showing?
- Make sure you own the planet (not viewing someone else's)
- Check that you're in Planet Interior view (not World Map)

### "Add Turret" button not showing?
- Open the Defense Panel first
- Make sure you own the planet

### Can't expand beyond certain size?
- Maximum grid size is 50 × 50
- If you see "MAX" on expansion options, you've reached the limit

### Can't add more turrets?
- Maximum is 20 turrets per planet
- If you see "Maximum turrets reached", you're at the limit

### Capacity not updating?
- Refresh the Defense Panel after adding turrets
- The capacity should update automatically

---

## 🎮 Quick Reference

| Feature | Location | Button | Max Limit |
|---------|----------|--------|-----------|
| **Expand Colony** | Planet Interior Header | "Expand Colony" | 50 × 50 |
| **Add Turret** | Defense Panel Header | "Add Turret" | 20 turrets |
| **View Grid Size** | Resource Bar | (Display only) | - |
| **View Capacity** | Defense Panel Header | (Display only) | - |

---

## Example Workflow

**Expanding Your Colony:**
1. Enter your planet
2. Click "Expand Colony" (top right)
3. Select "Expand Width (X)"
4. Review cost: 1,000 Carbon, 500 Titanium
5. Click "Expand Colony"
6. Grid updates from 10×10 to 20×10
7. You can now place buildings in the new area

**Adding Defense Turrets:**
1. Enter your planet
2. Open Defense Panel
3. Click "Add Turret" (top right of panel)
4. Select "Level 2" turret
5. Review cost: ~1,100 Carbon, 550 Titanium (scaled)
6. Click "Add Turret"
7. Capacity increases by 20 (now 20 total)
8. You can now assign up to 20 units per lane




