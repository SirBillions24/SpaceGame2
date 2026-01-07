import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './RecruitmentPanel.css';

interface UnitStats {
  id: string;
  name: string;
  description: string;
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
  requiredAcademyLevel: number;
}

// These should ideally come from an API endpoint, but for now we define them here
// to match the server-side constants.
const UNIT_DATA: Record<string, UnitStats> = {
  marine: {
    id: 'marine',
    name: 'Space Marine',
    description: 'Standard multi-purpose infantry unit. Balanced melee and defense.',
    type: 'melee',
    meleeAtk: 12,
    rangedAtk: 0,
    meleeDef: 12,
    rangedDef: 6,
    capacity: 10,
    upkeep: 4,
    cost: { carbon: 0, titanium: 0, credits: 10 },
    time: 20,
    requiredAcademyLevel: 1
  },
  ranger: {
    id: 'ranger',
    name: 'Scout Ranger',
    description: 'Light infantry specializing in long-range engagement.',
    type: 'ranged',
    meleeAtk: 4,
    rangedAtk: 14,
    meleeDef: 4,
    rangedDef: 10,
    capacity: 5,
    upkeep: 3,
    cost: { carbon: 41, titanium: 0 },
    time: 30,
    requiredAcademyLevel: 1
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel Heavy',
    description: 'Heavy armored unit designed to hold ground and absorb fire.',
    type: 'heavy',
    meleeAtk: 6,
    rangedAtk: 2,
    meleeDef: 18,
    rangedDef: 18,
    capacity: 20,
    upkeep: 6,
    cost: { carbon: 200, titanium: 0 },
    time: 40,
    requiredAcademyLevel: 2
  },
  interceptor: {
    id: 'interceptor',
    name: 'Void Interceptor',
    description: 'High-speed attack craft designed for shock tactics.',
    type: 'support',
    meleeAtk: 16,
    rangedAtk: 0,
    meleeDef: 8,
    rangedDef: 8,
    capacity: 15,
    upkeep: 10,
    cost: { carbon: 500, titanium: 250 },
    time: 120,
    requiredAcademyLevel: 3
  }
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

  const academy = planet.buildings.find(b => b.type === 'academy' && b.status === 'active');
  const academyLevel = academy ? academy.level : 0;

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

  return (
    <div className="recruitment-panel">
      <div className="recruitment-panel-header">
        <h3>Recruitment Console</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="recruitment-panel-content">
        <div className="units-selection-area">
          {Object.values(UNIT_DATA).map((unit) => {
            const isLocked = academyLevel < unit.requiredAcademyLevel;
            return (
              <div
                key={unit.id}
                className={`unit-recruitment-card ${selectedUnitId === unit.id ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                onClick={() => !isLocked && setSelectedUnitId(unit.id)}
              >
                <div className="unit-image-container">
                  <img src={`/assets/units/${unit.id}.jpeg`} alt={unit.name} onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = '⚔️';
                  }} />
                </div>
                <div className="unit-main-info">
                  <div className="unit-name-row">
                    <h4>{unit.name}</h4>
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
                    ACADEMY LV.{unit.requiredAcademyLevel}
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
                  <img src={`/assets/units/${selectedUnit.id}.jpeg`} alt={selectedUnit.name} onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = '⚔️';
                  }} />
                </div>
                <h4 style={{ margin: 0 }}>{selectedUnit.name}</h4>
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
                    <strong>{selectedUnit.time * recruitCount}s</strong>
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
            <div className="detail-placeholder">
              Select a unit from the left to view details and begin training.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

