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

type SectorKey = 'left' | 'front' | 'right';
type AssignmentMode = 'units' | 'modules';

interface UnitStats {
    id: string;
    name: string;
    description: string;
    unitClass: string;
}

interface ToolStats {
    id: string;
    name: string;
    description: string;
    workshop: string;
    bonusType: string;
    bonusValue: number;
}

const SECTOR_NAMES: Record<string, string> = {
    left: 'Industrial District',
    front: 'Starport Access',
    right: 'Military District'
};

const BONUS_TYPE_LABELS: Record<string, string> = {
    'canopy': 'Energy Canopy',
    'hub': 'Docking Hub',
    'ranged_def': 'Ranged Defense'
};

const getClassIcon = (unitClass: string) => {
    switch (unitClass) {
        case 'melee': return '🗡️';
        case 'ranged': return '🎯';
        case 'robotic': return '🤖';
        default: return '⚔️';
    }
};

const getToolIcon = (bonusType: string) => {
    switch (bonusType) {
        case 'canopy': return '🛡️';
        case 'hub': return '🚪';
        case 'ranged_def': return '🎯';
        default: return '🔧';
    }
};

export default function DefensePanel({ planet, onClose }: DefensePanelProps) {
    const [currentPlanet, setCurrentPlanet] = useState<Planet>(planet);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [front, setFront] = useState<LaneData>({ units: {}, tools: [] });
    const [left, setLeft] = useState<LaneData>({ units: {}, tools: [] });
    const [right, setRight] = useState<LaneData>({ units: {}, tools: [] });

    const [availableUnits, setAvailableUnits] = useState<Record<string, number>>({});
    const [availableTools, setAvailableTools] = useState<Record<string, number>>({});
    const [unitData, setUnitData] = useState<Record<string, UnitStats>>({});
    const [toolData, setToolData] = useState<Record<string, ToolStats>>({});

    const [maxSlots, setMaxSlots] = useState(1);
    const [caps, setCaps] = useState({ capacity: 0 });
    const [showTurretModal, setShowTurretModal] = useState(false);
    const [turretCount, setTurretCount] = useState(0);

    // Defensive structure values
    const [canopyLevel, setCanopyLevel] = useState(0);
    const [hubLevel, setHubLevel] = useState(0);
    const [minefieldLevel, setMinefieldLevel] = useState(0);
    const [admiralDefenseBonus, setAdmiralDefenseBonus] = useState(0);

    // Assignment mode: 'units' or 'modules'
    const [selectedSector, setSelectedSector] = useState<SectorKey | null>(null);
    const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('units');

    // Admiral State
    const [admiral, setAdmiral] = useState<{
        id: string;
        name: string;
        meleeStrengthBonus: number;
        rangedStrengthBonus: number;
        stationedPlanetId?: string | null;
    } | null>(null);

    // Dropdown states
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCurrentPlanet(planet);
        loadData();
        loadAdmiral();
        loadUnitTypes();
        loadToolTypes();
    }, [planet.id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        if (activeDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [activeDropdown]);

    const loadUnitTypes = async () => {
        try {
            const data = await api.getUnitTypes();
            setUnitData(data.units);
        } catch (err) {
            console.error('Failed to load unit types:', err);
        }
    };

    const loadToolTypes = async () => {
        try {
            const data = await api.getToolTypes();
            setToolData(data.tools);
        } catch (err) {
            console.error('Failed to load tool types:', err);
        }
    };

    const loadAdmiral = async () => {
        try {
            const admiralData = await api.getAdmiral();
            setAdmiral(admiralData);
        } catch (err) {
            setAdmiral(null);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const p = await api.getPlanet(currentPlanet.id);
            setAvailableUnits(p.units || {});

            const toolsMap: Record<string, number> = {};
            if (p.tools) {
                p.tools.forEach(t => toolsMap[t.toolType] = t.count);
            }
            setAvailableTools(toolsMap);

            const profile = await api.getDefenseProfile(currentPlanet.id);

            setCanopyLevel(profile.canopyLevel || 0);
            setHubLevel(profile.dockingHubLevel || 0);
            setMinefieldLevel(profile.minefieldLevel || 0);
            setAdmiralDefenseBonus(profile.admiralDefenseBonus || 0);
            setMaxSlots(Math.max(1, profile.canopyLevel || 1));
            setCaps({ capacity: profile.defenseCapacity ?? 0 });

            try {
                const turrets = p.defenseTurretsJson ? JSON.parse(p.defenseTurretsJson) : [];
                setTurretCount(Array.isArray(turrets) ? turrets.length : 0);
            } catch {
                setTurretCount(0);
            }

            setCurrentPlanet(p);

            const normalize = (data: any): LaneData => {
                if (!data) return { units: {}, tools: [] };
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

    // --- Lane State Helpers ---
    const getLaneState = (lane: SectorKey) => {
        return lane === 'front' ? front : lane === 'left' ? left : right;
    };
    const getLaneSetter = (lane: SectorKey) => {
        return lane === 'front' ? setFront : lane === 'left' ? setLeft : setRight;
    };

    // --- Unit Logic ---
    const updateUnit = (lane: SectorKey, unit: string, val: number) => {
        const updater = getLaneSetter(lane);
        const current = getLaneState(lane);
        updater({
            ...current,
            units: { ...current.units, [unit]: Math.max(0, val) }
        });
    };

    const addUnitsToSector = (unit: string, amount: number) => {
        if (!selectedSector) return;
        const current = getLaneState(selectedSector);
        const currentCount = current.units[unit] || 0;
        const owned = availableUnits[unit] || 0;
        const assigned = getAssignedUnitCount(unit);
        const available = Math.max(0, owned - assigned);
        const toAdd = Math.min(amount, available);
        if (toAdd > 0) {
            updateUnit(selectedSector, unit, currentCount + toAdd);
        }
    };

    const getAssignedUnitCount = (unit: string) => {
        const f = front.units[unit] || 0;
        const l = left.units[unit] || 0;
        const r = right.units[unit] || 0;
        return f + l + r;
    };

    const getAvailableForUnit = (unit: string) => {
        const owned = availableUnits[unit] || 0;
        const assigned = getAssignedUnitCount(unit);
        return Math.max(0, owned - assigned);
    };

    // --- Tool/Module Logic ---
    const addToolsToSector = (toolId: string, amount: number) => {
        if (!selectedSector) return;
        const current = getLaneState(selectedSector);

        const owned = availableTools[toolId] || 0;
        const assigned = getAssignedToolCount(toolId);
        const available = Math.max(0, owned - assigned);
        const toAdd = Math.min(amount, available);

        if (toAdd <= 0) return;

        // Check if tool already exists in this sector
        const existingIdx = current.tools.findIndex(t => t.type === toolId);
        const updater = getLaneSetter(selectedSector);

        if (existingIdx >= 0) {
            // Update existing slot
            const newTools = [...current.tools];
            newTools[existingIdx] = { ...newTools[existingIdx], count: newTools[existingIdx].count + toAdd };
            updater({ ...current, tools: newTools });
        } else {
            // New slot (check slot limit)
            if (current.tools.length >= maxSlots) return;
            updater({ ...current, tools: [...current.tools, { type: toolId, count: toAdd }] });
        }
    };

    const updateToolCount = (lane: SectorKey, index: number, newCount: number) => {
        const current = getLaneState(lane);
        const tool = current.tools[index];
        if (!tool) return;

        const owned = availableTools[tool.type] || 0;
        const assignedElsewhere = getAssignedToolCount(tool.type) - tool.count;
        const maxAllowed = Math.max(0, owned - assignedElsewhere);
        const clampedCount = Math.min(Math.max(0, newCount), maxAllowed);

        const updater = getLaneSetter(lane);
        if (clampedCount <= 0) {
            // Remove the slot
            updater({ ...current, tools: current.tools.filter((_, i) => i !== index) });
        } else {
            const newTools = [...current.tools];
            newTools[index] = { ...tool, count: clampedCount };
            updater({ ...current, tools: newTools });
        }
    };

    const removeToolFromSector = (lane: SectorKey, index: number) => {
        const updater = getLaneSetter(lane);
        const current = getLaneState(lane);
        const newTools = current.tools.filter((_, i) => i !== index);
        updater({ ...current, tools: newTools });
    };

    const getAssignedToolCount = (toolId: string) => {
        const count = (tools: ToolSlot[]) => tools.filter(t => t.type === toolId).reduce((a, b) => a + b.count, 0);
        return count(front.tools) + count(left.tools) + count(right.tools);
    };

    const getAvailableForTool = (toolId: string) => {
        const owned = availableTools[toolId] || 0;
        const assigned = getAssignedToolCount(toolId);
        return Math.max(0, owned - assigned);
    };

    // Filter for defensive tools only
    const getDefensiveTools = () => {
        return Object.entries(toolData).filter(([_, tool]) => tool.workshop === 'defense_workshop');
    };

    // --- Calculate totals ---
    const totalUnitsAssigned = Object.values(front.units).reduce((a, b) => a + b, 0) +
        Object.values(left.units).reduce((a, b) => a + b, 0) +
        Object.values(right.units).reduce((a, b) => a + b, 0);
    const capacityExceeded = totalUnitsAssigned > caps.capacity;

    const getSectorUnitCount = (lane: SectorKey) => {
        const data = getLaneState(lane);
        return Object.values(data.units).reduce((a, b) => a + b, 0);
    };

    // --- Tool Bonus Calculations ---
    const calculateToolBonuses = () => {
        const bonuses = {
            left: { shield: 0, hub: 0, ranged: 0 },
            front: { shield: 0, hub: 0, ranged: 0 },
            right: { shield: 0, hub: 0, ranged: 0 }
        };

        const addBonuses = (lane: SectorKey, tools: ToolSlot[]) => {
            tools.forEach(t => {
                const tool = toolData[t.type];
                if (tool && t.count > 0) {
                    const bonusPercent = Math.round(tool.bonusValue * 100);
                    if (tool.bonusType === 'canopy') bonuses[lane].shield += bonusPercent;
                    if (tool.bonusType === 'hub') bonuses[lane].hub += bonusPercent;
                    if (tool.bonusType === 'ranged_def') bonuses[lane].ranged += bonusPercent;
                }
            });
        };

        addBonuses('left', left.tools);
        addBonuses('front', front.tools);
        addBonuses('right', right.tools);

        return bonuses;
    };

    const toolBonuses = calculateToolBonuses();

    const calculateTotalDefense = () => {
        const canopyBase = canopyLevel * 100;
        const hubBase = hubLevel * 50;
        const minefieldBase = minefieldLevel * 75;

        const totalToolShield = toolBonuses.left.shield + toolBonuses.front.shield + toolBonuses.right.shield;
        const totalToolHub = toolBonuses.left.hub + toolBonuses.front.hub + toolBonuses.right.hub;
        const totalToolRanged = toolBonuses.left.ranged + toolBonuses.front.ranged + toolBonuses.right.ranged;

        return {
            canopy: { base: canopyBase, bonus: totalToolShield, total: canopyBase + totalToolShield },
            hub: { base: hubBase, bonus: totalToolHub, total: hubBase + totalToolHub },
            minefield: { base: minefieldBase, bonus: 0, total: minefieldBase },
            rangedBonus: totalToolRanged,
            admiralBonus: admiralDefenseBonus
        };
    };

    const totalDefense = calculateTotalDefense();

    // --- Sector selection handlers ---
    const handleSectorClick = (lane: SectorKey) => {
        if (selectedSector === lane && assignmentMode === 'units') {
            setSelectedSector(null);
        } else {
            setSelectedSector(lane);
            setAssignmentMode('units');
        }
    };

    const handleModulesClick = (lane: SectorKey, e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedSector === lane && assignmentMode === 'modules') {
            setSelectedSector(null);
        } else {
            setSelectedSector(lane);
            setAssignmentMode('modules');
        }
    };

    // --- Render Sector Card ---
    const renderSectorCard = (lane: SectorKey) => {
        const data = getLaneState(lane);
        const title = SECTOR_NAMES[lane];
        const totalInLane = getSectorUnitCount(lane);
        const assignedUnits = Object.entries(data.units).filter(([_, count]) => count > 0);
        const isSelected = selectedSector === lane;
        const isUnitsMode = isSelected && assignmentMode === 'units';
        const isModulesMode = isSelected && assignmentMode === 'modules';

        return (
            <div
                className={`defense-sector-card horizontal ${isUnitsMode ? 'selected' : ''}`}
                onClick={() => handleSectorClick(lane)}
            >
                <div className="sector-header">
                    <h4>{title}</h4>
                    <span className="sector-unit-count">{totalInLane}</span>
                </div>

                <div className="sector-body">
                    {assignedUnits.length === 0 ? (
                        <div className="empty-sector-msg">
                            {isUnitsMode ? 'Assign units →' : 'Click to assign'}
                        </div>
                    ) : (
                        <div className="sector-unit-list">
                            {assignedUnits.map(([unit, count]) => {
                                const uData = unitData[unit];
                                return (
                                    <div key={unit} className="sector-unit-row">
                                        <span className="unit-icon">{getClassIcon(uData?.unitClass || 'melee')}</span>
                                        <span className="unit-name">{uData?.name || unit}</span>
                                        <input
                                            type="number"
                                            className="unit-count-input"
                                            value={count}
                                            min={0}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                const owned = availableUnits[unit] || 0;
                                                const assignedElsewhere = getAssignedUnitCount(unit) - count;
                                                const maxAllowed = Math.max(0, owned - assignedElsewhere);
                                                updateUnit(lane, unit, Math.min(val, maxAllowed));
                                            }}
                                        />
                                        <button
                                            className="unit-remove-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateUnit(lane, unit, 0);
                                            }}
                                        >×</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div
                    className={`sector-footer ${isModulesMode ? 'selected' : ''}`}
                    onClick={(e) => handleModulesClick(lane, e)}
                >
                    <span className="modules-indicator">
                        Modules: {data.tools.length}/{maxSlots}
                    </span>
                    {data.tools.length > 0 && (
                        <div className="module-chips">
                            {data.tools.map((t, idx) => {
                                const tData = toolData[t.type];
                                return (
                                    <span key={idx} className="module-chip-mini" title={tData?.name || t.type}>
                                        {getToolIcon(tData?.bonusType || '')}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- Render Allocation Panel ---
    const renderAllocationPanel = () => {
        if (!selectedSector) {
            return (
                <div className="allocation-panel empty">
                    <div className="allocation-placeholder">
                        <span className="placeholder-icon">←</span>
                        <p>Select a sector to assign units</p>
                        <p className="placeholder-hint">Click "Modules" to assign tools</p>
                    </div>
                </div>
            );
        }

        if (assignmentMode === 'modules') {
            return renderModuleAllocationPanel();
        }

        return renderUnitAllocationPanel();
    };

    const renderUnitAllocationPanel = () => {
        const sectorData = getLaneState(selectedSector!);
        const unitIds = Object.keys(unitData).filter(id => (availableUnits[id] || 0) > 0);

        return (
            <div className="allocation-panel active">
                <div className="allocation-header">
                    <h3>Assign Units to {SECTOR_NAMES[selectedSector!]}</h3>
                    <button className="close-allocation" onClick={() => setSelectedSector(null)}>×</button>
                </div>
                <div className="allocation-list">
                    {unitIds.length === 0 ? (
                        <div className="no-units-msg">No units available</div>
                    ) : (
                        unitIds.map(unitId => {
                            const uData = unitData[unitId];
                            const available = getAvailableForUnit(unitId);

                            return (
                                <div key={unitId} className="allocation-row">
                                    <div className="allocation-unit-info">
                                        <span className="unit-icon">{getClassIcon(uData.unitClass)}</span>
                                        <span className="unit-name">{uData.name}</span>
                                    </div>
                                    <div className="allocation-controls">
                                        <span className={`available-count ${available > 0 ? 'has-units' : 'no-units'}`}>
                                            {available} free
                                        </span>
                                        <button
                                            className="add-btn"
                                            onClick={() => addUnitsToSector(unitId, 10)}
                                            disabled={available <= 0}
                                        >+10</button>
                                        <button
                                            className="add-btn"
                                            onClick={() => addUnitsToSector(unitId, 100)}
                                            disabled={available <= 0}
                                        >+100</button>
                                        <button
                                            className="add-btn max"
                                            onClick={() => addUnitsToSector(unitId, available)}
                                            disabled={available <= 0}
                                        >MAX</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    const renderModuleAllocationPanel = () => {
        const sectorData = getLaneState(selectedSector!);
        const defensiveTools = getDefensiveTools();
        const slotsRemaining = maxSlots - sectorData.tools.length;

        return (
            <div className="allocation-panel active modules-mode">
                <div className="allocation-header">
                    <h3>Assign Modules to {SECTOR_NAMES[selectedSector!]}</h3>
                    <button className="close-allocation" onClick={() => setSelectedSector(null)}>×</button>
                </div>

                {/* Current modules in slot */}
                {sectorData.tools.length > 0 && (
                    <div className="current-modules">
                        <h4>Equipped ({sectorData.tools.length}/{maxSlots} slots)</h4>
                        <div className="equipped-list">
                            {sectorData.tools.map((t, idx) => {
                                const tData = toolData[t.type];
                                return (
                                    <div key={idx} className="equipped-module">
                                        <span className="module-icon">{getToolIcon(tData?.bonusType || '')}</span>
                                        <div className="module-info">
                                            <span className="module-name">{tData?.name || t.type}</span>
                                            <span className="module-bonus">+{Math.round((tData?.bonusValue || 0) * 100)}% {BONUS_TYPE_LABELS[tData?.bonusType] || ''}</span>
                                        </div>
                                        <input
                                            type="number"
                                            className="module-count-input"
                                            value={t.count}
                                            min={0}
                                            onChange={(e) => updateToolCount(selectedSector!, idx, parseInt(e.target.value) || 0)}
                                        />
                                        <button
                                            className="module-remove"
                                            onClick={() => removeToolFromSector(selectedSector!, idx)}
                                        >×</button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="allocation-list">
                    <h4>Available Modules</h4>
                    {defensiveTools.length === 0 ? (
                        <div className="no-units-msg">No defensive modules available</div>
                    ) : (
                        defensiveTools.map(([toolId, tData]) => {
                            const available = getAvailableForTool(toolId);
                            const owned = availableTools[toolId] || 0;
                            const existsInSector = sectorData.tools.some(t => t.type === toolId);
                            const canAdd = available > 0 && (existsInSector || slotsRemaining > 0);

                            if (owned === 0) return null;

                            return (
                                <div key={toolId} className="allocation-row module-row">
                                    <div className="allocation-unit-info">
                                        <span className="unit-icon">{getToolIcon(tData.bonusType)}</span>
                                        <div className="module-details">
                                            <span className="unit-name">{tData.name}</span>
                                            <span className="module-desc">+{Math.round(tData.bonusValue * 100)}% {BONUS_TYPE_LABELS[tData.bonusType]}</span>
                                        </div>
                                    </div>
                                    <div className="allocation-controls">
                                        <span className={`available-count ${available > 0 ? 'has-units' : 'no-units'}`}>
                                            {available} free
                                        </span>
                                        <button
                                            className="add-btn"
                                            onClick={() => addToolsToSector(toolId, 10)}
                                            disabled={!canAdd}
                                        >+10</button>
                                        <button
                                            className="add-btn"
                                            onClick={() => addToolsToSector(toolId, 100)}
                                            disabled={!canAdd}
                                        >+100</button>
                                        <button
                                            className="add-btn max"
                                            onClick={() => addToolsToSector(toolId, available)}
                                            disabled={!canAdd}
                                        >MAX</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    // --- Render Dropdowns ---
    const renderModulesDropdown = () => (
        <div className="dropdown-panel modules-dropdown">
            <h4>Module Bonuses</h4>
            <div className="dropdown-content">
                {(['left', 'front', 'right'] as SectorKey[]).map(lane => (
                    <div key={lane} className="lane-bonus-row">
                        <span className="lane-label">{SECTOR_NAMES[lane]}</span>
                        <div className="bonus-values">
                            <span>Shield: <strong>+{toolBonuses[lane].shield}%</strong></span>
                            <span>Hub: <strong>+{toolBonuses[lane].hub}%</strong></span>
                            <span>Ranged: <strong>+{toolBonuses[lane].ranged}%</strong></span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAdmiralDropdown = () => (
        <div className="dropdown-panel admiral-dropdown">
            <h4>Admiral Bonuses</h4>
            {admiral && admiral.stationedPlanetId === currentPlanet.id ? (
                <div className="dropdown-content">
                    <div className="admiral-name">{admiral.name}</div>
                    <div className="bonus-row"><span>Melee Strength:</span> <span className="bonus-val">+{admiral.meleeStrengthBonus}%</span></div>
                    <div className="bonus-row"><span>Ranged Strength:</span> <span className="bonus-val">+{admiral.rangedStrengthBonus}%</span></div>
                    <div className="bonus-row"><span>Defense Bonus:</span> <span className="bonus-val">+{admiralDefenseBonus}%</span></div>
                </div>
            ) : (
                <div className="dropdown-content">
                    <p className="no-admiral">No admiral stationed here</p>
                    <p className="admiral-hint">Station via Admiral Command panel</p>
                </div>
            )}
        </div>
    );

    const renderOverviewDropdown = () => (
        <div className="dropdown-panel overview-dropdown">
            <h4>Defense Breakdown</h4>
            <div className="dropdown-content">
                <div className="defense-row">
                    <span>Energy Canopy (Lvl {canopyLevel})</span>
                    <span className="defense-val">{totalDefense.canopy.base} + {totalDefense.canopy.bonus} = <strong>{totalDefense.canopy.total}</strong></span>
                </div>
                <div className="defense-row">
                    <span>Docking Hub (Lvl {hubLevel})</span>
                    <span className="defense-val">{totalDefense.hub.base} + {totalDefense.hub.bonus} = <strong>{totalDefense.hub.total}</strong></span>
                </div>
                <div className="defense-row">
                    <span>Orbital Minefield (Lvl {minefieldLevel})</span>
                    <span className="defense-val"><strong>{totalDefense.minefield.total}</strong></span>
                </div>
                {totalDefense.rangedBonus > 0 && (
                    <div className="defense-row highlight">
                        <span>Ranged Bonus (tools)</span>
                        <span className="defense-val"><strong>+{totalDefense.rangedBonus}%</strong></span>
                    </div>
                )}
                {totalDefense.admiralBonus > 0 && (
                    <div className="defense-row highlight">
                        <span>Admiral Bonus</span>
                        <span className="defense-val"><strong>+{totalDefense.admiralBonus}%</strong></span>
                    </div>
                )}
            </div>
        </div>
    );

    if (loading) return <div className="defense-panel-overlay"><div className="defense-panel-v2">Loading...</div></div>;

    return (
        <div className="defense-panel-overlay">
            <div className="defense-panel-v2">
                {/* Header */}
                <div className="defense-header-v2">
                    <div className="header-title-row">
                        <h2>Defensive Strategy</h2>
                        <div className="header-controls">
                            <div className="dropdown-container" ref={dropdownRef}>
                                <button
                                    className={`header-dropdown-btn ${activeDropdown === 'modules' ? 'active' : ''}`}
                                    onClick={() => setActiveDropdown(activeDropdown === 'modules' ? null : 'modules')}
                                >
                                    Modules ▼
                                </button>
                                <button
                                    className={`header-dropdown-btn ${activeDropdown === 'admiral' ? 'active' : ''} ${admiral?.stationedPlanetId === currentPlanet.id ? 'stationed' : ''}`}
                                    onClick={() => setActiveDropdown(activeDropdown === 'admiral' ? null : 'admiral')}
                                >
                                    Admiral ▼
                                </button>
                                <button
                                    className={`header-dropdown-btn ${activeDropdown === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveDropdown(activeDropdown === 'overview' ? null : 'overview')}
                                >
                                    Overview ▼
                                </button>

                                {activeDropdown === 'modules' && renderModulesDropdown()}
                                {activeDropdown === 'admiral' && renderAdmiralDropdown()}
                                {activeDropdown === 'overview' && renderOverviewDropdown()}
                            </div>
                            <button className="close-btn" onClick={onClose}>×</button>
                        </div>
                    </div>

                    {/* Capacity Bar */}
                    <div className="capacity-section">
                        <div className="capacity-info-row">
                            <div className="capacity-text">
                                <span className={capacityExceeded ? 'capacity-error' : ''}>
                                    Troop Capacity: {totalUnitsAssigned} / {caps.capacity}
                                </span>
                                <span className="capacity-source">
                                    ({turretCount} turrets)
                                </span>
                            </div>
                            <button className="add-turret-btn" onClick={() => setShowTurretModal(true)}>
                                + Add Turret
                            </button>
                        </div>
                        <div className="capacity-bar">
                            <div
                                className={`capacity-fill ${capacityExceeded ? 'exceeded' : ''}`}
                                style={{ width: `${caps.capacity > 0 ? Math.min(100, (totalUnitsAssigned / caps.capacity) * 100) : 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="defense-content-v2">
                    {/* Horizontal Sectors */}
                    <div className="sectors-row">
                        {renderSectorCard('left')}
                        {renderSectorCard('front')}
                        {renderSectorCard('right')}
                    </div>

                    {/* Allocation Panel */}
                    {renderAllocationPanel()}
                </div>

                {/* Footer */}
                <div className="defense-footer-v2">
                    <button className="save-btn-v2" onClick={handleSave} disabled={saving || capacityExceeded}>
                        {saving ? 'Saving...' : 'Establish Defense'}
                    </button>
                    {capacityExceeded && (
                        <span className="capacity-warning">
                            ⚠️ Over capacity! Add turrets or reduce units.
                        </span>
                    )}
                </div>
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
