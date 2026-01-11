import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './RecruitmentPanel.css';

interface UnitStats {
  id: string;
  name: string;
  description: string;
  unitFaction: 'human' | 'mech' | 'exo';
  type: string;
  meleeAtk: number;
  rangedAtk: number;
  meleeDef: number;
  rangedDef: number;
  capacity: number;
  upkeep: number;
  cost: {
    carbon: number;
    titanium: number;
    credits?: number;
    darkMatter?: number;
  };
  time: number;
  requiredGarrisonLevel: number;
}

// Unit data matching server-side constants
const UNIT_DATA: Record<string, UnitStats> = {
  // Human Faction
  marine: {
    id: 'marine',
    name: 'Marine',
    description: 'Standard infantry. Balanced melee combat specialist.',
    unitFaction: 'human',
    type: 'melee',
    meleeAtk: 12, rangedAtk: 0, meleeDef: 12, rangedDef: 6,
    capacity: 10, upkeep: 4,
    cost: { carbon: 0, titanium: 0, credits: 10 },
    time: 20, requiredGarrisonLevel: 1,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Precision marksman. High ranged damage, low survivability.',
    unitFaction: 'human',
    type: 'ranged',
    meleeAtk: 2, rangedAtk: 16, meleeDef: 4, rangedDef: 8,
    capacity: 5, upkeep: 5,
    cost: { carbon: 60, titanium: 30 },
    time: 35, requiredGarrisonLevel: 2,
  },
  guardian: {
    id: 'guardian',
    name: 'Guardian',
    description: 'Heavy infantry in powered armor. High defense, low mobility.',
    unitFaction: 'human',
    type: 'heavy',
    meleeAtk: 8, rangedAtk: 4, meleeDef: 20, rangedDef: 16,
    capacity: 15, upkeep: 8,
    cost: { carbon: 200, titanium: 150, credits: 25 },
    time: 60, requiredGarrisonLevel: 4,
  },
  commando: {
    id: 'commando',
    name: 'Commando',
    description: 'Elite special forces. Devastating offensive capability.',
    unitFaction: 'human',
    type: 'elite',
    meleeAtk: 18, rangedAtk: 12, meleeDef: 10, rangedDef: 10,
    capacity: 20, upkeep: 12,
    cost: { carbon: 400, titanium: 300, credits: 100 },
    time: 120, requiredGarrisonLevel: 5,
  },
  // Mech Faction
  drone: {
    id: 'drone',
    name: 'Drone',
    description: 'Basic reconnaissance bot. Cheap and disposable.',
    unitFaction: 'mech',
    type: 'support',
    meleeAtk: 4, rangedAtk: 4, meleeDef: 6, rangedDef: 6,
    capacity: 5, upkeep: 2,
    cost: { carbon: 20, titanium: 40 },
    time: 15, requiredGarrisonLevel: 1,
  },
  automaton: {
    id: 'automaton',
    name: 'Automaton',
    description: 'Combat robot optimized for close-quarters engagement.',
    unitFaction: 'mech',
    type: 'melee',
    meleeAtk: 10, rangedAtk: 2, meleeDef: 10, rangedDef: 6,
    capacity: 8, upkeep: 4,
    cost: { carbon: 50, titanium: 80 },
    time: 30, requiredGarrisonLevel: 2,
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    description: 'Heavy defense platform. Absorbs massive damage.',
    unitFaction: 'mech',
    type: 'heavy',
    meleeAtk: 6, rangedAtk: 2, meleeDef: 22, rangedDef: 22,
    capacity: 12, upkeep: 6,
    cost: { carbon: 150, titanium: 200, credits: 20 },
    time: 50, requiredGarrisonLevel: 3,
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    description: 'High-speed assault craft. Devastating shock attacks.',
    unitFaction: 'mech',
    type: 'elite',
    meleeAtk: 20, rangedAtk: 8, meleeDef: 8, rangedDef: 8,
    capacity: 15, upkeep: 10,
    cost: { carbon: 300, titanium: 450, credits: 50 },
    time: 100, requiredGarrisonLevel: 5,
  },
  // Exo Faction
  stalker: {
    id: 'stalker',
    name: 'Stalker',
    description: 'Fast alien predator. Strikes from the shadows.',
    unitFaction: 'exo',
    type: 'melee',
    meleeAtk: 10, rangedAtk: 0, meleeDef: 6, rangedDef: 4,
    capacity: 6, upkeep: 3,
    cost: { carbon: 30, titanium: 20 },
    time: 20, requiredGarrisonLevel: 1,
  },
  spitter: {
    id: 'spitter',
    name: 'Spitter',
    description: 'Ranged bioform. Projects corrosive acid at distance.',
    unitFaction: 'exo',
    type: 'ranged',
    meleeAtk: 2, rangedAtk: 14, meleeDef: 4, rangedDef: 10,
    capacity: 5, upkeep: 4,
    cost: { carbon: 45, titanium: 35 },
    time: 30, requiredGarrisonLevel: 2,
  },
  brute: {
    id: 'brute',
    name: 'Brute',
    description: 'Massive alien beast. Incredible resilience.',
    unitFaction: 'exo',
    type: 'heavy',
    meleeAtk: 10, rangedAtk: 0, meleeDef: 18, rangedDef: 14,
    capacity: 18, upkeep: 7,
    cost: { carbon: 120, titanium: 100, credits: 15 },
    time: 55, requiredGarrisonLevel: 3,
  },
  ravager: {
    id: 'ravager',
    name: 'Ravager',
    description: 'Apex predator. Unmatched killing efficiency.',
    unitFaction: 'exo',
    type: 'elite',
    meleeAtk: 22, rangedAtk: 6, meleeDef: 12, rangedDef: 10,
    capacity: 25, upkeep: 14,
    cost: { carbon: 350, titanium: 250, credits: 80 },
    time: 110, requiredGarrisonLevel: 5,
  },
};

interface RecruitmentPanelProps {
  planet: Planet;
  onClose: () => void;
  onUpdate: () => void;
}

export default function RecruitmentPanel({ planet, onClose, onUpdate }: RecruitmentPanelProps) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [recruitCount, setRecruitCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const garrison = planet.buildings.find(b => b.type === 'orbital_garrison' && b.status === 'active');
  const garrisonLevel = garrison ? garrison.level : 0;
  const speedBonus = garrisonLevel * 0.05; // 5% per level

  // Ensure recruitment queue is an array (safeguard against string response)
  const recruitmentQueue = Array.isArray(planet.recruitmentQueue)
    ? planet.recruitmentQueue
    : (typeof planet.recruitmentQueue === 'string'
      ? (JSON.parse(planet.recruitmentQueue || '[]'))
      : []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());

      // If there's an active queue and the first item is finished, trigger a refresh
      if (recruitmentQueue && recruitmentQueue.length > 0) {
        const firstItem = recruitmentQueue[0];
        if (firstItem && firstItem.finishTime) {
          const finish = new Date(firstItem.finishTime).getTime();
          if (!isNaN(finish) && finish <= new Date().getTime() + 1000) { // Check slightly ahead for responsiveness
            onUpdate();
          }
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [recruitmentQueue, onUpdate]);

  const handleRecruit = async () => {
    if (!selectedUnitId) return;
    setLoading(true);
    setError(null);
    try {
      await api.recruit(planet.id, selectedUnitId, recruitCount);
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to recruit units');
    } finally {
      setLoading(false);
    }
  };

  const selectedUnit = selectedUnitId ? UNIT_DATA[selectedUnitId] : null;

  const getFactionIcon = (faction: string) => {
    switch (faction) {
      case 'human': return '�';
      case 'mech': return '🤖';
      case 'exo': return '👽';
      default: return '❓';
    }
  };

  const getFactionAdvantage = (faction: string) => {
    switch (faction) {
      case 'human': return 'Mech';
      case 'mech': return 'Exo';
      case 'exo': return 'Human';
      default: return '';
    }
  };

  return (
    <div className="recruitment-panel">
      <div className="recruitment-panel-header">
        <h3>Recruitment Console</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="recruitment-panel-content">
        <div className="units-selection-area">
          <div className="triangle-legend-container" style={{ textAlign: 'center', padding: '15px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(0, 243, 255, 0.2)', marginBottom: '10px' }}>
            <h4 style={{ color: '#00ff88', marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Faction Triangle (+25% Advantage)</h4>
            <div className="triangle-flow" style={{ display: 'flex', justifyContent: 'center', gap: '15px', alignItems: 'center', fontSize: '0.8rem' }}>
              <div className="triangle-node">👤 Human <span style={{ color: '#00ff88' }}>beats</span> 🤖 Mech</div>
              <div className="triangle-node">🤖 Mech <span style={{ color: '#00ff88' }}>beats</span> 👽 Exo</div>
              <div className="triangle-node">👽 Exo <span style={{ color: '#00ff88' }}>beats</span> 👤 Human</div>
            </div>
          </div>

          {Object.values(UNIT_DATA).map((unit) => {
            const isLocked = garrisonLevel < unit.requiredGarrisonLevel;
            return (
              <div
                key={unit.id}
                className={`unit-recruitment-card ${selectedUnitId === unit.id ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                onClick={() => !isLocked && setSelectedUnitId(unit.id)}
              >
                <div className="unit-image-container">
                  <img src={`/assets/units/${unit.id}.png`} alt={unit.name} onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = getFactionIcon(unit.unitFaction);
                  }} />
                </div>
                <div className="unit-main-info">
                  <div className="unit-name-row">
                    <h4>{unit.name}</h4>
                    <span className="unit-class-icon" title={`Faction: ${unit.unitFaction.toUpperCase()} (+25% vs ${getFactionAdvantage(unit.unitFaction)})`}>
                      {getFactionIcon(unit.unitFaction)}
                    </span>
                    <span className="unit-type-tag">{unit.type}</span>
                  </div>
                  <div className="unit-desc-short">{unit.description}</div>
                  <div className="unit-stats-row">
                    <div className="stat-brief">
                      <span className="stat-icon">⚔️</span>
                      <span>{Math.max(unit.meleeAtk, unit.rangedAtk)}</span>
                    </div>
                    <div className="stat-brief">
                      <span className="stat-icon">🛡️</span>
                      <span>{Math.max(unit.meleeDef, unit.rangedDef)}</span>
                    </div>
                    <div className="stat-brief">
                      <span className="stat-icon">📦</span>
                      <span>{unit.capacity}</span>
                    </div>
                  </div>
                  <div className="unit-cost-row-brief" style={{ marginTop: '5px', fontSize: '0.75rem', color: '#ffaa00' }}>
                    {unit.cost.carbon > 0 && <span style={{ marginRight: '8px' }}>{unit.cost.carbon} Carbon</span>}
                    {unit.cost.titanium > 0 && <span style={{ marginRight: '8px' }}>{unit.cost.titanium} Titanium</span>}
                    {unit.cost.credits && unit.cost.credits > 0 && <span>{unit.cost.credits} Credits</span>}
                  </div>
                </div>
                {isLocked && (
                  <div className="locked-badge" style={{ position: 'absolute', top: '5px', right: '5px', background: '#ff4d4d', color: '#fff', fontSize: '0.6rem', padding: '2px 5px', borderRadius: '3px' }}>
                    GARRISON LV.{unit.requiredGarrisonLevel}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="unit-details-area">
          {selectedUnit ? (
            <div className="unit-detail-view">
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px' }}>
                <div className="unit-image-container" style={{ width: '60px', height: '60px' }}>
                  <img src={`/assets/units/${selectedUnit.id}.png`} alt={selectedUnit.name} onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = getFactionIcon(selectedUnit.unitFaction);
                  }} />
                </div>
                <div>
                  <h4 style={{ margin: 0 }}>{selectedUnit.name}</h4>
                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '2px' }}>
                    {getFactionIcon(selectedUnit.unitFaction)} {selectedUnit.unitFaction.toUpperCase()} (+25% vs {getFactionAdvantage(selectedUnit.unitFaction)})
                  </div>
                </div>
              </div>
              <div className="stat-grid-full">
                <div className="full-stat-item">
                  <span className="full-stat-label">Melee Attack</span>
                  <span className="full-stat-value">{selectedUnit.meleeAtk}</span>
                </div>
                <div className="full-stat-item">
                  <span className="full-stat-label">Ranged Attack</span>
                  <span className="full-stat-value">{selectedUnit.rangedAtk}</span>
                </div>
                <div className="full-stat-item">
                  <span className="full-stat-label">Melee Defense</span>
                  <span className="full-stat-value">{selectedUnit.meleeDef}</span>
                </div>
                <div className="full-stat-item">
                  <span className="full-stat-label">Ranged Defense</span>
                  <span className="full-stat-value">{selectedUnit.rangedDef}</span>
                </div>
                <div className="full-stat-item">
                  <span className="full-stat-label">Loot Capacity</span>
                  <span className="full-stat-value">{selectedUnit.capacity}</span>
                </div>
                <div className="full-stat-item">
                  <span className="full-stat-label">Food Upkeep</span>
                  <span className="full-stat-value">{selectedUnit.upkeep}/h</span>
                </div>
              </div>

              <div className="recruitment-controls">
                {error && <div className="error-notification">{error}</div>}

                <div className="cost-row">
                  {selectedUnit.cost.carbon > 0 && (
                    <div className={`cost-item ${planet.resources && planet.resources.carbon < (selectedUnit.cost.carbon * recruitCount) ? 'insufficient' : ''}`}>
                      <span>Carbon:</span>
                      <strong>{selectedUnit.cost.carbon * recruitCount}</strong>
                    </div>
                  )}
                  {selectedUnit.cost.titanium > 0 && (
                    <div className={`cost-item ${planet.resources && planet.resources.titanium < (selectedUnit.cost.titanium * recruitCount) ? 'insufficient' : ''}`}>
                      <span>Titanium:</span>
                      <strong>{selectedUnit.cost.titanium * recruitCount}</strong>
                    </div>
                  )}
                  {selectedUnit.cost.credits && selectedUnit.cost.credits > 0 && (
                    <div className={`cost-item ${planet.resources && planet.resources.credits < (selectedUnit.cost.credits * recruitCount) ? 'insufficient' : ''}`}>
                      <span>Credits:</span>
                      <strong>{selectedUnit.cost.credits * recruitCount}</strong>
                    </div>
                  )}
                  <div className="cost-item">
                    <span>Time:</span>
                    <strong>{Math.ceil((selectedUnit.time / (1 + speedBonus)) * recruitCount)}s</strong>
                    {speedBonus > 0 && <small style={{ color: '#00ff88', marginLeft: '5px' }}>(-{(speedBonus * 100).toFixed(0)}%)</small>}
                  </div>
                </div>

                <div className="input-group-recruit">
                  <input
                    type="number"
                    className="recruit-count-input"
                    value={recruitCount}
                    onChange={(e) => setRecruitCount(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                  />
                  <button
                    className="train-button"
                    disabled={
                      loading ||
                      (selectedUnit.cost.carbon > 0 && planet.resources && planet.resources.carbon < (selectedUnit.cost.carbon * recruitCount)) ||
                      (selectedUnit.cost.titanium > 0 && planet.resources && planet.resources.titanium < (selectedUnit.cost.titanium * recruitCount)) ||
                      (selectedUnit.cost.credits && selectedUnit.cost.credits > 0 && planet.resources && planet.resources.credits < (selectedUnit.cost.credits * recruitCount))
                    }
                    onClick={handleRecruit}
                  >
                    {loading ? 'Recruiting...' : 'Train Units'}
                  </button>
                </div>
              </div>

              {recruitmentQueue && recruitmentQueue.length > 0 && (
                <div className="recruitment-queue-area">
                  <div className="queue-title">Active Queue</div>
                  <div className="queue-list-modern">
                    {recruitmentQueue.map((q: any, i: number) => {
                      if (!q || !q.finishTime) return null;
                      const finish = new Date(q.finishTime).getTime();
                      if (isNaN(finish)) return null;

                      const diff = Math.max(0, Math.ceil((finish - now.getTime()) / 1000));
                      return (
                        <div key={`${q.unit}-${i}`} className="queue-item-modern">
                          <span>{q.count}x {UNIT_DATA[q.unit]?.name || q.unit}</span>
                          <span className="queue-timer">{diff > 0 ? `${diff}s` : 'Processing...'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="detail-placeholder" style={{ flexDirection: 'column', gap: '15px' }}>
              <div style={{ fontSize: '3rem', opacity: 0.2 }}>⚔️</div>
              <div style={{ color: '#666' }}>
                Select a unit from the left to view details and begin training.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

