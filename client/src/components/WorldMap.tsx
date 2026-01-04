import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { api, type Planet, type Fleet } from '../lib/api';

interface WorldMapProps {
  mapImageUrl: string;
  onPlanetClick?: (planet: Planet) => void;
  sourcePlanetId?: string | null;
  onMapContainerReady?: (container: PIXI.Container) => void;
  currentUserId?: string;
}

// Tile configuration
const TILE_SIZE = 1024; // Size of each tile in world units
const RENDER_PADDING = 1;

export default function WorldMap({ mapImageUrl, onPlanetClick, sourcePlanetId, onMapContainerReady, currentUserId }: WorldMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const mapContainerRef = useRef<PIXI.Container | null>(null);

  // Storage for map objects
  const tileCacheRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const planetSpritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());

  // Storage for fleet animation objects [fleetId -> { sprite, graphics }]
  const fleetObjectsRef = useRef<Map<string, { sprite: PIXI.Sprite, graphics: PIXI.Graphics, label: PIXI.Text }>>(new Map());
  // We keep the latest fleets data in a ref to access it inside the render loop without dependency issues
  const latestFleetsRef = useRef<Fleet[]>([]);

  const [planets, setPlanets] = useState<Planet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastRenderedTilesRef = useRef<Set<string>>(new Set());

  // Fleet Polling
  useEffect(() => {
    const fetchFleets = async () => {
      try {
        const data = await api.getFleets();
        latestFleetsRef.current = data.fleets;
      } catch (err) {
        console.error('Failed to fetch fleets', err);
      }
    };

    fetchFleets();
    const interval = setInterval(fetchFleets, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initPixi = async () => {
      if (!canvasRef.current || appRef.current) return;

      try {
        const app = new PIXI.Application();
        await app.init({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0x0a0a1a,
          antialias: true,
        });

        if (!canvasRef.current) {
          app.destroy(true);
          return;
        }

        canvasRef.current.appendChild(app.canvas);
        appRef.current = app;

        // Container Hierarchy
        const mapContainer = new PIXI.Container();
        app.stage.addChild(mapContainer);
        mapContainerRef.current = mapContainer;
        mapContainer.sortableChildren = true;

        // Notify parent that map container is ready
        if (onMapContainerReady) {
          onMapContainerReady(mapContainer);
        }

        const bgLayer = new PIXI.Container();
        bgLayer.zIndex = 0;
        mapContainer.addChild(bgLayer);

        // Fleets below planets? Or above? Above makes them visible.
        const fleetLayer = new PIXI.Container();
        fleetLayer.zIndex = 10;
        mapContainer.addChild(fleetLayer);

        const planetLayer = new PIXI.Container();
        planetLayer.zIndex = 20;
        mapContainer.addChild(planetLayer);

        // Map Texture
        const mapTexture = await PIXI.Assets.load(mapImageUrl);

        // Load Fleet Texture (placeholder for now)
        const fleetTexture = await PIXI.Assets.load('/assets/map_icons/fleet_ship.png').catch(() => {
          // Fallback if file doesn't exist yet (though we created it)
          return PIXI.Texture.WHITE;
        });

        // Camera setup
        cameraRef.current = {
          x: 0,
          y: 0,
          scale: Math.min(app.screen.width / TILE_SIZE, app.screen.height / TILE_SIZE) * 0.8,
        };

        // Render Tiles
        const renderTiles = () => {
          if (!bgLayer) return;
          // ... (keep tile rendering logic mostly same, simplified for brevity here if needed)
          const camera = cameraRef.current;
          const screenW = app.screen.width;
          const screenH = app.screen.height;
          const worldLeft = camera.x - (screenW / 2) / camera.scale;
          const worldTop = camera.y - (screenH / 2) / camera.scale;
          const worldRight = camera.x + (screenW / 2) / camera.scale;
          const worldBottom = camera.y + (screenH / 2) / camera.scale;

          const tileX0 = Math.floor(worldLeft / TILE_SIZE) - RENDER_PADDING;
          const tileY0 = Math.floor(worldTop / TILE_SIZE) - RENDER_PADDING;
          const tileX1 = Math.floor(worldRight / TILE_SIZE) + RENDER_PADDING;
          const tileY1 = Math.floor(worldBottom / TILE_SIZE) + RENDER_PADDING;

          const currentTiles = new Set<string>();

          for (let ty = tileY0; ty <= tileY1; ty++) {
            for (let tx = tileX0; tx <= tileX1; tx++) {
              const key = `${tx},${ty}`;
              currentTiles.add(key);
              if (!tileCacheRef.current.has(key)) {
                const s = new PIXI.Sprite(mapTexture);
                s.x = tx * TILE_SIZE;
                s.y = ty * TILE_SIZE;
                bgLayer.addChild(s);
                tileCacheRef.current.set(key, s);
              }
            }
          }

          for (const [key, sprite] of tileCacheRef.current.entries()) {
            if (!currentTiles.has(key)) {
              bgLayer.removeChild(sprite);
              sprite.destroy();
              tileCacheRef.current.delete(key);
            }
          }
        };

        const updateCamera = () => {
          mapContainer.scale.set(cameraRef.current.scale);
          mapContainer.x = app.screen.width / 2 - cameraRef.current.x * cameraRef.current.scale;
          mapContainer.y = app.screen.height / 2 - cameraRef.current.y * cameraRef.current.scale;
        };

        // Load Planets
        try {
          const pData = await api.getPlanets();
          setPlanets(pData.planets);

          if (pData.planets.length > 0) {
            // Default center: Oldest planet
            let centerX = pData.planets[0].x;
            let centerY = pData.planets[0].y;

            console.log('[WorldMap] Planets loaded:', pData.planets.length);

            // Better center: User's own planet
            if (currentUserId) {
              const myPlanet = pData.planets.find(p => p.ownerId === currentUserId && !p.isNpc);
              if (myPlanet) {
                centerX = myPlanet.x;
                centerY = myPlanet.y;
              } else {
                console.warn('[WorldMap] No home planet found for user', currentUserId);
              }
            }

            if (isNaN(centerX) || isNaN(centerY)) {
              console.error('[WorldMap] Invalid camera coordinates', centerX, centerY);
              centerX = 2500;
              centerY = 2500;
            }

            cameraRef.current.x = centerX;
            cameraRef.current.y = centerY;
          }

          const castleTexture = await PIXI.Assets.load('/assets/castles/castlesprite.png');

          pData.planets.forEach(p => {
            const s = new PIXI.Sprite(castleTexture);
            s.anchor.set(0.5);
            s.scale.set(0.15);
            s.x = p.x;
            s.y = p.y;
            s.eventMode = 'static';
            s.cursor = 'pointer';
            s.on('pointerdown', () => onPlanetClick?.(p));

            // Highlighting
            if (p.isNpc) {
              s.tint = 0xff4444; // Red for Enemies
            } else if (sourcePlanetId === p.id) {
              s.tint = 0x00ff00; // distinct tint for selected source
            }

            planetLayer.addChild(s);
            planetSpritesRef.current.set(p.id, s);
          });
          setLoading(false);
        } catch (e) {
          console.error(e);
          setError('Failed to load planets');
          setLoading(false);
        }

        // --- GAME LOOP ---
        app.ticker.add(() => {
          updateCamera();
          renderTiles();

          // --- RENDER FLEETS ---
          const currentFleets = latestFleetsRef.current;
          const activeIds = new Set(currentFleets.map(f => f.id));
          const now = Date.now();

          // 1. Remove stale fleets
          for (const [id, objects] of fleetObjectsRef.current.entries()) {
            if (!activeIds.has(id)) {
              fleetLayer.removeChild(objects.sprite);
              fleetLayer.removeChild(objects.graphics);
              fleetLayer.removeChild(objects.label);
              objects.sprite.destroy();
              objects.graphics.destroy();
              objects.label.destroy();
              fleetObjectsRef.current.delete(id);
            }
          }

          // 2. Update/Create active fleets
          currentFleets.forEach(fleet => {
            let objects = fleetObjectsRef.current.get(fleet.id);

            if (!objects) {
              // Create visual objects
              const sprite = new PIXI.Sprite(fleetTexture);
              sprite.anchor.set(0.5);
              sprite.scale.set(0.5); // Adjust based on icon size

              const graphics = new PIXI.Graphics();

              const label = new PIXI.Text({
                text: '', style: {
                  fontFamily: 'Arial', fontSize: 12, fill: 0xffffff, stroke: 0x000000, strokeThickness: 2
                }
              });
              label.anchor.set(0.5, 1.5); // Above sprite

              fleetLayer.addChild(graphics); // Draw line first
              fleetLayer.addChild(sprite);   // Then ship
              fleetLayer.addChild(label);

              objects = { sprite, graphics, label };
              fleetObjectsRef.current.set(fleet.id, objects);
            }

            // Update State
            const start = new Date(fleet.departAt).getTime();
            const end = new Date(fleet.arriveAt).getTime();
            const duration = end - start;
            const elapsed = now - start;
            let progress = Math.max(0, Math.min(1, elapsed / duration));

            const startX = fleet.fromPlanet.x;
            const startY = fleet.fromPlanet.y;
            const endX = fleet.toPlanet.x;
            const endY = fleet.toPlanet.y;

            const currentX = startX + (endX - startX) * progress;
            const currentY = startY + (endY - startY) * progress;

            objects.sprite.x = currentX;
            objects.sprite.y = currentY;

            // Rotation (face target)
            const angle = Math.atan2(endY - startY, endX - startX);
            objects.sprite.rotation = angle + Math.PI / 2; // +90deg if sprite points up

            // Draw Line (dashed?)
            objects.graphics.clear();
            // Color coding
            let color = 0xffff00; // Attack (Yellow)
            if (fleet.type === 'support') color = 0x00ff00; // Support (Green)
            // If we knew "my id", we could color red for incoming attacks. 
            // TODO: Add logic to check if target is me and type is attack.

            objects.graphics.moveTo(startX, startY);
            objects.graphics.lineTo(endX, endY);
            objects.graphics.stroke({ width: 2, color, alpha: 0.5 });

            // Label
            const timeRemaining = Math.max(0, Math.ceil((end - now) / 1000));
            objects.label.text = `${timeRemaining}s`;
            objects.label.x = currentX;
            objects.label.y = currentY;
          });
        });

        // Input Handling (Pan/Zoom) - Simplified for brevity, copied from original
        // ... (Implement Pan/Zoom listeners similar to original code)
        let isDragging = false;
        let lastPos = { x: 0, y: 0 };

        app.canvas.addEventListener('wheel', (e) => {
          e.preventDefault();
          const zoom = e.deltaY > 0 ? 0.9 : 1.1;
          cameraRef.current.scale = Math.max(0.1, Math.min(5, cameraRef.current.scale * zoom));
        });

        app.canvas.addEventListener('mousedown', (e) => {
          isDragging = true;
          lastPos = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => isDragging = false);

        app.canvas.addEventListener('mousemove', (e) => {
          if (isDragging) {
            const dx = (e.clientX - lastPos.x) / cameraRef.current.scale;
            const dy = (e.clientY - lastPos.y) / cameraRef.current.scale;
            cameraRef.current.x -= dx;
            cameraRef.current.y -= dy;
            lastPos = { x: e.clientX, y: e.clientY };
          }
        });

      } catch (e) {
        console.error(e);
        setError('Init failed');
      }
    };

    initPixi();

    return () => {
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {/* UI Overlays */}
      {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', color: 'white' }}>Loading System...</div>}
      {/* Planet Count / Debug */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: 5 }}>
        Planets: {planets.length} <br /> Active Fleets: {latestFleetsRef.current.length}
      </div>
    </div>
  );
}
