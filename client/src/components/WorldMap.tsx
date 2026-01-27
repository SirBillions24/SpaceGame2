import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { api, type Planet, type Fleet } from '../lib/api';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { ProceduralBackgroundManager } from './ProceduralBackground';
import { SPRITE_CONFIG, getPlanetSpritePath } from '../config/spriteConfig';

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

interface EventShip {
  id: string;
  shipType: 'scout' | 'raider' | 'carrier' | 'dreadnought' | 'mothership';
  name: string;
  level: number;
  tier: number;
  x: number;
  y: number;
  zoneType: 'player_ring' | 'portal';
  isDefeated: boolean;
  attackCount: number;
  maxAttacks: number | null;
}

interface WorldMapProps {
  mapImageUrl?: string; // Optional - no longer used for background
  onPlanetClick?: (planet: Planet) => void;
  sourcePlanetId?: string | null;
  onMapContainerReady?: (container: PIXI.Container) => void;
  currentUserId?: string;
  isEspionageMode?: boolean;
  onEspionageModeChange?: (active: boolean) => void;
  teleportTo?: { x: number; y: number } | null; // Camera teleport target
  onTeleportComplete?: () => void; // Called after teleport
  onEventShipClick?: (ship: EventShip) => void;
}

// Tile configuration (kept for camera scale calculation)
const TILE_SIZE = 1024;

export default function WorldMap({
  onPlanetClick,
  sourcePlanetId,
  onMapContainerReady,
  currentUserId,
  isEspionageMode: controlledEspionageMode,
  onEspionageModeChange,
  teleportTo,
  onTeleportComplete,
  onEventShipClick
}: WorldMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const mapContainerRef = useRef<PIXI.Container | null>(null);

  // Storage for map objects
  const planetSpritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const planetLabelsRef = useRef<Map<string, PIXI.Text>>(new Map());

  // Storage for fleet animation objects [fleetId -> { sprite, graphics }]
  const fleetObjectsRef = useRef<Map<string, { sprite: PIXI.Sprite, graphics: PIXI.Graphics, label: PIXI.Text }>>(new Map());
  // We keep the latest fleets data in a ref to access it inside the render loop without dependency issues
  const latestFleetsRef = useRef<Fleet[]>([]);
  const latestProbesRef = useRef<Probe[]>([]);
  const probeObjectsRef = useRef<Map<string, { sprite: PIXI.Sprite, graphics: PIXI.Graphics }>>(new Map());

  // Event ship tracking
  const latestEventShipsRef = useRef<EventShip[]>([]);
  const eventShipObjectsRef = useRef<Map<string, { sprite: PIXI.Sprite, label: PIXI.Text, glow: PIXI.Graphics }>>(new Map());
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  const [planets, setPlanets] = useState<Planet[]>([]);
  const [myCoalitionId, setMyCoalitionId] = useState<string | null | undefined>(undefined);
  const [localEspionageMode, setLocalEspionageMode] = useState(false);
  const [selectedProbeType, setSelectedProbeType] = useState('recon_probe');

  useEffect(() => {
    // Fetch my coalition
    api.getMyCoalition().then(data => {
      setMyCoalitionId(data.coalition?.id || null);
    }).catch(() => {
      setMyCoalitionId(null);
    });
  }, []);

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

  // Teleport camera when teleportTo changes
  useEffect(() => {
    if (teleportTo && cameraRef.current) {
      cameraRef.current.x = teleportTo.x;
      cameraRef.current.y = teleportTo.y;
      cameraRef.current.scale = 1; // Zoom to reasonable level
      onTeleportComplete?.();
    }
  }, [teleportTo, onTeleportComplete]);

  // Ghost Probe for placement
  const ghostProbeRef = useRef<PIXI.Graphics | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastRenderedTilesRef = useRef<Set<string>>(new Set());

  // Initial data fetch on mount
  useEffect(() => {
    const fetchInitialData = async () => {
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

        // Check for active event and fetch ships
        try {
          const eventResult = await api.getActiveEvent();
          if (eventResult.event) {
            setActiveEventId(eventResult.event.id);
            const shipsData = await api.getEventShips(eventResult.event.id);
            latestEventShipsRef.current = shipsData.ships || [];
          } else {
            setActiveEventId(null);
            latestEventShipsRef.current = [];
          }
        } catch {
          setActiveEventId(null);
          latestEventShipsRef.current = [];
        }
      } catch (err) {
        console.error('Failed to fetch map data', err);
      }
    };

    fetchInitialData();

    // Refresh event ships every 30 seconds
    const eventShipsInterval = setInterval(async () => {
      if (activeEventId) {
        try {
          const shipsData = await api.getEventShips(activeEventId);
          latestEventShipsRef.current = shipsData.ships || [];
        } catch {
          // Silent fail
        }
      }
    }, 30000);

    return () => clearInterval(eventShipsInterval);
  }, [currentUserId, activeEventId]);

  // WebSocket subscription for real-time fleet updates
  useSocketEvent<Fleet>('fleet:updated', useCallback((data) => {
    // Remove completed/destroyed fleets from data ref - game loop handles visual cleanup
    if (data.status === 'completed' || data.status === 'destroyed') {
      latestFleetsRef.current = latestFleetsRef.current.filter(f => f.id !== data.id);
      return;
    }

    // Update existing fleet or add new one
    const existingIndex = latestFleetsRef.current.findIndex(f => f.id === data.id);
    if (existingIndex >= 0) {
      latestFleetsRef.current = latestFleetsRef.current.map(f => f.id === data.id ? data : f);
    } else {
      latestFleetsRef.current = [...latestFleetsRef.current, data];
    }
  }, []));

  // WebSocket subscription for new planets (NPC respawns, player spawns)
  useSocketEvent<any>('world:planetAdded', useCallback((data) => {
    setPlanets(prev => {
      // Update if exists, add if new
      const exists = prev.find(p => p.id === data.id);
      if (exists) {
        return prev.map(p => p.id === data.id ? { ...p, ...data } : p);
      }
      return [...prev, data];
    });
  }, []));

  // WebSocket subscription for probe updates
  useSocketEvent<any>('probe:updated', useCallback((data) => {
    // Remove if destroyed or on cooldown (returned) - game loop handles visual cleanup
    if (data.status === 'destroyed' || data.status === 'cooldown' || data.status === 'completed') {
      latestProbesRef.current = latestProbesRef.current.filter(p => p.id !== data.id);
      return;
    }

    // Update existing or add new
    const existingIndex = latestProbesRef.current.findIndex(p => p.id === data.id);
    if (existingIndex >= 0) {
      latestProbesRef.current = latestProbesRef.current.map(p => p.id === data.id ? data : p);
    } else {
      latestProbesRef.current = [...latestProbesRef.current, data];
    }
  }, []));

  useEffect(() => {
    const initPixi = async () => {
      if (!canvasRef.current || appRef.current || myCoalitionId === undefined) return;

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

        // Procedural Background (replaces tiled PNG)
        const proceduralBg = new ProceduralBackgroundManager(mapContainer);

        // Add initial black hole at center of starting map area
        proceduralBg.addBlackHole({ id: 'main', x: 5000, y: 5000 });

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

        // Event ships layer (alien invasion, etc.)
        const eventLayer = new PIXI.Container();
        eventLayer.zIndex = 15; // Between fleets and planets
        mapContainer.addChild(eventLayer);

        // Note: mapImageUrl no longer used for background (procedural generation)

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

        // Update procedural background based on camera
        const updateBackground = () => {
          const camera = cameraRef.current;
          proceduralBg.update(
            camera.x,
            camera.y,
            camera.scale,
            app.screen.width,
            app.screen.height
          );
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

          // Load all planet textures from config
          const textureCache = new Map<string, PIXI.Texture>();
          const defaultTexture = await PIXI.Assets.load(SPRITE_CONFIG.planets.default);
          textureCache.set(SPRITE_CONFIG.planets.default, defaultTexture);

          // Load planet type textures
          for (const [, path] of Object.entries(SPRITE_CONFIG.planets)) {
            if (!textureCache.has(path)) {
              textureCache.set(path, await PIXI.Assets.load(path).catch(() => defaultTexture));
            }
          }

          // Load NPC class textures
          for (const [, path] of Object.entries(SPRITE_CONFIG.npc)) {
            if (!textureCache.has(path)) {
              textureCache.set(path, await PIXI.Assets.load(path).catch(() => defaultTexture));
            }
          }

          pData.planets.forEach(p => {
            const spritePath = getPlanetSpritePath(p.planetType, p.npcClass, p.isNpc);
            const texture = textureCache.get(spritePath) || defaultTexture;

            const s = new PIXI.Sprite(texture);
            s.anchor.set(0.5);
            s.scale.set(0.15);
            s.x = p.x;
            s.y = p.y;
            s.eventMode = 'static';
            s.cursor = 'pointer';
            s.on('pointerdown', () => onPlanetClick?.(p));

            // Highlighting & Label
            const isAlly = p.coalitionId && p.coalitionId === myCoalitionId;
            const isMe = p.ownerId === currentUserId;

            // NPC: "LVL X Name", Player: "Colony Name\n[TAG] Owner" or "Colony Name\nOwner"
            const labelText = p.isNpc
              ? `LVL ${p.npcLevel} ${p.name}`
              : `${p.name}\n${p.coalitionTag ? `[${p.coalitionTag}] ` : ''}${p.ownerName || 'Unknown'}`;

            const labelColor = isMe ? 0x00ff88 : (isAlly ? 0xd500f9 : 0x00f3ff);

            const label = new PIXI.Text({
              text: labelText,
              style: {
                fontFamily: 'Courier New',
                fontSize: 14,
                fill: labelColor,
                fontWeight: 'bold',
                stroke: 0x000000,
                strokeThickness: 3
              }
            });
            label.anchor.set(0.5, 0); // Anchor at top-center of text
            label.x = p.x;
            label.y = p.y + 45; // Position below sprite (sprite is ~90px at 0.15 scale, so half is ~45)
            label.zIndex = 100; // Ensure labels render on top
            planetLayer.addChild(label);
            planetLabelsRef.current.set(p.id, label);

            if (p.isNpc) {
              // Only tint if we are using the fallback texture
              if (texture === defaultTexture) {
                s.tint = 0xff4444; // Red for Enemies fallback
              }
            } else if (sourcePlanetId === p.id) {
              s.tint = 0x00ff00; // distinct tint for selected source
            } else if (isAlly) {
              s.tint = 0xd500f9; // Purple tint for coalition allies
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
          updateBackground();

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

            // Determine visual start/end based on fleet status
            // When returning, the fleet travels from toPlanet back to fromPlanet
            const isReturning = fleet.status === 'returning';
            const visualStartX = isReturning ? fleet.toPlanet.x : fleet.fromPlanet.x;
            const visualStartY = isReturning ? fleet.toPlanet.y : fleet.fromPlanet.y;
            const visualEndX = isReturning ? fleet.fromPlanet.x : fleet.toPlanet.x;
            const visualEndY = isReturning ? fleet.fromPlanet.y : fleet.toPlanet.y;

            const currentX = visualStartX + (visualEndX - visualStartX) * progress;
            const currentY = visualStartY + (visualEndY - visualStartY) * progress;

            objects.sprite.x = currentX;
            objects.sprite.y = currentY;

            // Rotation (face target)
            const angle = Math.atan2(visualEndY - visualStartY, visualEndX - visualStartX);
            objects.sprite.rotation = angle + Math.PI / 2; // +90deg if sprite points up

            // Draw Line
            objects.graphics.clear();
            // Color coding
            let color = 0xffff00; // Attack (Yellow)
            if (fleet.type === 'support') color = 0x00ff00; // Support (Green)
            if (isReturning) color = 0x00ffaa; // Returning (Teal/Green)
            // Check if this is a transfer (attack to owned planet - same owner for from/to)
            if (fleet.type === 'attack' && fleet.fromPlanet && fleet.toPlanet && !isReturning) {
              // If going to owned planet, show as transfer (cyan)
              const fromOwner = planets.find(p => p.id === fleet.fromPlanet.id)?.ownerId;
              const toOwner = planets.find(p => p.id === fleet.toPlanet.id)?.ownerId;
              if (fromOwner && toOwner && fromOwner === toOwner) {
                color = 0x00f3ff; // Transfer (Cyan)
              }
            }

            objects.graphics.moveTo(visualStartX, visualStartY);
            objects.graphics.lineTo(visualEndX, visualEndY);
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

          // --- RENDER EVENT SHIPS ---
          const currentEventShips = latestEventShipsRef.current;
          const activeEventShipIds = new Set(currentEventShips.filter(s => !s.isDefeated).map(s => s.id));

          // 1. Remove stale event ships
          for (const [id, objects] of eventShipObjectsRef.current.entries()) {
            if (!activeEventShipIds.has(id)) {
              eventLayer.removeChild(objects.sprite);
              eventLayer.removeChild(objects.label);
              eventLayer.removeChild(objects.glow);
              objects.sprite.destroy();
              objects.label.destroy();
              objects.glow.destroy();
              eventShipObjectsRef.current.delete(id);
            }
          }

          // 2. Update/Create active event ships
          currentEventShips.filter(s => !s.isDefeated).forEach(ship => {
            let objects = eventShipObjectsRef.current.get(ship.id);

            if (!objects) {
              // Create visual objects for ship
              const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
              sprite.anchor.set(0.5);

              // Size and color based on tier
              let size = 0.3;
              let tint = 0x9c27b0; // Purple default
              switch (ship.shipType) {
                case 'scout': size = 0.2; tint = 0x4caf50; break;
                case 'raider': size = 0.25; tint = 0x2196f3; break;
                case 'carrier': size = 0.35; tint = 0xff9800; break;
                case 'dreadnought': size = 0.4; tint = 0xf44336; break;
                case 'mothership': size = 0.6; tint = 0x9c27b0; break;
              }

              sprite.scale.set(size);
              sprite.tint = tint;
              sprite.eventMode = 'static';
              sprite.cursor = 'pointer';
              sprite.on('pointerdown', () => onEventShipClick?.(ship));

              // Glow effect
              const glow = new PIXI.Graphics();
              glow.circle(0, 0, 30 + ship.tier * 10);
              glow.fill({ color: tint, alpha: 0.15 });
              glow.stroke({ width: 2, color: tint, alpha: 0.4 });

              // Label
              const label = new PIXI.Text({
                text: `LVL ${ship.level} ${ship.name}`,
                style: {
                  fontFamily: 'Courier New',
                  fontSize: 11,
                  fill: tint,
                  fontWeight: 'bold',
                  stroke: 0x000000,
                  strokeThickness: 3
                }
              });
              label.anchor.set(0.5, 0);

              eventLayer.addChild(glow);
              eventLayer.addChild(sprite);
              eventLayer.addChild(label);

              objects = { sprite, label, glow };
              eventShipObjectsRef.current.set(ship.id, objects);
            }

            // Position
            objects.sprite.x = ship.x;
            objects.sprite.y = ship.y;
            objects.label.x = ship.x;
            objects.label.y = ship.y + 35;
            objects.glow.x = ship.x;
            objects.glow.y = ship.y;

            // Animate glow
            const pulseAlpha = 0.1 + Math.sin(Date.now() / 500 + ship.tier) * 0.05;
            objects.glow.alpha = pulseAlpha;
          });
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
  }, [myCoalitionId]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {/* UI Overlays */}
      {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', color: 'white' }}>Loading System...</div>}
      {/* Planet Count / Debug */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: 5 }}>
        Planets: {planets.length} <br /> Active Fleets: {latestFleetsRef.current.length} <br />
        Active Probes: {latestProbesRef.current.length}
        {activeEventId && <><br />Event Ships: {latestEventShipsRef.current.filter(s => !s.isDefeated).length}</>}
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
