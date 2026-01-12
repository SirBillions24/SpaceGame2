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
        admiralId?: string,
        resourceTransfer?: { carbon?: number; titanium?: number; food?: number }
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
    sniper: '/assets/units/sniper.png',
    guardian: '/assets/units/guardian.png',
    commando: '/assets/units/commando.png',
    drone: '/assets/units/drone.png',
    automaton: '/assets/units/automaton.png',
    sentinel: '/assets/units/sentinel.png',
    interceptor: '/assets/units/interceptor.png',
    stalker: '/assets/units/stalker.png',
    spitter: '/assets/units/spitter.png',
    brute: '/assets/units/brute.png',
    ravager: '/assets/units/ravager.png',
};

const getFactionIcon = (faction: string) => {
    switch (faction) {
        case 'human': return '👤';
        case 'mech': return '🤖';
        case 'exo': return '👽';
        default: return '❓';
    }
};

const getUnitFaction = (unitId: string) => {
    const mapping: Record<string, string> = {
        marine: 'human',
        sniper: 'human',
        guardian: 'human',
        commando: 'human',
        drone: 'mech',
        automaton: 'mech',
        sentinel: 'mech',
        interceptor: 'mech',
        stalker: 'exo',
        spitter: 'exo',
        brute: 'exo',
        ravager: 'exo',
    };
    return mapping[unitId] || 'human';
};

const getFactionAdvantage = (faction: string) => {
    switch (faction) {
        case 'human': return 'Mech';
        case 'mech': return 'Exo';
        case 'exo': return 'Human';
        default: return '';
    }
};

const TOOL_ICONS: Record<string, string> = {
    invasion_anchors: iconJammer,
    plasma_breachers: iconBreach,
    stealth_field_pods: iconECM,
};

const ALL_UNITS = ['marine', 'sniper', 'guardian', 'commando', 'drone', 'automaton', 'sentinel', 'interceptor', 'stalker', 'spitter', 'brute', 'ravager'];
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

    // Admiral types
    type AdmiralData = {
        id: string;
        name: string;
        meleeStrengthBonus: number;
        rangedStrengthBonus: number;
        canopyReductionBonus: number;
        stationedPlanetId?: string | null;
        isOnMission?: boolean;
        isBusy?: boolean;
    };

    // Selected admiral (null = None selected)
    const [selectedAdmiral, setSelectedAdmiral] = useState<AdmiralData | null>(null);
    // All admirals for dropdown display (includes busy ones)
    const [allAdmirals, setAllAdmirals] = useState<AdmiralData[]>([]);
    const [loadingAdmiral, setLoadingAdmiral] = useState(false);
    const [showAdmiralDropdown, setShowAdmiralDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // State for defense borrowing warning
    const [borrowedFromDefense, setBorrowedFromDefense] = useState<Record<string, Record<string, number>>>({ front: {}, left: {}, right: {} });
    const [hasBorrowedTroops, setHasBorrowedTroops] = useState(false);

    // Resource Transfer State (for transfers to owned planets)
    const [resourceTransfer, setResourceTransfer] = useState<{ carbon: number; titanium: number; food: number }>({ carbon: 0, titanium: 0, food: 0 });
    const [unitData, setUnitData] = useState<Record<string, { capacity?: number }>>({});
    // Track which resources have been MAX'd (in order) for smart even allocation
    const [maxedResources, setMaxedResources] = useState<('carbon' | 'titanium' | 'food')[]>([]);
    // Simple unit transfer state (for transfers to owned planets - no waves/lanes)
    const [transferUnits, setTransferUnits] = useState<Record<string, number>>({});
    const MAX_TRANSFER_UNITS = 3600; // Same as max attack capacity (12 slots × 3 lanes × 100 per slot)

    // Determine if target is owned by the player (compare fromPlanet and toPlanet owners)
    // Use useMemo to stabilize this value and prevent flickering during re-renders
    const isOwnedTarget = useMemo(() => {
        return Boolean(fromPlanet.ownerId && toPlanet.ownerId && fromPlanet.ownerId === toPlanet.ownerId);
    }, [fromPlanet.ownerId, toPlanet.ownerId]);

    // Total units selected for transfer
    const transferUnitTotal = Object.values(transferUnits).reduce((a, b) => a + b, 0);

    // Load unit data for capacity calculation
    useEffect(() => {
        api.getUnitTypes().then(data => {
            setUnitData(data.units || {});
        }).catch(console.error);
    }, []);

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

            // Check if admiral is already on an active mission
            const fleetsResponse = await api.getFleets();
            const activeFleets = fleetsResponse.fleets || [];
            const admiralOnMission = activeFleets.some(
                (f: any) => f.admiralId === admiralData.id && ['enroute', 'returning'].includes(f.status)
            );
            const isStationedForDefense = !!admiralData.stationedPlanetId;
            const isBusy = admiralOnMission || isStationedForDefense;

            // Store admiral data with busy status
            const admiralWithStatus: AdmiralData = {
                ...admiralData,
                isOnMission: admiralOnMission,
                isBusy
            };

            // Add to dropdown list
            setAllAdmirals([admiralWithStatus]);

            // Only pre-select if NOT busy
            if (!isBusy) {
                setSelectedAdmiral(admiralWithStatus);
            } else {
                setSelectedAdmiral(null); // Default to None
            }
        } catch (err) {
            // Admiral might not exist yet, that's okay
            setSelectedAdmiral(null);
            setAllAdmirals([]);
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

    // Calculate total carry capacity based on assigned units
    const carryCapacity = useMemo(() => {
        let total = 0;
        for (const [unitType, count] of Object.entries(usedTotals)) {
            if (ALL_UNITS.includes(unitType) && unitData[unitType]) {
                total += (unitData[unitType].capacity || 0) * count;
            }
        }
        return total;
    }, [usedTotals, unitData]);

    // Total resources currently allocated for transfer
    const transferTotal = resourceTransfer.carbon + resourceTransfer.titanium + resourceTransfer.food;

    // Fetch defense borrowing preview when unit allocations change
    useEffect(() => {
        const unitTotals: Record<string, number> = {};
        ALL_UNITS.forEach(u => {
            if (usedTotals[u] && usedTotals[u] > 0) {
                unitTotals[u] = usedTotals[u];
            }
        });

        if (Object.keys(unitTotals).length === 0) {
            setBorrowedFromDefense({ front: {}, left: {}, right: {} });
            setHasBorrowedTroops(false);
            return;
        }

        // Debounce the API call
        const timeoutId = setTimeout(async () => {
            try {
                const result = await api.previewDefenseBorrowing(fromPlanet.id, unitTotals);
                setBorrowedFromDefense(result.borrowedFromDefense);
                setHasBorrowedTroops(result.hasBorrowedTroops);
            } catch (err) {
                console.error('Failed to preview defense borrowing:', err);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [usedTotals, fromPlanet.id]);

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

        // Only include admiral if one is selected (selectedAdmiral is already available)
        // Include resource transfer only if sending to owned planet and has resources to transfer
        const transferData = isOwnedTarget && transferTotal > 0 ? resourceTransfer : undefined;
        onCommit(finalSoldierUnits, laneAssignments, selectedAdmiral?.id, transferData);
    };

    // Simplified transfer launch (for friendly transfers - no lanes/waves)
    const handleTransferLaunch = () => {
        // Filter out zero entries
        const finalUnits: Record<string, number> = {};
        Object.entries(transferUnits).forEach(([u, c]) => {
            if (c > 0) finalUnits[u] = c;
        });

        // Validate at least one unit
        const totalUnits = Object.values(finalUnits).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) {
            console.warn('[Transfer] No units selected, aborting transfer');
            return;
        }

        // For transfers, we don't use lane assignments - just send all to front
        const laneAssignments = {
            left: [{ units: {}, tools: {} }],
            front: [{ units: finalUnits, tools: {} }],
            right: [{ units: {}, tools: {} }]
        };

        // Include resource transfer if any
        const transferData = transferTotal > 0 ? resourceTransfer : undefined;
        onCommit(finalUnits, laneAssignments, selectedAdmiral?.id, transferData);
    };

    // Simplified Transfer UI for friendly planets
    if (isOwnedTarget) {
        // Calculate carry capacity for resource transfers based on selected transfer units
        const transferCarryCapacity = Object.entries(transferUnits).reduce((total, [unitType, count]) => {
            return total + (unitData[unitType]?.capacity || 0) * count;
        }, 0);

        return (
            <div className="attack-planner" style={{ maxWidth: '900px' }}>
                <div className="ap-header">
                    <div className="ap-header-left">
                        <h2 style={{ color: '#00f3ff' }}>Fleet Transfer Planning</h2>
                        <div className="target-info">
                            Destination: <strong>{toPlanet.name}</strong>
                            <span style={{ marginLeft: '10px', color: '#00ff88', fontSize: '0.85rem' }}>
                                📦 Friendly Transfer
                            </span>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onCancel}>✕</button>
                </div>

                <div className="ap-main" style={{ flexDirection: 'column', gap: '12px', padding: '12px' }}>
                    {/* Unit Transfer Limit */}
                    <div style={{ background: 'rgba(0, 243, 255, 0.05)', border: '1px solid rgba(0, 243, 255, 0.3)', borderRadius: '6px', padding: '10px' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#00f3ff', fontSize: '1rem' }}>
                            🎖️ Troops to Transfer
                            <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal', marginLeft: '10px' }}>
                                ({transferUnitTotal.toLocaleString()} / {MAX_TRANSFER_UNITS.toLocaleString()})
                            </span>
                        </h3>

                        {/* Capacity Bar */}
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden', border: '1px solid #444' }}>
                                <div style={{
                                    width: `${Math.min(100, (transferUnitTotal / MAX_TRANSFER_UNITS) * 100)}%`,
                                    height: '100%',
                                    background: transferUnitTotal > MAX_TRANSFER_UNITS ? '#ff4d4d' : '#00f3ff',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        </div>

                        {/* Unit Grid - 4 columns for compactness */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                            {ALL_UNITS.map(unitType => {
                                const available = availableUnits[unitType] || 0;
                                const selected = transferUnits[unitType] || 0;
                                const remaining = available - selected;
                                const faction = getUnitFaction(unitType);

                                return (
                                    <div key={unitType} style={{
                                        background: 'rgba(0,0,0,0.3)',
                                        border: selected > 0 ? '1px solid rgba(0, 243, 255, 0.5)' : '1px solid #333',
                                        borderRadius: '4px',
                                        padding: '8px',
                                        opacity: available === 0 ? 0.5 : 1
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', textTransform: 'capitalize', fontSize: '0.8rem' }}>
                                                    {unitType.replace('_', ' ')}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#888' }}>
                                                    {faction.toUpperCase()} • Avail: {remaining}
                                                </div>
                                            </div>
                                            {selected > 0 && (
                                                <span style={{ color: '#00f3ff', fontWeight: 'bold', fontSize: '0.95rem' }}>{selected}</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                                            <button
                                                onClick={() => setTransferUnits(prev => ({ ...prev, [unitType]: Math.max(0, (prev[unitType] || 0) - 10) }))}
                                                disabled={selected === 0}
                                                style={{ flex: '1', background: '#333', border: '1px solid #444', color: '#fff', padding: '4px 0', borderRadius: '3px', cursor: selected > 0 ? 'pointer' : 'not-allowed', fontSize: '0.75rem' }}
                                            >-10</button>
                                            <input
                                                type="number"
                                                min={0}
                                                max={Math.min(available, MAX_TRANSFER_UNITS - transferUnitTotal + selected)}
                                                value={selected}
                                                onChange={(e) => {
                                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                                    const maxAllowed = Math.min(available, MAX_TRANSFER_UNITS - transferUnitTotal + selected);
                                                    setTransferUnits(prev => ({ ...prev, [unitType]: Math.min(val, maxAllowed) }));
                                                }}
                                                style={{ width: '40px', background: '#1a1a2e', border: '1px solid #444', borderRadius: '3px', padding: '4px 2px', color: '#fff', textAlign: 'center', fontSize: '0.8rem' }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const maxAdd = Math.min(remaining, MAX_TRANSFER_UNITS - transferUnitTotal, 10);
                                                    setTransferUnits(prev => ({ ...prev, [unitType]: (prev[unitType] || 0) + maxAdd }));
                                                }}
                                                disabled={remaining === 0 || transferUnitTotal >= MAX_TRANSFER_UNITS}
                                                style={{ flex: '1', background: '#333', border: '1px solid #444', color: '#fff', padding: '4px 0', borderRadius: '3px', cursor: remaining > 0 && transferUnitTotal < MAX_TRANSFER_UNITS ? 'pointer' : 'not-allowed', fontSize: '0.75rem' }}
                                            >+10</button>
                                            <button
                                                onClick={() => {
                                                    const maxAdd = Math.min(remaining, MAX_TRANSFER_UNITS - transferUnitTotal);
                                                    setTransferUnits(prev => ({ ...prev, [unitType]: (prev[unitType] || 0) + maxAdd }));
                                                }}
                                                disabled={remaining === 0 || transferUnitTotal >= MAX_TRANSFER_UNITS}
                                                style={{ flex: '1', background: 'rgba(0, 243, 255, 0.2)', border: '1px solid rgba(0, 243, 255, 0.3)', color: '#00f3ff', padding: '4px 0', borderRadius: '3px', cursor: remaining > 0 && transferUnitTotal < MAX_TRANSFER_UNITS ? 'pointer' : 'not-allowed', fontSize: '0.7rem', fontWeight: 'bold' }}
                                            >MAX</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Resource Transfer Section */}
                    <div style={{ background: 'rgba(0, 243, 255, 0.05)', border: '1px solid rgba(0, 243, 255, 0.3)', borderRadius: '8px', padding: '15px' }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#00f3ff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📦 Resource Transfer
                            <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>
                                (Capacity: {transferTotal.toLocaleString()} / {transferCarryCapacity.toLocaleString()})
                            </span>
                        </h3>

                        {/* Multi-Color Capacity Bar */}
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ height: '12px', background: '#222', borderRadius: '4px', overflow: 'hidden', border: '1px solid #444', display: 'flex' }}>
                                {resourceTransfer.carbon > 0 && transferCarryCapacity > 0 && (
                                    <div style={{ width: `${(resourceTransfer.carbon / transferCarryCapacity) * 100}%`, height: '100%', background: '#5d4037', transition: 'width 0.3s ease' }} />
                                )}
                                {resourceTransfer.titanium > 0 && transferCarryCapacity > 0 && (
                                    <div style={{ width: `${(resourceTransfer.titanium / transferCarryCapacity) * 100}%`, height: '100%', background: '#90a4ae', transition: 'width 0.3s ease' }} />
                                )}
                                {resourceTransfer.food > 0 && transferCarryCapacity > 0 && (
                                    <div style={{ width: `${(resourceTransfer.food / transferCarryCapacity) * 100}%`, height: '100%', background: '#81c784', transition: 'width 0.3s ease' }} />
                                )}
                            </div>
                        </div>

                        {transferCarryCapacity === 0 ? (
                            <div style={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                Select troops above to enable resource transfer (capacity based on unit carry capacity)
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                {(['carbon', 'titanium', 'food'] as const).map(resource => {
                                    const available = fromPlanet.resources?.[resource] || 0;
                                    const icons = { carbon: '💎', titanium: '🔩', food: '🌽' };
                                    const colors = { carbon: '#8d6e63', titanium: '#90a4ae', food: '#81c784' };
                                    const isMaxed = maxedResources.includes(resource);

                                    return (
                                        <div key={resource} style={{ flex: '1', minWidth: '150px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.85rem', color: colors[resource] }}>
                                                <span>{icons[resource]}</span>
                                                {resource.charAt(0).toUpperCase() + resource.slice(1)}
                                                <span style={{ color: '#666', fontSize: '0.75rem' }}>(max: {Math.floor(available).toLocaleString()})</span>
                                                {isMaxed && <span style={{ color: '#00f3ff', fontSize: '0.65rem' }}>●</span>}
                                            </label>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={resourceTransfer[resource]}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                                        const maxAllowed = Math.min(available, transferCarryCapacity - (transferTotal - resourceTransfer[resource]));
                                                        setResourceTransfer(prev => ({ ...prev, [resource]: Math.min(val, maxAllowed) }));
                                                        // Remove from maxed if manually edited
                                                        setMaxedResources(prev => prev.filter(r => r !== resource));
                                                    }}
                                                    style={{ flex: 1, background: '#1a1a2e', border: isMaxed ? '1px solid rgba(0, 243, 255, 0.6)' : '1px solid rgba(0, 243, 255, 0.3)', borderRadius: '4px', padding: '6px 8px', color: '#fff', fontSize: '0.9rem' }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        // Smart MAX: add this resource to maxed list and redistribute evenly
                                                        const newMaxed = maxedResources.includes(resource)
                                                            ? maxedResources
                                                            : [...maxedResources, resource];
                                                        setMaxedResources(newMaxed);

                                                        // Calculate available amounts for each maxed resource
                                                        const availables: Record<string, number> = {
                                                            carbon: fromPlanet.resources?.carbon || 0,
                                                            titanium: fromPlanet.resources?.titanium || 0,
                                                            food: fromPlanet.resources?.food || 0
                                                        };

                                                        // Even split across maxed resources, capped by availability
                                                        const perResource = Math.floor(transferCarryCapacity / newMaxed.length);
                                                        const newTransfer = { carbon: 0, titanium: 0, food: 0 };
                                                        let remainingCapacity = transferCarryCapacity;

                                                        // First pass: allocate even amounts up to availability
                                                        newMaxed.forEach(res => {
                                                            const amount = Math.min(perResource, Math.floor(availables[res]), remainingCapacity);
                                                            newTransfer[res] = amount;
                                                            remainingCapacity -= amount;
                                                        });

                                                        // Second pass: distribute remaining capacity
                                                        if (remainingCapacity > 0) {
                                                            for (const res of newMaxed) {
                                                                const canAdd = Math.min(remainingCapacity, Math.floor(availables[res]) - newTransfer[res]);
                                                                newTransfer[res] += canAdd;
                                                                remainingCapacity -= canAdd;
                                                                if (remainingCapacity <= 0) break;
                                                            }
                                                        }

                                                        setResourceTransfer(newTransfer);
                                                    }}
                                                    style={{ background: isMaxed ? 'rgba(0, 243, 255, 0.4)' : 'rgba(0, 243, 255, 0.2)', border: '1px solid rgba(0, 243, 255, 0.3)', borderRadius: '4px', padding: '4px 8px', color: '#00f3ff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: isMaxed ? 'bold' : 'normal' }}
                                                >MAX</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
                        <button
                            onClick={onCancel}
                            style={{ background: '#333', border: '1px solid #444', color: '#888', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleTransferLaunch}
                            disabled={transferUnitTotal === 0}
                            style={{
                                background: transferUnitTotal > 0 ? 'linear-gradient(135deg, #00f3ff, #0088ff)' : '#333',
                                border: 'none',
                                color: transferUnitTotal > 0 ? '#000' : '#666',
                                padding: '12px 30px',
                                borderRadius: '6px',
                                cursor: transferUnitTotal > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold',
                                fontSize: '1rem'
                            }}
                        >
                            INITIATE TRANSFER
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="attack-planner">
            <div className="ap-header">
                <div className="ap-header-left">
                    <h2>Orbital Assault Planning</h2>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div className="target-info">
                            Target: <strong>{toPlanet.name}</strong>
                            {/* Harvesters are permanent - no respawn/hits display */}
                            {(toPlanet as any).planetType === 'harvester' && (
                                <span className="harvester-badge" style={{ marginLeft: '10px', background: 'linear-gradient(135deg, #6a0dad, #9b59b6)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', color: 'white' }}>
                                    🌀 HARVESTER (Conquest Target)
                                </span>
                            )}
                            {/* Regular NPCs show stability/hits remaining */}
                            {toPlanet.isNpc && (toPlanet as any).planetType !== 'harvester' && (
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
                            {toPlanet.isNpc && (toPlanet as any).planetType !== 'harvester' && <span className="npc-tag"> (Sector {toPlanet.x},{toPlanet.y})</span>}
                        </div>
                        <div className="triangle-legend-mini" style={{ display: 'flex', gap: '10px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0,243,255,0.2)' }}>
                            <span>👤 &gt; 🤖</span>
                            <span>🤖 &gt; 👽</span>
                            <span>👽 &gt; 👤</span>
                        </div>
                    </div>
                </div>
                <div className="ap-header-right">
                    <div className="admiral-selector-ap">
                        <label>Admiral:</label>
                        <div className="admiral-dropdown-container" ref={dropdownRef}>
                            <button
                                className="admiral-dropdown-btn"
                                onClick={() => setShowAdmiralDropdown(!showAdmiralDropdown)}
                            >
                                {selectedAdmiral ? (
                                    <>
                                        <span className="admiral-name">{selectedAdmiral.name}</span>
                                        <span className="admiral-bonus">
                                            {selectedAdmiral.meleeStrengthBonus > 0 && `+${selectedAdmiral.meleeStrengthBonus}% M`}
                                            {selectedAdmiral.rangedStrengthBonus > 0 && ` / +${selectedAdmiral.rangedStrengthBonus}% R`}
                                        </span>
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
                                    ) : (
                                        <>
                                            {/* None option */}
                                            <div
                                                className={`dropdown-item ${!selectedAdmiral ? 'selected' : ''}`}
                                                onClick={() => { setSelectedAdmiral(null); setShowAdmiralDropdown(false); }}
                                            >
                                                <span>None</span>
                                            </div>
                                            {/* Available admirals */}
                                            {allAdmirals.map((adm) => (
                                                <div
                                                    key={adm.id}
                                                    className={`dropdown-item ${adm.isBusy ? 'disabled' : ''} ${selectedAdmiral?.id === adm.id ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        if (!adm.isBusy) {
                                                            setSelectedAdmiral(adm);
                                                            setShowAdmiralDropdown(false);
                                                        }
                                                    }}
                                                >
                                                    <span>{adm.name}</span>
                                                    {adm.stationedPlanetId ? (
                                                        <span className="item-status-busy">STATIONED</span>
                                                    ) : adm.isOnMission ? (
                                                        <span className="item-status-busy">ON MISSION</span>
                                                    ) : (
                                                        <span className="item-bonus">
                                                            {adm.meleeStrengthBonus > 0 && `+${adm.meleeStrengthBonus}% M`}
                                                            {adm.rangedStrengthBonus > 0 && ` / +${adm.rangedStrengthBonus}% R`}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </>
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
                                                        title={slot.itemId ? `${slot.itemId.replace('_', ' ').toUpperCase()} (${getUnitFaction(slot.itemId).toUpperCase()})` : 'Empty Slot'}
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
                                                                        {getFactionIcon(getUnitFaction(slot.itemId))}
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

                    {/* Resource Transfer Section (only for owned targets) */}
                    {isOwnedTarget && (
                        <div className="resource-transfer-section" style={{
                            marginTop: '20px',
                            padding: '15px',
                            background: 'rgba(0, 243, 255, 0.05)',
                            border: '1px solid rgba(0, 243, 255, 0.3)',
                            borderRadius: '8px'
                        }}>
                            <h3 style={{ margin: '0 0 15px 0', color: '#00f3ff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📦 Resource Transfer
                                <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>
                                    (Capacity: {transferTotal.toLocaleString()} / {carryCapacity.toLocaleString()})
                                </span>
                            </h3>

                            {/* Multi-Color Capacity Bar (HUD colors) */}
                            <div style={{ marginBottom: '15px' }}>
                                <div style={{
                                    height: '12px',
                                    background: '#222',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    border: '1px solid #444',
                                    display: 'flex'
                                }}>
                                    {/* Carbon segment */}
                                    {resourceTransfer.carbon > 0 && (
                                        <div style={{
                                            width: `${carryCapacity > 0 ? (resourceTransfer.carbon / carryCapacity) * 100 : 0}%`,
                                            height: '100%',
                                            background: '#5d4037', // HUD carbon color
                                            transition: 'width 0.3s ease'
                                        }} title={`Carbon: ${resourceTransfer.carbon.toLocaleString()}`} />
                                    )}
                                    {/* Titanium segment */}
                                    {resourceTransfer.titanium > 0 && (
                                        <div style={{
                                            width: `${carryCapacity > 0 ? (resourceTransfer.titanium / carryCapacity) * 100 : 0}%`,
                                            height: '100%',
                                            background: '#90a4ae', // HUD titanium color
                                            transition: 'width 0.3s ease'
                                        }} title={`Titanium: ${resourceTransfer.titanium.toLocaleString()}`} />
                                    )}
                                    {/* Food segment */}
                                    {resourceTransfer.food > 0 && (
                                        <div style={{
                                            width: `${carryCapacity > 0 ? (resourceTransfer.food / carryCapacity) * 100 : 0}%`,
                                            height: '100%',
                                            background: '#81c784', // HUD food color
                                            transition: 'width 0.3s ease'
                                        }} title={`Food: ${resourceTransfer.food.toLocaleString()}`} />
                                    )}
                                </div>
                                {/* Legend */}
                                <div style={{ display: 'flex', gap: '15px', marginTop: '6px', fontSize: '0.7rem', color: '#888' }}>
                                    <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#5d4037', borderRadius: '2px', marginRight: '4px' }}></span>Carbon</span>
                                    <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#90a4ae', borderRadius: '2px', marginRight: '4px' }}></span>Titanium</span>
                                    <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#81c784', borderRadius: '2px', marginRight: '4px' }}></span>Food</span>
                                </div>
                            </div>

                            {/* Resource Inputs with Smart MAX */}
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                {(['carbon', 'titanium', 'food'] as const).map(resource => {
                                    const available = fromPlanet.resources?.[resource] || 0;
                                    const icons = { carbon: '💎', titanium: '🔩', food: '🌽' };
                                    // Match HUD colors
                                    const colors = { carbon: '#8d6e63', titanium: '#90a4ae', food: '#81c784' };
                                    const isMaxed = maxedResources.includes(resource);

                                    return (
                                        <div key={resource} style={{ flex: '1', minWidth: '150px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.85rem', color: colors[resource] }}>
                                                <span>{icons[resource]}</span>
                                                {resource.charAt(0).toUpperCase() + resource.slice(1)}
                                                <span style={{ color: '#666', fontSize: '0.75rem' }}>(max: {Math.floor(available).toLocaleString()})</span>
                                                {isMaxed && <span style={{ color: '#00f3ff', fontSize: '0.65rem' }}>●</span>}
                                            </label>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={Math.min(available, carryCapacity - (transferTotal - resourceTransfer[resource]))}
                                                    value={resourceTransfer[resource]}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                                        const maxAllowed = Math.min(available, carryCapacity - (transferTotal - resourceTransfer[resource]));
                                                        setResourceTransfer(prev => ({
                                                            ...prev,
                                                            [resource]: Math.min(val, maxAllowed)
                                                        }));
                                                        // Remove from maxed if manually edited
                                                        setMaxedResources(prev => prev.filter(r => r !== resource));
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        background: '#1a1a2e',
                                                        border: isMaxed ? '1px solid rgba(0, 243, 255, 0.6)' : '1px solid rgba(0, 243, 255, 0.3)',
                                                        borderRadius: '4px',
                                                        padding: '6px 8px',
                                                        color: '#fff',
                                                        fontSize: '0.9rem'
                                                    }}
                                                    disabled={carryCapacity === 0}
                                                />
                                                <button
                                                    onClick={() => {
                                                        // Smart MAX: add this resource to maxed list and redistribute evenly
                                                        const newMaxed = maxedResources.includes(resource)
                                                            ? maxedResources
                                                            : [...maxedResources, resource];
                                                        setMaxedResources(newMaxed);

                                                        // Calculate available amounts for each maxed resource
                                                        const availables: Record<string, number> = {
                                                            carbon: fromPlanet.resources?.carbon || 0,
                                                            titanium: fromPlanet.resources?.titanium || 0,
                                                            food: fromPlanet.resources?.food || 0
                                                        };

                                                        // Even split across maxed resources, capped by availability
                                                        const perResource = Math.floor(carryCapacity / newMaxed.length);
                                                        const newTransfer = { carbon: 0, titanium: 0, food: 0 };
                                                        let remainingCapacity = carryCapacity;

                                                        // First pass: allocate even amounts up to availability
                                                        newMaxed.forEach(res => {
                                                            const amount = Math.min(perResource, Math.floor(availables[res]), remainingCapacity);
                                                            newTransfer[res] = amount;
                                                            remainingCapacity -= amount;
                                                        });

                                                        // Second pass: distribute remaining capacity
                                                        if (remainingCapacity > 0) {
                                                            for (const res of newMaxed) {
                                                                const canAdd = Math.min(remainingCapacity, Math.floor(availables[res]) - newTransfer[res]);
                                                                newTransfer[res] += canAdd;
                                                                remainingCapacity -= canAdd;
                                                                if (remainingCapacity <= 0) break;
                                                            }
                                                        }

                                                        setResourceTransfer(newTransfer);
                                                    }}
                                                    style={{
                                                        background: isMaxed ? 'rgba(0, 243, 255, 0.4)' : 'rgba(0, 243, 255, 0.2)',
                                                        border: '1px solid rgba(0, 243, 255, 0.3)',
                                                        borderRadius: '4px',
                                                        padding: '4px 8px',
                                                        color: '#00f3ff',
                                                        cursor: carryCapacity > 0 ? 'pointer' : 'not-allowed',
                                                        fontSize: '0.75rem',
                                                        fontWeight: isMaxed ? 'bold' : 'normal'
                                                    }}
                                                    disabled={carryCapacity === 0}
                                                >
                                                    MAX
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {carryCapacity === 0 && (
                                <div style={{ marginTop: '10px', color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    Assign units above to enable resource transfer (capacity based on unit carry capacity)
                                </div>
                            )}
                        </div>
                    )}
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
                                        title={`${u.replace('_', ' ').toUpperCase()} (${getUnitFaction(u).toUpperCase()}) - Strong vs ${getFactionAdvantage(getUnitFaction(u))}`}
                                    >
                                        <div className="unit-icon-wrapper" style={{ position: 'relative', width: '40px', height: '40px', marginBottom: '0.5rem' }}>
                                            <img
                                                src={UNIT_ICONS[u]}
                                                alt={u}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    const parent = (e.target as HTMLImageElement).parentElement;
                                                    if (parent) parent.textContent = getFactionIcon(getUnitFaction(u));
                                                }}
                                            />
                                            <span className="class-tag" style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#000', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyCenter: 'center', border: '1px solid #00f3ff' }}>
                                                {getFactionIcon(getUnitFaction(u))}
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
                        {/* Defense Borrowing Warning */}
                        {hasBorrowedTroops && (
                            <div className="defense-borrow-warning">
                                <div className="warning-icon">⚠️</div>
                                <div className="warning-content">
                                    <div className="warning-title">Troops Being Pulled From Defense</div>
                                    <div className="warning-details">
                                        {Object.entries(borrowedFromDefense).map(([lane, units]) => {
                                            const unitEntries = Object.entries(units).filter(([_, c]) => c > 0);
                                            if (unitEntries.length === 0) return null;

                                            const laneLabel = lane === 'front' ? 'Center' : lane === 'left' ? 'Left' : 'Right';
                                            return (
                                                <div key={lane} className="borrow-lane">
                                                    <span className="lane-name">{laneLabel}:</span>
                                                    {unitEntries.map(([unitType, count]) => (
                                                        <span key={unitType} className="borrow-unit">
                                                            {count}x {unitType.replace('_', ' ')}
                                                        </span>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                        <button
                            className="attack-btn"
                            onClick={handleLaunch}
                        >
                            INITIATE ASSAULT
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
