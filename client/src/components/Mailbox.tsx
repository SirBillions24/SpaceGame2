import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './Mailbox.css';

interface BattleReportSummary {
    id: string;
    type: 'battle';
    title: string;
    winner: 'attacker' | 'defender';
    isAttacker: boolean;
    attackerPlanet: { name: string; x: number; y: number };
    defenderPlanet: { name: string; x: number; y: number };
    createdAt: string;
}

interface EspionageReportSummary {
    id: string;
    type: 'espionage';
    title: string;
    targetX: number;
    targetY: number;
    accuracy: number;
    createdAt: string;
}

interface MessageSummary {
    id: string;
    type: 'message';
    subType: string;
    title: string;
    content: string;
    isRead: boolean;
    createdAt: string;
}

type InboxItem = BattleReportSummary | EspionageReportSummary | MessageSummary;

interface MailboxProps {
    onClose: () => void;
}

export default function Mailbox({ onClose }: MailboxProps) {
    const [items, setItems] = useState<InboxItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedItemType, setSelectedItemType] = useState<'battle' | 'espionage' | 'message' | null>(null);
    const [loading, setLoading] = useState(true);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageJumpInput, setPageJumpInput] = useState('');
    const PAGE_SIZE = 10;
    const totalPages = Math.ceil(items.length / PAGE_SIZE);
    const paginatedItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    useEffect(() => {
        loadInbox();
    }, []);

    const loadInbox = async () => {
        try {
            const data = await api.getInbox();
            setItems(data.items);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (item: InboxItem) => {
        setSelectedItemId(item.id);
        setSelectedItemType(item.type);
        if (item.type === 'message' && !item.isRead) {
            api.markMessageRead(item.id);
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, isRead: true } as InboxItem : i));
        }
    };

    const handleBack = () => {
        setSelectedItemId(null);
        setSelectedItemType(null);
    };

    return (
        <div className="mailbox-overlay">
            <div className="mailbox-window">
                <div className="mailbox-header">
                    <h2>Comms Relay</h2>
                    {/* Pagination Controls */}
                    {!selectedItemId && items.length > PAGE_SIZE && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '15px' }}>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                style={{ background: 'transparent', border: 'none', color: currentPage === 1 ? '#555' : '#00f3ff', cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: '1rem' }}
                            >◀</button>
                            <span style={{ color: '#888', fontSize: '0.85rem' }}>
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                style={{ background: 'transparent', border: 'none', color: currentPage === totalPages ? '#555' : '#00f3ff', cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: '1rem' }}
                            >▶</button>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                placeholder="#"
                                value={pageJumpInput}
                                onChange={(e) => setPageJumpInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const page = parseInt(pageJumpInput) || 1;
                                        setCurrentPage(Math.max(1, Math.min(totalPages, page)));
                                        setPageJumpInput('');
                                    }
                                }}
                                style={{ width: '40px', background: '#222', border: '1px solid #444', borderRadius: '4px', color: '#fff', padding: '2px 4px', textAlign: 'center', fontSize: '0.8rem' }}
                            />
                        </div>
                    )}
                    <button className="close-btn" onClick={onClose}>X</button>
                </div>

                <div className="mailbox-content">
                    {selectedItemId ? (
                        selectedItemType === 'battle' ? (
                            <BattleReportView id={selectedItemId} onBack={handleBack} />
                        ) : selectedItemType === 'espionage' ? (
                            <EspionageReportView id={selectedItemId} onBack={handleBack} />
                        ) : (
                            <MessageView id={selectedItemId} items={items} onBack={handleBack} />
                        )
                    ) : (
                        <div className="report-list">
                            {loading ? (
                                <div className="loading">Receiving transmissions...</div>
                            ) : items.length === 0 ? (
                                <div className="empty-state">No messages in buffer.</div>
                            ) : (
                                paginatedItems.map(item => (
                                    <div
                                        key={item.id}
                                        className={`report-item ${item.type} ${item.type === 'message' && !item.isRead ? 'unread' : ''}`}
                                        onClick={() => handleSelect(item)}
                                    >
                                        <div className="report-icon">
                                            {item.type === 'battle' ? (item.isAttacker ? '⚔️' : '🛡️') :
                                                item.type === 'espionage' ? '🛰️' :
                                                    (item.type === 'message' && item.subType === 'transfer_complete') ? '📦' : 
                                                        (item.type === 'message' && item.subType === 'starvation_desertion') ? '💀' : 
                                                            (item.type === 'message' && item.subType === 'coalition_invite') ? '🤝' : '✉️'}
                                        </div>
                                        <div className="report-summary">
                                            <div className="report-title">{item.title}</div>
                                            <div className="report-date">
                                                {new Date(item.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                        {item.type === 'battle' && (
                                            <div className={`report-status ${(item.winner === 'attacker') === item.isAttacker ? 'win' : 'loss'}`}>
                                                {(item.winner === 'attacker') === item.isAttacker ? 'VICTORY' : 'DEFEAT'}
                                            </div>
                                        )}
                                        {item.type === 'espionage' && (
                                            <div className="report-status info">
                                                INTEL: {Math.round(item.accuracy * 100)}%
                                            </div>
                                        )}
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

function EspionageReportView({ id, onBack }: { id: string, onBack: () => void }) {
    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getEspionageReport(id).then(setReport).finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="loading-detail">Downloading satellite data...</div>;
    if (!report) return <div>Error loading report.</div>;

    return (
        <div className="espionage-report-view">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
            </div>
            <div className="report-header info">
                <h3>SATELLITE INTELLIGENCE</h3>
                <div className="sub-status">TARGET: [{report.targetX}, {report.targetY}]</div>
            </div>
            <div className="esp-details">
                <div className="esp-meta">
                    <span>Generated: {new Date(report.createdAt).toLocaleString()}</span>
                    <span>Accuracy: {Math.round(report.accuracy * 100)}%</span>
                </div>
                <div className="colonies-detected">
                    {report.data.map((colony: any) => (
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
                    ))}
                </div>
            </div>
        </div>
    );
}

// Gear rarity colors
const RARITY_COLORS: Record<string, string> = {
    common: '#9ca3af',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#f59e0b'
};

// Gear slot icons
const SLOT_ICONS: Record<string, string> = {
    weapon: '⚔️',
    helmet: '🪖',
    spacesuit: '🧥',
    shield: '🛡️'
};

interface GearDropData {
    gearId: string;
    name: string;
    slotType: string;
    rarity: string;
    level: number;
    meleeStrengthBonus: number;
    rangedStrengthBonus: number;
    canopyReductionBonus: number;
    planetName: string;
    iconName?: string;
}

function GearDropMessageView({ message, onBack }: { message: any, onBack: () => void }) {
    let gearData: GearDropData | null = null;
    try {
        gearData = JSON.parse(message.content);
    } catch (e) {
        // Fall back to text display
    }

    if (!gearData) {
        return (
            <div className="message-view">
                <div className="br-nav">
                    <button className="back-btn" onClick={onBack}>← Back</button>
                </div>
                <div className="message-header">
                    <h3>{message.title}</h3>
                    <div className="message-date">{new Date(message.createdAt).toLocaleString()}</div>
                </div>
                <div className="message-body">
                    {message.content}
                </div>
            </div>
        );
    }

    const rarityColor = RARITY_COLORS[gearData.rarity] || RARITY_COLORS.common;
    const slotIcon = SLOT_ICONS[gearData.slotType] || '📦';

    return (
        <div className="message-view gear-drop-view">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
            </div>
            <div className="report-header victory">
                <h3>GEAR RECOVERED!</h3>
                <div className="sub-status">Combat Salvage from {gearData.planetName}</div>
            </div>
            <div className="gear-card" style={{ borderColor: rarityColor }}>
                <div className="gear-header">
                    <span className="gear-icon">{slotIcon}</span>
                    <div className="gear-title">
                        <span className="gear-name" style={{ color: rarityColor }}>{gearData.name}</span>
                        <span className="gear-rarity" style={{ color: rarityColor }}>
                            {gearData.rarity.charAt(0).toUpperCase() + gearData.rarity.slice(1)} {gearData.slotType.charAt(0).toUpperCase() + gearData.slotType.slice(1)}
                        </span>
                    </div>
                    <span className="gear-level">Lv. {gearData.level}</span>
                </div>
                <div className="gear-stats">
                    {gearData.meleeStrengthBonus > 0 && (
                        <div className="gear-stat melee">
                            <span className="stat-icon">⚔️</span>
                            <span className="stat-label">Melee Strength</span>
                            <span className="stat-value">+{gearData.meleeStrengthBonus}%</span>
                        </div>
                    )}
                    {gearData.rangedStrengthBonus > 0 && (
                        <div className="gear-stat ranged">
                            <span className="stat-icon">🎯</span>
                            <span className="stat-label">Ranged Strength</span>
                            <span className="stat-value">+{gearData.rangedStrengthBonus}%</span>
                        </div>
                    )}
                    {gearData.canopyReductionBonus !== 0 && (
                        <div className="gear-stat canopy">
                            <span className="stat-icon">🛡️</span>
                            <span className="stat-label">Canopy Reduction</span>
                            <span className="stat-value">{gearData.canopyReductionBonus}%</span>
                        </div>
                    )}
                    {gearData.meleeStrengthBonus === 0 && gearData.rangedStrengthBonus === 0 && gearData.canopyReductionBonus === 0 && (
                        <div className="gear-stat none">No stat bonuses</div>
                    )}
                </div>
            </div>
            <div className="gear-info">
                <p>This gear has been added to your inventory. Visit the Admiral page to equip it.</p>
            </div>
        </div>
    );
}

function MessageView({ id, items, onBack }: { id: string, items: any[], onBack: () => void }) {
    const message = items.find(i => i.id === id);
    if (!message) return <div>Message not found.</div>;

    // Handle gear drop messages with special styling
    if (message.subType === 'gear_drop') {
        return <GearDropMessageView message={message} onBack={onBack} />;
    }

    // Handle transfer complete messages with special styling
    if (message.subType === 'transfer_complete') {
        return <TransferCompleteMessageView message={message} onBack={onBack} />;
    }

    // Handle starvation desertion messages with special styling
    if (message.subType === 'starvation_desertion') {
        return <StarvationDesertionView message={message} onBack={onBack} />;
    }

    // Handle coalition invite messages
    if (message.subType === 'coalition_invite') {
        return <CoalitionInviteView message={message} onBack={onBack} />;
    }

    return (
        <div className="message-view">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
            </div>
            <div className="message-header">
                <h3>{message.title}</h3>
                <div className="message-date">{new Date(message.createdAt).toLocaleString()}</div>
            </div>
            <div className="message-body">
                {message.content}
            </div>
        </div>
    );
}

// Transfer Complete Message View
interface TransferData {
    fromPlanet: { id: string; name: string; x: number; y: number };
    toPlanet: { id: string; name: string; x: number; y: number };
    units: Record<string, number>;
    resources: { carbon: number; titanium: number; food: number };
}

function TransferCompleteMessageView({ message, onBack }: { message: any, onBack: () => void }) {
    let data: TransferData | null = null;
    try {
        data = JSON.parse(message.content);
    } catch (e) {
        // Fall back to text display
    }

    if (!data) {
        return (
            <div className="message-view">
                <div className="br-nav">
                    <button className="back-btn" onClick={onBack}>← Back</button>
                </div>
                <div className="message-header">
                    <h3>{message.title}</h3>
                    <div className="message-date">{new Date(message.createdAt).toLocaleString()}</div>
                </div>
                <div className="message-body">{message.content}</div>
            </div>
        );
    }

    const hasUnits = Object.values(data.units).some(v => v > 0);
    const hasResources = data.resources.carbon > 0 || data.resources.titanium > 0 || data.resources.food > 0;

    return (
        <div className="message-view transfer-complete-view">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
            </div>
            <div className="report-header victory">
                <h3>TRANSFER COMPLETE</h3>
                <div className="sub-status">Fleet arrived safely</div>
            </div>

            {/* Route Display */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: '20px 0', fontSize: '1.1rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: '#00f3ff' }}>{data.fromPlanet.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>({data.fromPlanet.x}, {data.fromPlanet.y})</div>
                </div>
                <span style={{ color: '#00ff88', fontSize: '1.5rem' }}>➜</span>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: '#00f3ff' }}>{data.toPlanet.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>({data.toPlanet.x}, {data.toPlanet.y})</div>
                </div>
            </div>

            {/* Units Transferred */}
            {hasUnits && (
                <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#d32f2f' }}>🎖️ Troops Transferred</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {Object.entries(data.units).filter(([_, c]) => c > 0).map(([unit, count]) => (
                            <div key={unit} style={{ background: 'rgba(211, 47, 47, 0.2)', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(211, 47, 47, 0.3)' }}>
                                <span style={{ textTransform: 'capitalize' }}>{unit.replace(/_/g, ' ')}</span>: <span style={{ fontWeight: 'bold', color: '#fff' }}>{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Resources Transferred */}
            {hasResources && (
                <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#00f3ff' }}>📦 Resources Delivered</h4>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {data.resources.carbon > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-block', width: '14px', height: '14px', background: '#5d4037', borderRadius: '50%' }}></span>
                                <span style={{ color: '#8d6e63' }}>Carbon:</span>
                                <span style={{ fontWeight: 'bold', color: '#fff' }}>{data.resources.carbon.toLocaleString()}</span>
                            </div>
                        )}
                        {data.resources.titanium > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-block', width: '14px', height: '14px', background: '#90a4ae', borderRadius: '50%' }}></span>
                                <span style={{ color: '#90a4ae' }}>Titanium:</span>
                                <span style={{ fontWeight: 'bold', color: '#fff' }}>{data.resources.titanium.toLocaleString()}</span>
                            </div>
                        )}
                        {data.resources.food > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-block', width: '14px', height: '14px', background: '#81c784', borderRadius: '50%' }}></span>
                                <span style={{ color: '#81c784' }}>Food:</span>
                                <span style={{ fontWeight: 'bold', color: '#fff' }}>{data.resources.food.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!hasUnits && !hasResources && (
                <div style={{ marginTop: '15px', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                    No units or resources were transferred with this fleet.
                </div>
            )}
        </div>
    );
}

// Starvation Desertion Message View
interface StarvationData {
    planetName: string;
    lostUnits: Record<string, number>;
    sustainableUpkeep: number;
    totalUpkeep: number;
}

function StarvationDesertionView({ message, onBack }: { message: any, onBack: () => void }) {
    let data: StarvationData | null = null;
    try {
        data = JSON.parse(message.content);
    } catch (e) {
        // Fall back to text display
    }

    if (!data) {
        return (
            <div className="message-view">
                <div className="br-nav">
                    <button className="back-btn" onClick={onBack}>← Back</button>
                </div>
                <div className="message-header">
                    <h3>{message.title}</h3>
                    <div className="message-date">{new Date(message.createdAt).toLocaleString()}</div>
                </div>
                <div className="message-body">{message.content}</div>
            </div>
        );
    }

    return (
        <div className="message-view starvation-desertion-view">
            <div className="br-nav">
                <button className="back-btn" onClick={onBack}>← Back</button>
            </div>
            <div className="report-header defeat">
                <h3>TROOPS DESERTED</h3>
                <div className="sub-status">Critical Food Shortage on {data.planetName}</div>
            </div>

            <div style={{ padding: '20px', background: 'rgba(255, 0, 0, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 0, 0, 0.2)', marginTop: '15px' }}>
                <p style={{ color: '#ffb74d', margin: '0 0 15px 0', fontSize: '1rem', lineHeight: '1.4' }}>
                    Supplies ran dry on <strong>{data.planetName}</strong>. Without nutrient paste, your stationed troops have abandoned their posts.
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-around', margin: '20px 0', textAlign: 'center' }}>
                    <div>
                        <div style={{ color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Requirement</div>
                        <div style={{ color: '#ff5252', fontSize: '1.2rem', fontWeight: 'bold' }}>{Math.round(data.totalUpkeep)}/hr</div>
                    </div>
                    <div style={{ alignSelf: 'center', fontSize: '1.2rem', color: '#444' }}>VS</div>
                    <div>
                        <div style={{ color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Sustainable</div>
                        <div style={{ color: '#4caf50', fontSize: '1.2rem', fontWeight: 'bold' }}>{Math.round(data.sustainableUpkeep)}/hr</div>
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#ff5252', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        💀 Casualties of Starvation
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {Object.entries(data.lostUnits).map(([unit, count]) => (
                            <div key={unit} style={{ background: 'rgba(255, 82, 82, 0.15)', padding: '6px 12px', borderRadius: '4px', border: '1px solid rgba(255, 82, 82, 0.3)' }}>
                                <span style={{ textTransform: 'capitalize', color: '#ff8a80' }}>{unit.replace(/_/g, ' ')}</span>: <span style={{ fontWeight: 'bold', color: '#fff' }}>-{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p style={{ marginTop: '20px', color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    Recommendation: Increase food production or relocate troops to prevent further desertion.
                </p>
            </div>
        </div>
    );
}

// Coalition Invite Message View
interface InviteData {
    inviteId: string;
    coalitionId: string;
    coalitionName: string;
    coalitionTag: string;
    senderName: string;
}

function CoalitionInviteView({ message, onBack }: { message: any, onBack: () => void }) {
    const [responding, setSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    let data: InviteData | null = null;
    try {
        data = JSON.parse(message.content);
    } catch (e) { }

    if (!data) return <div className="message-view">Invalid invite data.</div>;

    const handleResponse = async (accept: boolean) => {
        try {
            setSending(true);
            setError(null);
            const response = await api.respondToCoalitionInvite(data!.inviteId, accept);
            setResult(response.message);
            // If they accepted, we might want to refresh user state globally, 
            // but for now just show success.
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSending(false);
        }
    };

    if (result) {
        return (
            <div className="message-view">
                <div className="br-nav"><button className="back-btn" onClick={onBack}>← Back</button></div>
                <div className="message-header"><h3>Invitation Result</h3></div>
                <div className="message-body" style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '1.2rem', color: '#00ff88', marginBottom: '20px' }}>{result}</div>
                    <button className="back-btn" onClick={onBack}>Return to Comms</button>
                </div>
            </div>
        );
    }

    return (
        <div className="message-view coalition-invite-view">
            <div className="br-nav"><button className="back-btn" onClick={onBack}>← Back</button></div>
            <div className="report-header victory" style={{ background: 'rgba(156, 39, 176, 0.2)', borderColor: '#9c27b0' }}>
                <h3>COALITION INVITATION</h3>
                <div className="sub-status">Encrypted Broadcast from {data.senderName}</div>
            </div>

            <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginTop: '20px' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>You have been requested to join</p>
                <h2 style={{ color: '#00f3ff', margin: '0 0 5px 0' }}>{data.coalitionName}</h2>
                <div style={{ color: '#ff00ff', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '30px' }}>[{data.coalitionTag}]</div>

                {error && <div style={{ color: '#f44336', marginBottom: '20px' }}>{error}</div>}

                <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                    <button 
                        onClick={() => handleResponse(true)} 
                        disabled={responding}
                        style={{ 
                            padding: '12px 40px', background: '#00ff88', color: '#000', 
                            border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' 
                        }}
                    >
                        ACCEPT
                    </button>
                    <button 
                        onClick={() => handleResponse(false)} 
                        disabled={responding}
                        style={{ 
                            padding: '12px 40px', background: 'transparent', color: '#ff4444', 
                            border: '2px solid #ff4444', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' 
                        }}
                    >
                        DECLINE
                    </button>
                </div>
            </div>
        </div>
    );
}

function BattleReportView({ id, onBack }: { id: string, onBack: () => void }) {
    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'overview' | 'details'>('overview'); // Default to overview
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
    // ... rest of BattleReportView

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
                    <div className="admiral-section">
                        <h4>Commanders</h4>
                        <div className="admiral-grid">
                            {/* Attacker Admiral Card */}
                            <div className="admiral-card attacker">
                                <div className="admiral-header">
                                    <span className="admiral-label">Attacker</span>
                                    <span className="admiral-name">{admirals.attacker?.name || 'No Admiral Assigned'}</span>
                                </div>
                                <div className="admiral-bonuses">
                                    {admirals.attacker ? (
                                        <>
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
                                        </>
                                    ) : (
                                        <span className="no-bonus">No bonuses applied to this fleet</span>
                                    )}
                                </div>
                            </div>

                            {/* Defender Admiral Card */}
                            <div className="admiral-card defender">
                                <div className="admiral-header">
                                    <span className="admiral-label">Defender</span>
                                    <span className="admiral-name">
                                        {admirals.defender ? admirals.defender.name : 'No Admiral Stationed'}
                                    </span>
                                </div>
                                <div className="admiral-bonuses">
                                    {admirals.defender ? (
                                        <>
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
                                        </>
                                    ) : (
                                        <span className="no-bonus">No defensive bonuses active</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
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
                                            {result.initialDefenderUnits === null ? (
                                                <div className="intel-masked">Intelligence Unavailable</div>
                                            ) : (
                                                <UnitList units={result.initialDefenderUnits} colorClass="neutral" />
                                            )}
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
                                                        {wave.attackerTriangleBonus > 1 && (
                                                            <span className="tactical-advantage positive" title={`+${((wave.attackerTriangleBonus - 1) * 100).toFixed(0)}% Tactical Advantage`}>
                                                                📈 +{((wave.attackerTriangleBonus - 1) * 100).toFixed(0)}% Adv.
                                                            </span>
                                                        )}
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
                                                            {wave.defenderTriangleBonus > 1 && (
                                                                <div className="tactical-advantage positive" style={{ fontSize: '0.7rem', marginTop: '2px' }}>
                                                                    🛡️ +{((wave.defenderTriangleBonus - 1) * 100).toFixed(0)}% Counter-Adv.
                                                                </div>
                                                            )}
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
                                        {admirals.attacker ? (
                                            <>
                                                {admirals.attacker.meleeStrengthBonus > 0 && ` | Melee: +${admirals.attacker.meleeStrengthBonus}%`}
                                                {admirals.attacker.rangedStrengthBonus > 0 && ` | R: +${admirals.attacker.rangedStrengthBonus}%`}
                                                {admirals.attacker.canopyReductionBonus !== 0 && ` | Canopy Reduc: ${admirals.attacker.canopyReductionBonus}%`}
                                            </>
                                        ) : (
                                            ` | No Admiral`
                                        )}
                                    </div>
                                    <div className="losses">Lost: <UnitList units={surfaceResult.attackerLosses} colorClass="red" /></div>
                                </div>
                                <div className="cy-vs">VS</div>
                                <div className="cy-side">
                                    <h5>Defender Force</h5>
                                    <div>Deployed: {surfaceResult.initialDefenderUnits === null ? (
                                        <span className="intel-masked">Intelligence Unavailable</span>
                                    ) : (
                                        <UnitList units={surfaceResult.initialDefenderUnits} colorClass="neutral" />
                                    )}</div>
                                    <div className="bonus-breakdown">
                                        Sector Bonus: +{(surfaceResult.defenderBonus * 100).toFixed(0)}%
                                        {admirals.defender ? (
                                            <>
                                                {admirals.defender.meleeStrengthBonus > 0 && ` | Melee: +${admirals.defender.meleeStrengthBonus}%`}
                                                {admirals.defender.rangedStrengthBonus > 0 && ` | R: +${admirals.defender.rangedStrengthBonus}%`}
                                                {admirals.defender.canopyReductionBonus !== 0 && ` | Canopy Reduc: ${admirals.defender.canopyReductionBonus}%`}
                                            </>
                                        ) : (
                                            ` | No Admiral`
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

