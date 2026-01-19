import { useEffect, useState, useCallback } from 'react';
import './GlobalHUD.css';
import { type Planet, api } from '../lib/api';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { useSocket } from '../lib/SocketContext';

import Mailbox from './Mailbox';
import ResourceBreakdownPanel from './ResourceBreakdownPanel';

interface GlobalHUDProps {
    user: { username: string; xp?: number; level?: number; } | null;
    currentPlanet: Planet | null;
}

export default function GlobalHUD({ user, currentPlanet: initialPlanet }: GlobalHUDProps) {
    const [planet, setPlanet] = useState<Planet | null>(initialPlanet);
    const [mailboxOpen, setMailboxOpen] = useState(false);
    const [devToolsOpen, setDevToolsOpen] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const [lastClickTime, setLastClickTime] = useState(0);
    const [selectedResourcePanel, setSelectedResourcePanel] = useState<'carbon' | 'titanium' | 'food' | null>(null);

    // WebSocket connection status
    const { isConnected } = useSocket();

    // Sync state if prop changes
    useEffect(() => {
        setPlanet(initialPlanet);
    }, [initialPlanet]);

    // WebSocket subscription for real-time planet updates
    useSocketEvent<Planet>('planet:updated', useCallback((data) => {
        if (planet && data.id === planet.id) {
            setPlanet(data);
        }
    }, [planet?.id]));

    // Fallback polling when socket disconnects
    useEffect(() => {
        if (!planet?.id || isConnected) return;

        const interval = setInterval(() => {
            api.getPlanet(planet.id).then(setPlanet).catch(console.error);
        }, 5000);

        return () => clearInterval(interval);
    }, [planet?.id, isConnected]);

    // Level calculation
    const level = user?.level || 1;
    const xp = user?.xp || 0;

    // XP Curve
    const prevThreshold = 100 * Math.pow(level - 1, 2);
    const nextThreshold = 100 * Math.pow(level, 2);
    const range = nextThreshold - prevThreshold;
    const xpInLevel = Math.max(0, xp - prevThreshold);
    const xpPercent = range > 0 ? (xpInLevel / range) * 100 : 0;

    // Safe extraction of resources (handle both object and primitive)
    const resources = planet?.resources || {};
    const darkMatter = typeof resources === 'object' ? (resources.darkMatter || 0) : 0;
    const darkMatterRate = planet?.stats?.darkMatterRate || 0;

    const credits = typeof resources === 'object' ? (resources.credits || 0) : 0;
    const carbon = typeof resources === 'object' ? (resources.carbon || 0) : 0;
    const titanium = typeof resources === 'object' ? (resources.titanium || 0) : 0;
    const food = typeof resources === 'object' ? (resources.food || 0) : 0;

    // Derived Stats
    const stats = planet?.stats;
    const publicOrder = stats?.publicOrder || 0;
    const productivity = stats?.productivity || 100;

    // Workforce Stats (new economy system)
    const workforceRequired = stats?.workforceRequired || 0;
    const workforceEfficiency = stats?.workforceEfficiency || 1.0;
    const staffingRatio = stats?.staffingRatio || 1.0;
    const overstaffBonus = stats?.overstaffBonus || 0;

    // Food Tooltip
    const foodProd = stats?.foodRate || 0;
    const foodCons = stats?.foodConsumption || 0;
    const foodNet = stats?.netFoodRate || 0;
    const foodTooltip = `Nutrient Paste:\nProd: ${foodProd.toFixed(2)}/h\nCons: ${foodCons.toFixed(2)}/h\nNet: ${foodNet > 0 ? '+' : ''}${foodNet.toFixed(2)}/h`;

    // PO Tooltip
    // Show Productivity Bonus
    const poTooltip = `System Stability: ${publicOrder}\nProductivity: ${productivity.toFixed(0)}%\n(100% Base + Bonus)`;

    // Credits Tooltip
    const taxRev = stats?.creditRate || 0;
    const pop = stats?.population || 0;
    const creditTooltip = `Population: ${pop}\nTax Revenue: ${taxRev.toFixed(1)}/h`;

    const handleBannerClick = () => {
        const now = Date.now();
        if (now - lastClickTime < 500) {
            const newCount = clickCount + 1;
            setClickCount(newCount);
            if (newCount >= 3) {
                setDevToolsOpen(true);
                setClickCount(0);
            }
        } else {
            setClickCount(1);
        }
        setLastClickTime(now);
    };

    return (
        <div className="global-hud">
            {/* Top Left: Level & User */}
            <div className="hud-profile-section" onClick={handleBannerClick}>
                <div className="level-badge">{level}</div>
                <div className="profile-details">
                    <div className="username">
                        {user?.username || 'Commander'}
                    </div>
                    <div className="xp-bar-container">
                        <div className="xp-bar" style={{ width: `${xpPercent}%` }}></div>
                    </div>
                </div>

                <div className="resource-dropdown xp-dropdown">
                    <h5>Commander Progress</h5>
                    <div className="military-row">
                        <span className="unit-name">Level:</span>
                        <span className="unit-count">{level}</span>
                    </div>
                    <div className="military-row">
                        <span className="unit-name">Current XP:</span>
                        <span className="unit-count">{xpInLevel.toLocaleString()}</span>
                    </div>
                    <div className="military-row">
                        <span className="unit-name">Next Level:</span>
                        <span className="unit-count">{range.toLocaleString()}</span>
                    </div>
                    <div className="military-row">
                        <span className="unit-name">Remaining:</span>
                        <span className="unit-count">{(range - xpInLevel).toLocaleString()}</span>
                    </div>
                    <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                        <span className="unit-name">Total XP:</span>
                        <span className="unit-count">{xp.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Top Center: Resources */}
            <div className="hud-resources-bar">
                <div
                    className="res-group clickable"
                    onClick={() => setSelectedResourcePanel('carbon')}
                    title="Click for detailed breakdown"
                >
                    <div className="res-icon carbon-icon"></div>
                    <span className="res-val">{Math.floor(carbon).toLocaleString()}</span>
                    <span className="res-rate-mini">+{stats?.carbonRate.toFixed(2)}/h</span>

                    <div className="resource-dropdown carbon-dropdown">
                        <h5>Carbon Production</h5>
                        <div className="military-row">
                            <span className="unit-name">Base Rate:</span>
                            <span className="unit-count">100/h</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Buildings:</span>
                            <span className="unit-count">+{Math.max(0, (stats?.carbonRate || 0) - (100 * (productivity / 100))).toFixed(2)}/h</span>
                        </div>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Total:</span>
                            <span className="unit-count">+{stats?.carbonRate.toFixed(2)}/h</span>
                        </div>
                        <div style={{ fontSize: '0.7em', color: '#666', marginTop: '6px', fontStyle: 'italic' }}>Click for detailed breakdown</div>
                    </div>
                </div>
                <div
                    className="res-group clickable"
                    onClick={() => setSelectedResourcePanel('titanium')}
                    title="Click for detailed breakdown"
                >
                    <div className="res-icon titanium-icon"></div>
                    <span className="res-val">{Math.floor(titanium).toLocaleString()}</span>
                    <span className="res-rate-mini">+{stats?.titaniumRate.toFixed(2)}/h</span>

                    <div className="resource-dropdown titanium-dropdown">
                        <h5>Titanium Production</h5>
                        <div className="military-row">
                            <span className="unit-name">Base Rate:</span>
                            <span className="unit-count">100/h</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Buildings:</span>
                            <span className="unit-count">+{Math.max(0, (stats?.titaniumRate || 0) - (100 * (productivity / 100))).toFixed(2)}/h</span>
                        </div>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Total:</span>
                            <span className="unit-count">+{stats?.titaniumRate.toFixed(2)}/h</span>
                        </div>
                    </div>
                </div>
                <div
                    className="res-group clickable"
                    onClick={() => setSelectedResourcePanel('food')}
                    title="Click for detailed breakdown"
                >
                    <div className="res-icon food-icon"></div>
                    <span className={`res-val ${foodNet < 0 ? 'warning' : ''}`}>{Math.floor(food).toLocaleString()}</span>
                    <span className="res-rate-mini">{foodNet > 0 ? '+' : ''}{foodNet.toFixed(2)}/h</span>

                    <div className="resource-dropdown food-dropdown">
                        <h5>Food Supply</h5>
                        <div className="military-row">
                            <span className="unit-name">Production:</span>
                            <span className="unit-count">+{foodProd.toFixed(2)}/h</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Consumption:</span>
                            <span className="unit-count">-{foodCons.toFixed(2)}/h</span>
                        </div>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Net:</span>
                            <span className={`unit-count ${foodNet < 0 ? 'warning-text' : 'success-text'}`}>
                                {foodNet > 0 ? '+' : ''}{foodNet.toFixed(2)}/h
                            </span>
                        </div>
                        <div style={{ fontSize: '0.7em', color: '#666', marginTop: '6px', fontStyle: 'italic' }}>Click for detailed breakdown</div>
                    </div>
                </div>

                {/* Military Dropdown */}
                <div className="res-group military-group">
                    <div className="res-icon military-icon"></div>
                    <span className="res-val">{planet?.units ? Object.values(planet.units).reduce((a, b) => a + b, 0).toLocaleString() : 0}</span>

                    <div className="military-dropdown">
                        <h5>Stationed Units</h5>
                        {planet?.units && Object.entries(planet.units).length > 0 ? (
                            Object.entries(planet.units).map(([unit, count]) => (
                                count > 0 && (
                                    <div key={unit} className="military-row">
                                        <span className="unit-name">{unit}</span>
                                        <span className="unit-count">{count}</span>
                                    </div>
                                )
                            ))
                        ) : (
                            <div className="military-row">No units stationed</div>
                        )}
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Upkeep:</span>
                            <span className="unit-count">-{foodCons.toFixed(0)} Food/h</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Right: Currencies & Order */}
            <div className="hud-currencies">
                {/* Integrated Public Order */}
                <div className="res-group order-group">
                    {/* Visual Indicator: Color based on Productivity */}
                    <div
                        className={`res-icon order-icon ${productivity >= 100 ? 'positive' : 'negative'}`}
                        style={{
                            background: productivity >= 100 ? '#4caf50' : '#f44336',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}
                    >
                        {publicOrder >= 0 ? '☺' : '☹'}
                    </div>
                    <span className="res-val" style={{ color: productivity >= 100 ? '#81c784' : '#e57373' }}>
                        {productivity.toFixed(0)}%
                    </span>

                    <div className="resource-dropdown order-dropdown">
                        <h5>System Stability</h5>
                        <div className="military-row">
                            <span className="unit-name">Index:</span>
                            <span className="unit-count">{publicOrder}</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Productivity:</span>
                            <span className="unit-count" style={{ color: productivity >= 100 ? '#4caf50' : '#f44336' }}>
                                {productivity.toFixed(0)}%
                            </span>
                        </div>
                        <div className="military-row" style={{ fontSize: '0.8em', color: '#aaa' }}>
                            (Base 100% + Bonus)
                        </div>
                        <div className="order-bar-bg" style={{ marginTop: '5px', height: '4px' }}>
                            <div
                                className={`order-indicator ${publicOrder >= 0 ? 'positive' : 'negative'}`}
                                style={{ width: `${Math.min(100, Math.abs(publicOrder) / 5)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Workforce Efficiency Indicator */}
                <div className="res-group workforce-group">
                    <div
                        className="res-icon workforce-icon"
                        style={{
                            background: workforceEfficiency >= 1.0 ? '#4caf50' : workforceEfficiency >= 0.5 ? '#ff9800' : '#f44336',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}
                    >
                        👷
                    </div>
                    <span className="res-val" style={{ color: workforceEfficiency >= 1.0 ? '#81c784' : workforceEfficiency >= 0.5 ? '#ffb74d' : '#e57373' }}>
                        {(workforceEfficiency * 100).toFixed(0)}%
                    </span>

                    <div className="resource-dropdown workforce-dropdown">
                        <h5>Workforce Efficiency</h5>
                        <p style={{ fontSize: '0.8em', color: '#aaa', marginBottom: '8px' }}>
                            Production buildings require workers to operate.
                        </p>
                        <div className="military-row">
                            <span className="unit-name">Workers Available:</span>
                            <span className="unit-count">{pop}</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Workers Required:</span>
                            <span className="unit-count">{workforceRequired}</span>
                        </div>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Staffing Ratio:</span>
                            <span className="unit-count" style={{ color: staffingRatio >= 1.0 ? '#4caf50' : staffingRatio >= 0.5 ? '#ff9800' : '#f44336' }}>
                                {(staffingRatio * 100).toFixed(0)}%
                            </span>
                        </div>
                        {overstaffBonus > 0 && (
                            <div className="military-row">
                                <span className="unit-name">Overstaff Bonus:</span>
                                <span className="unit-count" style={{ color: '#4caf50' }}>+{(overstaffBonus * 100).toFixed(1)}%</span>
                            </div>
                        )}
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Final Efficiency:</span>
                            <span className="unit-count" style={{ color: workforceEfficiency >= 1.0 ? '#4caf50' : '#ff9800' }}>
                                {(workforceEfficiency * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#888', marginTop: '8px', fontStyle: 'italic' }}>
                            Build Housing or upgrade Colony Hub for more workers.
                        </div>
                    </div>
                </div>

                <div className="currency-pill">
                    <span className="icon coin-icon">C</span>
                    <span>{Math.floor(credits).toLocaleString()}</span>
                    <div className="resource-dropdown coin-dropdown">
                        <h5>Credits</h5>
                        <p>Taxation revenue from all your colonies. This is a <strong>Global Resource</strong> shared across all your planets.</p>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Total Rate:</span>
                            <span className="unit-count" style={{ color: '#f1c40f' }}>+{taxRev.toFixed(1)}/h</span>
                        </div>
                    </div>
                </div>

                <div className="currency-pill premium">
                    <span className="icon dm-icon">DM</span>
                    <span>{Math.floor(darkMatter).toLocaleString()}</span>
                    <div className="resource-dropdown dm-dropdown">
                        <h5>Dark Matter</h5>
                        <p>Exotic energy harvested from Horizon Harvesters. This is a <strong>Global Resource</strong> shared across all your colonies.</p>
                        <div className="military-row" style={{ borderTop: '1px solid #444', marginTop: '5px', paddingTop: '5px' }}>
                            <span className="unit-name">Total Rate:</span>
                            <span className="unit-count" style={{ color: '#9b59b6' }}>+{darkMatterRate.toFixed(2)}/h</span>
                        </div>
                    </div>
                </div>
                <div className="hud-icon-btn mail-icon" onClick={() => setMailboxOpen(true)}>
                    ✉️
                </div>
            </div>

            {/* Public Order Bar Removed (Integrated) */}

            {mailboxOpen && <Mailbox onClose={() => setMailboxOpen(false)} />}
            {devToolsOpen && planet && (
                <div className="dev-tools-overlay" onClick={() => setDevToolsOpen(false)}>
                    <div className="dev-tools-modal" onClick={e => e.stopPropagation()}>
                        <div className="dev-header">
                            <h3>COMMANDER DEV TOOLS</h3>
                            <button className="close-btn" onClick={() => setDevToolsOpen(false)}>×</button>
                        </div>
                        <div className="dev-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {/* Resources */}
                            <button onClick={async () => {
                                try {
                                    await api.devAddResources(planet.id, 10000);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('10,000 resources added');
                                } catch (e: any) { alert(e.message); }
                            }}>
                                +10K Resources
                            </button>
                            <button onClick={async () => {
                                try {
                                    await api.devAddResources(planet.id, 1000000);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('1,000,000 resources added');
                                } catch (e: any) { alert(e.message); }
                            }}>
                                +1M Resources
                            </button>

                            {/* Global Currencies */}
                            <button onClick={async () => {
                                try {
                                    await api.devAddDarkMatter(1000);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('1,000 Dark Matter added');
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#9b59b6' }}>
                                +1K Dark Matter
                            </button>
                            <button onClick={async () => {
                                try {
                                    await api.devAddDarkMatter(100000);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('100,000 Dark Matter added');
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#8e44ad' }}>
                                +100K Dark Matter
                            </button>

                            {/* Timers */}
                            <button onClick={async () => {
                                try {
                                    await api.devFastForward(planet.id);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('All crafts completed');
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#e67e22' }}>
                                ⏩ Complete All Crafts
                            </button>

                            {/* Level Up */}
                            <button onClick={async () => {
                                try {
                                    await api.devLevelUp(10);
                                    window.location.reload();
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#27ae60' }}>
                                +10 Levels
                            </button>

                            {/* Units */}
                            <button onClick={async () => {
                                try {
                                    await api.devAddArmy(planet.id, 100);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('100 of each unit added');
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#c0392b' }}>
                                +100 All Units
                            </button>
                            <button onClick={async () => {
                                try {
                                    await api.devAddArmy(planet.id, 1000);
                                    api.getPlanet(planet.id).then(setPlanet);
                                    alert('1,000 of each unit added');
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#e74c3c' }}>
                                +1K All Units
                            </button>

                            {/* Free Build Toggle */}
                            <button onClick={async () => {
                                try {
                                    const result = await api.devToggleFreeBuild();
                                    alert(result.message);
                                } catch (e: any) { alert(e.message); }
                            }} style={{ background: '#1abc9c', gridColumn: 'span 2' }}>
                                🔧 Toggle Free Build Mode
                            </button>

                            {/* Help Text */}
                            <div style={{ gridColumn: 'span 2', fontSize: '11px', color: '#888', marginTop: '8px', textAlign: 'center' }}>
                                Triple-click profile to open. Free Build requires server restart to take effect.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Resource Breakdown Panel */}
            {selectedResourcePanel && stats?.productionBreakdown && (
                <ResourceBreakdownPanel
                    resourceType={selectedResourcePanel}
                    production={stats.productionBreakdown[selectedResourcePanel]}
                    consumption={selectedResourcePanel === 'food' ? stats.consumptionBreakdown?.food : undefined}
                    onClose={() => setSelectedResourcePanel(null)}
                />
            )}
        </div>
    );
}
