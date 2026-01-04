import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './FleetPanel.css';

interface FleetPanelProps {
  fromPlanet: Planet | null;
  toPlanet: Planet | null;
  onClose: () => void;
  onFleetCreated: () => void;
}

type Lane = 'front' | 'left' | 'right';
type UnitType = 'marine' | 'ranger' | 'sentinel' | 'interceptor'; // Added interceptor 

export default function FleetPanel({ fromPlanet, toPlanet, onClose, onFleetCreated }: FleetPanelProps) {
  // Mode
  const [fleetType, setFleetType] = useState<'attack' | 'support' | 'scout'>('attack');

  // Data
  const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});

  // State for flat fleet (Support/Scout)
  const [flatUnits, setFlatUnits] = useState<Record<string, number>>({});

  // State for Attack (Lanes)
  const [laneUnits, setLaneUnits] = useState<Record<Lane, Record<string, number>>>({
    front: { marine: 0, ranger: 0, sentinel: 0, interceptor: 0 },
    left: { marine: 0, ranger: 0, sentinel: 0, interceptor: 0 },
    right: { marine: 0, ranger: 0, sentinel: 0, interceptor: 0 },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fromPlanet) {
      loadPlanetUnits();
    }
  }, [fromPlanet]);

  const loadPlanetUnits = async () => {
    if (!fromPlanet) return;
    try {
      const planet = await api.getPlanet(fromPlanet.id);
      setAvailableUnits(planet.units || {});
      // Init flat units
      const initial: Record<string, number> = {};
      Object.keys(planet.units || {}).forEach(u => initial[u] = 0);
      setFlatUnits(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load units');
    }
  };

  // Helper to calculate total used of a specific type across all lanes OR flat list
  const getUsedCount = (unitType: string): number => {
    if (fleetType !== 'attack') {
      return flatUnits[unitType] || 0;
    }
    return (laneUnits.front[unitType] || 0) +
      (laneUnits.left[unitType] || 0) +
      (laneUnits.right[unitType] || 0);
  };

  const handleLaneChange = (lane: Lane, unitType: string, val: number) => {
    const currentUsed = getUsedCount(unitType);
    const currentLaneVal = laneUnits[lane][unitType] || 0;
    const available = availableUnits[unitType] || 0;

    // We can increase if currentUsed < available
    // or if we are decreasing
    const diff = val - currentLaneVal;

    if (currentUsed + diff <= available && val >= 0) {
      setLaneUnits(prev => ({
        ...prev,
        [lane]: { ...prev[lane], [unitType]: val }
      }));
    }
  };

  const handleFlatChange = (unitType: string, val: number) => {
    const available = availableUnits[unitType] || 0;
    if (val >= 0 && val <= available) {
      setFlatUnits(prev => ({ ...prev, [unitType]: val }));
    }
  };

  const handleCreateFleet = async () => {
    if (!fromPlanet || !toPlanet) return;

    setLoading(true);
    setError(null);

    try {
      let finalUnits: Record<string, number> = {};
      let laneAssignments = undefined;

      if (fleetType === 'attack') {
        // Aggregate units for the main payload
        ['marine', 'ranger', 'sentinel', 'interceptor'].forEach(u => {
          finalUnits[u] = getUsedCount(u);
        });
        laneAssignments = laneUnits;
      } else {
        finalUnits = flatUnits;
      }

      // Validate > 0
      const total = Object.values(finalUnits).reduce((a, b) => a + b, 0);
      if (total === 0) throw new Error("Must select at least one unit");

      await api.createFleet(fromPlanet.id, toPlanet.id, fleetType, finalUnits, laneAssignments);
      onFleetCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!fromPlanet || !toPlanet) return null;

  const UNIT_TYPES = ['marine', 'ranger', 'sentinel', 'interceptor'];

  return (
    <div className="fleet-panel">
      <div className="fleet-panel-header">
        <h3>Dispatch Fleet</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="fleet-panel-content">
        <div className="fleet-info">
          <div className="route-display">
            <span className="planet-name">{fromPlanet.name}</span>
            <span className="arrow">➔</span>
            <span className="planet-name">{toPlanet.name}</span>
          </div>
          {toPlanet.isNpc && <span className="npc-badge">NPC (Lvl {toPlanet.npcLevel})</span>}
        </div>

        <div className="fleet-type-selector">
          {['attack', 'support', 'scout'].map(t => (
            <button key={t} className={fleetType === t ? 'active' : ''} onClick={() => setFleetType(t as any)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {fleetType === 'attack' ? (
          <div className="lane-configurator">
            <div className="lanes-container">
              {/* Left Lane */}
              <div className="lane-column">
                <h4>Left Flank</h4>
                {UNIT_TYPES.map(u => (
                  <div key={u} className="lane-input-row">
                    <label>{u[0].toUpperCase() + u.slice(1)}</label>
                    <input
                      type="number"
                      value={laneUnits.left[u] || 0}
                      onChange={e => handleLaneChange('left', u, parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>

              {/* Front Lane */}
              <div className="lane-column center">
                <h4>Front Lane</h4>
                {UNIT_TYPES.map(u => (
                  <div key={u} className="lane-input-row">
                    <label>{u[0].toUpperCase() + u.slice(1)}</label>
                    <input
                      type="number"
                      value={laneUnits.front[u] || 0}
                      onChange={e => handleLaneChange('front', u, parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>

              {/* Right Lane */}
              <div className="lane-column">
                <h4>Right Flank</h4>
                {UNIT_TYPES.map(u => (
                  <div key={u} className="lane-input-row">
                    <label>{u[0].toUpperCase() + u.slice(1)}</label>
                    <input
                      type="number"
                      value={laneUnits.right[u] || 0}
                      onChange={e => handleLaneChange('right', u, parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flat-selector">
            {Object.entries(availableUnits).map(([u, count]) => (
              <div key={u} className="unit-row">
                <span>{u}</span>
                <span>Max: {count}</span>
                <input
                  type="number"
                  value={flatUnits[u] || 0}
                  onChange={e => handleFlatChange(u, parseInt(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="fleet-footer">
          <div className="unit-summary">
            {UNIT_TYPES.map(u => {
              const used = getUsedCount(u);
              const avail = availableUnits[u] || 0;
              return (
                <div key={u} style={{ color: used > avail ? 'red' : '#aaa' }}>
                  {u}: {used} / {avail}
                </div>
              )
            })}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="dispatch-btn" onClick={handleCreateFleet} disabled={loading}>
            {loading ? 'Engaging Hyperdrive...' : 'LAUNCH FLEET'}
          </button>
        </div>
      </div>
    </div>
  );
}
