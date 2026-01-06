import { useState, useEffect, useRef, useCallback } from 'react';
import { api, type Planet, getCurrentUser } from '../lib/api';
import DefensePanel from './DefensePanel';
import WorkshopPanel from './WorkshopPanel';
import ExpansionModal from './ExpansionModal';
import DefenseTurretModal from './DefenseTurretModal';
import AdmiralPanel from './AdmiralPanel';
import './PlanetInterior.css';

interface PlanetInteriorProps {
  planet: Planet;
  onClose: () => void;
  onUpdate?: () => void;
}

const BUILDING_LABELS: Record<string, string> = {
  'colony_hub': 'Colony Hub',
  'carbon_processor': 'Carbon Processor',
  'titanium_extractor': 'Titanium Extractor',
  'hydroponics': 'Hydroponics',
  'academy': 'Naval Academy',
  'tavern': 'Intelligence Hub',
  'defense_workshop': 'Systems Workshop',
  'siege_workshop': 'Munitions Factory',
  'monument': 'Holo-Monument',
  'housing_unit': 'Residential Block',
  'shield_generator': 'Defensive Grid',
  'storage_depot': 'Automated Storage Depot'
};

const BUILDING_SIZES: Record<string, number> = {
  'colony_hub': 4,
  'carbon_processor': 2,
  'titanium_extractor': 2,
  'hydroponics': 2,
  'academy': 3,
  'tavern': 2,
  'defense_workshop': 2,
  'siege_workshop': 2,
  'monument': 1,
  'housing_unit': 2,
  'shield_generator': 2,
  'storage_depot': 2
};

const BUILDING_COSTS: Record<string, { c: number, t: number }> = {
  'colony_hub': { c: 0, t: 0 },
  'carbon_processor': { c: 13, t: 0 },
  'titanium_extractor': { c: 14, t: 0 },
  'hydroponics': { c: 30, t: 0 },
  'academy': { c: 158, t: 83 },
  'tavern': { c: 145, t: 95 },
  'defense_workshop': { c: 61, t: 30 },
  'siege_workshop': { c: 118, t: 63 },
  'monument': { c: 50, t: 20 },
  'housing_unit': { c: 20, t: 10 },
  'shield_generator': { c: 1000, t: 1000 },
  'storage_depot': { c: 79, t: 42 }
};

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
      'Base production rate: 8/h at Level 1',
      'Scales with Stability/Productivity'
    ],
    size: '2×2 tiles',
    cost: { c: 13, t: 0 }
  },
  'titanium_extractor': {
    name: 'Titanium Extractor',
    description: 'Mines and refines titanium ore for advanced construction.',
    purpose: [
      'Produces Titanium resource',
      'Base production rate: 8/h at Level 1',
      'Scales with Stability/Productivity'
    ],
    size: '2×2 tiles',
    cost: { c: 14, t: 0 }
  },
  'hydroponics': {
    name: 'Hydroponics',
    description: 'Automated agricultural facility producing nutrient paste.',
    purpose: [
      'Produces Food (Nutrient Paste)',
      'Base production rate: 16/h at Level 1',
      'Scales with Stability/Productivity',
      'Required for unit upkeep'
    ],
    size: '2×2 tiles',
    cost: { c: 30, t: 0 }
  },
  'housing_unit': {
    name: 'Residential Block',
    description: 'Housing complex for colony population.',
    purpose: [
      'Increases population capacity',
      'Enables higher tax revenue',
      'Reduces Stability (Public Order)'
    ],
    size: '2×2 tiles',
    cost: { c: 20, t: 10 }
  },
  'academy': {
    name: 'Naval Academy',
    description: 'Military training facility for fleet operations and command.',
    purpose: [
      'Unlocks Defense Panel (Defensive Strategy)',
      'Enables Unit Recruitment',
      'Unlocks Defense Turret management'
    ],
    unlocks: [
      'Defense Panel access',
      'Recruitment Console',
      'Defense Turret system'
    ],
    size: '3×3 tiles',
    cost: { c: 158, t: 83 }
  },
  'tavern': {
    name: 'Intelligence Hub',
    description: 'Covert operations center for espionage and intelligence gathering.',
    purpose: [
      'Generates Spies/Infiltrators',
      'Spy count = Building level'
    ],
    size: '2×2 tiles',
    cost: { c: 145, t: 95 }
  },
  'defense_workshop': {
    name: 'Systems Workshop',
    description: 'Manufacturing facility for defensive equipment and systems.',
    purpose: [
      'Manufactures Defense Tools',
      'Unlocks Systems Workshop panel'
    ],
    size: '2×2 tiles',
    cost: { c: 61, t: 30 }
  },
  'siege_workshop': {
    name: 'Munitions Factory',
    description: 'Production facility for siege weapons and attack equipment.',
    purpose: [
      'Manufactures Siege Tools',
      'Unlocks Munitions Factory panel'
    ],
    size: '2×2 tiles',
    cost: { c: 118, t: 63 }
  },
  'monument': {
    name: 'Holo-Monument',
    description: 'Decorative holographic monument celebrating colony achievements.',
    purpose: [
      'Increases Stability',
      'Improves Productivity modifier'
    ],
    size: '1×1 tile',
    cost: { c: 50, t: 20 }
  },
  'shield_generator': {
    name: 'Defensive Grid',
    description: 'Planetary shield generator providing defensive bonuses.',
    purpose: [
      'Increases defensive grid level (wall level)',
      'Unlocks defensive tool slots'
    ],
    size: '2×2 tiles',
    cost: { c: 1000, t: 1000 }
  },
  'storage_depot': {
    name: 'Automated Storage Depot',
    description: 'Centralized storage for colony resources.',
    purpose: [
      'Increases maximum resource storage capacity'
    ],
    size: '2×2 tiles',
    cost: { c: 79, t: 42 }
  },
  'colony_hub': {
    name: 'Colony Hub',
    description: 'The central command structure of your planetary colony.',
    purpose: [
      'Main colony building',
      'Starting structure',
      'Provides base Stability'
    ],
    size: '4×4 tiles',
    cost: { c: 0, t: 0 }
  }
};

const UNIT_COSTS: any = {
  marine: { c: 48, t: 0, time: 20, label: 'Marine' },
  ranger: { c: 41, t: 0, time: 30, label: 'Ranger' },
  sentinel: { c: 200, t: 0, time: 40, label: 'Sentinel' }
};

// Organized building categories
const BUILDING_CATEGORIES = {
  structures: {
    label: 'Structures',
    subsections: {
      military: {
        label: 'Military',
        buildings: ['academy', 'shield_generator', 'tavern', 'defense_workshop', 'siege_workshop']
      },
      civil: {
        label: 'Civil',
        buildings: ['carbon_processor', 'titanium_extractor', 'hydroponics', 'housing_unit', 'monument', 'colony_hub', 'storage_depot']
      }
    }
  },
  production: {
    label: 'Production',
    subsections: {
      workshops: {
        label: 'Workshops',
        buildings: [] // These are actions/panels, not buildings
      }
    }
  },
  fleet: {
    label: 'Fleet Management',
    subsections: {
      operations: {
        label: 'Operations',
        buildings: [] // These are actions, not buildings
      }
    }
  }
};

export default function PlanetInterior({ planet, onClose }: PlanetInteriorProps) {
  const [planetData, setPlanetData] = useState<Planet | null>(null);
  const [loading, setLoading] = useState(true);

  // Interaction State
  const [hoveredTile, setHoveredTile] = useState<{ x: number, y: number } | null>(null);
  const [buildMode, setBuildMode] = useState<string | null>(null); // Building Type
  const [moveMode, setMoveMode] = useState<boolean>(false);
  const [movingBuildingId, setMovingBuildingId] = useState<string | null>(null);
  const [showUpgradeMenu, setShowUpgradeMenu] = useState<{ building: any } | null>(null);
  const [recruitSelection, setRecruitSelection] = useState<string>('marine');
  const [recruitCount, setRecruitCount] = useState<number>(10);
  const [showRecruitConsole, setShowRecruitConsole] = useState(false);
  const [showDefensePanel, setShowDefensePanel] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState<'defense_workshop' | 'siege_workshop' | null>(null);
  const [showExpansionModal, setShowExpansionModal] = useState(false);
  const [showTurretModal, setShowTurretModal] = useState(false);
  const [showAdmiralPanel, setShowAdmiralPanel] = useState(false);
  const [hoveredBuildingType, setHoveredBuildingType] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<string>('structures');
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(new Set(['military', 'civil', 'workshops', 'operations']));
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnterBuilding = (e: React.MouseEvent, type: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.right + 15, y: rect.top });
    setHoveredBuildingType(type);
  };

  // Zoom State
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [autoZoom, setAutoZoom] = useState<boolean>(true);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Pan/Drag State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  const currentUser = getCurrentUser();
  const isOwner = currentUser?.userId === planet.ownerId;

  // Initial Load
  const loadPlanetData = async () => {
    try {
      const data = await api.getPlanet(planet.id);
      setPlanetData(data);
    } catch (error) {
      console.error('Failed to load planet data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlanetData();
  }, [planet.id]);

  // Timer Logic
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Global Ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const construction = planetData?.construction;
  useEffect(() => {
    if (construction?.isBuilding && construction.buildFinishTime) {
      // Logic moved to rely on 'now' if we wanted, or kept simple here
      // Let's just use the existing logic for construction right now to minimize diff risk, 
      // but strictly speaking we could unify.
      // Re-implementing simplified construction timer using `now` would be cleaner but changing logic.
      // Keeping existing interval logic for construction for safety, but `now` is needed for recruitment.

      const finish = new Date(construction.buildFinishTime!);
      const diff = Math.ceil((finish.getTime() - now.getTime()) / 1000);

      if (diff <= 0) {
        if (timeLeft !== null) { // Only reload if we transition from having time to 0
          setTimeLeft(null);
          loadPlanetData();
        }
      } else {
        setTimeLeft(`${diff}s`);
      }
    } else {
      setTimeLeft(null);
    }
  }, [now, construction, planet.id]);

  // derived
  const resources = planetData?.resources;
  const buildings = planetData?.buildings || [];

  // Occupied Map
  const occupiedMap = new Set<string>();
  buildings.forEach(b => {
    const size = BUILDING_SIZES[b.type] || 2;
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        occupiedMap.add(`${b.x + dx},${b.y + dy}`);
      }
    }
  });
  const isOccupied = (x: number, y: number) => occupiedMap.has(`${x},${y}`);

  // Placement Check Logic
  const canPlaceAt = (x: number, y: number, type: string, ignoreId?: string) => {
    const size = BUILDING_SIZES[type] || 2;
    // Bounds - use actual grid size
    const currentGridX = planetData?.gridSizeX || planet.gridSizeX || planet.gridSize || 10;
    const currentGridY = planetData?.gridSizeY || planet.gridSizeY || planet.gridSize || 10;
    if (x + size > currentGridX || y + size > currentGridY) return false;
    // Overlap
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        // Check collision, but ignore 'ignoreId' if provided
        // We need to check if the occupied map has something *other* than us.
        // Simplest: Iterate buildings directly instead of using occupiedMap for complex checks, OR rebuild map excluding us?
        // Re-iterating is safer for "exclude".
        const blocking = buildings.find(b => {
          if (ignoreId && b.id === ignoreId) return false;
          const bSize = BUILDING_SIZES[b.type] || 2;
          return (x + dx >= b.x && x + dx < b.x + bSize && y + dy >= b.y && y + dy < b.y + bSize);
        });
        if (blocking) return false;
      }
    }
    return true;
  };

  // Handlers
  const handleTileClick = async (x: number, y: number) => {
    if (!isOwner) return;

    // Don't process click if user was dragging
    if (hasDraggedRef.current) {
      return;
    }

    // Move Mode Logic
    if (moveMode) {
      if (movingBuildingId) {
        // Attempt place
        try {
          const movingB = buildings.find(b => b.id === movingBuildingId);
          if (movingB) {
            const size = BUILDING_SIZES[movingB.type] || 2;
            const currentGridX = planetData?.gridSizeX || planet.gridSizeX || planet.gridSize || 10;
            const currentGridY = planetData?.gridSizeY || planet.gridSizeY || planet.gridSize || 10;
            if (x + size > currentGridX || y + size > currentGridY) {
              alert(`Cannot move building: position out of bounds (max: ${currentGridX}x${currentGridY})`);
              return;
            }

            if (!canPlaceAt(x, y, movingB.type, movingB.id)) return;

            await api.moveBuilding(planet.id, movingBuildingId, x, y);
            setMovingBuildingId(null);
            setMoveMode(false);

            loadPlanetData();
            onUpdate?.();
          }
        } catch (e: any) { alert(e.message); }
      } else {
        const building = buildings.find(b => {
          const size = BUILDING_SIZES[b.type] || 2;
          return x >= b.x && x < b.x + size && y >= b.y && y < b.y + size;
        });

        if (building) {
          setMovingBuildingId(building.id);
        }
      }
      return;
    }

    if (buildMode) {
      // Attempt to build
      if (canPlaceAt(x, y, buildMode)) {
        try {
          await api.build(planet.id, buildMode, x, y);
          setBuildMode(null);
          loadPlanetData();
          onUpdate?.();
        } catch (e: any) { alert(e.message); }
      }
      return;
    }

    // Check click existing
    const building = buildings.find(b => {
      const size = BUILDING_SIZES[b.type] || 2;
      return x >= b.x && x < b.x + size && y >= b.y && y < b.y + size;
    });
    if (building) {
      setShowUpgradeMenu({ building });
    }
  };

  const handleRecruit = async () => {
    if (recruitCount <= 0) return;
    try {
      await api.recruit(planet.id, recruitSelection, recruitCount);
      loadPlanetData();
    } catch (e: any) { alert(e.message); }
  };

  // Render Grid (use dynamic size from planetData, fallback to planet prop)
  const gridSizeX = planetData?.gridSizeX || planetData?.gridSize || planet.gridSizeX || planet.gridSize || 10;
  const gridSizeY = planetData?.gridSizeY || planetData?.gridSize || planet.gridSizeY || planet.gridSize || 10;

  // Calculate optimal zoom level
  const calculateOptimalZoom = (gridX: number, gridY: number): number => {
    if (!gridContainerRef.current) return 1.0;

    const container = gridContainerRef.current;
    const containerWidth = container.clientWidth - 40; // Account for padding (20px each side)
    const containerHeight = container.clientHeight - 40; // Account for padding (20px each side)

    // Calculate actual grid dimensions (cells + gaps)
    const cellSize = 50;
    const gapSize = 2;
    const gridWidth = gridX * cellSize + (gridX - 1) * gapSize;
    const gridHeight = gridY * cellSize + (gridY - 1) * gapSize;

    // Calculate scale factors to fit both dimensions
    const scaleX = containerWidth / gridWidth;
    const scaleY = containerHeight / gridHeight;

    // Use the smaller scale to ensure grid fits in both dimensions
    // Apply 0.95 factor to leave some padding
    let optimalZoom = Math.min(scaleX, scaleY) * 0.95;

    // Constrain zoom between 0.1 (10%) and 1.0 (100%)
    optimalZoom = Math.max(0.1, Math.min(1.0, optimalZoom));

    return optimalZoom;
  };

  // Auto-zoom when grid size changes
  useEffect(() => {
    if (autoZoom && gridSizeX && gridSizeY) {
      // Small delay to ensure container is rendered
      const timer = setTimeout(() => {
        const optimalZoom = calculateOptimalZoom(gridSizeX, gridSizeY);
        setZoomLevel(optimalZoom);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [gridSizeX, gridSizeY, autoZoom]);

  // Handle container resize
  useEffect(() => {
    if (!gridContainerRef.current || !autoZoom) return;

    const resizeObserver = new ResizeObserver(() => {
      if (autoZoom && gridSizeX && gridSizeY) {
        const optimalZoom = calculateOptimalZoom(gridSizeX, gridSizeY);
        setZoomLevel(optimalZoom);
      }
    });

    resizeObserver.observe(gridContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [gridSizeX, gridSizeY, autoZoom]);

  // Manual zoom controls
  const handleZoomIn = () => {
    setAutoZoom(false);
    setZoomLevel(prev => Math.min(1.0, prev * 1.2));
  };

  const handleZoomOut = () => {
    setAutoZoom(false);
    setZoomLevel(prev => Math.max(0.1, prev / 1.2));
  };

  const handleResetZoom = () => {
    setAutoZoom(true);
    if (gridSizeX && gridSizeY) {
      const optimalZoom = calculateOptimalZoom(gridSizeX, gridSizeY);
      setZoomLevel(optimalZoom);
    }
  };

  // Wheel zoom support
  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    // Allow zoom with scroll wheel (no Ctrl needed)
    e.preventDefault();
    setAutoZoom(false);
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomLevel(prev => {
      const newZoom = prev * delta;
      return Math.max(0.1, Math.min(1.0, newZoom));
    });
  };

  // Pan/Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't start drag if clicking on zoom controls or buildings
    const target = e.target as HTMLElement;
    if (
      target.closest('.zoom-controls') ||
      target.closest('.grid-building') ||
      e.button !== 0 // Only left mouse button
    ) {
      return;
    }

    // Don't allow drag in build mode or move mode (unless clicking empty space)
    if (buildMode || moveMode) {
      // Only allow drag if clicking on empty container space, not grid cells
      if (!target.closest('.grid-cell') && !target.closest('.grid-building')) {
        // Allow drag on empty space even in build/move mode
      } else {
        return; // Don't drag when clicking on grid cells in build/move mode
      }
    }

    if (gridContainerRef.current) {
      hasDraggedRef.current = false;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: gridContainerRef.current.scrollLeft,
        scrollTop: gridContainerRef.current.scrollTop
      };
      // Change cursor to indicate dragging
      gridContainerRef.current.style.cursor = 'grabbing';
    }
  };


  const stopDragging = useCallback(() => {
    if (gridContainerRef.current) {
      gridContainerRef.current.style.cursor = '';
    }
    // Reset drag flag after a short delay to allow click handlers to check it
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 10);
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleMouseUp = () => {
    if (isDragging) {
      stopDragging();
    }
  };

  // Handle mouse leave to stop dragging
  const handleMouseLeave = () => {
    if (isDragging) {
      stopDragging();
    }
  };

  // Global mouse up handler - always active to catch mouse up anywhere
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        stopDragging();
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && dragStartRef.current && gridContainerRef.current) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        // Only start actual dragging if moved more than 3 pixels (prevents accidental drags)
        const dragThreshold = 3;
        if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
          hasDraggedRef.current = true;
          gridContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - deltaX;
          gridContainerRef.current.scrollTop = dragStartRef.current.scrollTop - deltaY;
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDragging, stopDragging]);

  const gridCells = [];

  for (let y = 0; y < gridSizeY; y++) {
    for (let x = 0; x < gridSizeX; x++) {
      // Ghost Logic
      let ghostClass = '';
      if (buildMode && hoveredTile) {
        const size = BUILDING_SIZES[buildMode] || 2;
        // Check if THIS cell is inside the hovered footprint
        if (x >= hoveredTile.x && x < hoveredTile.x + size &&
          y >= hoveredTile.y && y < hoveredTile.y + size) {
          // Check validity of the ROOT hovered tile
          const valid = canPlaceAt(hoveredTile.x, hoveredTile.y, buildMode);
          ghostClass = valid ? 'ghost-valid' : 'ghost-invalid';
        }
      }

      gridCells.push(
        <div
          key={`${x},${y}`}
          className={`grid-cell ${isOccupied(x, y) ? 'occupied' : ''} ${ghostClass}`}
          onClick={() => handleTileClick(x, y)}
          onMouseEnter={() => setHoveredTile({ x, y })}
          onMouseLeave={() => setHoveredTile(null)}
          style={{ gridColumn: x + 1, gridRow: y + 1 }}
        />
      );
    }
  }

  const buildingElements = buildings.map(b => {
    const size = BUILDING_SIZES[b.type] || 2;
    return (
      <div
        key={b.id}
        className={`grid-building ${b.type} ${b.status === 'constructing' || b.status === 'upgrading' ? 'constructing' : ''}`}
        style={{
          gridColumn: `${b.x + 1} / span ${size}`,
          gridRow: `${b.y + 1} / span ${size}`
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleTileClick(b.x, b.y);
        }}
        onMouseEnter={() => {
          // Prevent ghost from rendering underneath if hovering a building?
          // No, we technically want to know we can't place there.
        }}
      >
        <div className="b-name">{BUILDING_LABELS[b.type]}</div>
        <div className="b-level">Lvl {b.level}</div>
        {b.status !== 'active' && <div className="b-status">{timeLeft || '...'}</div>}
      </div>
    );
  });

  return (
    <div className="planet-interior-overlay">
      <div className="planet-interior">
        <div className="planet-header">
          <h2>{planet.name}</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isOwner && (
              <>
                <button
                  className={`recruit-btn ${moveMode ? 'active-mode' : ''}`}
                  style={{ backgroundColor: moveMode ? '#ff9800' : '#555' }}
                  onClick={() => {
                    setMoveMode(!moveMode);
                    setBuildMode(null);
                    setMovingBuildingId(null);
                  }}
                >
                  {moveMode ? (movingBuildingId ? 'Place Building' : 'Select to Move') : 'Move Buildings'}
                </button>
                <button
                  className="recruit-btn"
                  style={{ backgroundColor: '#4a90e2' }}
                  onClick={() => setShowExpansionModal(true)}
                >
                  Expand Colony
                </button>
              </>
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="planet-content">
          {/* Left Sidebar: Structures */}
          <div className="planet-sidebar">
            <div className="subsection-container">
              {Object.entries(BUILDING_CATEGORIES.structures.subsections).map(([subKey, subsection]) => {
                const isExpanded = expandedSubsections.has(subKey);
                return (
                  <div key={subKey} className="subsection">
                    <button
                      className="subsection-header"
                      onClick={() => {
                        const newExpanded = new Set(expandedSubsections);
                        if (isExpanded) {
                          newExpanded.delete(subKey);
                        } else {
                          newExpanded.add(subKey);
                        }
                        setExpandedSubsections(newExpanded);
                      }}
                    >
                      <span className="subsection-title">{subsection.label}</span>
                      <span className="subsection-toggle">{isExpanded ? '−' : '+'}</span>
                    </button>
                    {isExpanded && (
                      <div className="subsection-content">
                        <div className="building-grid">
                          {subsection.buildings.map(type => {
                            const cost = BUILDING_COSTS[type];
                            const canAfford = resources && resources.carbon >= cost.c && resources.titanium >= cost.t;
                            return (
                              <div
                                key={type}
                                className={`building-card ${buildMode === type ? 'active' : ''} ${!canAfford ? 'disabled' : ''}`}
                                onClick={() => canAfford && setBuildMode(buildMode === type ? null : type)}
                                onMouseEnter={(e) => handleMouseEnterBuilding(e, type)}
                                onMouseLeave={() => setHoveredBuildingType(null)}
                              >
                                <div className="building-card-header">
                                  <span className="building-card-name">{BUILDING_LABELS[type]}</span>
                                </div>
                                <div className="building-card-cost">
                                  {cost.c}C {cost.t}Ti
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Area: Grid + Resources */}
          <div className="planet-main-area">
            {/* Resources Bar */}
            <div className="planet-section">
            <div className="resources-list">
              <div className="resource-item">
                <span>Carbon: {resources?.carbon.toFixed(0)}</span>
                <span className="res-rate">+{planetData?.production?.carbon.toFixed(2)}/h</span>
              </div>
              <div className="resource-item">
                <span>Titanium: {resources?.titanium.toFixed(0)}</span>
                <span className="res-rate">+{planetData?.production?.titanium.toFixed(2)}/h</span>
              </div>
                <div className="resource-item">
                  <span>Grid: {gridSizeX} × {gridSizeY}</span>
                  {/* Zoom Controls */}
                  <div className="zoom-controls-compact">
                    <button 
                      className="zoom-btn-small" 
                      onClick={handleZoomOut}
                      title="Zoom Out"
                    >
                      −
                    </button>
                    <span className="zoom-level-small">
                      {Math.round(zoomLevel * 100)}%
                      {autoZoom && <span className="auto-badge-small">AUTO</span>}
                    </span>
                    <button 
                      className="zoom-btn-small" 
                      onClick={handleZoomIn}
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button 
                      className="zoom-btn-small reset-btn-small" 
                      onClick={handleResetZoom}
                      title="Reset to Auto Zoom"
                    >
                      ↻
                    </button>
                  </div>
                </div>

                {isOwner && (
                  <div className="resource-item" style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>Tax Rate: {planetData?.taxRate ?? 10}%</span>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={planetData?.taxRate ?? 10}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                    api.updateTaxRate(planet.id, val).then(() => {
                      setPlanetData(prev => prev ? { ...prev, taxRate: val } : null);
                      onUpdate?.();
                    });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Grid Container */}
            <div 
              ref={gridContainerRef}
              className="planet-grid-container"
              key={`grid-${gridSizeX}-${gridSizeY}`}
              onWheel={handleWheelZoom}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              <div 
                className="planet-grid"
                style={{
                  gridTemplateColumns: `repeat(${gridSizeX}, 50px)`,
                  gridTemplateRows: `repeat(${gridSizeY}, 50px)`,
                  width: `${gridSizeX * 50 + (gridSizeX - 1) * 2}px`,
                  height: `${gridSizeY * 50 + (gridSizeY - 1) * 2}px`,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: '0 0'
                }}
              >
                {gridCells}
                {buildingElements}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Production & Fleet Management */}
          <div className="planet-sidebar">
            <div className="subsection-container">
              {/* Production Section */}
              <div className="subsection">
                <button
                  className="subsection-header"
                  onClick={() => {
                    const newExpanded = new Set(expandedSubsections);
                    if (expandedSubsections.has('workshops')) {
                      newExpanded.delete('workshops');
                    } else {
                      newExpanded.add('workshops');
                    }
                    setExpandedSubsections(newExpanded);
                  }}
                >
                  <span className="subsection-title">Production</span>
                  <span className="subsection-toggle">{expandedSubsections.has('workshops') ? '−' : '+'}</span>
                </button>
                {expandedSubsections.has('workshops') && (
                  <div className="subsection-content">
                    <div className="action-grid">
                      {buildings.some(b => b.type === 'defense_workshop' && b.status === 'active') && (
                        <button 
                          className="action-card"
                          onClick={() => setShowWorkshop('defense_workshop')}
                        >
                          <div className="action-icon">⚙️</div>
                          <div className="action-label">Systems Workshop</div>
                        </button>
                      )}
                      {buildings.some(b => b.type === 'siege_workshop' && b.status === 'active') && (
                        <button 
                          className="action-card"
                          onClick={() => setShowWorkshop('siege_workshop')}
                        >
                          <div className="action-icon">💣</div>
                          <div className="action-label">Munitions Factory</div>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Fleet Management Section */}
              <div className="subsection">
                <button
                  className="subsection-header"
                  onClick={() => {
                    const newExpanded = new Set(expandedSubsections);
                    if (expandedSubsections.has('operations')) {
                      newExpanded.delete('operations');
                    } else {
                      newExpanded.add('operations');
                    }
                    setExpandedSubsections(newExpanded);
                  }}
                >
                  <span className="subsection-title">Fleet Management</span>
                  <span className="subsection-toggle">{expandedSubsections.has('operations') ? '−' : '+'}</span>
                </button>
                {expandedSubsections.has('operations') && (
                  <div className="subsection-content">
                    {showRecruitConsole ? (
                      <div className="recruitment-sidebar-context">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#00f3ff' }}>Recruitment</h4>
                          <button className="close-btn" style={{ fontSize: '18px' }} onClick={() => setShowRecruitConsole(false)}>×</button>
                        </div>
                        <div className="unit-cards-vertical">
                          {Object.entries(UNIT_COSTS).map(([id, u]: any) => (
                            <div
                              key={id}
                              className={`unit-card-mini ${recruitSelection === id ? 'selected' : ''}`}
                              onClick={() => setRecruitSelection(id)}
                            >
                              <div className="unit-info">
                                <span className="unit-label">{u.label}</span>
                                <span className="unit-cost-small">{u.c}C {u.t}Ti</span>
                              </div>
                              <div className="unit-time-small">{u.time}s</div>
                            </div>
                          ))}
                        </div>
                        <div className="recruit-actions-sidebar">
                          <input
                            type="number"
                            className="recruit-input-sidebar"
                            value={recruitCount}
                            onChange={e => setRecruitCount(parseInt(e.target.value))}
                            min="1"
                          />
                          <button className="recruit-btn-action-small" onClick={handleRecruit}>
                            TRAIN
                          </button>
                        </div>
                        {planetData?.recruitmentQueue && planetData.recruitmentQueue.length > 0 && (
                          <div className="recruitment-queue-mini">
                            {planetData.recruitmentQueue.map((q: any, i: number) => {
                              const finish = new Date(q.finishTime).getTime();
                              const diff = Math.max(0, Math.ceil((finish - now.getTime()) / 1000));
                              return (
                                <div key={i} className="queue-item-mini">
                                  <span>{q.count} {q.unit}</span>
                                  <span>{diff > 0 ? `${diff}s` : 'Done'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="action-grid">
                        {buildings.some(b => b.type === 'academy' && b.status === 'active') && (
                          <>
                            <button 
                              className="action-card"
                              onClick={() => setShowRecruitConsole(true)}
                            >
                              <div className="action-icon">👥</div>
                              <div className="action-label">Recruitment Console</div>
                            </button>
                            <button 
                              className="action-card"
                              onClick={() => setShowDefensePanel(true)}
                            >
                              <div className="action-icon">🛡️</div>
                              <div className="action-label">Defensive Strategy</div>
                            </button>
                            <button 
                              className="action-card"
                              onClick={() => setShowAdmiralPanel(true)}
                            >
                              <div className="action-icon">⭐</div>
                              <div className="action-label">Admiral Command</div>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Global Hover Tooltip (Conditional) */}
          {hoveredBuildingType && BUILDING_INFO[hoveredBuildingType] && (
            <div 
              className="building-tooltip-hover"
              style={{
                top: tooltipPos.y,
                left: tooltipPos.x,
                // Adjust if tooltip goes off screen right
                transform: tooltipPos.x + 300 > window.innerWidth ? 'translateX(-100%) translateX(-30px)' : 'none'
              }}
            >
              <h5>{BUILDING_INFO[hoveredBuildingType].name}</h5>
              <div className="tooltip-section">
                <div className="tooltip-description">
                  {BUILDING_INFO[hoveredBuildingType].description}
                </div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">Purpose:</div>
                {BUILDING_INFO[hoveredBuildingType].purpose.map((p, i) => (
                  <div key={i} className="tooltip-row">
                    <span className="tooltip-bullet">•</span>
                    <span className="tooltip-text">{p}</span>
                  </div>
                ))}
              </div>
              {BUILDING_INFO[hoveredBuildingType].unlocks && BUILDING_INFO[hoveredBuildingType].unlocks!.length > 0 && (
                <div className="tooltip-section">
                  <div className="tooltip-label">Unlocks:</div>
                  {BUILDING_INFO[hoveredBuildingType].unlocks!.map((u, i) => (
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
                  <span className="tooltip-value">{BUILDING_INFO[hoveredBuildingType].size}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Cost:</span>
                  <span className="tooltip-value">
                    {BUILDING_COSTS[hoveredBuildingType].c}C {BUILDING_COSTS[hoveredBuildingType].t}Ti
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade Modal */}
          {showUpgradeMenu && (
            <div className="building-modal-overlay" onClick={() => setShowUpgradeMenu(null)}>
              <div className="building-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header-row">
                  <h3>{BUILDING_LABELS[showUpgradeMenu.building.type]} (Lvl {showUpgradeMenu.building.level})</h3>
                  <button className="close-btn" onClick={() => setShowUpgradeMenu(null)}>×</button>
                </div>
                
                <div className="upgrade-stats-comparison">
                  <div className="stat-column">
                    <div className="stat-label">Current Level</div>
                    <div className="stat-value">
                      {showUpgradeMenu.building.stats?.production !== undefined && <div>Production: {showUpgradeMenu.building.stats.production}/h</div>}
                      {showUpgradeMenu.building.stats?.population !== undefined && <div>Population: {showUpgradeMenu.building.stats.population}</div>}
                      {showUpgradeMenu.building.stats?.stability !== undefined && <div>Stability: {showUpgradeMenu.building.stats.stability}</div>}
                      {showUpgradeMenu.building.stats?.storage !== undefined && <div>Storage: {showUpgradeMenu.building.stats.storage.toLocaleString()}</div>}
                    </div>
                  </div>
                  {showUpgradeMenu.building.nextUpgrade && (
                    <div className="stat-column next">
                      <div className="stat-label">Next Level</div>
                      <div className="stat-value">
                        {showUpgradeMenu.building.nextUpgrade.production !== undefined && (
                          <div className="stat-diff">
                            Production: {showUpgradeMenu.building.nextUpgrade.production}/h 
                            <span className="diff-val"> (+{showUpgradeMenu.building.nextUpgrade.production - (showUpgradeMenu.building.stats?.production || 0)})</span>
                          </div>
                        )}
                        {showUpgradeMenu.building.nextUpgrade.population !== undefined && (
                          <div className="stat-diff">
                            Population: {showUpgradeMenu.building.nextUpgrade.population}
                            <span className="diff-val"> (+{showUpgradeMenu.building.nextUpgrade.population - (showUpgradeMenu.building.stats?.population || 0)})</span>
                          </div>
                        )}
                        {showUpgradeMenu.building.nextUpgrade.stability !== undefined && (
                          <div className="stat-diff">
                            Stability: {showUpgradeMenu.building.nextUpgrade.stability}
                            <span className="diff-val"> ({showUpgradeMenu.building.nextUpgrade.stability - (showUpgradeMenu.building.stats?.stability || 0) > 0 ? '+' : ''}{showUpgradeMenu.building.nextUpgrade.stability - (showUpgradeMenu.building.stats?.stability || 0)})</span>
                          </div>
                        )}
                        {showUpgradeMenu.building.nextUpgrade.storage !== undefined && (
                          <div className="stat-diff">
                            Storage: {showUpgradeMenu.building.nextUpgrade.storage.toLocaleString()}
                            <span className="diff-val"> (+{(showUpgradeMenu.building.nextUpgrade.storage - (showUpgradeMenu.building.stats?.storage || 0)).toLocaleString()})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {showUpgradeMenu.building.nextUpgrade ? (
                  <div className="upgrade-actions">
                    <div className="upgrade-cost-row">
                      <div className="cost-item">
                        <span className="cost-label">Carbon:</span>
                        <span className={`cost-val ${resources && resources.carbon < showUpgradeMenu.building.nextUpgrade.cost.carbon ? 'insufficient' : ''}`}>
                          {showUpgradeMenu.building.nextUpgrade.cost.carbon}
                        </span>
                      </div>
                      {showUpgradeMenu.building.nextUpgrade.cost.titanium > 0 && (
                        <div className="cost-item">
                          <span className="cost-label">Titanium:</span>
                          <span className={`cost-val ${resources && resources.titanium < showUpgradeMenu.building.nextUpgrade.cost.titanium ? 'insufficient' : ''}`}>
                            {showUpgradeMenu.building.nextUpgrade.cost.titanium}
                          </span>
                        </div>
                      )}
                      <div className="cost-item">
                        <span className="cost-label">Time:</span>
                        <span className="cost-val">{showUpgradeMenu.building.nextUpgrade.time}s</span>
                      </div>
                    </div>
                    <button 
                      className="upgrade-btn" 
                      disabled={!resources || resources.carbon < showUpgradeMenu.building.nextUpgrade.cost.carbon || resources.titanium < (showUpgradeMenu.building.nextUpgrade.cost.titanium || 0)}
                      onClick={async () => {
                        try {
                          await api.build(planet.id, showUpgradeMenu.building.type, showUpgradeMenu.building.x, showUpgradeMenu.building.y);
                          setShowUpgradeMenu(null);
                          loadPlanetData();
                          onUpdate?.();
                        } catch (e: any) { alert(e.message); }
                      }}
                    >
                      Construct Upgrade (Lvl {showUpgradeMenu.building.level + 1})
                    </button>
                  </div>
                ) : (
                  <div className="max-level">Maximum Level Reached</div>
                )}
              </div>
            </div>
          )}


          {/* Modals */}
          {showDefensePanel && planetData && (
            <DefensePanel planet={planetData} onClose={() => setShowDefensePanel(false)} />
          )}

          {showWorkshop && planetData && (
            <WorkshopPanel
              planet={planetData}
              type={showWorkshop}
              onClose={() => setShowWorkshop(null)}
              onUpdate={loadPlanetData}
            />
          )}

          {showAdmiralPanel && (
            <AdmiralPanel onClose={() => setShowAdmiralPanel(false)} />
          )}

          {showExpansionModal && planetData && (
            <ExpansionModal
              planet={planetData}
              onClose={() => setShowExpansionModal(false)}
              onExpand={loadPlanetData}
            />
          )}

          {showTurretModal && planetData && (
            <DefenseTurretModal
              planet={planetData}
              onClose={() => setShowTurretModal(false)}
              onAdd={loadPlanetData}
            />
          )}
        </div>
      </div>
    </div>
  );
}
