import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './DefenseTurretModal.css';

interface DefenseTurretModalProps {
  planet: Planet;
  onClose: () => void;
  onAdd: () => void;
}

const MAX_TURRETS = 20;
const TURRET_LEVELS = [
  { level: 1, capacity: 10, baseCarbon: 500, baseTitanium: 250 },
  { level: 2, capacity: 20, baseCarbon: 1000, baseTitanium: 500 },
  { level: 3, capacity: 30, baseCarbon: 1500, baseTitanium: 750 },
  { level: 4, capacity: 40, baseCarbon: 2000, baseTitanium: 1000 }
];

export default function DefenseTurretModal({ planet, onClose, onAdd }: DefenseTurretModalProps) {
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Parse current turrets
  const currentTurrets = planet.defenseTurretsJson 
    ? (() => {
        try {
          return JSON.parse(planet.defenseTurretsJson);
        } catch {
          return [];
        }
      })()
    : [];

  const turretCount = currentTurrets.length;
  
  // Parse construction queue (handle both array and string)
  const turretQueue = (() => {
    if (!planet.turretConstructionQueue) return [];
    if (Array.isArray(planet.turretConstructionQueue)) return planet.turretConstructionQueue;
    try {
      return JSON.parse(planet.turretConstructionQueue as any);
    } catch {
      return [];
    }
  })();
  
  // Check if can add (including queued turrets)
  const totalTurrets = turretCount + turretQueue.length;
  const canAddWithQueue = totalTurrets < MAX_TURRETS;

  // Calculate total capacity
  const totalCapacity = currentTurrets.reduce((sum: number, t: any) => {
    const level = t.level || 1;
    const capacity = TURRET_LEVELS.find(l => l.level === level)?.capacity || 0;
    return sum + capacity;
  }, 0);

  // Calculate cost for selected level
  const calculateCost = (level: number) => {
    const turretData = TURRET_LEVELS.find(l => l.level === level);
    if (!turretData) return { carbon: 0, titanium: 0 };

    const multiplier = 1 + (turretCount * 0.1); // 10% more per existing turret
    return {
      carbon: Math.floor(turretData.baseCarbon * multiplier),
      titanium: Math.floor(turretData.baseTitanium * multiplier)
    };
  };

  const selectedCost = calculateCost(selectedLevel);
  const newCapacity = totalCapacity + (TURRET_LEVELS.find(l => l.level === selectedLevel)?.capacity || 0);

  const handleAdd = async () => {
    if (!canAddWithQueue) return;

    setLoading(true);
    setError(null);

    try {
      await api.addDefenseTurret(planet.id, selectedLevel);
      onAdd();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to add defense turret');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content turret-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Defense Turret</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
            <div className="turret-info">
              <div className="info-row">
                <strong>Current Turrets:</strong> {turretCount} / {MAX_TURRETS}
                {turretQueue.length > 0 && (
                  <span style={{ color: '#ffaa00', marginLeft: '10px' }}>
                    ({turretQueue.length} in queue)
                  </span>
                )}
              </div>
            <div className="info-row">
              <strong>Current Capacity:</strong> {totalCapacity} troops (shared across all lanes)
            </div>
            {!canAddWithQueue && (
              <div className="warning-message">
                Maximum turrets reached ({MAX_TURRETS})
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          {canAddWithQueue && (
            <>
              <div className="level-selection">
                <h3>Select Turret Level</h3>
                <div className="level-options">
                  {TURRET_LEVELS.map(turret => (
                    <div
                      key={turret.level}
                      className={`level-option ${selectedLevel === turret.level ? 'selected' : ''}`}
                      onClick={() => setSelectedLevel(turret.level)}
                    >
                      <div className="level-header">
                        <span className="level-badge">Level {turret.level}</span>
                        <span className="capacity-badge">+{turret.capacity} capacity</span>
                      </div>
                      <div className="level-cost">
                        Base: {turret.baseCarbon.toLocaleString()} Carbon, {turret.baseTitanium.toLocaleString()} Titanium
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cost-preview">
                <div className="cost-item">
                  <span>Cost:</span>
                  <span className="cost-value">{selectedCost.carbon.toLocaleString()} Carbon</span>
                </div>
                <div className="cost-item">
                  <span>Cost:</span>
                  <span className="cost-value">{selectedCost.titanium.toLocaleString()} Titanium</span>
                </div>
                <div className="capacity-preview">
                  <span>New Total Capacity:</span>
                  <span className="capacity-value">{newCapacity} troops (shared across all lanes)</span>
                </div>
              </div>
            </>
          )}

          {/* Construction Queue */}
          {turretQueue.length > 0 && (
            <div className="turret-queue">
              <h3>Construction Queue</h3>
              {turretQueue.map((item: any, i: number) => {
                const finish = new Date(item.finishTime).getTime();
                const nowMs = now.getTime();
                const diff = Math.max(0, Math.ceil((finish - nowMs) / 1000));
                const mins = Math.floor(diff / 60);
                const secs = diff % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                const isDone = diff <= 0;

                return (
                  <div key={i} className="queue-item">
                    <span>Level {item.level} Turret</span>
                    <span className={isDone ? 'done' : 'processing'}>
                      {isDone ? 'Complete' : timeStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          {canAddWithQueue && (
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Turret'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

