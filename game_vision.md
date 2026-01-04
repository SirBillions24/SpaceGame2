Galactic Conquest: Design & Style Guide
1. Core Vision
"Galactic Conquest" is a persistent browser-based strategy game rooted in the mechanics of Goodgame Empire, but transported to a stylized Sci-Fi universe.

The Directive:

Old School Gameplay: Strategic depth, 3-lane combat, and resource management.
Universal Sci-Fi: Accessible tropes (lasers, spaceships, planets) rather than niche IP-specific lore.
Aesthetic: "Retro-Future Command Console". High contrast, neon accents on dark backgrounds, pixel-art sprites.
2. Terminology & World Mapping
We are performing a 1:1 translation of mechanics to ensure the game remains balanced but feels coherent.

Original Concept (Medieval)	New Concept (Sci-Fi)	Description / Flavor
Castle	Planetary Colony	The player's main base of operations. Upgrades physically alter the planet view.
World Map	Sector Chart	A scrollable starfield containing other player's colonies (Planets) and NPC targets (Asteroid Bases).
King/Lord	Commander	The player's persona.
Alliance	Federation	Group of players working together.
Robber Baron Castle	Pirate Rock	NPC asteroid bases to farm for resources.
Outpost	Moon Colony	Smaller auxiliary bases that can be captured.
Economy & Resources
Original	New Resource	Purpose
Wood	Carbon	Basic building block for structures and light ships.
Stone	Titanium	Advanced material for walls (shields) and heavy armor.
Food	Nutrient Paste	Upkeep for organic troops (Marines). If it hits 0, troops desert.
Gold	Credits	Currency for recruiting units and research.
Rubies	Dark Matter	Premium currency for speed-ups and cosmetics.
Public Order	Stability	Percentage modifier to resource production. High Stability = High Productivity.
3. The Combat System (The "3-Lane" Model)
Combat remains the heart of the game. It occurs in Waves across 3 Lanes (Left Flank, Center, Right Flank).

A. The Setup (Space & Orbit)
Instead of "Walls" and "Moats", we use "Shields" and "Defense Grids".

Wall Level -> Shield Generator: Increases defense bonus for units stationed in the defensive line.
Moat -> Perimeter Field: Slows down attackers or reduces their effectiveness before they reach the main line.
Gate -> Starport: Increases the speed of deployment and sortie capabilities.
Tower -> Defense Turret: Increases the max number of units that can defend a flank.
B. The Units (Rock-Paper-Scissors)
We map the classic interactions to unit classes.

Role	Medieval	Sci-Fi Unit	Description
Melee	Swordsman	Marine	Standard infantry. Good all-rounder.
Ranged	Archer	Ranger	Laser rifle unit. High damage, low defense.
Anti-Cav	Pikeman	Sentinel	Heavy exo-suit/mech. High defense, counters rapid units.
Fast/Cav	Knight	Interceptor	Fast atmospheric fighter. High impact.
Combat Logic:

Fleet Engagement (The Walls):
Attacking Interceptors try to break through the Shields.
Defending Rangers fire from behind the shields.
Sentinels block the breach points.
Surface Invasion (The Courtyard):
If the attacker wins a flank (breaks the shields), their surviving units land on the surface.
The "Courtyard Battle" is a chaotic ground war between the landing force and the colony's garrison.
Bonus: If attackers win 2+ flanks (Left/Right/Center), they flank the defenders in the Courtyard (+30% Combat Strength).
C. Tools (Siege & Defense)
Tools are consumable items used in battle.

Ladder -> Breach Pod: Negates Wall (Shield) protection.
Battering Ram -> EMP Charge: Negates Gate (Starport) protection.
Mantlet -> Deflector Screen: Protects attacking units from ranged fire.
Flaming Arrows -> Plasma Grenades: Bonus damage to defenders.
Tar Pot -> Auto-Turret: Bonus damage to attackers.
4. Visual Style Guide
Color Palette
Background: Deep Space Blue/Black (#0a0b1e).
UI Borders: Neon Cyan (#00f3ff) or Holographic Blue.
Good/Ally: Green/Teal.
Bad/Enemy: Red/Orange.
Resources:
Carbon: Dark Grey/Black.
Titanium: Silver/White.
Food: Organic Green.
Credits: Gold/Yellow.
Sprites (Pixel Art)
Planets: Colorful spheres (Earth-like, Mars-like, Ice worlds).
Upgrades: As the colony grows, add orbital rings, satellites, and city lights to the sprite.
Fleets: Small icons moving on the star map.
Attack: Red chevron or arrow-shaped ship.
Support: Blue shield or transport ship.
Map Features:
Nebula clouds (fog of war or just decoration).
Asteroid belts.
5. User Interface (UI)
The Command Deck: The main view is the "Planet Surface" view, showing buildings.
The Bridge: The main navigation bar (Galaxy Map, Reports, Alliance, Inventory).
The Holo-Map: The Sector Chart view.
6. Implementation Checklist
This guide informs the following technical changes:

 Database: Rename tables (Castle -> Planet, March -> Fleet).
 Database: Add carbon, titanium, food, credits, stability.
 Frontend: Replace "Castle" text with "Colony" / "Planet".
 Frontend: Update icons (Wood -> Carbon, etc.).
 Backend: Standardize on "Unit Types" (marine, ranger, sentinel) in code constants.