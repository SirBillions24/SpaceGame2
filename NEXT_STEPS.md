# Next Steps: Frontend Integration

## ✅ Completed Backend & Core Updates

1. **Database Schema**: Updated with `gridSizeX`, `gridSizeY`, `defenseTurretsJson`
2. **API Endpoints**: 
   - `POST /api/actions/expand` - Planet expansion
   - `POST /api/actions/defense-turret` - Add defense turrets
3. **Defense Capacity**: Backend now calculates and validates capacity
4. **API Client**: Updated with new endpoints
5. **PlanetInterior**: Now uses dynamic `gridSizeX`/`gridSizeY`
6. **DefensePanel**: Now shows actual defense capacity from API

## 🚧 Remaining Frontend Work

### 1. Planet Expansion UI
**Location**: `PlanetInterior.tsx` header or sidebar

**Features Needed**:
- Button to open expansion modal
- Modal showing:
  - Current grid size (e.g., "10x10")
  - Max size (50x50)
  - Expansion options:
    - Expand X (width) - shows cost
    - Expand Y (height) - shows cost
  - Cost calculation display
  - "Expand" button

**Implementation**:
```tsx
// Add state
const [showExpansionModal, setShowExpansionModal] = useState(false);

// Add button in header (near "Move Buildings")
{isOwner && (
  <button onClick={() => setShowExpansionModal(true)}>
    Expand Colony
  </button>
)}

// Modal component
{showExpansionModal && (
  <ExpansionModal 
    planet={planetData}
    onClose={() => setShowExpansionModal(false)}
    onExpand={async (direction) => {
      await api.expandPlanet(planet.id, direction);
      loadPlanetData(); // Refresh
    }}
  />
)}
```

### 2. Defense Turret Management UI
**Location**: `DefensePanel.tsx` or separate modal

**Features Needed**:
- Display current turrets (list with levels)
- Display total capacity
- "Add Turret" button
- Modal for adding turret:
  - Select level (1-4)
  - Show cost (scales with level and existing turrets)
  - Show capacity gain
  - "Add" button
- Show max turrets (20)

**Implementation**:
```tsx
// In DefensePanel.tsx
const [showTurretModal, setShowTurretModal] = useState(false);

// Display current turrets
const turrets = planet.defenseTurretsJson 
  ? JSON.parse(planet.defenseTurretsJson) 
  : [];

// Add button
<button onClick={() => setShowTurretModal(true)}>
  Add Defense Turret
</button>

// Modal
{showTurretModal && (
  <TurretModal
    planet={planet}
    existingTurrets={turrets}
    onClose={() => setShowTurretModal(false)}
    onAdd={async (level) => {
      await api.addDefenseTurret(planet.id, level);
      loadData(); // Refresh
    }}
  />
)}
```

### 3. Grid Styling Updates
**Location**: `PlanetInterior.css`

**Needed**:
- Ensure grid scales properly with larger sizes
- May need to adjust cell size for very large grids (50x50)
- Consider responsive sizing or scrollable grid

**Current**: Grid uses `gridTemplateColumns/Rows` with `repeat()`, which should work, but may need:
- Max height/width constraints
- Scrollable container for large grids
- Smaller cell size for expanded grids

### 4. Visual Feedback
- Show grid size in header (e.g., "10x10" → "20x10" after expansion)
- Show defense capacity in DefensePanel header
- Show turret count/capacity in planet stats

## 📋 Quick Implementation Checklist

- [ ] Create `ExpansionModal.tsx` component
- [ ] Add expansion button to `PlanetInterior.tsx`
- [ ] Create `TurretModal.tsx` component  
- [ ] Add turret management to `DefensePanel.tsx` or separate section
- [ ] Update grid CSS for larger sizes (if needed)
- [ ] Add visual indicators for grid size and capacity
- [ ] Test expansion flow end-to-end
- [ ] Test turret addition and capacity updates

## 🎨 UI/UX Suggestions

### Expansion Modal
```
┌─────────────────────────────┐
│  Colony Expansion          │
├─────────────────────────────┤
│  Current Size: 10x10       │
│  Maximum Size: 50x50       │
│                             │
│  [Expand Width]  [Expand Height] │
│  Cost: 1000 Carbon          │
│        500 Titanium         │
│                             │
│  [Cancel]  [Expand]         │
└─────────────────────────────┘
```

### Turret Modal
```
┌─────────────────────────────┐
│  Add Defense Turret         │
├─────────────────────────────┤
│  Current: 2 turrets (30 cap)│
│  Maximum: 20 turrets        │
│                             │
│  Select Level:              │
│  ○ Level 1 (10 capacity)   │
│  ○ Level 2 (20 capacity)    │
│  ○ Level 3 (30 capacity)    │
│  ○ Level 4 (40 capacity)    │
│                             │
│  Cost: 750 Carbon           │
│        375 Titanium         │
│                             │
│  [Cancel]  [Add Turret]     │
└─────────────────────────────┘
```

## 🧪 Testing Plan

1. **Expansion**:
   - Start with 10x10 planet
   - Expand X to 20x10
   - Expand Y to 20x20
   - Verify grid renders correctly
   - Verify buildings still work
   - Try max expansion (50x50)

2. **Defense Turrets**:
   - Add Level 1 turret
   - Verify capacity increases
   - Add more turrets (up to 20)
   - Verify defense assignment respects capacity
   - Test capacity validation errors

3. **Integration**:
   - Expand planet, add turrets, assign defense
   - Verify all features work together
   - Test with multiple planets

## 📝 Notes

- Grid size is now dynamic, so existing buildings should still work
- Defense capacity is calculated server-side and validated
- Costs scale appropriately to prevent easy maxing
- All backend endpoints are ready and tested




