import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import './AlienInvasionPanel.css';

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
  currentHp?: number;
  maxHp?: number;
}

interface EventScore {
  xenoCores: number;
  shipsDefeated: number;
  damageDealt: number;
}

interface EventHeat {
  currentHeat: number;
  retaliationChance: number;
}

interface ActiveEvent {
  id: string;
  name: string;
  type: string;
  status: 'scheduled' | 'active' | 'retaliation' | 'ended';
  startTime: string;
  endTime: string;
  retaliationTime: string;
  globalState: {
    mothershipCurrentHp: number;
    mothershipMaxHp: number;
    mothershipDefeated: boolean;
    totalShipsDefeated: number;
    currentDay: number;
  };
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  xenoCores: number;
  shipsDefeated: number;
}

interface AlienInvasionPanelProps {
  onClose: () => void;
  onShipClick?: (ship: EventShip) => void;
  onTeleportToPortal?: (x: number, y: number) => void;
}

export default function AlienInvasionPanel({ onClose, onShipClick, onTeleportToPortal }: AlienInvasionPanelProps) {
  const [event, setEvent] = useState<ActiveEvent | null>(null);
  const [ships, setShips] = useState<EventShip[]>([]);
  const [score, setScore] = useState<EventScore | null>(null);
  const [heat, setHeat] = useState<EventHeat | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'ships' | 'leaderboard'>('overview');
  const [timeRemaining, setTimeRemaining] = useState('');
  const [portalLocation, setPortalLocation] = useState<{ x: number; y: number } | null>(null);

  const fetchEventData = useCallback(async () => {
    try {
      const result = await api.getActiveEvent();
      if (!result.event) {
        setEvent(null);
        setLoading(false);
        return;
      }
      
      setEvent(result.event);
      
      // Fetch additional data
      const [shipsData, progressData, lbData, portalData] = await Promise.all([
        api.getEventShips(result.event.id),
        api.getEventProgress(result.event.id),
        api.getEventLeaderboard(result.event.id, 20),
        api.getEventPortal(result.event.id).catch(() => ({ portal: null })),
      ]);
      
      setShips(shipsData.ships || []);
      setScore(progressData.score);
      setHeat(progressData.heat);
      setRank(progressData.rank);
      setLeaderboard(lbData.leaderboard || []);
      setPortalLocation(portalData.portal);
    } catch (err) {
      console.error('Failed to fetch event data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEventData();
    const interval = setInterval(fetchEventData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchEventData]);

  // Countdown timer
  useEffect(() => {
    if (!event) return;
    
    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(event.endTime).getTime();
      const remaining = Math.max(0, end - now);
      
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [event]);

  const getShipTypeIcon = (type: string) => {
    switch (type) {
      case 'scout': return '🛸';
      case 'raider': return '👾';
      case 'carrier': return '🚀';
      case 'dreadnought': return '💀';
      case 'mothership': return '🌌';
      default: return '❓';
    }
  };

  const getHeatColor = (heat: number) => {
    if (heat < 100) return '#4caf50';
    if (heat < 500) return '#ff9800';
    if (heat < 1000) return '#f44336';
    return '#9c27b0';
  };

  if (loading) {
    return (
      <div className="alien-panel-overlay" onClick={onClose}>
        <div className="alien-panel" onClick={e => e.stopPropagation()}>
          <div className="alien-loading">
            <div className="alien-spinner"></div>
            <p>Scanning for alien activity...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="alien-panel-overlay" onClick={onClose}>
        <div className="alien-panel alien-panel-inactive" onClick={e => e.stopPropagation()}>
          <div className="alien-header">
            <h2>🛸 Alien Invasion</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="alien-inactive-content">
            <div className="alien-inactive-icon">🌌</div>
            <h3>No Active Invasion</h3>
            <p>The galaxy is quiet... for now.</p>
            <p className="alien-hint">Check back later for the next event!</p>
          </div>
        </div>
      </div>
    );
  }

  const mothershipHpPercent = event.globalState.mothershipMaxHp > 0 
    ? (event.globalState.mothershipCurrentHp / event.globalState.mothershipMaxHp) * 100 
    : 0;

  const availableShips = ships.filter(s => !s.isDefeated);
  const portalShips = availableShips.filter(s => s.zoneType === 'portal');
  const ringShips = availableShips.filter(s => s.zoneType === 'player_ring');

  return (
    <div className="alien-panel-overlay" onClick={onClose}>
      <div className="alien-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="alien-header">
          <div className="alien-title">
            <span className="alien-icon">👾</span>
            <div>
              <h2>{event.name}</h2>
              <span className={`event-status status-${event.status}`}>{event.status.toUpperCase()}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Timer Bar */}
        <div className="alien-timer-bar">
          <div className="timer-left">
            <div className="timer-label">Event Ends In:</div>
            <div className="timer-value">{timeRemaining}</div>
          </div>
          <div className="timer-day">Day {event.globalState.currentDay}</div>
          {portalLocation && onTeleportToPortal && (
            <button 
              className="teleport-btn"
              onClick={() => {
                onTeleportToPortal(portalLocation.x, portalLocation.y);
                onClose();
              }}
            >
              🌀 Go to Portal
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="alien-tabs">
          <button 
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab ${activeTab === 'ships' ? 'active' : ''}`}
            onClick={() => setActiveTab('ships')}
          >
            Ships ({availableShips.length})
          </button>
          <button 
            className={`tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </button>
        </div>

        {/* Tab Content */}
        <div className="alien-content">
          {activeTab === 'overview' && (
            <div className="overview-tab">
              {/* Player Stats */}
              <div className="stats-section">
                <h3>Your Progress</h3>
                <div className="player-stats">
                  <div className="stat-box xeno-cores">
                    <div className="stat-value">{score?.xenoCores?.toLocaleString() || 0}</div>
                    <div className="stat-label">Xeno Cores</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{score?.shipsDefeated || 0}</div>
                    <div className="stat-label">Ships Defeated</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">#{rank || '—'}</div>
                    <div className="stat-label">Rank</div>
                  </div>
                </div>
              </div>

              {/* Heat Meter */}
              <div className="stats-section">
                <h3>Aggression Meter</h3>
                <div className="heat-meter">
                  <div className="heat-bar-container">
                    <div 
                      className="heat-bar" 
                      style={{ 
                        width: `${Math.min(100, (heat?.currentHeat || 0) / 20)}%`,
                        backgroundColor: getHeatColor(heat?.currentHeat || 0)
                      }}
                    ></div>
                  </div>
                  <div className="heat-stats">
                    <span className="heat-value" style={{ color: getHeatColor(heat?.currentHeat || 0) }}>
                      {heat?.currentHeat || 0} Heat
                    </span>
                    <span className="retaliation-chance">
                      {((heat?.retaliationChance || 0) * 100).toFixed(1)}% Retaliation Chance
                    </span>
                  </div>
                </div>
                <p className="heat-hint">
                  Heat builds as you attack aliens. High heat increases the chance of retaliation attacks!
                </p>
              </div>

              {/* Mothership Status */}
              <div className="stats-section mothership-section">
                <h3>🌌 Mothership Status</h3>
                {event.globalState.mothershipDefeated ? (
                  <div className="mothership-defeated">
                    <span className="defeated-icon">💥</span>
                    <p>The Mothership has been destroyed!</p>
                  </div>
                ) : (
                  <div className="mothership-status">
                    <div className="mothership-hp-bar">
                      <div 
                        className="mothership-hp" 
                        style={{ width: `${mothershipHpPercent}%` }}
                      ></div>
                    </div>
                    <div className="mothership-hp-text">
                      {event.globalState.mothershipCurrentHp.toLocaleString()} / {event.globalState.mothershipMaxHp.toLocaleString()} HP
                    </div>
                  </div>
                )}
              </div>

              {/* Event Stats */}
              <div className="stats-section">
                <h3>Global Progress</h3>
                <div className="global-stats">
                  <div className="global-stat">
                    <span className="label">Total Ships Destroyed:</span>
                    <span className="value">{event.globalState.totalShipsDefeated}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ships' && (
            <div className="ships-tab">
              {/* Portal Zone Ships */}
              <div className="ships-section">
                <h3>🌀 Portal Zone</h3>
                <p className="section-hint">Elite ships near the portal. Attack for bonus rewards!</p>
                {portalShips.length === 0 ? (
                  <p className="no-ships">No portal ships available</p>
                ) : (
                  <div className="ships-grid">
                    {portalShips.map(ship => (
                      <div 
                        key={ship.id} 
                        className={`ship-card tier-${ship.tier} ${ship.shipType}`}
                        onClick={() => onShipClick?.(ship)}
                      >
                        <div className="ship-icon">{getShipTypeIcon(ship.shipType)}</div>
                        <div className="ship-info">
                          <div className="ship-name">{ship.name}</div>
                          <div className="ship-level">Level {ship.level}</div>
                          {ship.maxAttacks && (
                            <div className="ship-attacks">{ship.attackCount}/{ship.maxAttacks} attacks</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Player Ring Ships */}
              <div className="ships-section">
                <h3>🛸 Nearby Ships</h3>
                <p className="section-hint">Ships spawned near your colonies</p>
                {ringShips.length === 0 ? (
                  <p className="no-ships">No nearby ships available</p>
                ) : (
                  <div className="ships-grid">
                    {ringShips.map(ship => (
                      <div 
                        key={ship.id} 
                        className={`ship-card tier-${ship.tier} ${ship.shipType}`}
                        onClick={() => onShipClick?.(ship)}
                      >
                        <div className="ship-icon">{getShipTypeIcon(ship.shipType)}</div>
                        <div className="ship-info">
                          <div className="ship-name">{ship.name}</div>
                          <div className="ship-level">Level {ship.level}</div>
                          {ship.maxAttacks && (
                            <div className="ship-attacks">{ship.attackCount}/{ship.maxAttacks} attacks</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="leaderboard-tab">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Commander</th>
                    <th>Xeno Cores</th>
                    <th>Ships</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={i} className={entry.rank === rank ? 'current-player' : ''}>
                      <td className="rank">#{entry.rank}</td>
                      <td className="username">{entry.username}</td>
                      <td className="xeno-cores">{entry.xenoCores.toLocaleString()}</td>
                      <td className="ships">{entry.shipsDefeated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rank && rank > 20 && (
                <div className="your-rank">
                  Your Rank: <strong>#{rank}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

