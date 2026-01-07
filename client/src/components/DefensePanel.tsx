import { useState, useEffect, useRef } from 'react';
import { api, type Planet } from '../lib/api';
import DefenseTurretModal from './DefenseTurretModal';
import './DefensePanel.css';

interface DefensePanelProps {
    planet: Planet;
    onClose: () => void;
}

type LaneUnits = Record<string, number>;
type ToolSlot = { type: string; count: number };
interface LaneData {
    units: LaneUnits;
    tools: ToolSlot[];
}

const UNIT_TYPES = ['marine', 'ranger', 'sentinel'];

export default function DefensePanel({ planet, onClose }: DefensePanelProps) {
    const [currentPlanet, setCurrentPlanet] = useState<Planet>(planet);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Initial State
    const [front, setFront] = useState<LaneData>({ units: {}, tools: [] });
    const [left, setLeft] = useState<LaneData>({ units: {}, tools: [] });
    const [right, setRight] = useState<LaneData>({ units: {}, tools: [] });

    const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});
    const [availableTools, setAvailableTools] = useState<Record<string, number>>({});

    const [maxSlots, setMaxSlots] = useState(1);
    const [caps, setCaps] = useState({ canopy: 100 });
    const [showTurretModal, setShowTurretModal] = useState(false);

    // Admiral State
    const [admiral, setAdmiral] = useState<{
        id: string;
        name: string;
        meleeStrengthBonus: number;
        rangedStrengthBonus: number;
        canopyReductionBonus: number;
        stationedPlanetId?: string | null;
    } | null>(null);
    const [loadingAdmiral, setLoadingAdmiral] = useState(false);
    const [showAdmiralDropdown, setShowAdmiralDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Tool Selection Modal State
    const [showToolSelector, setShowToolSelector] = useState<{ lane: 'front' | 'left' | 'right' | null } | null>(null);

    useEffect(() => {
        setCurrentPlanet(planet);
        loadData();
        loadAdmiral();
    }, [planet.id]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowAdmiralDropdown(false);
            }
        };
        if (showAdmiralDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showAdmiralDropdown]);

    const loadAdmiral = async () => {
        try {
            setLoadingAdmiral(true);
            const admiralData = await api.getAdmiral();
            setAdmiral(admiralData);
        } catch (err) {
            setAdmiral(null);
        } finally {
            setLoadingAdmiral(false);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            // Re-fetch planet to get latest units AND tools
            const p = await api.getPlanet(currentPlanet.id);
            setAvailableUnits(p.units || {});

            const toolsMap: Record<string, number> = {};
            if (p.tools) {
                p.tools.forEach(t => toolsMap[t.toolType] = t.count);
            }
            setAvailableTools(toolsMap);

            // Fetch layout
            const profile = await api.getDefenseProfile(currentPlanet.id);

            // Canopy Level determines Max Slots. Level 1 = 1 Slot.
            const canopyLevel = profile.canopyLevel || 1;
            const hubLevel = profile.dockingHubLevel || 0;
            const minefieldLevel = profile.minefieldLevel || 0;
            setMaxSlots(Math.max(1, canopyLevel));
            
            // Get defense capacity from API response (if available)
            const defenseCapacity = profile.defenseCapacity || 0;
            setCaps({ canopy: defenseCapacity || (canopyLevel * 20) }); // Fallback to old calculation if not available
            
            // Update planet data to get latest turrets
            setCurrentPlanet(p);

            // Normalize incoming data (Backend might send old or new format)
            const normalize = (data: any): LaneData => {
                if (!data) return { units: {}, tools: [] };
                // Check if it's legacy (just units)
                if (!data.units && !data.tools) return { units: data, tools: [] };
                return {
                    units: data.units || {},
                    tools: Array.isArray(data.tools) ? data.tools : []
                };
            };

            if (profile.laneDefenses) {
                setFront(normalize(profile.laneDefenses.front));
                setLeft(normalize(profile.laneDefenses.left));
                setRight(normalize(profile.laneDefenses.right));
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.updateDefenseLayout(currentPlanet.id, { front, left, right });
            alert('Defense layout saved!');
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    // --- Unit Logic ---
    const updateUnit = (lane: 'front' | 'left' | 'right', unit: string, val: number) => {
        const updater = lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
        const current = lane === 'front' ? front : lane === 'left' ? left : right;

        // Calculate what the new total would be
        const currentTotal = Object.values(front.units).reduce((a, b) => a + b, 0) +
                            Object.values(left.units).reduce((a, b) => a + b, 0) +
                            Object.values(right.units).reduce((a, b) => a + b, 0);
        const currentLaneTotal = Object.values(current.units).reduce((a, b) => a + b, 0);
        const currentUnitInLane = current.units[unit] || 0;
        const newLaneTotal = currentLaneTotal - currentUnitInLane + val;
        const newTotal = currentTotal - currentUnitInLane + val;

        // Check if new total exceeds capacity
        if (newTotal > caps.canopy) {
            // Allow the change but it will be rejected on save
            // Could show a warning here if desired
        }

        updater({
            ...current,
            units: { ...current.units, [unit]: val }
        });
    };

    const getAssignedUnitCount = (unit: string) => {
        const f = front.units[unit] || 0;
        const l = left.units[unit] || 0;
        const r = right.units[unit] || 0;
        return f + l + r;
    };

    // --- Tool Logic ---
    const addToolToLane = (lane: 'front' | 'left' | 'right', toolType: string) => {
        const updater = lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
        const current = lane === 'front' ? front : lane === 'left' ? left : right;

        if (current.tools.length >= maxSlots) return;

        // Add proper slot
        // Initial count 1 or max available? let's start with 0 so user sets it? Or 1.
        updater({
            ...current,
            tools: [...current.tools, { type: toolType, count: 0 }]
        });
        setShowToolSelector(null);
    };

    const updateToolCount = (lane: 'front' | 'left' | 'right', index: number, val: number) => {
        const updater = lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
        const current = lane === 'front' ? front : lane === 'left' ? left : right; // { units, tools }

        const newTools = [...current.tools];
        if (newTools[index]) {
            newTools[index] = { ...newTools[index], count: val };
        }
        updater({ ...current, tools: newTools });
    };

    const removeTool = (lane: 'front' | 'left' | 'right', index: number) => {
        const updater = lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
        const current = lane === 'front' ? front : lane === 'left' ? left : right;

        const newTools = current.tools.filter((_, i) => i !== index);
        updater({ ...current, tools: newTools });
    };

    const getAssignedToolCount = (toolType: string) => {
        const sum = (list: ToolSlot[]) => list.filter(t => t.type === toolType).reduce((a, b) => a + b.count, 0);
        return sum(front.tools) + sum(left.tools) + sum(right.tools);
    };

    // --- Render ---

    const renderLane = (title: string, lane: 'front' | 'left' | 'right', data: LaneData) => {
        const totalInLane = Object.values(data.units).reduce((a, b) => a + b, 0);

        return (
            <div className="defense-lane">
                <div className="defense-lane-header">
                    <h4>{title}</h4>
                    <span className="lane-cap">Units: {totalInLane}</span>
                </div>

                {/* UNITS SECTION */}
                <div className="section-label">Units</div>
                <div className="unit-inputs">
                    {UNIT_TYPES.map(unit => {
                        const owned = availableUnits[unit] || 0;
                        const assignedElsewhere = getAssignedUnitCount(unit) - (data.units[unit] || 0);
                        const maxForThisLane = Math.max(0, owned - assignedElsewhere);
                        const currentVal = data.units[unit] || 0;

                        return (
                            <div key={unit} className="unit-input-row">
                                <label className="unit-name">{unit}</label>
                                <input
                                    type="number"
                                    min="0"
                                    max={owned}
                                    value={currentVal}
                                    onChange={e => {
                                        let val = parseInt(e.target.value) || 0;
                                        // Cap to owned
                                        val = Math.min(val, maxForThisLane + currentVal); // Can increase up to remaining owned
                                        updateUnit(lane, unit, Math.max(0, val));
                                    }}
                                />
                                <span className="unit-total">/ {owned}</span>
                            </div>
                        );
                    })}
                </div>

                {/* TOOLS SECTION */}
                <div className="section-label">Defense Modules ({data.tools.length}/{maxSlots})</div>
                <div className="tool-slots">
                    {/* Render Filled Slots */}
                    {data.tools.map((slot, idx) => {
                        const owned = availableTools[slot.type] || 0;
                        // Calculate assigned elsewhere?
                        // Tools are just pool-based.
                        const totalAssigned = getAssignedToolCount(slot.type);
                        const remaining = Math.max(0, owned - (totalAssigned - slot.count));

                        return (
                            <div key={idx} className="tool-slot filled">
                                <div className="tool-info">
                                    <span className="tool-name">{slot.type}</span>
                                    <button className="remove-tool-btn" onClick={() => removeTool(lane, idx)}>×</button>
                                </div>
                                <div className="tool-qty-row">
                                    <input
                                        type="number"
                                        value={slot.count}
                                        min="0"
                                        max={remaining + slot.count}
                                        onChange={(e) => updateToolCount(lane, idx, parseInt(e.target.value) || 0)}
                                    />
                                    <span>/ {owned}</span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Render Empty Slots */}
                    {Array.from({ length: maxSlots - data.tools.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="tool-slot empty" onClick={() => setShowToolSelector({ lane })}>
                            <span>+ Add Tool</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- Modal ---
    const renderToolSelector = () => {
        if (!showToolSelector) return null;

        // Filter tools that are defense tools?
        // Defense Tools: sentry_drones, hardened_bulkheads, targeting_uplinks
        // Attack Tools: invasion_anchors, plasma_breachers, stealth_field_pods
        // Ideally we only show relevant ones or show all but mark type.
        // For MVP, show all available in inventory.

        const inventoryItems = Object.entries(availableTools).filter(([_, count]) => count > 0);

        return (
            <div className="tool-select-overlay" onClick={() => setShowToolSelector(null)}>
                <div className="tool-select-modal" onClick={e => e.stopPropagation()}>
                    <h3>Select Tool</h3>
                    <div className="tool-grid">
                        {inventoryItems.length === 0 && <p>No tools in inventory.</p>}
                        {inventoryItems.map(([type, count]) => (
                            <div key={type} className="tool-option" onClick={() => addToolToLane(showToolSelector.lane!, type)}>
                                <strong>{type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</strong>
                                <small>Owned: {count}</small>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="defense-panel modal">Loading Defense System...</div>;

    // Calculate total units across all lanes
    const totalUnitsAssigned = Object.values(front.units).reduce((a, b) => a + b, 0) +
                               Object.values(left.units).reduce((a, b) => a + b, 0) +
                               Object.values(right.units).reduce((a, b) => a + b, 0);
    const capacityExceeded = totalUnitsAssigned > caps.canopy;

    return (
        <div className="defense-panel-overlay">
            <div className="defense-panel modal">
                <div className="defense-header">
                    <div>
                        <h2>Defensive Structure (Canopy Lvl {maxSlots})</h2>
                        <div className="defense-stats">
                            <span style={{ color: capacityExceeded ? '#ff4444' : '#aaa' }}>
                                Total Capacity: {totalUnitsAssigned} / {caps.canopy} troops (shared across all lanes)
                            </span>
                            <span className="defense-bonus-info" style={{ marginLeft: '15px', color: '#00f3ff' }}>
                                Hub: Lvl {currentPlanet.starportLevel || 0} | Minefield: Lvl {currentPlanet.perimeterFieldLevel || 0}
                            </span>
                            {currentPlanet.defenseTurretsJson && (
                                <span className="turret-count">
                                    {(() => {
                                        try {
                                            const turrets = JSON.parse(currentPlanet.defenseTurretsJson);
                                            return `${turrets.length} Turrets`;
                                        } catch {
                                            return '';
                                        }
                                    })()}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {/* Admiral Selector */}
                        <div className="admiral-selector-defense" ref={dropdownRef}>
                            <button 
                                className={`admiral-dropdown-btn ${admiral?.stationedPlanetId === currentPlanet.id ? 'active' : ''}`}
                                onClick={() => setShowAdmiralDropdown(!showAdmiralDropdown)}
                                title={admiral?.stationedPlanetId === currentPlanet.id ? 'Admiral is stationed here for defense' : 'Station an admiral for defense bonuses'}
                            >
                                {admiral ? (
                                    <>
                                        <div className="admiral-mini-info">
                                            <span className="admiral-name">{admiral.name}</span>
                                            {admiral.stationedPlanetId === currentPlanet.id ? (
                                                <span className="admiral-status-active">STATIONED</span>
                                            ) : (
                                                <span className="admiral-status-off">UNASSIGNED</span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <span className="no-admiral-text">No Admiral</span>
                                )}
                                <span className="dropdown-arrow">▼</span>
                            </button>

                            {showAdmiralDropdown && (
                                <div className="admiral-dropdown-menu">
                                    {loadingAdmiral ? (
                                        <div className="dropdown-item">Loading...</div>
                                    ) : admiral ? (
                                        <div className="admiral-details-popover">
                                            <h4>{admiral.name}</h4>
                                            <div className="attribute-row">
                                                <span>Melee Defense:</span>
                                                <span className="success-text">+{admiral.meleeStrengthBonus}%</span>
                                            </div>
                                            <div className="attribute-row">
                                                <span>Ranged Defense:</span>
                                                <span className="success-text">+{admiral.rangedStrengthBonus}%</span>
                                            </div>
                                            <div className="attribute-row" style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px' }}>
                                                <span className="status-label">Status:</span>
                                                <span className={admiral.stationedPlanetId === currentPlanet.id ? 'success-text' : 'warning-text'}>
                                                    {admiral.stationedPlanetId === currentPlanet.id ? 'Stationed Here' : 'Not Stationed Here'}
                                                </span>
                                            </div>
                                            <p className="note">Admirals only provide bonuses to the planet where they are stationed.</p>
                                        </div>
                                    ) : (
                                        <div className="dropdown-item">No Admiral Available</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <button 
                            className="add-turret-btn"
                            onClick={() => setShowTurretModal(true)}
                            style={{ 
                                background: '#4a90e2', 
                                border: 'none', 
                                color: 'white', 
                                padding: '8px 12px', 
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Add Turret
                        </button>
                        <button className="close-btn" onClick={onClose}>×</button>
                    </div>
                </div>

                <div className="defense-lanes-container">
                    {renderLane("Left Flank", "left", left)}
                    {renderLane("Central Docking Hub", "front", front)}
                    {renderLane("Right Flank", "right", right)}
                </div>

                <div className="defense-footer">
                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Establish Defense'}
                    </button>
                </div>

                {renderToolSelector()}
            </div>
            
            {showTurretModal && (
                <DefenseTurretModal
                    planet={currentPlanet}
                    onClose={() => setShowTurretModal(false)}
                    onAdd={loadData}
                />
            )}
        </div>
    );
}
