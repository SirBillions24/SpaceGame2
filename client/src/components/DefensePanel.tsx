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
    const [shieldBonus, setShieldBonus] = useState(0);
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
    const [showToolDropdown, setShowToolDropdown] = useState(false);
    const [showTotalDropdown, setShowTotalDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const toolDropdownRef = useRef<HTMLDivElement>(null);
    const totalDropdownRef = useRef<HTMLDivElement>(null);

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
            if (toolDropdownRef.current && !toolDropdownRef.current.contains(event.target as Node)) {
                setShowToolDropdown(false);
            }
            if (totalDropdownRef.current && !totalDropdownRef.current.contains(event.target as Node)) {
                setShowTotalDropdown(false);
            }
        };
        if (showAdmiralDropdown || showToolDropdown || showTotalDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showAdmiralDropdown, showToolDropdown]);

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
            
            // Set shield bonus
            if (p.buildings) {
                const canopy = p.buildings.find(b => b.type === 'canopy_generator');
                if (canopy && canopy.level > 0) {
                    // Level 1: 30, Level 2: 50, Level 3: 70, Level 4: 90
                    const bonuses: Record<number, number> = { 1: 30, 2: 50, 3: 70, 4: 90 };
                    setShieldBonus(bonuses[canopy.level] || 0);
                }
            }
            
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

        // Add proper slot with initial count 1
        updater({
            ...current,
            tools: [...current.tools, { type: toolType, count: 1 }]
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

    const calculateToolBonuses = () => {
        const toolStats: Record<string, { type: string, value: number }> = {
            'sentry_drones': { type: 'shield', value: 25 },
            'hardened_bulkheads': { type: 'hub', value: 35 },
            'targeting_uplinks': { type: 'ranged', value: 25 }
        };

        const bonuses = {
            left: { shield: 0, hub: 0, ranged: 0 },
            front: { shield: 0, hub: 0, ranged: 0 },
            right: { shield: 0, hub: 0, ranged: 0 }
        };

        const addLaneBonuses = (lane: 'left' | 'front' | 'right', tools: ToolSlot[]) => {
            tools.forEach(t => {
                const stats = toolStats[t.type];
                if (stats && t.count > 0) {
                    if (stats.type === 'shield') bonuses[lane].shield += stats.value;
                    if (stats.type === 'hub') bonuses[lane].hub += stats.value;
                    if (stats.type === 'ranged') bonuses[lane].ranged += stats.value;
                }
            });
        };

        addLaneBonuses('left', left.tools);
        addLaneBonuses('front', front.tools);
        addLaneBonuses('right', right.tools);

        return bonuses;
    };

    const toolBonuses = calculateToolBonuses();
    const hasAnyToolBonus = Object.values(toolBonuses).some(l => l.shield > 0 || l.hub > 0 || l.ranged > 0);

    const calculateTotals = () => {
        // Find max tool bonus from any lane for the general "Total" overview
        const maxToolShield = Math.max(toolBonuses.left.shield, toolBonuses.front.shield, toolBonuses.right.shield);
        const maxToolRanged = Math.max(toolBonuses.left.ranged, toolBonuses.front.ranged, toolBonuses.right.ranged);
        const maxToolHub = toolBonuses.front.hub;

        const isStationed = admiral?.stationedPlanetId === currentPlanet.id;
        const admiralMelee = isStationed ? (admiral?.meleeStrengthBonus || 0) : 0;
        const admiralRanged = isStationed ? (admiral?.rangedStrengthBonus || 0) : 0;

        return {
            melee: {
                base: 100,
                admiral: admiralMelee,
                total: 100 + admiralMelee
            },
            ranged: {
                base: 100,
                admiral: admiralRanged,
                modules: maxToolRanged,
                total: 100 + admiralRanged + maxToolRanged
            },
            shield: {
                building: shieldBonus,
                modules: maxToolShield,
                total: shieldBonus + maxToolShield
            },
            hub: {
                building: (currentPlanet as any).starportLevel * 35 || 0, // Docking Hub is 35% per level in combatService
                modules: maxToolHub,
                total: ((currentPlanet as any).starportLevel * 35 || 0) + maxToolHub
            }
        };
    };

    const totals = calculateTotals();

    // --- Render ---

    const renderLane = (title: string, lane: 'front' | 'left' | 'right', data: LaneData) => {
        const totalInLane = Object.values(data.units).reduce((a, b) => a + b, 0);
        const assignedUnits = Object.entries(data.units).filter(([_, count]) => count > 0);

        return (
            <div className="defense-lane">
                <div className="defense-lane-header">
                    <h4>{title}</h4>
                    <span className="lane-cap">Units: {totalInLane}</span>
                </div>

                {/* UNITS SECTION */}
                <div className="section-label">Units</div>
                <div className="unit-slots">
                    {assignedUnits.length === 0 && <div className="empty-lane-msg">No units assigned.</div>}
                    {assignedUnits.map(([unit, count]) => {
                        const owned = availableUnits[unit] || 0;
                        const assignedElsewhere = getAssignedUnitCount(unit) - count;
                        const maxForThisLane = Math.max(0, owned - assignedElsewhere);

                        return (
                            <div key={unit} className="unit-slot-filled">
                                <div className="unit-slot-info">
                                    <span className="unit-name">{unit}</span>
                                    <button className="remove-unit-btn" onClick={() => updateUnit(lane, unit, 0)}>×</button>
                                </div>
                                <div className="unit-qty-row">
                                    <input
                                        type="number"
                                        min="0"
                                        max={owned}
                                        value={count}
                                        onChange={e => {
                                            let val = parseInt(e.target.value) || 0;
                                            val = Math.min(val, maxForThisLane + count);
                                            updateUnit(lane, unit, Math.max(0, val));
                                        }}
                                    />
                                    <span>/ {owned}</span>
                                </div>
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
                    {Array.from({ length: Math.max(0, maxSlots - data.tools.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="tool-slot empty">
                            <span>Empty Slot</span>
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
                    <div className="header-main">
                        <div className="header-left">
                            <h2>Defensive Structure</h2>
                            <div className="defense-stats-new">
                                <div className="stat-pill">
                                    <span className="label">Shield:</span>
                                    <span className="value">{shieldBonus}% (Lvl {maxSlots})</span>
                                </div>
                                <div className="stat-pill">
                                    <span className="label">Hub:</span>
                                    <span className="value">Lvl {currentPlanet.starportLevel || 0}</span>
                                </div>
                                <div className="stat-pill">
                                    <span className="label">Minefield:</span>
                                    <span className="value">Lvl {currentPlanet.perimeterFieldLevel || 0}</span>
                                </div>
                            </div>
                        </div>

                        <div className="header-right">
                            {/* Modules Dropdown */}
                            <div className="dropdown-container" ref={toolDropdownRef}>
                                <button 
                                    className={`defense-tab-btn ${showToolDropdown ? 'active' : ''}`}
                                    onClick={() => {
                                        setShowToolDropdown(!showToolDropdown);
                                        setShowTotalDropdown(false);
                                        setShowAdmiralDropdown(false);
                                    }}
                                >
                                    <div className="tab-label-group">
                                        <span className="tab-label">MODULES</span>
                                        <span className={`tab-status ${hasAnyToolBonus ? 'active' : ''}`}>
                                            {hasAnyToolBonus ? 'ACTIVE' : 'NONE'}
                                        </span>
                                    </div>
                                    <span className="tab-arrow">▼</span>
                                </button>

                                {showToolDropdown && (
                                    <div className="dropdown-menu-new">
                                        <h4>Module Bonuses</h4>
                                        <div className="lane-bonus-group">
                                            <h5>Left Flank</h5>
                                            <div className="bonus-row"><span>Shield:</span> <span className="success">+{toolBonuses.left.shield}%</span></div>
                                            <div className="bonus-row"><span>Ranged Acc:</span> <span className="success">+{toolBonuses.left.ranged}%</span></div>
                                        </div>
                                        <div className="lane-bonus-group">
                                            <h5>Central Hub</h5>
                                            <div className="bonus-row"><span>Shield:</span> <span className="success">+{toolBonuses.front.shield}%</span></div>
                                            <div className="bonus-row"><span>Hub Integrity:</span> <span className="success">+{toolBonuses.front.hub}%</span></div>
                                            <div className="bonus-row"><span>Ranged Acc:</span> <span className="success">+{toolBonuses.front.ranged}%</span></div>
                                        </div>
                                        <div className="lane-bonus-group">
                                            <h5>Right Flank</h5>
                                            <div className="bonus-row"><span>Shield:</span> <span className="success">+{toolBonuses.right.shield}%</span></div>
                                            <div className="bonus-row"><span>Ranged Acc:</span> <span className="success">+{toolBonuses.right.ranged}%</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Admiral Selector */}
                            <div className="dropdown-container" ref={dropdownRef}>
                                <button 
                                    className={`defense-tab-btn ${admiral?.stationedPlanetId === currentPlanet.id ? 'admiral-active' : ''}`}
                                    onClick={() => {
                                        setShowAdmiralDropdown(!showAdmiralDropdown);
                                        setShowToolDropdown(false);
                                        setShowTotalDropdown(false);
                                    }}
                                    title={admiral?.stationedPlanetId === currentPlanet.id ? 'Admiral is stationed here for defense' : 'Station an admiral for defense bonuses'}
                                >
                                    {admiral ? (
                                        <div className="tab-label-group">
                                            <span className="tab-label">{admiral.name.toUpperCase()}</span>
                                            {admiral.stationedPlanetId === currentPlanet.id ? (
                                                <span className="tab-status active">STATIONED</span>
                                            ) : (
                                                <span className="tab-status">UNASSIGNED</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="tab-label-group">
                                            <span className="tab-label">ADMIRAL</span>
                                            <span className="tab-status">NONE</span>
                                        </div>
                                    )}
                                    <span className="tab-arrow">▼</span>
                                </button>

                                {showAdmiralDropdown && (
                                    <div className="dropdown-menu-new">
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

                            {/* Total Bonuses Dropdown */}
                            <div className="dropdown-container" ref={totalDropdownRef}>
                                <button 
                                    className={`defense-tab-btn highlight ${showTotalDropdown ? 'active' : ''}`}
                                    onClick={() => {
                                        setShowTotalDropdown(!showTotalDropdown);
                                        setShowToolDropdown(false);
                                        setShowAdmiralDropdown(false);
                                    }}
                                >
                                    <div className="tab-label-group">
                                        <span className="tab-label">OVERVIEW</span>
                                        <span className="tab-status active">TOTALS</span>
                                    </div>
                                    <span className="tab-arrow">▼</span>
                                </button>

                                {showTotalDropdown && (
                                    <div className="dropdown-menu-new total-overview">
                                        <h4>Total Defensive Output</h4>
                                        <div className="total-section">
                                            <div className="total-main">
                                                <span>Melee Strength:</span>
                                                <span className="total-value">{totals.melee.total}%</span>
                                            </div>
                                            <div className="total-breakdown">
                                                <span>Base: 100% | Admiral: +{totals.melee.admiral}%</span>
                                            </div>
                                        </div>
                                        <div className="total-section">
                                            <div className="total-main">
                                                <span>Ranged Strength:</span>
                                                <span className="total-value">{totals.ranged.total}%</span>
                                            </div>
                                            <div className="total-breakdown">
                                                <span>Base: 100% | Admiral: +{totals.ranged.admiral}% | Modules: +{totals.ranged.modules}%</span>
                                            </div>
                                        </div>
                                        <div className="total-section">
                                            <div className="total-main">
                                                <span>Energy Shield:</span>
                                                <span className="total-value">+{totals.shield.total}%</span>
                                            </div>
                                            <div className="total-breakdown">
                                                <span>Canopy: +{totals.shield.building}% | Modules: +{totals.shield.modules}%</span>
                                            </div>
                                        </div>
                                        <div className="total-section">
                                            <div className="total-main">
                                                <span>Hub Integrity:</span>
                                                <span className="total-value">+{totals.hub.total}%</span>
                                            </div>
                                            <div className="total-breakdown">
                                                <span>Hub Lvl: +{totals.hub.building}% | Modules: +{totals.hub.modules}%</span>
                                            </div>
                                        </div>
                                        <p className="note">Overview shows maximum potential bonuses. Specific sector tools only apply to units in that sector.</p>
                                    </div>
                                )}
                            </div>

                            <button className="close-btn" onClick={onClose}>×</button>
                        </div>
                    </div>

                    <div className="header-sub">
                        <div className="capacity-bar-container">
                            <div className="capacity-info">
                                <span className={capacityExceeded ? 'error' : ''}>
                                    Total Capacity: {totalUnitsAssigned} / {caps.canopy} troops
                                </span>
                            </div>
                            <div className="capacity-bar-bg">
                                <div 
                                    className={`capacity-bar-fill ${capacityExceeded ? 'exceeded' : ''}`} 
                                    style={{ width: `${Math.min(100, (totalUnitsAssigned / caps.canopy) * 100)}%` }}
                                />
                            </div>
                        </div>

                        <div className="turret-control-box">
                            <button 
                                className="add-turret-btn"
                                onClick={() => setShowTurretModal(true)}
                            >
                                Add Turret
                            </button>
                            <span className="turret-counter">
                                {(() => {
                                    try {
                                        const turrets = currentPlanet.defenseTurretsJson ? JSON.parse(currentPlanet.defenseTurretsJson) : [];
                                        return `${turrets.length}/20 Turrets`;
                                    } catch {
                                        return '0/20 Turrets';
                                    }
                                })()}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="defense-lanes-container">
                    <div className="lanes-main">
                        {renderLane("Left Flank", "left", left)}
                        {renderLane("Central Docking Hub", "front", front)}
                        {renderLane("Right Flank", "right", right)}
                    </div>

                    <div className="defense-pool-sidebar">
                        <h3>Available Units</h3>
                        <div className="pool-list">
                            {UNIT_TYPES.map(unit => {
                                const owned = availableUnits[unit] || 0;
                                const assigned = getAssignedUnitCount(unit);
                                const available = Math.max(0, owned - assigned);

                                return (
                                    <div key={unit} className="pool-item">
                                        <div className="pool-item-info">
                                            <span className="unit-name">{unit}</span>
                                            <span className="unit-available">{available} available</span>
                                        </div>
                                        <div className="pool-actions">
                                            <div className="pool-action-group">
                                                <span className="group-label">Front:</span>
                                                <button onClick={() => updateUnit('front', unit, (front.units[unit] || 0) + Math.min(10, available))} disabled={available <= 0}>+10</button>
                                                <button onClick={() => updateUnit('front', unit, (front.units[unit] || 0) + Math.min(100, available))} disabled={available <= 0}>+100</button>
                                                <button onClick={() => updateUnit('front', unit, (front.units[unit] || 0) + available)} disabled={available <= 0}>MAX</button>
                                            </div>
                                            <div className="pool-action-group">
                                                <span className="group-label">Left:</span>
                                                <button onClick={() => updateUnit('left', unit, (left.units[unit] || 0) + Math.min(10, available))} disabled={available <= 0}>+10</button>
                                                <button onClick={() => updateUnit('left', unit, (left.units[unit] || 0) + Math.min(100, available))} disabled={available <= 0}>+100</button>
                                                <button onClick={() => updateUnit('left', unit, (left.units[unit] || 0) + available)} disabled={available <= 0}>MAX</button>
                                            </div>
                                            <div className="pool-action-group">
                                                <span className="group-label">Right:</span>
                                                <button onClick={() => updateUnit('right', unit, (right.units[unit] || 0) + Math.min(10, available))} disabled={available <= 0}>+10</button>
                                                <button onClick={() => updateUnit('right', unit, (right.units[unit] || 0) + Math.min(100, available))} disabled={available <= 0}>+100</button>
                                                <button onClick={() => updateUnit('right', unit, (right.units[unit] || 0) + available)} disabled={available <= 0}>MAX</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <h3 style={{ marginTop: '20px' }}>Defense Modules</h3>
                        <div className="pool-list">
                            {Object.entries(availableTools).filter(([_, count]) => count > 0).map(([type, count]) => {
                                const assigned = getAssignedToolCount(type);
                                const available = Math.max(0, count - assigned);

                                return (
                                    <div key={type} className="pool-item">
                                        <div className="pool-item-info">
                                            <span className="tool-name">{type.split('_').join(' ')}</span>
                                            <span className="unit-available">{available} available</span>
                                        </div>
                                        <div className="pool-actions">
                                            <button onClick={() => addToolToLane('front', type)} disabled={available <= 0 || front.tools.length >= maxSlots}>
                                                Front
                                            </button>
                                            <button onClick={() => addToolToLane('left', type)} disabled={available <= 0 || left.tools.length >= maxSlots}>
                                                Left
                                            </button>
                                            <button onClick={() => addToolToLane('right', type)} disabled={available <= 0 || right.tools.length >= maxSlots}>
                                                Right
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
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
