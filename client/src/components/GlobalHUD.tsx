import { useEffect, useState } from 'react';
import './GlobalHUD.css';
import { type Planet, api } from '../lib/api';

import Mailbox from './Mailbox';

interface GlobalHUDProps {
    user: { username: string; xp?: number; level?: number; } | null;
    currentPlanet: Planet | null;
}

export default function GlobalHUD({ user, currentPlanet: initialPlanet }: GlobalHUDProps) {
    const [planet, setPlanet] = useState<Planet | null>(initialPlanet);
    const [mailboxOpen, setMailboxOpen] = useState(false);

    // Sync state if prop changes
    useEffect(() => {
        setPlanet(initialPlanet);
    }, [initialPlanet]);

    // Poll for updates every 5 seconds
    useEffect(() => {
        if (!planet?.id) return;

        const interval = setInterval(() => {
            api.getPlanet(planet.id).then(setPlanet).catch(console.error);
        }, 5000);

        return () => clearInterval(interval);
    }, [planet?.id]);

    // Level calculation
    const level = user?.level || 1;
    const xp = user?.xp || 0;

    // XP Curve
    const prevThreshold = 100 * Math.pow(level - 1, 2);
    const nextThreshold = 100 * Math.pow(level, 2);
    const range = nextThreshold - prevThreshold;
    const xpInLevel = Math.max(0, xp - prevThreshold);
    const xpPercent = range > 0 ? (xpInLevel / range) * 100 : 0;

    const rubies = 250;

    const credits = planet?.resources?.credits || 0;
    const carbon = planet?.resources?.carbon || 0;
    const titanium = planet?.resources?.titanium || 0;
    const food = planet?.resources?.food || 0;

    // Derived Stats
    const stats = planet?.stats;
    const publicOrder = stats?.publicOrder || 0;
    const productivity = stats?.productivity || 100;

    // Food Tooltip
    const foodProd = stats?.foodRate || 0;
    const foodCons = stats?.foodConsumption || 0;
    const foodNet = stats?.netFoodRate || 0;
    const foodTooltip = `Prod: ${foodProd.toFixed(0)}/h\nCons: ${foodCons.toFixed(0)}/h\nNet: ${foodNet > 0 ? '+' : ''}${foodNet.toFixed(0)}/h`;

    // PO Tooltip
    // Show Productivity Bonus
    const poTooltip = `Public Order: ${publicOrder}\nProductivity: ${productivity.toFixed(0)}%\n(100% Base + Bonus)`;

    // Credits Tooltip
    const taxRev = stats?.creditRate || 0;
    const pop = stats?.population || 0;
    const creditTooltip = `Population: ${pop}\nTax Revenue: ${taxRev.toFixed(1)}/h`;

    return (
        <div className="global-hud">
            {/* Top Left: Level & User */}
            <div className="hud-profile-section">
                <div className="level-badge">{level}</div>
                <div className="profile-details">
                    <div className="username">{user?.username || 'Commander'}</div>
                    <div className="xp-bar-container">
                        <div className="xp-bar" style={{ width: `${xpPercent}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Top Center: Resources */}
            <div className="hud-resources-bar">
                <div className="res-group">
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
                    </div>
                </div>
                <div className="res-group">
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
                <div className="res-group">
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
                            <span className="unit-name">Stability:</span>
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

                <div className="currency-pill">
                    <span className="icon coin-icon">C</span>
                    <span>{Math.floor(credits).toLocaleString()}</span>
                    <div className="resource-dropdown coin-dropdown">
                        <h5>Colony Credits</h5>
                        <div className="military-row">
                            <span className="unit-name">Population:</span>
                            <span className="unit-count">{pop}</span>
                        </div>
                        <div className="military-row">
                            <span className="unit-name">Tax Revenue:</span>
                            <span className="unit-count">+{taxRev.toFixed(1)}/h</span>
                        </div>
                    </div>
                </div>

                <div className="currency-pill premium">
                    <span className="icon ruby-icon">R</span>
                    <span>{rubies}</span>
                </div>
                <div className="hud-icon-btn mail-icon" onClick={() => setMailboxOpen(true)}>
                    ✉️
                </div>
            </div>

            {/* Public Order Bar Removed (Integrated) */}

            {mailboxOpen && <Mailbox onClose={() => setMailboxOpen(false)} />}
        </div>
    );
}
