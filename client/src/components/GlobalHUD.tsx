import { useEffect, useState } from 'react';
import './GlobalHUD.css';
import { type Planet, api } from '../lib/api';

import Mailbox from './Mailbox';

interface GlobalHUDProps {
    user: { username: string } | null;
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

    // Mocks for features not yet in backend
    const level = 12;
    const xpPercent = 45;
    const rubies = 250;
    const publicOrder = 180; // High order

    const credits = planet?.resources?.credits || 0;
    const carbon = planet?.resources?.carbon || 0;
    const titanium = planet?.resources?.titanium || 0;
    const food = planet?.resources?.food || 0;

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
                </div>
                <div className="res-group">
                    <div className="res-icon titanium-icon"></div>
                    <span className="res-val">{Math.floor(titanium).toLocaleString()}</span>
                </div>
                <div className="res-group">
                    <div className="res-icon food-icon"></div>
                    <span className="res-val">{Math.floor(food).toLocaleString()}</span>
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
                    </div>
                </div>
            </div>

            {/* Top Right: Currencies & Order */}
            <div className="hud-currencies">
                <div className="currency-pill">
                    <span className="icon coin-icon">C</span>
                    <span>{Math.floor(credits).toLocaleString()}</span>
                </div>
                <div className="currency-pill premium">
                    <span className="icon ruby-icon">R</span>
                    <span>{rubies}</span>
                </div>
                <div className="hud-icon-btn mail-icon" onClick={() => setMailboxOpen(true)}>
                    ✉️
                </div>
            </div>

            {/* Public Order Bar (Underneath) */}
            <div className="hud-public-order">
                <span>System Stability: {publicOrder}%</span>
                <div className="order-indicator" style={{ width: `${Math.min(100, publicOrder / 2)}%` }}></div>
            </div>

            {mailboxOpen && <Mailbox onClose={() => setMailboxOpen(false)} />}
        </div>
    );
}
