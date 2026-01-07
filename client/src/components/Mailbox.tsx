import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './Mailbox.css';

interface BattleReportSummary {
    id: string;
    fleetId: string;
    isAttacker: boolean;
    winner: 'attacker' | 'defender';
    attackerPlanet: { name: string; x: number; y: number };
    defenderPlanet: { name: string; x: number; y: number };
    createdAt: string;
    loot?: { carbon: number; titanium: number; food: number };
    resourcesStolen?: { carbon: number; titanium: number; food: number };
    admirals?: {
        attacker: { name: string; meleeStrengthBonus: number; rangedStrengthBonus: number; canopyReductionBonus: number } | null;
        defender: { name: string } | null;
    };
}

interface MailboxProps {
    onClose: () => void;
}

export default function Mailbox({ onClose }: MailboxProps) {
    const [reports, setReports] = useState<BattleReportSummary[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        try {
            const data = await api.getReports(); // We need to add this to api.ts
            setReports(data.reports);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (id: string) => {
        setSelectedReportId(id);
    };

    return (
        <div className="mailbox-overlay">
            <div className="mailbox-window">
                <div className="mailbox-header">
                    <h2>Comms Relay</h2>
                    <button className="close-btn" onClick={onClose}>X</button>
                </div>

                <div className="mailbox-content">
                    {selectedReportId ? (
                        <BattleReportView id={selectedReportId} onBack={() => setSelectedReportId(null)} />
                    ) : (
                        <div className="report-list">
                            {loading ? (
                                <div className="loading">Receiving transmissions...</div>
                            ) : reports.length === 0 ? (
                                <div className="empty-state">No messages in buffer.</div>
                            ) : (
                                reports.map(report => (
                                    <div key={report.id} className={`report-item ${report.winner === (report.isAttacker ? 'attacker' : 'defender') ? 'won' : 'lost'}`} onClick={() => handleSelect(report.id)}>
                                        <div className="report-icon">
                                            {report.isAttacker ? '⚔️' : '🛡️'}
                                        </div>
                                        <div className="report-summary">
                                            <div className="report-title">
                                                {report.isAttacker
                                                    ? `Attack on ${report.defenderPlanet.name}`
                                                    : `Defense against ${report.attackerPlanet.name}`}
                                            </div>
                                            <div className="report-date">
                                                {new Date(report.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className={`report-status ${report.winner === (report.isAttacker ? 'attacker' : 'defender') ? 'win' : 'loss'}`}>
                                            {report.winner === (report.isAttacker ? 'attacker' : 'defender') ? 'VICTORY' : 'DEFEAT'}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper to render unit counts securely
const UnitList = ({ units, colorClass }: { units: Record<string, number>, colorClass: string }) => {
    if (!units || Object.keys(units).length === 0) return <div className="unit-entry">-</div>;
    return (
        <div className="unit-list">
            {Object.entries(units).map(([u, c]) => (
                <div key={u} className={`unit-entry ${colorClass}`}>
                    <span className="u-name">{u}:</span> <span className="u-count">{c}</span>
                </div>
            ))}
        </div>
    );
};

// Helper for tools
const TOOL_LABELS: Record<string, string> = {
    'sentry_drones': 'Sentry Drones (+25% Energy Canopy)',
    'hardened_bulkheads': 'Hardened Bulkheads (+35% Docking Hub)',
    'targeting_uplinks': 'Targeting Uplinks (+25% Ranged accuracy)',
    'invasion_anchors': 'Invasion Anchors (-10% Energy Canopy)',
    'plasma_breachers': 'Plasma Breachers (-10% Docking Hub)',
    'stealth_field_pods': 'Stealth Field Pods (-10% Ranged sensors)'
};

const ToolList = ({ tools }: { tools: Record<string, number> | Record<string, number>[] }) => {
    // If array (waves), aggregate
    let agg: Record<string, number> = {};
    if (Array.isArray(tools)) {
        tools.forEach(t => {
            Object.entries(t).forEach(([k, v]) => {
                if (typeof v === 'number') agg[k] = (agg[k] || 0) + v;
            });
        });
    } else {
        agg = tools || {};
    }

    // Filter out 0s
    const filtered = Object.entries(agg).filter(([_, c]) => c > 0);

    if (filtered.length === 0) return null;
    return (
        <div className="tool-list">
            <span className="tool-label">Tools: </span>
            {filtered.map(([t, c]) => (
                <div key={t} className="tool-entry" title={TOOL_LABELS[t] || t}>
                    {c} x {TOOL_LABELS[t] || t}
                </div>
            ))}
        </div>
    );
};

function BattleReportView({ id, onBack }: { id: string, onBack: () => void }) {
    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'overview' | 'details'>('details'); // Default to details as per user pref
    const [expandedSectors, setExpandedSectors] = useState<string[]>([]);

    const toggleSector = (laneKey: string) => {
        setExpandedSectors(prev =>
            prev.includes(laneKey)
                ? prev.filter(k => k !== laneKey)
                : [...prev, laneKey]
        );
    };

    useEffect(() => {
        api.getReport(id).then(setReport).finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="loading-detail">Decryption in progress...</div>;
    if (!report) return <div>Error loading report.</div>;

    // Parse Lane Results (Backwards compatibility)
    // New format: { sectors: {...}, surface: {...} }
    // Old format: { left: ..., center: ..., right: ... }

    // API might return 'laneResults' (parsed object) or 'laneResultsJson' (string)
    let rawData = {};
    if (report.laneResults && typeof report.laneResults === 'object') {
        rawData = report.laneResults;
    } else if (report.laneResultsJson) {
        try {
            rawData = JSON.parse(report.laneResultsJson);
        } catch (e) {
            console.error("Failed to parse laneResultsJson", e);
        }
    }

    const sectors = (rawData as any).sectors || rawData;
    const surfaceResult = (rawData as any).surface || null;
    const admirals = report.admirals || (rawData as any).admirals || { attacker: null, defender: null };

    // Helper to get sector by name, handling 'center' vs 'front'
    const getSector = (key: string) => {
        if (sectors[key]) return sectors[key];
        if (key === 'center' && sectors['front']) return sectors['front'];
        return null;
    };

    // Derived Stats
    const totalAttackerSent = Object.values(getSector('left')?.initialAttackerUnits || {}).reduce((a: number, b: any) => a + b, 0) +
        Object.values(getSector('center')?.initialAttackerUnits || {}).reduce((a: number, b: any) => a + b, 0) +
        Object.values(getSector('right')?.initialAttackerUnits || {}).reduce((a: number, b: any) => a + b, 0);
    // Note: This is an approximation if we don't have totalSent in DB, but we added initials to SectorResult

    return (
        <div className="battle-report-detail">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
                <div className="br-tabs">
                    <button className={viewMode === 'overview' ? 'active' : ''} onClick={() => setViewMode('overview')}>Overview</button>
                    <button className={viewMode === 'details' ? 'active' : ''} onClick={() => setViewMode('details')}>Details</button>
                </div>
            </div>

            {/* Determine Victory relative to Viewer */}
            {(() => {
                const iAmAttacker = report.isAttacker !== undefined ? report.isAttacker : (report.attackerId === 1); // Fallback or assuming ID context? 
                // Better: If isAttacker is missing, we can't be sure without user context.
                // But previous code used report.isAttacker. I will assume API provides it.

                // If API doesn't provide it, we have a problem.
                // Assuming it does:
                const iWon = (report.winner === 'attacker') === (report.isAttacker);
                const resultText = iWon ? 'VICTORY' : 'DEFEAT';
                const resultClass = iWon ? 'victory' : 'defeat';

                return (
                    <div className={`report-header ${resultClass}`}>
                        <h3>{resultText}</h3>
                        <div className="sub-status">{report.winner.toUpperCase()} PREVAILED</div>
                    </div>
                );
            })()}

            {viewMode === 'overview' && (
                <div className="br-overview">
                    {/* Admiral Information */}
                    {(admirals.attacker || admirals.defender) && (
                        <div className="admiral-section">
                            <h4>Commanders</h4>
                            <div className="admiral-grid">
                                {admirals.attacker && (
                                    <div className="admiral-card attacker">
                                        <div className="admiral-header">
                                            <span className="admiral-label">Attacker</span>
                                            <span className="admiral-name">{admirals.attacker.name}</span>
                                        </div>
                                        <div className="admiral-bonuses">
                                            {admirals.attacker.meleeStrengthBonus > 0 && (
                                                <span className="bonus attack">+{admirals.attacker.meleeStrengthBonus}% Melee</span>
                                            )}
                                            {admirals.attacker.rangedStrengthBonus > 0 && (
                                                <span className="bonus attack">+{admirals.attacker.rangedStrengthBonus}% Ranged</span>
                                            )}
                                            {admirals.attacker.canopyReductionBonus < 0 && (
                                                <span className="bonus defense">{admirals.attacker.canopyReductionBonus}% Canopy Reduc.</span>
                                            )}
                                            {admirals.attacker.meleeStrengthBonus === 0 && 
                                             admirals.attacker.rangedStrengthBonus === 0 && 
                                             admirals.attacker.canopyReductionBonus === 0 && (
                                                <span className="no-bonus">No bonuses</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {admirals.defender && (
                                    <div className="admiral-card defender">
                                        <div className="admiral-header">
                                            <span className="admiral-label">Defender</span>
                                            <span className="admiral-name">{admirals.defender.name}</span>
                                        </div>
                                        <div className="admiral-bonuses">
                                            {admirals.defender.meleeStrengthBonus > 0 && (
                                                <span className="bonus attack">+{admirals.defender.meleeStrengthBonus}% Melee</span>
                                            )}
                                            {admirals.defender.rangedStrengthBonus > 0 && (
                                                <span className="bonus attack">+{admirals.defender.rangedStrengthBonus}% Ranged</span>
                                            )}
                                            {admirals.defender.canopyReductionBonus < 0 && (
                                                <span className="bonus defense">{admirals.defender.canopyReductionBonus}% Canopy Reduc.</span>
                                            )}
                                            {(!admirals.defender.meleeStrengthBonus && 
                                              !admirals.defender.rangedStrengthBonus && 
                                              !admirals.defender.canopyReductionBonus) && (
                                                <span className="no-bonus">No bonuses</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="loot-section">
                        <h4>Resources Plundered</h4>
                        {report.resourcesJson ? (
                            <div className="loot-grid">
                                {Object.entries(JSON.parse(report.resourcesJson)).map(([res, amount]) => (
                                    <div key={res} className={`loot-item ${res}`}>
                                        <span className="res-icon">📦</span>
                                        <span className="res-amount">{amount as number}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="no-loot">No resources plundered.</div>}
                    </div>

                    <div className="total-casualties-section">
                        <h4>Total Casualties</h4>
                        <div className="casualties-grid">
                            <div className="cas-col">
                                <h5>My Losses</h5>
                                <UnitList units={report.myLosses} colorClass="red" />
                            </div>
                            <div className="cas-col">
                                <h5>Enemy Losses</h5>
                                <UnitList units={report.enemyLosses} colorClass="green" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'details' && (
                <div className="br-details-flow">
                    <div className="flanks-row">
                        {['left', 'center', 'right'].map(laneKey => {
                            const result = getSector(laneKey);
                            const label = laneKey === 'left' ? 'Industrial' : laneKey === 'center' ? 'Central Docking Hub' : 'Military';

                            if (!result) return <div key={laneKey} className="flank-col empty">Empty</div>;

                            const attWon = result.winner === 'attacker';
                            const wasUnopposed = result.wavesFought === 0 && Object.keys(result.initialAttackerUnits || {}).length > 0;
                            const isExpanded = expandedSectors.includes(laneKey);

                            return (
                                <div key={laneKey} className="flank-col">
                                    <div className={`flank-header ${attWon ? 'att-win' : 'def-win'}`}>
                                        {label}
                                    </div>

                                    {/* Attacker Stats */}
                                    <div className="flank-side attacker">
                                        <div className="fs-title">Attacker</div>
                                        <div className="fs-content">
                                            <UnitList units={result.initialAttackerUnits} colorClass="neutral" />
                                            <ToolList tools={result.attackerToolsByWave} />
                                            <div className="losses">
                                                {wasUnopposed ? (
                                                    <span className="unopposed">Unopposed</span>
                                                ) : (
                                                    <>Lost: <UnitList units={result.attackerLosses} colorClass="red" /></>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Wave Toggle (Central Action) */}
                                    {result.waveResults && result.waveResults.length > 0 ? (
                                        <div className="lane-action">
                                            <button
                                                className={`wave-toggle-btn ${isExpanded ? 'active' : ''}`}
                                                onClick={() => toggleSector(laneKey)}
                                            >
                                                {isExpanded ? 'Hide Waves' : `View ${result.waveResults.length} Waves`}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="vs-divider">VS</div>
                                    )}

                                    {/* Defender Stats */}
                                    <div className="flank-side defender">
                                        <div className="fs-title">Defender</div>
                                        <div className="fs-content">
                                            <UnitList units={result.initialDefenderUnits} colorClass="neutral" />
                                            <ToolList tools={result.defenderTools} />
                                            <div className="losses">
                                                {wasUnopposed ? (
                                                    <span className="unopposed">No Resistance</span>
                                                ) : (
                                                    <>Lost: <UnitList units={result.defenderLosses} colorClass="red" /></>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Wave Details Overlay / Expansion */}
                                    {isExpanded && result.waveResults && (
                                        <div className="mail-wave-breakdown">
                                            {result.waveResults.map((wave: any, idx: number) => (
                                                <div key={idx} className="mail-wave-row">
                                                    <div className="mail-wave-header">
                                                        <span>Wave {wave.waveIndex}</span>
                                                    </div>
                                                    <div className="mail-wave-body">
                                                        <div className="mail-wave-part att">
                                                            <div className="wp-label">Sent:</div>
                                                            <UnitList units={wave.attackerUnits} />
                                                            <ToolList tools={wave.tools} />
                                                            <div className="wp-loss">Lost: <UnitList units={wave.attackerLosses} colorClass="red" /></div>
                                                        </div>
                                                        <div className="mail-wave-vs">vs</div>
                                                        <div className="mail-wave-part def">
                                                            <div className="wp-label">Def:</div>
                                                            <UnitList units={wave.defenderUnits} />
                                                            <div className="wp-loss">Lost: <UnitList units={wave.defenderLosses} colorClass="red" /></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Outcome Arrow */}
                                    <div className={`outcome-arrow ${attWon ? 'breach' : 'blocked'}`}>
                                        {attWon ? '⬇ BREACH ⬇' : '❌ BLOCKED'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Courtyard / Surface */}
                    <div className="courtyard-section">
                        <h4>Surface Invasion (Courtyard)</h4>
                        {surfaceResult ? (
                            <div className="courtyard-content">
                                <div className="cy-side">
                                    <h5>Attacker Force</h5>
                                    {/* We don't have exact initial breakdown of courtyard stored in report root, but `surfaceResult` implies survivors */}
                                    {/* For now show losses */}
                                    <div>Deployed: <UnitList units={surfaceResult.initialAttackerUnits} colorClass="neutral" /></div>
                                    <div className="bonus-breakdown">
                                        Sector Bonus: +{(surfaceResult.attackerBonus * 100).toFixed(0)}%
                                        {admirals.attacker && (admirals.attacker.meleeStrengthBonus > 0 || admirals.attacker.rangedStrengthBonus > 0) && (
                                            <> | Commander: +{Math.max(admirals.attacker.meleeStrengthBonus, admirals.attacker.rangedStrengthBonus)}%</>
                                        )}
                                    </div>
                                    <div className="losses">Lost: <UnitList units={surfaceResult.attackerLosses} colorClass="red" /></div>
                                </div>
                                <div className="cy-vs">VS</div>
                                <div className="cy-side">
                                    <h5>Defender Force</h5>
                                    <div>Deployed: <UnitList units={surfaceResult.initialDefenderUnits} colorClass="neutral" /></div>
                                    <div className="bonus-breakdown">
                                        Sector Bonus: +{(surfaceResult.defenderBonus * 100).toFixed(0)}%
                                        {admirals.defender && (admirals.defender.meleeStrengthBonus > 0 || admirals.defender.rangedStrengthBonus > 0) && (
                                            <> | Commander: +{Math.max(admirals.defender.meleeStrengthBonus, admirals.defender.rangedStrengthBonus)}%</>
                                        )}
                                    </div>
                                    <div className="losses">Lost: <UnitList units={surfaceResult.defenderLosses} colorClass="red" /></div>
                                </div>
                            </div>
                        ) : (
                            <div className="cy-skipped">No Surface Combat</div>
                        )}
                        <div className={`cy-result ${surfaceResult?.winner === 'attacker' ? 'att-win' : 'def-win'}`}>
                            {surfaceResult ? `Winner: ${surfaceResult.winner.toUpperCase()}` : 'Defense Prevailed'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
