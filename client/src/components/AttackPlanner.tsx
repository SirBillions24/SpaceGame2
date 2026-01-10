import { useState, useMemo, useEffect, useRef } from 'react';
import { type Planet, api } from '../lib/api';
import './AttackPlanner.css';

// Import tool icons (SVGs from src/assets)
import iconJammer from '../assets/placeholders/shield_jammer.svg';
import iconBreach from '../assets/placeholders/hangar_breach.svg';
import iconECM from '../assets/placeholders/ecm_pod.svg';

interface AttackPlannerProps {
    fromPlanet: Planet;
    toPlanet: Planet;
    availableUnits: Record<string, number>;
    onCommit: (
        finalUnits: Record<string, number>,
        laneAssignments: any,
        admiralId?: string
    ) => void;
    onCancel: () => void;
}

type Lane = 'left' | 'front' | 'right';
type ItemType = 'unit' | 'tool';

interface SlotData {
    id: string;
    type: ItemType;
    itemId: string | null;
    count: number;
}

interface WaveData {
    id: number;
    lanes: {
        left: { unitSlots: SlotData[], toolSlots: SlotData[] };
        front: { unitSlots: SlotData[], toolSlots: SlotData[] };
        right: { unitSlots: SlotData[], toolSlots: SlotData[] };
    };
}

const MAX_WAVES = 4;
const UNIT_SLOTS_PER_LANE = 3;
const TOOL_SLOTS_PER_LANE = 2; // GGE has 2 or 3 usually
const SLOT_CAPACITY = 100;

const UNIT_ICONS: Record<string, string> = {
    marine: '/assets/units/marine.png',
    ranger: '/assets/units/ranger.png',
    sentinel: '/assets/units/sentinel.png',
    interceptor: '/assets/units/interceptor.png',
    droid_decoy: '/assets/units/droid_decoy.png',
    heavy_automaton: '/assets/units/heavy_automaton.png',
};

const getClassIcon = (unitClass: string) => {
    switch (unitClass) {
        case 'melee': return '🗡️';
        case 'ranged': return '🎯';
        case 'robotic': return '🤖';
        default: return '❓';
    }
};

const getUnitClass = (unitId: string) => {
    const mapping: Record<string, string> = {
        marine: 'melee',
        sentinel: 'melee',
        ranger: 'ranged',
        interceptor: 'robotic',
        droid_decoy: 'robotic',
        heavy_automaton: 'robotic'
    };
    return mapping[unitId] || 'melee';
};

const getClassAdvantage = (unitClass: string) => {
    switch (unitClass) {
        case 'melee': return 'Robotic';
        case 'ranged': return 'Melee';
        case 'robotic': return 'Ranged';
        default: return '';
    }
};

const TOOL_ICONS: Record<string, string> = {
    invasion_anchors: iconJammer,
    plasma_breachers: iconBreach,
    stealth_field_pods: iconECM,
};

const ALL_UNITS = ['marine', 'ranger', 'sentinel', 'interceptor', 'droid_decoy', 'heavy_automaton'];
const ALL_TOOLS = ['invasion_anchors', 'plasma_breachers', 'stealth_field_pods'];

// Initial State Generator
const createInitialState = (): WaveData[] => {
    const waves: WaveData[] = [];
    for (let w = 0; w < MAX_WAVES; w++) {
        const laneObj = { left: {}, front: {}, right: {} } as any;
        ['left', 'front', 'right'].forEach(lane => {
            laneObj[lane] = {
                unitSlots: Array.from({ length: UNIT_SLOTS_PER_LANE }).map((_, i) => ({
                    id: `w${w}-${lane}-u${i}`, type: 'unit', itemId: null, count: 0
                })),
                toolSlots: Array.from({ length: TOOL_SLOTS_PER_LANE }).map((_, i) => ({
                    id: `w${w}-${lane}-t${i}`, type: 'tool', itemId: null, count: 0
                })),
            };
        });
        waves.push({ id: w + 1, lanes: laneObj });
    }
    return waves;
};

export default function AttackPlanner({ fromPlanet, toPlanet, availableUnits, onCommit, onCancel }: AttackPlannerProps) {
    const [waves, setWaves] = useState<WaveData[]>(createInitialState());
    const [selectedItem, setSelectedItem] = useState<{ type: ItemType, id: string } | null>(null);
    const [placementAmount, setPlacementAmount] = useState<number | 'max'>('max');
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

    // Load admiral on mount
    useEffect(() => {
        loadAdmiral();
    }, []);

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
            // Admiral might not exist yet, that's okay
            setAdmiral(null);
        } finally {
            setLoadingAdmiral(false);
        }
    };

    // Calculate available tools from Planet props
    const availableTools = useMemo(() => {
        const map: Record<string, number> = {};
        if (fromPlanet.tools) {
            fromPlanet.tools.forEach(t => {
                if (ALL_TOOLS.includes(t.toolType)) {
                    map[t.toolType] = t.count;
                }
            });
        }
        return map;
    }, [fromPlanet]);

    // Calculate specific totals used
    const usedTotals = useMemo(() => {
        const used: Record<string, number> = {};
        waves.forEach(w => {
            ['left', 'front', 'right'].forEach((l: any) => {
                const lane = w.lanes[l as Lane];
                lane.unitSlots.forEach(s => {
                    if (s.itemId) used[s.itemId] = (used[s.itemId] || 0) + s.count;
                });
                lane.toolSlots.forEach(s => {
                    if (s.itemId) used[s.itemId] = (used[s.itemId] || 0) + s.count;
                });
            });
        });
        return used;
    }, [waves]);

    // Handle Slot Click -> Assign / Edit
    const handleSlotClick = (waveIdx: number, lane: Lane, slotType: 'unitSlots' | 'toolSlots', slotIdx: number) => {
        if (!selectedItem) return;

        // Check type compatibility
        if (slotType === 'unitSlots' && !ALL_UNITS.includes(selectedItem.id)) return;
        if (slotType === 'toolSlots' && !ALL_TOOLS.includes(selectedItem.id)) return;

        setWaves(prev => {
            // Deep clone to safely mutate
            const next = JSON.parse(JSON.stringify(prev));
            const slot = next[waveIdx].lanes[lane][slotType][slotIdx];

            const currentGlobalUsed = usedTotals[selectedItem.id] || 0;
            const totalAvailable = selectedItem.type === 'unit'
                ? (availableUnits[selectedItem.id] || 0)
                : (availableTools[selectedItem.id] || 0);

            const remainingGlobal = Math.max(0, totalAvailable - currentGlobalUsed);

            if (slot.itemId === selectedItem.id) {
                // Adding to existing slot
                const spaceInSlot = SLOT_CAPACITY - slot.count;
                const maxAddable = Math.min(spaceInSlot, remainingGlobal);

                // Determine how much to add
                let amountToAdd = 0;
                if (placementAmount === 'max') {
                    amountToAdd = maxAddable;
                } else {
                    amountToAdd = Math.min(placementAmount, maxAddable);
                }

                if (amountToAdd > 0) {
                    slot.count += amountToAdd;
                }
            } else {
                // Replacing content or filling empty
                // Start fresh
                const amountToFill = placementAmount === 'max'
                    ? Math.min(SLOT_CAPACITY, remainingGlobal)
                    : Math.min(placementAmount, SLOT_CAPACITY, remainingGlobal);

                if (amountToFill > 0) {
                    slot.itemId = selectedItem.id;
                    slot.count = amountToFill;
                }
            }
            return next;
        });
    };

    const clearSlot = (waveIdx: number, lane: Lane, slotType: 'unitSlots' | 'toolSlots', slotIdx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setWaves(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const slot = next[waveIdx].lanes[lane][slotType][slotIdx];
            slot.itemId = null;
            slot.count = 0;
            return next;
        });
    };

    const handleLaunch = () => {
        // 1. Compile Final Units Total (Soldiers Only)
        const finalSoldierUnits: Record<string, number> = {};
        Object.keys(usedTotals).forEach(k => {
            if (ALL_UNITS.includes(k)) {
                finalSoldierUnits[k] = usedTotals[k];
            }
        });

        // 2. Compile Lane Assignments JSON
        const laneAssignments: any = { left: [], front: [], right: [] };

        waves.forEach(w => {
            ['left', 'front', 'right'].forEach((l: any) => {
                const laneKey = l as Lane;
                const laneData = w.lanes[laneKey];

                const units: Record<string, number> = {};
                laneData.unitSlots.forEach(s => {
                    if (s.itemId && s.count > 0) units[s.itemId] = (units[s.itemId] || 0) + s.count;
                });

                const tools: Record<string, number> = {};
                laneData.toolSlots.forEach(s => {
                    if (s.itemId && s.count > 0) tools[s.itemId] = (tools[s.itemId] || 0) + s.count;
                });

                laneAssignments[laneKey].push({ units, tools });
            });
        });

        onCommit(finalSoldierUnits, laneAssignments, admiral?.id);
    };

    return (
        <div className="attack-planner">
            <div className="ap-header">
                <div className="ap-header-left">
                    <h2>Orbital Assault Planning</h2>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div className="target-info">
                            Target: <strong>{toPlanet.name}</strong>
                            {toPlanet.isNpc && (
                                <div className="npc-stability-container" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '10px', gap: '8px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#888' }}>STABILITY:</span>
                                    <div className="stability-bar-bg" style={{ width: '60px', height: '6px', background: '#222', borderRadius: '3px', position: 'relative', overflow: 'hidden', border: '1px solid #444' }}>
                                        <div 
                                            className="stability-bar-fill" 
                                            style={{ 
                                                width: `${Math.max(0, 100 - ((toPlanet.attackCount || 0) / (toPlanet.maxAttacks || 15) * 100))}%`, 
                                                height: '100%', 
                                                background: (toPlanet.attackCount || 0) / (toPlanet.maxAttacks || 15) > 0.7 ? '#ff4d4d' : '#00ff88',
                                                transition: 'width 0.3s ease'
                                            }} 
                                        />
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#00f3ff' }}>{Math.max(0, (toPlanet.maxAttacks || 15) - (toPlanet.attackCount || 0))} Hits Left</span>
                                </div>
                            )}
                            {toPlanet.isNpc && <span className="npc-tag"> (Sector {toPlanet.x},{toPlanet.y})</span>}
                        </div>
                        <div className="triangle-legend-mini" style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0,243,255,0.2)' }}>
                            <span>🎯 &gt; 🗡️</span>
                            <span>🗡️ &gt; 🤖</span>
                            <span>🤖 &gt; 🎯</span>
                        </div>
                    </div>
                </div>
                <div className="ap-header-right">
                    <div className="admiral-selector-ap">
                        <label>Admiral:</label>
                        <div className="admiral-dropdown-container" ref={dropdownRef}>
                        <button 
                            className={`admiral-dropdown-btn ${admiral?.stationedPlanetId ? 'busy' : ''}`}
                            onClick={() => setShowAdmiralDropdown(!showAdmiralDropdown)}
                        >
                            {admiral ? (
                                <>
                                    <span className="admiral-name">{admiral.name}</span>
                                    {admiral.stationedPlanetId ? (
                                        <span className="admiral-status-busy">(STATIONED FOR DEFENSE)</span>
                                    ) : (
                                        <span className="admiral-bonus">
                                            {admiral.meleeStrengthBonus > 0 && `+${admiral.meleeStrengthBonus}% M`}
                                            {admiral.rangedStrengthBonus > 0 && ` / +${admiral.rangedStrengthBonus}% R`}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span className="no-admiral-text">None Selected</span>
                            )}
                            <span className="dropdown-arrow">▼</span>
                        </button>
                        {showAdmiralDropdown && (
                            <div className="admiral-dropdown-menu">
                                {loadingAdmiral ? (
                                    <div className="dropdown-item">Loading...</div>
                                ) : admiral ? (
                                    <>
                                    <div className={`dropdown-item ${admiral.stationedPlanetId ? 'disabled' : 'selected'}`}>
                                            <span>{admiral.name}</span>
                                            {admiral.stationedPlanetId ? (
                                                <span className="item-status-busy">BUSY</span>
                                            ) : (
                                                <span className="item-bonus">
                                                    {admiral.meleeStrengthBonus > 0 && `+${admiral.meleeStrengthBonus}% M`}
                                                    {admiral.rangedStrengthBonus > 0 && ` / +${admiral.rangedStrengthBonus}% R`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="dropdown-item" onClick={() => { setAdmiral(null); setShowAdmiralDropdown(false); }}>
                                            <span>None</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="dropdown-item" onClick={loadAdmiral}>
                                        <span>Load Admiral</span>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                    <button className="close-ap" onClick={onCancel}>×</button>
                </div>
            </div>

            <div className="ap-body">
                {/* Left: Interactive Visual + Wave Grid */}
                <div className="ap-main-col">

                    <div className="sector-visuals">
                        <div className="sector-vis left">Industrial (Left)</div>
                        <div className="sector-vis center">Central Docking Hub</div>
                        <div className="sector-vis right">Military (Right)</div>
                    </div>

                    <div className="wave-grid-scroll">
                        {waves.map((wave, wIdx) => (
                            <div key={wave.id} className="wave-row">
                                <div className="wave-label">Wave {wave.id}</div>

                                {['left', 'front', 'right'].map((l) => {
                                    const lane = l as Lane;
                                    const ld = wave.lanes[lane];

                                    return (
                                        <div key={l} className={`sector-block ${lane}`}>
                                            {/* Units */}
                                            <div className="slots-row">
                                                {ld.unitSlots.map((slot, sIdx) => (
                                                    <div
                                                        key={slot.id}
                                                        className={`ap-slot unit ${slot.itemId ? 'filled' : ''}`}
                                                        onClick={() => handleSlotClick(wIdx, lane, 'unitSlots', sIdx)}
                                                        title={slot.itemId ? `${slot.itemId.replace('_', ' ').toUpperCase()} (${getUnitClass(slot.itemId).toUpperCase()})` : 'Empty Slot'}
                                                    >
                                                        {slot.itemId ? (
                                                            <>
                                                                <div className="slot-image-wrapper" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <img 
                                                                        src={UNIT_ICONS[slot.itemId]} 
                                                                        alt={slot.itemId} 
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                                            const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                                                            if (fallback) (fallback as HTMLElement).style.display = 'block';
                                                                        }}
                                                                    />
                                                                    <div className="unit-fallback-emoji" style={{ display: 'none', fontSize: '1.2rem' }}>
                                                                        {getClassIcon(getUnitClass(slot.itemId))}
                                                                    </div>
                                                                </div>
                                                                <div className="slot-unit-name" style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '8px', background: 'rgba(0,0,0,0.7)', padding: '1px 3px', borderRadius: '2px', pointerEvents: 'none', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {slot.itemId.split('_')[0]}
                                                                </div>
                                                                <span className="count">{slot.count}</span>
                                                                <div className="slot-remove" onClick={(e) => clearSlot(wIdx, lane, 'unitSlots', sIdx, e)}>×</div>
                                                            </>
                                                        ) : <span className="empty">+</span>}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Tools - smaller row */}
                                            <div className="slots-row tools">
                                                {ld.toolSlots.map((slot, sIdx) => (
                                                    <div
                                                        key={slot.id}
                                                        className={`ap-slot tool ${slot.itemId ? 'filled' : ''}`}
                                                        onClick={() => handleSlotClick(wIdx, lane, 'toolSlots', sIdx)}
                                                        title={slot.itemId ? slot.itemId.replace('_', ' ').toUpperCase() : 'Empty Tool Slot'}
                                                    >
                                                        {slot.itemId ? (
                                                            <>
                                                                <div className="slot-image-wrapper" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <img 
                                                                        src={TOOL_ICONS[slot.itemId]} 
                                                                        alt={slot.itemId} 
                                                                        style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                                            const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                                                            if (fallback) (fallback as HTMLElement).style.display = 'block';
                                                                        }}
                                                                    />
                                                                    <div className="tool-fallback-emoji" style={{ display: 'none', fontSize: '1rem' }}>
                                                                        🛠️
                                                                    </div>
                                                                </div>
                                                                <span className="count">{slot.count}</span>
                                                                <div className="slot-remove" onClick={(e) => clearSlot(wIdx, lane, 'toolSlots', sIdx, e)}>×</div>
                                                            </>
                                                        ) : <span className="empty-tool">T</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Palettes */}
                <div className="ap-sidebar">

                    <div className="amount-slider">
                        <h4>Troops per Click</h4>
                        <div className="slider-controls">
                            {[1, 10, 50].map(amt => (
                                <button
                                    key={amt}
                                    className={placementAmount === amt ? 'active' : ''}
                                    onClick={() => setPlacementAmount(amt)}
                                >
                                    {amt}
                                </button>
                            ))}
                            <button
                                className={placementAmount === 'max' ? 'active' : ''}
                                onClick={() => setPlacementAmount('max')}
                            >
                                Max
                            </button>
                        </div>
                    </div>

                    <div className="palette-section">
                        <h3>Units</h3>
                        <div className="palette-grid">
                            {ALL_UNITS.map(u => {
                                const avail = availableUnits[u] || 0;
                                const used = usedTotals[u] || 0;
                                const remaining = Math.max(0, avail - used);

                                return (
                                    <div
                                        key={u}
                                        className={`palette-item unit ${selectedItem?.id === u ? 'selected' : ''} ${remaining <= 0 ? 'disabled' : ''}`}
                                        onClick={() => remaining > 0 && setSelectedItem({ type: 'unit', id: u })}
                                        title={`${u.replace('_', ' ').toUpperCase()} (${getUnitClass(u).toUpperCase()}) - Strong vs ${getClassAdvantage(getUnitClass(u))}`}
                                    >
                                        <div className="unit-icon-wrapper" style={{ position: 'relative', width: '40px', height: '40px', marginBottom: '0.5rem' }}>
                                            <img 
                                                src={UNIT_ICONS[u]} 
                                                alt={u} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} 
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    const parent = (e.target as HTMLImageElement).parentElement;
                                                    if (parent) parent.textContent = getClassIcon(getUnitClass(u));
                                                }}
                                            />
                                            <span className="class-tag" style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#000', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyCenter: 'center', border: '1px solid #00f3ff' }}>
                                                {getClassIcon(getUnitClass(u))}
                                            </span>
                                        </div>
                                        <div className="p-info">
                                            <div className="p-name" style={{ fontSize: '0.7rem' }}>{u.replace('_', ' ')}</div>
                                            <div className="p-count">{remaining}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="palette-section">
                        <h3>Tactical Modules</h3>
                        <div className="palette-grid">
                            {ALL_TOOLS.map(t => {
                                const avail = availableTools[t] || 0;
                                const used = usedTotals[t] || 0;
                                const remaining = Math.max(0, avail - used);

                                return (
                                    <div
                                        key={t}
                                        className={`palette-item ${selectedItem?.id === t ? 'selected' : ''} ${remaining <= 0 ? 'disabled' : ''}`}
                                        onClick={() => remaining > 0 && setSelectedItem({ type: 'tool', id: t })}
                                    >
                                        <img 
                                            src={TOOL_ICONS[t]} 
                                            alt={t} 
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                const parent = (e.target as HTMLImageElement).parentElement;
                                                if (parent) parent.textContent = '🛠️';
                                            }}
                                        />
                                        <div className="p-info">
                                            <div className="p-name">{t.replace('_', ' ')}</div>
                                            <div className="p-count">{remaining}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="ap-footer">
                        <button 
                            className="attack-btn" 
                            onClick={handleLaunch}
                            disabled={!!admiral?.stationedPlanetId}
                            title={admiral?.stationedPlanetId ? 'Admiral is stationed for defense' : ''}
                        >
                            {admiral?.stationedPlanetId ? 'ADMIRAL BUSY' : 'INITIATE ASSAULT'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
