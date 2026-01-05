import { useState, useEffect } from 'react';
import { api, type Planet, getCurrentUser } from '../lib/api';
import DefensePanel from './DefensePanel';
import WorkshopPanel from './WorkshopPanel';
import './PlanetInterior.css';

interface PlanetInteriorProps {
  planet: Planet;
  onClose: () => void;
}

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
  'shield_generator': 2
};

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
  'shield_generator': 'Defensive Grid'
};

const BUILDING_COSTS: Record<string, { c: number, t: number }> = {
  'colony_hub': { c: 0, t: 0 },
  'carbon_processor': { c: 100, t: 100 },
  'titanium_extractor': { c: 100, t: 100 },
  'hydroponics': { c: 100, t: 100 },
  'academy': { c: 500, t: 500 },
  'tavern': { c: 300, t: 200 },
  'defense_workshop': { c: 400, t: 300 },
  'siege_workshop': { c: 400, t: 300 },
  'monument': { c: 500, t: 0 },
  'housing_unit': { c: 150, t: 0 },
  'shield_generator': { c: 500, t: 1000 }
};

const UNIT_COSTS: any = {
  marine: { c: 20, t: 0, time: 20, label: 'Marine' },
  ranger: { c: 30, t: 10, time: 30, label: 'Ranger' },
  sentinel: { c: 10, t: 40, time: 40, label: 'Sentinel' }
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
    // Bounds
    if (x + size > 10 || y + size > 10) return false;
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

    // Move Mode Logic
    if (moveMode) {
      if (movingBuildingId) {
        // Attempt place
        try {
          // Check validity first (client-side)
          // We need to know which building type it is to check sizing
          const movingB = buildings.find(b => b.id === movingBuildingId);
          if (movingB) {
            // Temporarily remove moving building from occupied map for check?
            // "canPlaceAt" checks occupiedMap.
            // We should check collision excluding self.
            // Simplified: just try call API, let server valid.
            // Or precise check:
            const size = BUILDING_SIZES[movingB.type] || 2;
            // Validate bounds
            if (x + size > 10 || y + size > 10) return;

            // Check Collision ignoring self
            if (!canPlaceAt(x, y, movingB.type, movingB.id)) return;

            await api.moveBuilding(planet.id, movingBuildingId, x, y);
            setMovingBuildingId(null);
            setMoveMode(false); // Auto-exit move mode after placement? Or stay? User might want to move multiple.
            // User said "if I click back on the building it cancels". 
            // Current logic: "if movingBuildingId ... else setMovingBuildingId".
            // If I click same building, I am in "else" block? No, I am in "movingBuildingId" block if it's set.
            // Wait. If I click (x,y) and building is there. "canPlaceAt" usually handles.
            // Issue is my "canPlaceAt" logic above.
            // Also, if I click the *same* spot, I am placing it where it is. That's a no-op move.

            loadPlanetData();
          }
        } catch (e: any) { alert(e.message); }
      } else {
        // Select building to move
        const building = buildings.find(b => {
          const size = BUILDING_SIZES[b.type] || 2;
          return x >= b.x && x < b.x + size && y >= b.y && y < b.y + size;
        });

        // If we clicked a building, pick it up.
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

  // Render Grid
  const gridSize = 10;
  const gridCells = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
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
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="planet-content">
          {/* Resources */}
          <div className="planet-section">
            <div className="resources-list">
              <div className="resource-item">
                <span>Carbon: {resources?.carbon.toFixed(0)}</span>
                <span className="res-rate">+{planetData?.production?.carbon}/h</span>
              </div>
              <div className="resource-item">
                <span>Titanium: {resources?.titanium.toFixed(0)}</span>
                <span className="res-rate">+{planetData?.production?.titanium}/h</span>
              </div>

              {isOwner && (
                <div className="resource-item" style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>Tax Rate: {planetData?.taxRate ?? 10}%</span>
                  <input
                    type="range"
                    min="0"
                    type="range"
                    min="0"
                    max="50"
                    value={planetData?.taxRate ?? 10}
                    onChange={(e) => {
                      // Optimistic update + debounce could be good, but simple direct for now
                      const val = parseInt(e.target.value);
                      // We need local update or debounce. Or just onMouseUp?
                      // Let's use onMouseUp or just live update with simple api call (rate limit risk if spammed)
                      // Better: Update state local, then effect or onBlur.
                      // Implementing simple "Set" button or direct change
                      api.updateTaxRate(planet.id, val).then(() => {
                        setPlanetData(prev => prev ? { ...prev, taxRate: val } : null);
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="planet-grid-container">
            <div className="planet-grid">
              {gridCells}
              {buildingElements}
            </div>
          </div>

          {/* Build Dock */}
          {isOwner && (
            <div className="build-dock">
              {['carbon_processor', 'titanium_extractor', 'hydroponics', 'housing_unit', 'academy', 'tavern', 'defense_workshop', 'siege_workshop', 'monument', 'shield_generator'].map(type => {
                const cost = BUILDING_COSTS[type];
                const canAfford = resources && resources.carbon >= cost.c && resources.titanium >= cost.t;
                return (
                  <div
                    key={type}
                    className={`build-dock-item ${buildMode === type ? 'active' : ''}`}
                    onClick={() => canAfford && setBuildMode(buildMode === type ? null : type)}
                    style={{ opacity: canAfford ? 1 : 0.5 }}
                  >
                    <span>{BUILDING_LABELS[type]}</span>
                    <span>{cost.c}C {cost.t}Ti</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upgrade Modal */}
          {showUpgradeMenu && (
            <div className="building-modal-overlay" onClick={() => setShowUpgradeMenu(null)}>
              <div className="building-modal" onClick={e => e.stopPropagation()}>
                <h3>{BUILDING_LABELS[showUpgradeMenu.building.type]} (Lvl {showUpgradeMenu.building.level})</h3>
                <button className="upgrade-btn" onClick={async () => {
                  try {
                    await api.build(planet.id, showUpgradeMenu.building.type, showUpgradeMenu.building.x, showUpgradeMenu.building.y);
                    setShowUpgradeMenu(null);
                    loadPlanetData();
                  } catch (e: any) { alert(e.message); }
                }}>
                  Upgrade ({(100 * Math.pow(1.5, showUpgradeMenu.building.level)).toFixed(0)} Res)
                </button>
              </div>
            </div>
          )}

          {/* Recruitment & Defense */}
          <div className="planet-section">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
              <h3>Military Operations</h3>
              {buildings.some(b => b.type === 'academy' && b.status === 'active') && (
                <>
                  <button className="recruit-btn" onClick={() => setShowRecruitConsole(!showRecruitConsole)}>
                    {showRecruitConsole ? 'Close Console' : 'Open Recruitment Console'}
                  </button>
                  <button className="recruit-btn" style={{ background: '#1976d2' }} onClick={() => setShowDefensePanel(true)}>
                    Defensive Strategy
                  </button>
                </>
              )}
              {buildings.some(b => b.type === 'defense_workshop' && b.status === 'active') && (
                <button className="recruit-btn" style={{ background: '#00bcd4' }} onClick={() => setShowWorkshop('defense_workshop')}>
                  Systems Workshop
                </button>
              )}
              {buildings.some(b => b.type === 'siege_workshop' && b.status === 'active') && (
                <button className="recruit-btn" style={{ background: '#f44336' }} onClick={() => setShowWorkshop('siege_workshop')}>
                  Munitions Factory
                </button>
              )}
            </div>

            {showRecruitConsole && (
              <div className="recruitment-console">
                <div className="unit-cards">
                  {Object.entries(UNIT_COSTS).map(([id, u]: any) => (
                    <div
                      key={id}
                      className={`unit-card ${recruitSelection === id ? 'selected' : ''}`}
                      onClick={() => setRecruitSelection(id)}
                    >
                      <h4>{u.label}</h4>
                      <div className="unit-cost">{u.c}C {u.t}Ti</div>
                      <div>{u.time}s</div>
                    </div>
                  ))}
                </div>
                <div className="recruit-actions">
                  <input
                    type="number"
                    className="recruit-input"
                    value={recruitCount}
                    onChange={e => setRecruitCount(parseInt(e.target.value))}
                    min="1"
                  />
                  <button className="recruit-btn-action" onClick={handleRecruit}>
                    TRAIN UNITS
                  </button>
                </div>
                {planetData?.recruitmentQueue && planetData.recruitmentQueue.length > 0 && (
                  <div className="recruitment-queue">
                    {planetData.recruitmentQueue.map((q: any, i: number) => {
                      const finish = new Date(q.finishTime).getTime();
                      const nowMs = now.getTime();
                      const diff = Math.max(0, Math.ceil((finish - nowMs) / 1000));

                      // Format MM:SS
                      const mins = Math.floor(diff / 60);
                      const secs = diff % 60;
                      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                      return (
                        <div key={i} className="queue-item">
                          <span>{q.count} {q.unit}</span>
                          <span style={{ color: diff < 5 ? '#4caf50' : '#ff9800' }}>
                            {diff > 0 ? timeStr : 'Training Complete...'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

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

        </div>
      </div>
    </div>
  );
}
