import { useState, useEffect } from 'react';
import { api, type Planet } from '../lib/api';
import './DefensePanel.css';

interface DefensePanelProps {
    planet: Planet;
    onClose: () => void;
}

type LaneAssignment = Record<string, number>;

const UNIT_TYPES = ['marine', 'ranger', 'sentinel'];

export default function DefensePanel({ planet, onClose }: DefensePanelProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // assignments
    const [front, setFront] = useState<LaneAssignment>({});
    const [left, setLeft] = useState<LaneAssignment>({});
    const [right, setRight] = useState<LaneAssignment>({});

    const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});
    const [caps, setCaps] = useState({ wall: 100 }); // Placeholder cap

    useEffect(() => {
        loadData();
    }, [planet.id]);

    const loadData = async () => {
        try {
            setLoading(true);
            // Re-fetch planet to get latest units
            const p = await api.getPlanet(planet.id);
            console.log('DefensePanel loaded units:', p.units); // Debug log
            setAvailableUnits(p.units || {});

            // Fetch layout
            const profile = await api.getDefenseProfile(planet.id);
            if (profile.laneDefenses) {
                setFront(profile.laneDefenses.front || {});
                setLeft(profile.laneDefenses.left || {});
                setRight(profile.laneDefenses.right || {});
            }
            // Use grid level to determine cap?
            setCaps({ wall: (profile.defensiveGridLevel || 1) * 20 });

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.updateDefenseLayout(planet.id, { front, left, right });
            alert('Defense layout saved!');
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateAssignment = (lane: 'front' | 'left' | 'right', unit: string, val: number) => {
        const updater = lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
        const current = lane === 'front' ? front : lane === 'left' ? left : right;

        updater({ ...current, [unit]: val });
    };

    const getAssignedCount = (unit: string) => {
        return (front[unit] || 0) + (left[unit] || 0) + (right[unit] || 0);
    };

    const renderLane = (title: string, lane: 'front' | 'left' | 'right', data: LaneAssignment) => {
        const totalInLane = Object.values(data).reduce((a, b) => a + b, 0);

        return (
            <div className="defense-lane">
                <h4>{title}</h4>
                <div className="lane-stats">
                    Capacity: {totalInLane} / {caps.wall}
                </div>

                <div className="unit-inputs">
                    {UNIT_TYPES.map(unit => {
                        // Even if 0, show it so user knows it exists
                        const owned = availableUnits[unit] || 0;
                        const assignedElsewhere = getAssignedCount(unit) - (data[unit] || 0);
                        const maxForThisLane = Math.max(0, owned - assignedElsewhere);

                        return (
                            <div key={unit} className="unit-input-row">
                                <label>{unit}</label>
                                <input
                                    type="number"
                                    min="0"
                                    max={owned}
                                    value={data[unit] || 0}
                                    onChange={e => updateAssignment(lane, unit, Math.min(maxForThisLane + (data[unit] || 0), Math.max(0, parseInt(e.target.value) || 0)))}
                                />
                                <span className="unit-total">/ {owned}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) return <div className="defense-panel modal">Loading Defense System...</div>;

    return (
        <div className="defense-panel-overlay">
            <div className="defense-panel modal">
                <div className="defense-header">
                    <h2>Defensive Strategy</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="defense-lanes-container">
                    {renderLane("Left Flank", "left", left)}
                    {renderLane("Front (Center)", "front", front)}
                    {renderLane("Right Flank", "right", right)}
                </div>

                <div className="defense-footer">
                    <div className="defense-summary">
                        Total Stationed: {getAssignedCount('marine') + getAssignedCount('ranger') + getAssignedCount('sentinel')}
                    </div>
                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Establish Defense'}
                    </button>
                </div>
            </div>
        </div>
    );
}
