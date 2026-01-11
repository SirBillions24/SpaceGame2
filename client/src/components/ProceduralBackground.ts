/**
 * ProceduralBackground.ts
 * 
 * Lightweight procedural space background with visual flair.
 * Supports dynamic black holes and procedural galaxies/stars that work with map expansion.
 */

import * as PIXI from 'pixi.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    CELL_SIZE: 512,

    STARS_MIN: 10,
    STARS_MAX: 18,

    STAR_SIZE_MIN: 0.4,
    STAR_SIZE_MAX: 3,

    STAR_COLORS: [
        0xffffff, 0xe8f0ff, 0xcce0ff, 0x99ccff,
        0xaaddff, 0xffffee, 0xffeedd, 0xffddbb,
    ],

    CELL_PADDING: 3,
    REDRAW_THRESHOLD: 2,

    LOD_FULL: 0.6,
    LOD_MEDIUM: 0.25,

    // Procedural feature spacing (features generate at these intervals)
    GALAXY_SPACING: 2500,      // One galaxy possible per 2500x2500 area
    LANDMARK_STAR_SPACING: 1500, // One landmark star possible per 1500x1500 area

    // Chance for feature to exist (0-1)
    GALAXY_CHANCE: 0.4,
    LANDMARK_STAR_CHANCE: 0.5,

    // Black hole default radius
    BLACK_HOLE_RADIUS: 60,
};

// ============================================================================
// TYPES
// ============================================================================

export interface BlackHoleData {
    id: string;
    x: number;
    y: number;
    radius?: number;
}

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

function hash(a: number, b: number, seed: number): number {
    let x = (a * 374761393 + seed) | 0;
    let y = (b * 668265263) | 0;
    x = ((x ^ y) * 1274126177) | 0;
    return Math.abs(x ^ (x >> 15));
}

function hashFloat(a: number, b: number, seed: number): number {
    return (hash(a, b, seed) % 10000) / 10000;
}

function regionNoise(x: number, y: number): number {
    const scale = 0.0003;
    const xi = Math.floor(x * scale);
    const yi = Math.floor(y * scale);
    return hashFloat(xi, yi, 777);
}

// ============================================================================
// PROCEDURAL FEATURE GENERATION
// ============================================================================

interface ProceduralGalaxy {
    x: number;
    y: number;
    size: number;
    rotation: number;
    color: number;
}

interface ProceduralLandmarkStar {
    x: number;
    y: number;
    size: number;
    color: number;
}

const GALAXY_COLORS = [0x8866aa, 0x6688aa, 0xaa7788, 0x7799aa, 0x9988aa, 0x88aacc];
const STAR_GLOW_COLORS = [0x88ccff, 0xffffaa, 0xffccaa, 0xaaeeff, 0xffaacc, 0xaaffcc];

// Get galaxy for a grid cell (if one exists there)
function getGalaxyAt(gridX: number, gridY: number): ProceduralGalaxy | null {
    const chance = hashFloat(gridX, gridY, 11111);
    if (chance > CONFIG.GALAXY_CHANCE) return null;

    // Position within the grid cell
    const offsetX = hashFloat(gridX, gridY, 22222) * CONFIG.GALAXY_SPACING * 0.8;
    const offsetY = hashFloat(gridX, gridY, 33333) * CONFIG.GALAXY_SPACING * 0.8;

    return {
        x: gridX * CONFIG.GALAXY_SPACING + offsetX,
        y: gridY * CONFIG.GALAXY_SPACING + offsetY,
        size: 25 + hashFloat(gridX, gridY, 44444) * 25,
        rotation: (hashFloat(gridX, gridY, 55555) - 0.5) * Math.PI,
        color: GALAXY_COLORS[hash(gridX, gridY, 66666) % GALAXY_COLORS.length],
    };
}

// Get landmark star for a grid cell (if one exists there)
function getLandmarkStarAt(gridX: number, gridY: number): ProceduralLandmarkStar | null {
    const chance = hashFloat(gridX, gridY, 77777);
    if (chance > CONFIG.LANDMARK_STAR_CHANCE) return null;

    const offsetX = hashFloat(gridX, gridY, 88888) * CONFIG.LANDMARK_STAR_SPACING * 0.8;
    const offsetY = hashFloat(gridX, gridY, 99999) * CONFIG.LANDMARK_STAR_SPACING * 0.8;

    return {
        x: gridX * CONFIG.LANDMARK_STAR_SPACING + offsetX,
        y: gridY * CONFIG.LANDMARK_STAR_SPACING + offsetY,
        size: 3.5 + hashFloat(gridX, gridY, 10101) * 2,
        color: STAR_GLOW_COLORS[hash(gridX, gridY, 20202) % STAR_GLOW_COLORS.length],
    };
}

// ============================================================================
// STAR DATA
// ============================================================================

interface StarData {
    worldX: number;
    worldY: number;
    size: number;
    color: number;
    alpha: number;
}

const starDataCache = new Map<string, StarData[]>();

function getStarsForCell(cellX: number, cellY: number): StarData[] {
    const key = `${cellX},${cellY}`;

    if (starDataCache.has(key)) {
        return starDataCache.get(key)!;
    }

    const worldOffsetX = cellX * CONFIG.CELL_SIZE;
    const worldOffsetY = cellY * CONFIG.CELL_SIZE;

    const count = CONFIG.STARS_MIN + (hash(cellX, cellY, 1) % (CONFIG.STARS_MAX - CONFIG.STARS_MIN + 1));
    const stars: StarData[] = [];

    for (let i = 0; i < count; i++) {
        const localX = hashFloat(cellX * 100 + i, cellY, 11) * CONFIG.CELL_SIZE;
        const localY = hashFloat(cellX, cellY * 100 + i, 22) * CONFIG.CELL_SIZE;
        const worldX = worldOffsetX + localX;
        const worldY = worldOffsetY + localY;

        const sizeT = hashFloat(cellX + i, cellY - i, 33);
        const size = CONFIG.STAR_SIZE_MIN + Math.pow(sizeT, 2.5) * (CONFIG.STAR_SIZE_MAX - CONFIG.STAR_SIZE_MIN);

        const baseColorIdx = hash(cellX - i, cellY + i, 44) % CONFIG.STAR_COLORS.length;
        let color = CONFIG.STAR_COLORS[baseColorIdx];

        const region = regionNoise(worldX, worldY);
        if (region > 0.6) {
            color = tintColor(color, 0xffddcc, 0.15);
        } else if (region < 0.4) {
            color = tintColor(color, 0xccddff, 0.15);
        }

        const alpha = 0.5 + hashFloat(cellX + i * 2, cellY + i * 3, 55) * 0.5;
        stars.push({ worldX, worldY, size, color, alpha });
    }

    if (starDataCache.size > 500) {
        const firstKey = starDataCache.keys().next().value;
        if (firstKey) starDataCache.delete(firstKey);
    }

    starDataCache.set(key, stars);
    return stars;
}

function tintColor(base: number, tint: number, amount: number): number {
    const br = (base >> 16) & 0xff;
    const bg = (base >> 8) & 0xff;
    const bb = base & 0xff;
    const tr = (tint >> 16) & 0xff;
    const tg = (tint >> 8) & 0xff;
    const tb = tint & 0xff;
    const r = Math.round(br + (tr - br) * amount);
    const g = Math.round(bg + (tg - bg) * amount);
    const b = Math.round(bb + (tb - bb) * amount);
    return (r << 16) | (g << 8) | b;
}

// ============================================================================
// BACKGROUND MANAGER
// ============================================================================

export class ProceduralBackgroundManager {
    private container: PIXI.Container;
    private starsGraphics: PIXI.Graphics;
    private glowGraphics: PIXI.Graphics;
    private featuresGraphics: PIXI.Graphics;  // Galaxies and landmark stars
    private blackHolesContainer: PIXI.Container;
    private blackHoleGraphics: Map<string, PIXI.Container> = new Map();

    private lastCenterCellX: number = -9999;
    private lastCenterCellY: number = -9999;
    private lastLodLevel: string = '';

    // Current list of black holes
    private blackHoles: BlackHoleData[] = [];

    constructor(parentContainer: PIXI.Container) {
        this.container = new PIXI.Container();
        this.container.zIndex = 0;
        parentContainer.addChild(this.container);

        // Features layer (galaxies, landmark stars)
        this.featuresGraphics = new PIXI.Graphics();
        this.container.addChild(this.featuresGraphics);

        this.glowGraphics = new PIXI.Graphics();
        this.container.addChild(this.glowGraphics);

        this.starsGraphics = new PIXI.Graphics();
        this.container.addChild(this.starsGraphics);

        // Black holes on top
        this.blackHolesContainer = new PIXI.Container();
        this.container.addChild(this.blackHolesContainer);
    }

    /**
     * Set the list of black holes to display.
     * Call this whenever black holes change (added/removed).
     */
    setBlackHoles(blackHoles: BlackHoleData[]): void {
        this.blackHoles = blackHoles;
        this.updateBlackHoles();
    }

    /**
     * Add a single black hole.
     */
    addBlackHole(blackHole: BlackHoleData): void {
        this.blackHoles.push(blackHole);
        this.updateBlackHoles();
    }

    /**
     * Remove a black hole by ID.
     */
    removeBlackHole(id: string): void {
        this.blackHoles = this.blackHoles.filter(bh => bh.id !== id);
        this.updateBlackHoles();
    }

    private updateBlackHoles(): void {
        // Remove old graphics
        for (const [id, container] of this.blackHoleGraphics.entries()) {
            if (!this.blackHoles.some(bh => bh.id === id)) {
                this.blackHolesContainer.removeChild(container);
                container.destroy({ children: true });
                this.blackHoleGraphics.delete(id);
            }
        }

        // Add new graphics
        for (const bh of this.blackHoles) {
            if (!this.blackHoleGraphics.has(bh.id)) {
                const container = this.createBlackHoleGraphics(bh);
                this.blackHolesContainer.addChild(container);
                this.blackHoleGraphics.set(bh.id, container);
            }
        }
    }

    private createBlackHoleGraphics(bh: BlackHoleData): PIXI.Container {
        const container = new PIXI.Container();
        const r = bh.radius || CONFIG.BLACK_HOLE_RADIUS;

        const outerGlow = new PIXI.Graphics();
        outerGlow.circle(0, 0, r * 6);
        outerGlow.fill({ color: 0x4422aa, alpha: 0.03 });
        outerGlow.circle(0, 0, r * 5);
        outerGlow.fill({ color: 0x5533bb, alpha: 0.04 });
        outerGlow.circle(0, 0, r * 4);
        outerGlow.fill({ color: 0x6644cc, alpha: 0.05 });
        container.addChild(outerGlow);

        const disk = new PIXI.Graphics();
        disk.circle(0, 0, r * 3.5);
        disk.fill({ color: 0x3344aa, alpha: 0.15 });
        disk.circle(0, 0, r * 2.8);
        disk.fill({ color: 0x6644aa, alpha: 0.2 });
        disk.circle(0, 0, r * 2.2);
        disk.fill({ color: 0xaa4466, alpha: 0.3 });
        disk.circle(0, 0, r * 1.8);
        disk.fill({ color: 0xff6633, alpha: 0.4 });
        disk.circle(0, 0, r * 1.4);
        disk.fill({ color: 0xff8844, alpha: 0.6 });
        disk.circle(0, 0, r * 1.2);
        disk.fill({ color: 0xffaa55, alpha: 0.7 });
        container.addChild(disk);

        const core = new PIXI.Graphics();
        core.circle(0, 0, r);
        core.fill({ color: 0x000000 });
        core.circle(0, 0, r * 1.05);
        core.stroke({ width: 2, color: 0xff6600, alpha: 0.5 });
        container.addChild(core);

        container.x = bh.x;
        container.y = bh.y;

        return container;
    }

    update(
        cameraX: number,
        cameraY: number,
        scale: number,
        screenWidth: number,
        screenHeight: number
    ): void {
        const showGlows = scale >= CONFIG.LOD_FULL;
        const minStarSize = scale >= CONFIG.LOD_MEDIUM ? 0.5 : 1.2;
        const lodLevel = showGlows ? 'F' : (minStarSize > 1 ? 'L' : 'M');

        const centerCellX = Math.floor(cameraX / CONFIG.CELL_SIZE);
        const centerCellY = Math.floor(cameraY / CONFIG.CELL_SIZE);

        const dx = Math.abs(centerCellX - this.lastCenterCellX);
        const dy = Math.abs(centerCellY - this.lastCenterCellY);
        const needsRedraw = dx >= CONFIG.REDRAW_THRESHOLD ||
            dy >= CONFIG.REDRAW_THRESHOLD ||
            lodLevel !== this.lastLodLevel ||
            this.lastCenterCellX === -9999;

        if (!needsRedraw) {
            return;
        }

        this.lastCenterCellX = centerCellX;
        this.lastCenterCellY = centerCellY;
        this.lastLodLevel = lodLevel;

        const halfW = (screenWidth / 2) / scale;
        const halfH = (screenHeight / 2) / scale;
        const worldLeft = cameraX - halfW;
        const worldTop = cameraY - halfH;
        const worldRight = cameraX + halfW;
        const worldBottom = cameraY + halfH;

        const cellX0 = Math.floor(worldLeft / CONFIG.CELL_SIZE) - CONFIG.CELL_PADDING;
        const cellY0 = Math.floor(worldTop / CONFIG.CELL_SIZE) - CONFIG.CELL_PADDING;
        const cellX1 = Math.floor(worldRight / CONFIG.CELL_SIZE) + CONFIG.CELL_PADDING;
        const cellY1 = Math.floor(worldBottom / CONFIG.CELL_SIZE) + CONFIG.CELL_PADDING;

        // Draw procedural features (galaxies, landmark stars)
        this.featuresGraphics.clear();

        // Galaxies
        const galaxyGridX0 = Math.floor(worldLeft / CONFIG.GALAXY_SPACING) - 1;
        const galaxyGridY0 = Math.floor(worldTop / CONFIG.GALAXY_SPACING) - 1;
        const galaxyGridX1 = Math.floor(worldRight / CONFIG.GALAXY_SPACING) + 1;
        const galaxyGridY1 = Math.floor(worldBottom / CONFIG.GALAXY_SPACING) + 1;

        for (let gy = galaxyGridY0; gy <= galaxyGridY1; gy++) {
            for (let gx = galaxyGridX0; gx <= galaxyGridX1; gx++) {
                const galaxy = getGalaxyAt(gx, gy);
                if (galaxy) {
                    this.drawGalaxy(galaxy);
                }
            }
        }

        // Landmark stars
        const starGridX0 = Math.floor(worldLeft / CONFIG.LANDMARK_STAR_SPACING) - 1;
        const starGridY0 = Math.floor(worldTop / CONFIG.LANDMARK_STAR_SPACING) - 1;
        const starGridX1 = Math.floor(worldRight / CONFIG.LANDMARK_STAR_SPACING) + 1;
        const starGridY1 = Math.floor(worldBottom / CONFIG.LANDMARK_STAR_SPACING) + 1;

        for (let sy = starGridY0; sy <= starGridY1; sy++) {
            for (let sx = starGridX0; sx <= starGridX1; sx++) {
                const star = getLandmarkStarAt(sx, sy);
                if (star) {
                    this.drawLandmarkStar(star);
                }
            }
        }

        // Stars
        const stars = this.starsGraphics;
        const glow = this.glowGraphics;
        stars.clear();
        glow.clear();

        for (let cy = cellY0; cy <= cellY1; cy++) {
            for (let cx = cellX0; cx <= cellX1; cx++) {
                const cellStars = getStarsForCell(cx, cy);

                for (const star of cellStars) {
                    if (star.size < minStarSize) continue;

                    if (showGlows && star.size >= 2) {
                        glow.circle(star.worldX, star.worldY, star.size * 3);
                        glow.fill({ color: star.color, alpha: star.alpha * 0.15 });
                        glow.circle(star.worldX, star.worldY, star.size * 2);
                        glow.fill({ color: star.color, alpha: star.alpha * 0.25 });
                    }

                    stars.circle(star.worldX, star.worldY, star.size);
                    stars.fill({ color: star.color, alpha: star.alpha });
                }
            }
        }
    }

    private drawGalaxy(galaxy: ProceduralGalaxy): void {
        const g = this.featuresGraphics;

        // Draw as circles at world position (no rotation to avoid artifacts)
        // Outer halo
        g.circle(galaxy.x, galaxy.y, galaxy.size * 1.5);
        g.fill({ color: galaxy.color, alpha: 0.05 });

        // Middle
        g.circle(galaxy.x, galaxy.y, galaxy.size);
        g.fill({ color: galaxy.color, alpha: 0.1 });

        // Core
        g.circle(galaxy.x, galaxy.y, galaxy.size * 0.4);
        g.fill({ color: 0xffffff, alpha: 0.15 });

        // Bright center
        g.circle(galaxy.x, galaxy.y, galaxy.size * 0.15);
        g.fill({ color: 0xffffff, alpha: 0.3 });
    }

    private drawLandmarkStar(star: ProceduralLandmarkStar): void {
        const g = this.featuresGraphics;

        // Large glow
        g.circle(star.x, star.y, star.size * 4);
        g.fill({ color: star.color, alpha: 0.08 });
        g.circle(star.x, star.y, star.size * 2.5);
        g.fill({ color: star.color, alpha: 0.15 });
        g.circle(star.x, star.y, star.size * 1.5);
        g.fill({ color: star.color, alpha: 0.3 });

        // Core
        g.circle(star.x, star.y, star.size);
        g.fill({ color: 0xffffff, alpha: 0.9 });
    }

    clear(): void {
        this.starsGraphics.clear();
        this.glowGraphics.clear();
        this.featuresGraphics.clear();
        starDataCache.clear();
        this.lastCenterCellX = -9999;
        this.lastCenterCellY = -9999;
    }

    getContainer(): PIXI.Container {
        return this.container;
    }
}
