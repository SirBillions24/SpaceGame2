import { useState, useEffect } from 'react';
import { api, type Fleet } from '../lib/api';
import './TravelOverview.css';

interface TravelOverviewProps {
    onClose: () => void;
}

export default function TravelOverview({ onClose }: TravelOverviewProps) {
    const [fleets, setFleets] = useState<Fleet[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());

    const fetchFleets = async () => {
        try {
            const data = await api.getFleets();
            setFleets(data.fleets);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFleets();
        const interval = setInterval(() => {
            setNow(new Date());
            // Optionally re-fetch periodically?
            // For now, rely on initial fetch + local timer, but refreshing list every 5s is good practice
            // to catch new fleets or status changes.
            if (new Date().getSeconds() % 5 === 0) fetchFleets();
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatDuration = (ms: number) => {
        if (ms <= 0) return 'Arriving...';
        const totalSecs = Math.floor(ms / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="travel-overview-overlay">
            <div className="travel-overview">
                <div className="header">
                    <h2>Travel Overview</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="content">
                    <div className="summary-bar">
                        <span>Active Movements: {fleets.length}</span>
                    </div>

                    <div className="fleets-list">
                        {fleets.length === 0 && <div className="no-fleets">No active movements.</div>}

                        {fleets.map(fleet => {
                            const arrive = new Date(fleet.arriveAt).getTime();
                            const timeLeft = arrive - now.getTime();

                            // If timeleft < 0 and status is 'enroute', it's processing

                            return (
                                <div key={fleet.id} className={`fleet-row ${fleet.type}`}>
                                    <div className="fleet-info">
                                        <span className="type">{fleet.type.toUpperCase()}</span>
                                        <div className="details">
                                            From: <b>{fleet.fromPlanet.name}</b> <br />
                                            To: <b>{fleet.toPlanet.name}</b>
                                        </div>
                                    </div>

                                    <div className="fleet-units">
                                        {Object.entries(fleet.units).map(([u, c]) => (
                                            <span key={u} className="unit-badge">{c} {u}</span>
                                        ))}
                                    </div>

                                    <div className="fleet-timer">
                                        <span className="time">{formatDuration(timeLeft)}</span>
                                        <span className="status">{fleet.status}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
