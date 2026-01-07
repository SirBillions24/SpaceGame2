# Building Tooltip Implementation Guide

## Overview
This guide outlines the implementation plan for adding rich tooltips to building menu items in the `PlanetInterior.tsx` component. When users hover over buildings in the build dock, they will see detailed information about what each building does, its costs, size, and functionality.

## Design Pattern Reference
The project already uses a "dropdown" tooltip pattern in `GlobalHUD.tsx` for resource tooltips. We will follow the same pattern for consistency:
- **Position**: Absolute positioning relative to parent container
- **Display**: Hidden by default, shown on hover
- **Styling**: Dark glassmorphism theme with neon accents
- **Structure**: Header with building name, followed by structured information rows

## Building Data Structure

### Building Information Map
Create a new constant `BUILDING_INFO` that contains rich descriptions for each building type:

```typescript
const BUILDING_INFO: Record<string, {
  name: string;
  description: string;
  purpose: string[];
  unlocks?: string[];
  size: string;
  cost: { c: number; t: number };
}> = {
  'carbon_processor': {
    name: 'Carbon Processor',
    description: 'Extracts and processes carbon from planetary resources.',
    purpose: [
      'Produces Carbon resource',
      'Base production rate: 100/h per level',
      'Scales with Stability/Productivity'
    ],
    size: '2×2 tiles',
    cost: { c: 100, t: 100 }
  },
  'titanium_extractor': {
    name: 'Titanium Extractor',
    description: 'Mines and refines titanium ore for advanced construction.',
    purpose: [
      'Produces Titanium resource',
      'Base production rate: 100/h per level',
      'Scales with Stability/Productivity'
    ],
    size: '2×2 tiles',
    cost: { c: 100, t: 100 }
  },
  'hydroponics': {
    name: 'Hydroponics',
    description: 'Automated agricultural facility producing nutrient paste.',
    purpose: [
      'Produces Food (Nutrient Paste)',
      'Base production rate: 100/h per level',
      'Scales with Stability/Productivity',
      'Required for unit upkeep'
    ],
    size: '2×2 tiles',
    cost: { c: 100, t: 100 }
  },
  'housing_unit': {
    name: 'Residential Block',
    description: 'Housing complex for colony population.',
    purpose: [
      'Increases population capacity',
      'Enables higher tax revenue',
      'Required for colony growth'
    ],
    size: '2×2 tiles',
    cost: { c: 150, t: 0 }
  },
  'naval_academy': {
    name: 'Naval Academy',
    description: 'Military training facility for fleet operations and command.',
    purpose: [
      'Unlocks Defense Panel (Defensive Strategy)',
      'Enables Unit Recruitment',
      'Unlocks Defense Turret management',
      'Required for military operations'
    ],
    unlocks: [
      'Defense Panel access',
      'Recruitment Console',
      'Defense Turret system'
    ],
    size: '3×3 tiles',
    cost: { c: 500, t: 500 }
  },
  'tavern': {
    name: 'Intelligence Hub',
    description: 'Covert operations center for espionage and intelligence gathering.',
    purpose: [
      'Generates Spies/Infiltrators',
      'Spy count = Building level',
      'Future: Intelligence operations'
    ],
    size: '2×2 tiles',
    cost: { c: 300, t: 200 }
  },
  'defense_workshop': {
    name: 'Systems Workshop',
    description: 'Manufacturing facility for defensive equipment and systems.',
    purpose: [
      'Manufactures Defense Tools',
      'Unlocks Systems Workshop panel'
    ],
    unlocks: [
      'Auto-Turret (+Shield Generator Power)',
      'Blast Door (+Starport Integrity)',
      'Targeting Array (+Ranged Unit Power)'
    ],
    size: '2×2 tiles',
    cost: { c: 400, t: 300 }
  },
  'siege_workshop': {
    name: 'Munitions Factory',
    description: 'Production facility for siege weapons and attack equipment.',
    purpose: [
      'Manufactures Siege Tools',
      'Unlocks Munitions Factory panel'
    ],
    unlocks: [
      'Signal Jammer (-Enemy Shield Power)',
      'Breach Cutter (-Enemy Starport Integrity)',
      'Holo-Decoy (-Enemy Ranged Power)'
    ],
    size: '2×2 tiles',
    cost: { c: 400, t: 300 }
  },
  'monument': {
    name: 'Holo-Monument',
    description: 'Decorative holographic monument celebrating colony achievements.',
    purpose: [
      'Increases Stability',
      'Improves Productivity modifier',
      'Decorative/prestige building',
      'Unlimited quantity allowed'
    ],
    size: '1×1 tile',
    cost: { c: 500, t: 0 }
  },
  'shield_generator': {
    name: 'Defensive Grid',
    description: 'Planetary shield generator providing defensive bonuses.',
    purpose: [
      'Increases defensive grid level (wall level)',
      'Unlocks defensive tool slots (1 per level)',
      'Provides defense bonus to stationed units',
      'Note: Does NOT unlock Defense Panel'
    ],
    size: '2×2 tiles',
    cost: { c: 500, t: 1000 }
  },
  'colony_hub': {
    name: 'Colony Hub',
    description: 'The central command structure of your planetary colony.',
    purpose: [
      'Main colony building',
      'Starting structure',
      'Core of colony operations'
    ],
    size: '4×4 tiles',
    cost: { c: 0, t: 0 }
  }
};
```

## Implementation Steps

### Step 1: Add Building Info Constant
**File**: `client/src/components/PlanetInterior.tsx`
**Location**: After the existing `BUILDING_COSTS` constant (around line 55)

Add the `BUILDING_INFO` constant as defined above.

### Step 2: Add Tooltip State Management
**File**: `client/src/components/PlanetInterior.tsx`
**Location**: In the component state section (around line 68)

Add a new state variable to track which building is being hovered:
```typescript
const [hoveredBuildingType, setHoveredBuildingType] = useState<string | null>(null);
```

### Step 3: Create Tooltip Component/Structure
**File**: `client/src/components/PlanetInterior.tsx`
**Location**: Inside the build dock rendering section (around line 656)

Modify the build dock items to include:
1. `onMouseEnter` handler to set `hoveredBuildingType`
2. `onMouseLeave` handler to clear `hoveredBuildingType`
3. A tooltip dropdown element that conditionally renders based on `hoveredBuildingType`

### Step 4: Tooltip JSX Structure
**Pattern**: Follow the same structure as `GlobalHUD.tsx` resource dropdowns

```tsx
<div className="build-dock-item-wrapper">
  <div
    className={`build-dock-item ${buildMode === type ? 'active' : ''}`}
    onClick={() => canAfford && setBuildMode(buildMode === type ? null : type)}
    onMouseEnter={() => setHoveredBuildingType(type)}
    onMouseLeave={() => setHoveredBuildingType(null)}
    style={{ opacity: canAfford ? 1 : 0.5 }}
  >
    <span>{BUILDING_LABELS[type]}</span>
    <span>{cost.c}C {cost.t}Ti</span>
  </div>
  
  {hoveredBuildingType === type && (
    <div className="building-tooltip">
      <h5>{BUILDING_INFO[type].name}</h5>
      <div className="tooltip-section">
        <div className="tooltip-row">
          <span className="tooltip-label">Description:</span>
        </div>
        <div className="tooltip-description">
          {BUILDING_INFO[type].description}
        </div>
      </div>
      
      <div className="tooltip-section">
        <div className="tooltip-row">
          <span className="tooltip-label">Purpose:</span>
        </div>
        {BUILDING_INFO[type].purpose.map((p, i) => (
          <div key={i} className="tooltip-row">
            <span className="tooltip-bullet">•</span>
            <span className="tooltip-text">{p}</span>
          </div>
        ))}
      </div>
      
      {BUILDING_INFO[type].unlocks && (
        <div className="tooltip-section">
          <div className="tooltip-row">
            <span className="tooltip-label">Unlocks:</span>
          </div>
          {BUILDING_INFO[type].unlocks.map((u, i) => (
            <div key={i} className="tooltip-row">
              <span className="tooltip-bullet">→</span>
              <span className="tooltip-text">{u}</span>
            </div>
          ))}
        </div>
      )}
      
      <div className="tooltip-section" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
        <div className="tooltip-row">
          <span className="tooltip-label">Size:</span>
          <span className="tooltip-value">{BUILDING_INFO[type].size}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Cost:</span>
          <span className="tooltip-value">{cost.c}C {cost.t}Ti</span>
        </div>
      </div>
    </div>
  )}
</div>
```

### Step 5: CSS Styling
**File**: `client/src/components/PlanetInterior.css`
**Location**: After the `.build-dock-item` styles (around line 408)

Add the following CSS:

```css
/* Build Dock Item Wrapper - for tooltip positioning */
.build-dock-item-wrapper {
  position: relative;
  display: inline-block;
}

/* Building Tooltip */
.building-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #222;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 12px;
  width: 280px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.8);
  z-index: 5000;
  margin-bottom: 10px;
  white-space: normal;
  line-height: 1.5;
  pointer-events: none; /* Prevent tooltip from blocking hover */
}

/* Bridge gap for hover continuity */
.building-tooltip::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 0;
  right: 0;
  height: 10px;
}

.building-tooltip h5 {
  margin: 0 0 8px 0;
  border-bottom: 1px solid #444;
  padding-bottom: 4px;
  color: #00f3ff;
  text-align: center;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.tooltip-section {
  margin-bottom: 8px;
}

.tooltip-section:last-child {
  margin-bottom: 0;
}

.tooltip-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 4px;
  font-size: 0.85rem;
  color: #ccc;
}

.tooltip-row:last-child {
  margin-bottom: 0;
}

.tooltip-label {
  font-weight: bold;
  color: #fff;
  margin-right: 6px;
  min-width: 60px;
}

.tooltip-description {
  font-size: 0.85rem;
  color: #aaa;
  font-style: italic;
  margin-bottom: 6px;
  line-height: 1.4;
}

.tooltip-bullet {
  color: #00f3ff;
  margin-right: 6px;
  font-weight: bold;
}

.tooltip-text {
  flex: 1;
  color: #ccc;
}

.tooltip-value {
  color: #4caf50;
  font-weight: 500;
}

/* Ensure tooltip doesn't go off-screen */
.build-dock-item-wrapper:first-child .building-tooltip {
  left: 0;
  transform: none;
}

.build-dock-item-wrapper:last-child .building-tooltip {
  left: auto;
  right: 0;
  transform: none;
}
```

### Step 6: Handle Edge Cases

1. **Tooltip Positioning**: If tooltip would go off-screen (left/right edges), adjust positioning
2. **Mobile/Responsive**: Consider hiding tooltips on very small screens or using a different interaction pattern
3. **Build Mode Active**: Tooltip should still show even when building is selected (active state)
4. **Cannot Afford**: Tooltip should still show even when building is grayed out (opacity 0.5)

### Step 7: Testing Checklist

- [ ] Tooltip appears on hover for each building type
- [ ] Tooltip disappears when mouse leaves
- [ ] Tooltip content is accurate for all building types
- [ ] Tooltip positioning works correctly (doesn't go off-screen)
- [ ] Tooltip doesn't interfere with clicking to select building
- [ ] Tooltip styling matches project theme (dark, glassmorphism)
- [ ] Tooltip shows correct cost and size information
- [ ] "Unlocks" section only appears for buildings that unlock features
- [ ] Tooltip works when building is in "active" (selected) state
- [ ] Tooltip works when building cannot be afforded (grayed out)

## Visual Design Notes

- **Color Scheme**: Follow existing tooltip pattern from `GlobalHUD.css`
  - Header: Neon cyan (`#00f3ff`) for building name
  - Text: Light gray (`#ccc`) for body text
  - Labels: White (`#fff`) for section headers
  - Values: Green (`#4caf50`) for cost/size
  - Bullets: Cyan (`#00f3ff`) for list items
- **Typography**: Match existing tooltip font sizes (0.85rem for body, 0.9rem for headers)
- **Spacing**: Consistent padding and margins matching `GlobalHUD` tooltips
- **Border**: 1px solid `#444` matching existing tooltip borders

## Alternative Considerations

### Option A: Always-Visible Tooltip
Instead of hover-only, could show tooltip when building is selected (active). **Not recommended** - would clutter UI.

### Option B: Click-to-Show Tooltip
Show tooltip on click instead of hover. **Not recommended** - less discoverable, requires extra click.

### Option C: Separate Info Panel
Dedicated info panel that updates when hovering buildings. **Not recommended** - more complex, takes up screen space.

**Recommended**: Hover-based tooltip (as outlined above) - most intuitive and follows existing patterns.

## Future Enhancements

1. **Production Rates**: Show actual production rates based on building level and stability
2. **Prerequisites**: Display building prerequisites if any are added
3. **Upgrade Benefits**: Show what upgrading the building provides
4. **Animation**: Add subtle fade-in animation for tooltip appearance
5. **Keyboard Navigation**: Support keyboard navigation for accessibility

## Files to Modify

1. `client/src/components/PlanetInterior.tsx`
   - Add `BUILDING_INFO` constant
   - Add `hoveredBuildingType` state
   - Modify build dock item rendering
   - Add tooltip JSX structure

2. `client/src/components/PlanetInterior.css`
   - Add tooltip styles
   - Add wrapper styles for positioning

## Estimated Implementation Time

- **Data Structure**: 15 minutes
- **State Management**: 5 minutes
- **JSX Structure**: 30 minutes
- **CSS Styling**: 30 minutes
- **Testing & Refinement**: 20 minutes

**Total**: ~1.5-2 hours

---

## Implementation Notes

- Keep tooltip content concise but informative
- Ensure tooltip doesn't block interaction with other UI elements
- Test on different screen sizes
- Maintain consistency with existing tooltip patterns
- Consider performance (tooltip rendering should be lightweight)

