import { useState, useEffect, useMemo } from 'react';
import { api, type Planet } from '../lib/api';
import './FleetPanel.css'; // Reuse FleetPanel styles for consistency

interface EventShip {
    id: string;
    shipType: 'scout' | 'raider' | 'carrier' | 'dreadnought' | 'mothership';
    name: string;
    level: number;
    tier: number;
    x: number;
    y: number;
    eventId?: string; // Sometimes tied to ship object
}

interface EventAttackPanelProps {
    eventId: string;
    ship: EventShip;
    fromPlanet: { id: string; name: string };
    onClose: () => void;
    onAttackComplete: (result: any) => void;
}

const UNIT_POWER: Record<string, number> = {
    marine: 5,
    sniper: 15,
    sentinel: 35,
    automaton: 80,
    interceptor: 150,
    striker: 25,
    bomber: 60,
    capital: 200,
};

export default function EventAttackPanel({ eventId, ship, fromPlanet, onClose, onAttackComplete }: EventAttackPanelProps) {
    const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});
    const [selectedUnits, setSelectedUnits] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [estimate, setEstimate] = useState<{ chance: number; recommendation: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load planet units on mount
    useEffect(() => {
        loadPlanetUnits();
    }, [fromPlanet.id]);

    const loadPlanetUnits = async () => {
        try {
            const planet = await api.getPlanet(fromPlanet.id);
            // Use reserveUnits (units not on defense) for dispatch availability. fall back to units
            const unitsForDispatch = planet.reserveUnits || planet.units || {};
            setAvailableUnits(unitsForDispatch);

            // Init selected units to 0
            const initial: Record<string, number> = {};
            Object.keys(unitsForDispatch).forEach(u => initial[u] = 0);
            setSelectedUnits(initial);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load units');
        }
    };

    const handleUnitChange = (unitType: string, val: number) => {
        const available = availableUnits[unitType] || 0;
        const clamped = Math.max(0, Math.min(val, available));

        setSelectedUnits(prev => {
            const next = { ...prev, [unitType]: clamped };
            return next;
        });
    };

    // Update estimate when units change
    useEffect(() => {
        const totalUnits = Object.values(selectedUnits).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) {
            setEstimate(null);
            return;
        }

        const timer = setTimeout(() => {
            api.estimateEventCombat(eventId, ship.id, selectedUnits)
                .then(res => setEstimate(res.estimate))
                .catch(console.error);
        }, 500);

        return () => clearTimeout(timer);
    }, [selectedUnits, eventId, ship.id]);

    const handleAttack = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.attackEventShip(eventId, ship.id, selectedUnits);
            onAttackComplete(result);
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const totalSelected = Object.values(selectedUnits).reduce((a, b) => a + b, 0);

    // Calculate rough power locally for immediate feedback
    const totalPower = useMemo(() => {
        let power = 0;
        for (const [u, count] of Object.entries(selectedUnits)) {
            power += (UNIT_POWER[u] || 10) * count;
        }
        return power;
    }, [selectedUnits]);

    return (
        <div className="fleet-panel" style={{ zIndex: 2000 }}>
            <div className="fleet-panel-header" style={{ background: 'linear-gradient(90deg, #4a148c, #311b92)' }}>
                <h3>Intercept: {ship.name}</h3>
                <button onClick={onClose} className="close-btn">×</button>
            </div>

            <div className="fleet-panel-content">
                <div className="fleet-info">
                    <div className="route-display" style={{ justifyContent: 'center' }}>
                        <span className="planet-name">{fromPlanet.name}</span>
                        <span className="arrow" style={{ color: '#ff4d4d' }}>⚔️</span>
                        <span className="planet-name" style={{ color: '#e040fb' }}>Level {ship.level} {ship.shipType.toUpperCase()}</span>
                    </div>
                </div>

                <div className="estimate-box" style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    border: '1px solid #444',
                    textAlign: 'center'
                }}>
                    {estimate ? (
                        <div>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: estimate.chance > 70 ? '#4caf50' : estimate.chance > 40 ? '#ff9800' : '#f44336' }}>
                                Success Chance: {estimate.chance.toFixed(0)}%
                            </div>
                            <div style={{ color: '#aaa', fontSize: '0.9em' }}>{estimate.recommendation}</div>
                        </div>
                    ) : (
                        <div style={{ color: '#666' }}>Select units to see combat estimate</div>
                    )}
                    <div style={{ fontSize: '0.8em', color: '#888', marginTop: '5px' }}>Fleet Power: {totalPower}</div>
                </div>

                <div className="flat-selector" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {Object.keys(availableUnits).length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No units available at this colony.</div>}

                    {Object.entries(availableUnits).map(([u, count]) => count > 0 && (
                        <div key={u} className="unit-row">
                            <span style={{ textTransform: 'capitalize' }}>{u}</span>
                            <span style={{ fontSize: '0.8em', color: '#aaa' }}>Max: {count}</span>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <input
                                    type="number"
                                    value={selectedUnits[u] || 0}
                                    onChange={e => handleUnitChange(u, parseInt(e.target.value) || 0)}
                                    style={{ width: '60px' }}
                                />
                                <button
                                    onClick={() => handleUnitChange(u, count)}
                                    style={{ padding: '2px 8px', fontSize: '0.8em', background: '#333', border: '1px solid #555', color: 'white', cursor: 'pointer' }}
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="fleet-footer">
                    {error && <div className="error">{error}</div>}
                    <button
                        className="dispatch-btn"
                        onClick={handleAttack}
                        disabled={loading || totalSelected === 0}
                        style={{
                            background: loading ? '#555' : 'linear-gradient(45deg, #d500f9, #ff1744)',
                            boxShadow: '0 0 10px rgba(213, 0, 249, 0.4)'
                        }}
                    >
                        {loading ? 'Engaging Hostiles...' : 'LAUNCH INTERCEPTION'}
                    </button>
                </div>
            </div>
        </div>
    );
}
