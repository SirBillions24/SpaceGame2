import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { api, type Planet, type Fleet } from '../lib/api';

interface Probe {
  id: string;
  targetX: number;
  targetY: number;
  status: string;
  startTime: string;
  arrivalTime: string;
  returnTime?: string;
  radius: number;
  fromPlanet: { x: number; y: number };
}

interface WorldMapProps {
  mapImageUrl: string;
  onPlanetClick?: (planet: Planet) => void;
  sourcePlanetId?: string | null;
  onMapContainerReady?: (container: PIXI.Container) => void;
  currentUserId?: string;
  isEspionageMode?: boolean;
  onEspionageModeChange?: (active: boolean) => void;
}

// Tile configuration
const TILE_SIZE = 1024; // Size of each tile in world units
const RENDER_PADDING = 1;

export default function WorldMap({ 
  mapImageUrl, 
  onPlanetClick, 
  sourcePlanetId, 
  onMapContainerReady, 
  currentUserId,
  isEspionageMode: controlledEspionageMode,
  onEspionageModeChange
}: WorldMapProps) {
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
  const latestProbesRef = useRef<Probe[]>([]);
  const probeObjectsRef = useRef<Map<string, { sprite: PIXI.Sprite, graphics: PIXI.Graphics }>>(new Map());

  const [planets, setPlanets] = useState<Planet[]>([]);
  const [localEspionageMode, setLocalEspionageMode] = useState(false);
  const [selectedProbeType, setSelectedProbeType] = useState('recon_probe');
  
  useEffect(() => {
    if (ghostProbeRef.current) {
      ghostProbeRef.current.clear();
      const radius = selectedProbeType === 'advanced_probe' ? 300 : 150;
      ghostProbeRef.current.circle(0, 0, radius);
      ghostProbeRef.current.stroke({ width: 2, color: 0x00f2ff, alpha: 0.5 });
      ghostProbeRef.current.fill({ color: 0x00f2ff, alpha: 0.1 });
    }
  }, [selectedProbeType]);

  const [hasIntelHub, setHasIntelHub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEspionageMode = controlledEspionageMode !== undefined ? controlledEspionageMode : localEspionageMode;
  const setIsEspionageMode = onEspionageModeChange || setLocalEspionageMode;

  const isEspionageModeRef = useRef(isEspionageMode);
  useEffect(() => {
    isEspionageModeRef.current = isEspionageMode;
  }, [isEspionageMode]);

  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Ghost Probe for placement
  const ghostProbeRef = useRef<PIXI.Graphics | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastRenderedTilesRef = useRef<Set<string>>(new Set());

  // Fleet & Probe Polling
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fleetData, probeData] = await Promise.all([
          api.getFleets(),
          api.getProbes()
        ]);
        latestFleetsRef.current = fleetData.fleets;
        latestProbesRef.current = probeData;

        // Check for intel hub on any player planet
        if (currentUserId) {
          const myPlanets = await api.getPlanets();
          const owned = myPlanets.planets.filter(p => p.ownerId === currentUserId);
          const intelHub = owned.some(p => p.buildings?.some(b => b.type === 'tavern' && b.status === 'active'));
          setHasIntelHub(intelHub);
        }
      } catch (err) {
        console.error('Failed to fetch map data', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [currentUserId]);

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

        const espionageLayer = new PIXI.Container();
        espionageLayer.zIndex = 30;
        mapContainer.addChild(espionageLayer);

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

          const colonyTexture = await PIXI.Assets.load('/assets/castles/castlesprite.png');
          const planetTexture = await PIXI.Assets.load('/assets/castles/castlesprite.png'); // Fallback naming

          pData.planets.forEach(p => {
            const s = new PIXI.Sprite(colonyTexture);
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

          // --- RENDER PROBES ---
          const currentProbes = latestProbesRef.current;
          const activeProbeIds = new Set(currentProbes.map(p => p.id));

          // 1. Remove stale probes
          for (const [id, objects] of probeObjectsRef.current.entries()) {
            if (!activeProbeIds.has(id)) {
              espionageLayer.removeChild(objects.sprite);
              espionageLayer.removeChild(objects.graphics);
              objects.sprite.destroy();
              objects.graphics.destroy();
              probeObjectsRef.current.delete(id);
            }
          }

          // 2. Update/Create active probes
          currentProbes.forEach(probe => {
            let objects = probeObjectsRef.current.get(probe.id);

            if (!objects) {
              const sprite = new PIXI.Sprite(PIXI.Texture.WHITE); // Placeholder or drone icon
              sprite.anchor.set(0.5);
              sprite.scale.set(0.2);
              sprite.tint = 0x00f2ff;

              const graphics = new PIXI.Graphics();
              espionageLayer.addChild(graphics);
              espionageLayer.addChild(sprite);

              objects = { sprite, graphics };
              probeObjectsRef.current.set(probe.id, objects);
            }

            let posX = probe.targetX;
            let posY = probe.targetY;
            let showRadius = true;

            if (probe.status === 'traveling') {
              const start = new Date(probe.startTime).getTime();
              const end = new Date(probe.arrivalTime).getTime();
              const nowMs = Date.now();
              const progress = Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
              
              posX = probe.fromPlanet.x + (probe.targetX - probe.fromPlanet.x) * progress;
              posY = probe.fromPlanet.y + (probe.targetY - probe.fromPlanet.y) * progress;
              
              objects.sprite.alpha = 0.6;
            } else if (probe.status === 'returning') {
              const start = new Date(probe.lastUpdateTime).getTime(); // Recall started
              const end = new Date(probe.returnTime!).getTime();
              const nowMs = Date.now();
              const progress = Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
              
              // Move from target back to home
              posX = probe.targetX + (probe.fromPlanet.x - probe.targetX) * progress;
              posY = probe.targetY + (probe.fromPlanet.y - probe.targetY) * progress;
              
              objects.sprite.alpha = 0.4;
              objects.sprite.tint = 0xff0000; // Red for returning
            } else {
              objects.sprite.alpha = 1.0;
              objects.sprite.tint = 0x00f2ff;
            }

            objects.sprite.x = posX;
            objects.sprite.y = posY;

            // Draw Radius and Connection Line
            objects.graphics.clear();
            
            // Draw tether line to home colony
            objects.graphics.moveTo(probe.fromPlanet.x, probe.fromPlanet.y);
            objects.graphics.lineTo(posX, posY);
            objects.graphics.stroke({ width: 1, color: 0x00f2ff, alpha: 0.15 });

            if (showRadius) {
              objects.graphics.circle(posX, posY, probe.radius);
              objects.graphics.stroke({ width: 1, color: 0x00f2ff, alpha: 0.3 });
              if (probe.status !== 'traveling' && probe.status !== 'returning') {
                objects.graphics.fill({ color: 0x00f2ff, alpha: 0.05 });
              }
            }
          });

          // --- GHOST PROBE ---
          if (ghostProbeRef.current) {
            ghostProbeRef.current.visible = isEspionageModeRef.current;
          }
        });

        // Create ghost probe
        const ghostProbe = new PIXI.Graphics();
        ghostProbe.circle(0, 0, 150);
        ghostProbe.stroke({ width: 2, color: 0x00f2ff, alpha: 0.5 });
        ghostProbe.fill({ color: 0x00f2ff, alpha: 0.1 });
        ghostProbe.visible = false;
        espionageLayer.addChild(ghostProbe);
        ghostProbeRef.current = ghostProbe;

        // Input Handling (Pan/Zoom) - Simplified for brevity, copied from original
        let isDragging = false;
        let lastPos = { x: 0, y: 0 };
        let dragStartTime = 0;

        app.canvas.addEventListener('wheel', (e) => {
          e.preventDefault();
          const zoom = e.deltaY > 0 ? 0.9 : 1.1;
          cameraRef.current.scale = Math.max(0.1, Math.min(5, cameraRef.current.scale * zoom));
        });

        app.canvas.addEventListener('mousedown', (e) => {
          isDragging = true;
          lastPos = { x: e.clientX, y: e.clientY };
          dragStartTime = Date.now();
        });

        app.canvas.addEventListener('click', async (e) => {
          // If was dragging, don't trigger click
          if (Date.now() - dragStartTime > 200) return;

          if (isEspionageModeRef.current) {
            // Calculate world coords
            const rect = app.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = cameraRef.current.x + (mouseX - app.screen.width / 2) / cameraRef.current.scale;
            const worldY = cameraRef.current.y + (mouseY - app.screen.height / 2) / cameraRef.current.scale;

            try {
              // Get home planet to launch from
              const myPlanets = await api.getPlanets();
              const home = myPlanets.planets.find(p => p.ownerId === currentUserIdRef.current && !p.isNpc);
              if (!home) throw new Error('No home colony found');

              await api.launchProbe(home.id, Math.round(worldX), Math.round(worldY), selectedProbeType);
              setIsEspionageMode(false);
              alert(`${selectedProbeType.replace('_', ' ').toUpperCase()} Launched!`);
            } catch (err: any) {
              alert(err.message);
            }
          }
        });

        window.addEventListener('mouseup', () => isDragging = false);

        app.canvas.addEventListener('mousemove', (e) => {
          const rect = app.canvas.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const worldX = cameraRef.current.x + (mouseX - app.screen.width / 2) / cameraRef.current.scale;
          const worldY = cameraRef.current.y + (mouseY - app.screen.height / 2) / cameraRef.current.scale;

          if (ghostProbeRef.current) {
            ghostProbeRef.current.x = worldX;
            ghostProbeRef.current.y = worldY;
          }

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
        Planets: {planets.length} <br /> Active Fleets: {latestFleetsRef.current.length} <br />
        Active Probes: {latestProbesRef.current.length}
      </div>

      {hasIntelHub && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setIsEspionageMode(!isEspionageMode)}
            style={{
              padding: '10px 20px',
              background: isEspionageMode ? '#00f2ff' : '#222',
              color: isEspionageMode ? '#000' : '#00f2ff',
              border: '2px solid #00f2ff',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 0 10px rgba(0, 242, 255, 0.3)'
            }}
          >
            {isEspionageMode ? 'CANCEL PROBE DEPLOYMENT' : 'DEPLOY RECON PROBE'}
          </button>
        </div>
      )}

      {isEspionageMode && (
        <div style={{ 
          position: 'absolute', 
          top: 80, 
          left: '50%', 
          transform: 'translateX(-50%)', 
          color: '#00f2ff', 
          background: 'rgba(0,0,0,0.85)', 
          padding: '15px 30px', 
          borderRadius: '10px',
          border: '1px solid #00f2ff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 0 20px rgba(0, 242, 255, 0.4)'
        }}>
          <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>SELECT PROBE TYPE & CLICK ON MAP</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedProbeType('recon_probe'); }}
              style={{
                padding: '5px 15px',
                background: selectedProbeType === 'recon_probe' ? '#00f2ff' : '#111',
                color: selectedProbeType === 'recon_probe' ? '#000' : '#00f2ff',
                border: '1px solid #00f2ff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              BASIC (150 Radius)
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedProbeType('advanced_probe'); }}
              style={{
                padding: '5px 15px',
                background: selectedProbeType === 'advanced_probe' ? '#00f2ff' : '#111',
                color: selectedProbeType === 'advanced_probe' ? '#000' : '#00f2ff',
                border: '1px solid #00f2ff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              ADVANCED (300 Radius)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
