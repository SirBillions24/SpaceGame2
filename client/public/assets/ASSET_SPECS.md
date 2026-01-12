# Asset Specifications

## Castle Sprite
- **File**: `castles/castle.png`
- **Size**: 24x24 pixels (recommended)
- **Format**: PNG with transparency
- **Style**: Top-down view, pixel art
- **Colors**: 
  - Own castle: Blue/Gray
  - Enemy castle: Red/Orange
  - Neutral: Gray

## March Sprites
- **File**: `marches/march-attack.png`, `marches/march-support.png`
- **Size**: 12x12 to 16x16 pixels
- **Format**: PNG with transparency
- **Style**: Simple unit icon, facing direction of travel
- **Animation**: Optional - 2-3 frame walking animation

## Unit Icons
- **File**: `units/icon-*.png`
- **Size**: 16x16 pixels
- **Format**: PNG with transparency
- **Style**: Clear, recognizable icons

## Adding New Sprites

All sprite paths are configured in `client/src/config/spriteConfig.ts`.

### Planet/Colony Sprites
1. Place image in `client/public/assets/castles/`
2. Add entry to `SPRITE_CONFIG.planets`:
   ```typescript
   planets: {
     default: '/assets/castles/castlesprite.png',
     harvester: '/assets/castles/horizon_harvester.png',
     yourNewType: '/assets/castles/your_sprite.png',  // Add here
   },
   ```
3. Ensure planet data includes matching `planetType` field

### NPC Class Sprites
1. Place image in `client/public/assets/castles/`
2. Add entry to `SPRITE_CONFIG.npc`:
   ```typescript
   npc: {
     melee: '/assets/castles/melee_outpost.jpeg',
     yourNewClass: '/assets/castles/your_npc.png',  // Add here
   },
   ```
3. Ensure NPC planet data includes matching `npcClass` field

### Recommended Specs
- **Size**: ~1000px original (renders at 0.15 scale on map)
- **Format**: PNG with transparency preferred



