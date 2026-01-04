import { useState, useMemo } from 'react';
import { type Planet } from '../lib/api';
import './AttackPlanner.css';

// Importing SVG placeholders directly as image sources
import iconMarine from '../assets/placeholders/marine.svg';
import iconRanger from '../assets/placeholders/ranger.svg';
import iconSentinel from '../assets/placeholders/sentinel.svg';
import iconInterceptor from '../assets/placeholders/interceptor.svg';
import iconJammer from '../assets/placeholders/shield_jammer.svg';
import iconBreach from '../assets/placeholders/hangar_breach.svg';
import iconECM from '../assets/placeholders/ecm_pod.svg';

interface AttackPlannerProps {
    fromPlanet: Planet;
    toPlanet: Planet;
    availableUnits: Record<string, number>;
    onCommit: (
        finalUnits: Record<string, number>,
        laneAssignments: any
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
    marine: iconMarine,
    ranger: iconRanger,
    sentinel: iconSentinel,
    interceptor: iconInterceptor,
};

const TOOL_ICONS: Record<string, string> = {
    signal_jammer: iconJammer,
    breach_cutter: iconBreach,
    holo_decoy: iconECM,
};

const ALL_UNITS = ['marine', 'ranger', 'sentinel', 'interceptor'];
const ALL_TOOLS = ['signal_jammer', 'breach_cutter', 'holo_decoy'];

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

        onCommit(finalSoldierUnits, laneAssignments);
    };

    return (
        <div className="attack-planner">
            <div className="ap-header">
                <h2>Orbital Assault Planning</h2>
                <div className="target-info">
                    Target: <strong>{toPlanet.name}</strong>
                    {toPlanet.isNpc && <span className="npc-tag"> (Sector {toPlanet.x},{toPlanet.y})</span>}
                </div>
                <button className="close-ap" onClick={onCancel}>×</button>
            </div>

            <div className="ap-body">
                {/* Left: Interactive Visual + Wave Grid */}
                <div className="ap-main-col">

                    <div className="sector-visuals">
                        <div className="sector-vis left">Industrial (Left)</div>
                        <div className="sector-vis center">Starport (Gate)</div>
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
                                                    >
                                                        {slot.itemId ? (
                                                            <>
                                                                <img src={UNIT_ICONS[slot.itemId]} alt={slot.itemId} />
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
                                                    >
                                                        {slot.itemId ? (
                                                            <>
                                                                <img src={TOOL_ICONS[slot.itemId]} alt={slot.itemId} />
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
                                        className={`palette-item ${selectedItem?.id === u ? 'selected' : ''} ${remaining <= 0 ? 'disabled' : ''}`}
                                        onClick={() => remaining > 0 && setSelectedItem({ type: 'unit', id: u })}
                                    >
                                        <img src={UNIT_ICONS[u]} alt={u} />
                                        <div className="p-info">
                                            <div className="p-name">{u}</div>
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
                                        <img src={TOOL_ICONS[t]} alt={t} />
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
                        <button className="attack-btn" onClick={handleLaunch}>INITIATE ASSAULT</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
