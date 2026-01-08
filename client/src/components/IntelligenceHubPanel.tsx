import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './IntelligenceHubPanel.css';

interface Probe {
  id: string;
  type: string;
  targetX: number;
  targetY: number;
  status: 'traveling' | 'active' | 'discovered' | 'returning' | 'cooldown' | 'destroyed';
  arrivalTime: string;
  returnTime?: string;
  cooldownUntil?: string;
  lastUpdateTime: string;
  accuracy: number;
  discoveryChance: number;
}

interface IntelligenceHubPanelProps {
  planetId: string;
  onClose: () => void;
}

export const IntelligenceHubPanel: React.FC<IntelligenceHubPanelProps> = ({ planetId, onClose }) => {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProbeId, setSelectedProbeId] = useState<string | null>(null);
  const [probeData, setProbeData] = useState<any>(null);

  const fetchProbes = async () => {
    try {
      const data = await api.getProbes();
      setProbes(data);
    } catch (err) {
      console.error('Failed to fetch probes', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProbeDetail = async (id: string) => {
    try {
      const data = await api.getProbeData(id);
      setProbeData(data);
    } catch (err) {
      console.error('Failed to fetch probe detail', err);
    }
  };

  useEffect(() => {
    fetchProbes();
    const interval = setInterval(fetchProbes, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedProbeId) {
      fetchProbeDetail(selectedProbeId);
      const interval = setInterval(() => fetchProbeDetail(selectedProbeId), 5000);
      return () => clearInterval(interval);
    } else {
      setProbeData(null);
    }
  }, [selectedProbeId]);

  const handleDeleteProbe = async (id: string) => {
    if (!confirm('Are you sure you want to decommission this probe? No resources will be recovered.')) return;
    try {
      await api.deleteProbe(id);
      setProbes(probes.filter(p => p.id !== id));
      if (selectedProbeId === id) setSelectedProbeId(null);
    } catch (err) {
      alert('Failed to delete probe');
    }
  };

  const handleRecallProbe = async (id: string) => {
    try {
      await api.recallProbe(id);
      fetchProbes();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleGenerateReport = async (id: string) => {
    try {
      await api.generateProbeReport(id);
      alert('Espionage Report generated and sent to your Inbox!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="espionage-overlay">
      <div className="espionage-panel">
        <div className="panel-header">
          <h2>Intelligence Hub</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="panel-content">
          <div className="probes-list">
            <h3>Active Probes</h3>
            {loading ? (
              <p>Loading signals...</p>
            ) : probes.length === 0 ? (
              <p className="empty-msg">No probes deployed. Launch one from the World Map.</p>
            ) : (
              probes.map(probe => (
                <div 
                  key={probe.id} 
                  className={`probe-item ${selectedProbeId === probe.id ? 'selected' : ''} ${probe.status}`}
                  onClick={() => setSelectedProbeId(probe.id)}
                >
                  <div className="probe-item-content">
                    <div className="probe-info">
                      <span className="probe-coord">[{probe.targetX}, {probe.targetY}]</span>
                      <span className="probe-type-tag">{probe.type === 'advanced_probe' ? 'ADV' : 'BASIC'}</span>
                      <span className={`probe-status-tag ${probe.status}`}>{probe.status.toUpperCase()}</span>
                    </div>
                    {probe.status === 'traveling' && (
                      <div className="probe-eta">ETA: {new Date(probe.arrivalTime).toLocaleTimeString()}</div>
                    )}
                    {probe.status === 'returning' && (
                      <div className="probe-eta returning">RETURNING: {new Date(probe.returnTime!).toLocaleTimeString()}</div>
                    )}
                    {probe.status === 'cooldown' && (
                      <div className="probe-eta cooldown">COOLDOWN: {new Date(probe.cooldownUntil!).toLocaleTimeString()}</div>
                    )}
                    {probe.status === 'active' && (
                      <div className="probe-stats">
                        <div className="stats-row">
                          <span>Acc: {(probe.accuracy * 100).toFixed(0)}%</span>
                          <span>Risk: {(probe.discoveryChance * 100).toFixed(1)}%</span>
                        </div>
                        <div className="next-ping">
                          Next ping: {(() => {
                            const lastUpdate = new Date(probe.lastUpdateTime).getTime();
                            const nextUpdate = lastUpdate + 60000;
                            const diff = Math.max(0, Math.ceil((nextUpdate - Date.now()) / 1000));
                            return `${diff}s`;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  {(probe.status === 'active' || probe.status === 'traveling' || probe.status === 'discovered') && (
                    <div className="probe-side-actions">
                      <button 
                        className="recall-btn" 
                        onClick={(e) => { e.stopPropagation(); handleRecallProbe(probe.id); }}
                      >
                        RECALL
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="probe-detail">
            {selectedProbeId ? (
              probeData ? (
                <div className="detail-view">
                  <h3>Probe Data [{probeData.probe.targetX}, {probeData.probe.targetY}]</h3>
                  <div className="accuracy-bar">
                    <div className="accuracy-fill" style={{ width: `${probeData.probe.accuracy * 100}%` }}></div>
                    <span>Signal Integrity: {(probeData.probe.accuracy * 100).toFixed(0)}%</span>
                  </div>

                  <button 
                    className="gen-report-btn" 
                    onClick={() => handleGenerateReport(probeData.probe.id)}
                    disabled={probeData.probe.status === 'discovered'}
                  >
                    GENERATE PERMANENT REPORT
                  </button>

                  {probeData.probe.status === 'discovered' ? (
                    <div className="discovered-alert">
                      ⚠️ SIGNAL COMPROMISED: This probe has been detected and is no longer relaying data.
                    </div>
                  ) : probeData.probe.status === 'returning' ? (
                    <div className="returning-info">
                      📡 SIGNAL LOST: Probe has entered return trajectory. No further data available.
                      <div className="return-eta">Estimated Arrival: {new Date(probeData.probe.returnTime).toLocaleTimeString()}</div>
                    </div>
                  ) : probeData.probe.status === 'cooldown' ? (
                    <div className="cooldown-info">
                      🛠️ MAINTENANCE: Probe has returned and is undergoing maintenance.
                      <div className="cooldown-eta">Ready at: {new Date(probeData.probe.cooldownUntil).toLocaleTimeString()}</div>
                    </div>
                  ) : (
                    <div className="colonies-detected">
                      <h4>Colonies in Radius</h4>
                      {probeData.colonies.length === 0 ? (
                        <p>No enemy colonies detected within scan range.</p>
                      ) : (
                        probeData.colonies.map((colony: any) => (
                          <div key={colony.id} className="detected-colony">
                            <div className="colony-header">
                              <span className="colony-name">{colony.name}</span>
                              <span className="colony-owner">Owner: {colony.ownerName}</span>
                              <span className="colony-pos">({colony.x}, {colony.y})</span>
                            </div>
                            <div className="unit-intel">
                              {colony.units.map((unit: any) => (
                                <div key={unit.type} className="unit-row">
                                  <span className="unit-type">{unit.type}</span>
                                  <span className="unit-count">
                                    {unit.count !== null ? unit.count : `${unit.countRange[0]} - ${unit.countRange[1]}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p>Establishing link...</p>
              )
            ) : (
              <div className="no-selection">
                <p>Select a probe to view intelligence reports.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

