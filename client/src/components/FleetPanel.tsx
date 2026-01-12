import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './FleetPanel.css';
import AttackPlanner from './AttackPlanner';

interface FleetPanelProps {
  fromPlanet: Planet | null;
  toPlanet: Planet | null;
  onClose: () => void;
  onFleetCreated: () => void;
}

// type Lane = 'front' | 'left' | 'right'; // Not used in this component

export default function FleetPanel({ fromPlanet, toPlanet, onClose, onFleetCreated }: FleetPanelProps) {
  // Mode
  const [fleetType, setFleetType] = useState<'attack' | 'support' | 'scout'>('attack');

  // Data
  const [currentFromPlanet, setCurrentFromPlanet] = useState<Planet | null>(fromPlanet);
  const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});

  // State for flat fleet (Support/Scout)
  const [flatUnits, setFlatUnits] = useState<Record<string, number>>({});

  // Admiral selection
  const [admiral, setAdmiral] = useState<{ id: string; name: string; attackBonus: number; defenseBonus: number } | null>(null);
  const [loadingAdmiral, setLoadingAdmiral] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attack Planner Toggle - Not needed, AttackPlanner is rendered directly

  useEffect(() => {
    if (fromPlanet) {
      setCurrentFromPlanet(fromPlanet); // Reset to prop first
      loadPlanetUnits();
      loadAdmiral();
    }
  }, [fromPlanet]);

  const loadPlanetUnits = async () => {
    if (!fromPlanet) return;
    try {
      const planet = await api.getPlanet(fromPlanet.id);
      setCurrentFromPlanet(planet); // Update with fresh data (including tools)
      setAvailableUnits(planet.units || {});
      // Init flat units
      const initial: Record<string, number> = {};
      Object.keys(planet.units || {}).forEach(u => initial[u] = 0);
      setFlatUnits(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load units');
    }
  };

  const loadAdmiral = async () => {
    try {
      setLoadingAdmiral(true);
      const admiralData = await api.getAdmiral();
      setAdmiral(admiralData);
    } catch (err) {
      // Admiral might not exist yet, that's okay
      setAdmiral(null);
    } finally {
      setLoadingAdmiral(false);
    }
  };

  const handleFlatChange = (unitType: string, val: number) => {
    const available = availableUnits[unitType] || 0;
    if (val >= 0 && val <= available) {
      setFlatUnits(prev => ({ ...prev, [unitType]: val }));
    }
  };

  const handleFlatDispatch = async () => {
    if (!currentFromPlanet || !toPlanet) return;
    setLoading(true);
    try {
      const total = Object.values(flatUnits).reduce((a, b) => a + b, 0);
      if (total === 0) throw new Error("Must select at least one unit");

      await api.createFleet(currentFromPlanet.id, toPlanet.id, fleetType, flatUnits, undefined, admiral?.id);
      onFleetCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleAttackCommit = async (
    finalUnits: Record<string, number>,
    laneAssignments: any,
    admiralId?: string,
    resourceTransfer?: { carbon?: number; titanium?: number; food?: number }
  ) => {
    if (!currentFromPlanet || !toPlanet) return;
    setLoading(true);
    try {
      // We only use the `laneAssignments` JSON for the complex attack logic
      // But `finalUnits` is needed for aggregation in DB (if needed) or simple checks
      await api.createFleet(currentFromPlanet.id, toPlanet.id, 'attack', finalUnits, laneAssignments, admiralId, resourceTransfer);
      onFleetCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!currentFromPlanet || !toPlanet) return null;

  // If Attack Mode is selected, we render the AttackPlanner instead of the simple panel!
  // Or we show a "Open Tactical Map" button?
  // Let's toggle immediately if 'attack' is selected.

  if (fleetType === 'attack') {
    return (
      <AttackPlanner
        fromPlanet={currentFromPlanet}
        toPlanet={toPlanet}
        availableUnits={availableUnits}
        onCommit={handleAttackCommit}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fleet-panel">
      <div className="fleet-panel-header">
        <h3>Dispatch Fleet</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="fleet-panel-content">
        <div className="fleet-info">
          <div className="route-display">
            <span className="planet-name">{currentFromPlanet?.name || fromPlanet?.name || 'Unknown'}</span>
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

        {/* Admiral Selection - Note: Attack uses AttackPlanner which has its own dropdown */}
        {fleetType === 'support' && (
          <div className="admiral-selector">
            <label>Admiral Assignment (Optional):</label>
            {loadingAdmiral ? (
              <div>Loading admiral...</div>
            ) : admiral ? (
              <div className="admiral-info">
                <span className="admiral-name">{admiral.name}</span>
                <span className="admiral-bonuses">
                  {admiral.attackBonus > 0 && `+${admiral.attackBonus}% Attack`}
                  {admiral.attackBonus > 0 && admiral.defenseBonus > 0 && ' • '}
                  {admiral.defenseBonus > 0 && `+${admiral.defenseBonus}% Defense`}
                </span>
                <button
                  className="remove-admiral-btn"
                  onClick={() => setAdmiral(null)}
                  title="Remove admiral from fleet"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="no-admiral">
                <span>No admiral assigned</span>
                <button
                  className="assign-admiral-btn"
                  onClick={loadAdmiral}
                  disabled={loadingAdmiral}
                >
                  Assign Admiral
                </button>
              </div>
            )}
          </div>
        )}

        {/* Support/Scout View */}
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

        <div className="fleet-footer">
          {error && <div className="error">{error}</div>}
          <button className="dispatch-btn" onClick={handleFlatDispatch} disabled={loading}>
            {loading ? 'Engaging...' : 'DISPATCH'}
          </button>
        </div>
      </div>
    </div>
  );
}
