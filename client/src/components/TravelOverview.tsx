import { useState, useEffect } from 'react';
import { api, type Fleet } from '../lib/api';
import './TravelOverview.css';

interface Probe {
    id: string;
    type: string;
    targetX: number;
    targetY: number;
    status: string;
    arrivalTime: string;
    returnTime?: string;
    fromPlanet: { name: string };
}

interface TravelOverviewProps {
    onClose: () => void;
}

export default function TravelOverview({ onClose }: TravelOverviewProps) {
    const [fleets, setFleets] = useState<Fleet[]>([]);
    const [probes, setProbes] = useState<Probe[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());

    const fetchData = async () => {
        try {
            const [fleetData, probeData] = await Promise.all([
                api.getFleets(),
                api.getProbes()
            ]);
            setFleets(fleetData.fleets);
            // Filter only traveling or returning probes for overview
            setProbes(probeData.filter((p: any) => p.status === 'traveling' || p.status === 'returning'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            setNow(new Date());
            if (new Date().getSeconds() % 5 === 0) fetchData();
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

    // Combine and sort all movements by arrival time
    const allMovements = [
        ...fleets.map(f => ({ ...f, movementType: 'fleet' })),
        ...probes.map(p => ({ ...p, movementType: 'probe' }))
    ].sort((a: any, b: any) => {
        const timeA = a.movementType === 'fleet' ? new Date(a.arriveAt).getTime() : (a.status === 'returning' ? new Date(a.returnTime!).getTime() : new Date(a.arrivalTime).getTime());
        const timeB = b.movementType === 'fleet' ? new Date(b.arriveAt).getTime() : (b.status === 'returning' ? new Date(b.returnTime!).getTime() : new Date(b.arrivalTime).getTime());
        return timeA - timeB;
    });

    return (
        <div className="travel-overview-overlay">
            <div className="travel-overview">
                <div className="header">
                    <h2>Travel Overview</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="content">
                    <div className="summary-bar">
                        <span>Active Movements: {allMovements.length}</span>
                    </div>

                    <div className="fleets-list">
                        {allMovements.length === 0 && <div className="no-fleets">No active movements.</div>}

                        {allMovements.map((move: any) => {
                            if (move.movementType === 'fleet') {
                                const timeLeft = new Date(move.arriveAt).getTime() - now.getTime();
                                return (
                                    <div key={move.id} className={`fleet-row ${move.type}`}>
                                        <div className="fleet-info">
                                            <span className="type">{move.type.toUpperCase()}</span>
                                            <div className="details">
                                                From: <b>{move.fromPlanet.name}</b> <br />
                                                To: <b>{move.toPlanet.name}</b>
                                            </div>
                                        </div>

                                        <div className="fleet-units">
                                            {Object.entries(move.units).map(([u, c]) => (
                                                <span key={u} className="unit-badge">{c as number} {u}</span>
                                            ))}
                                        </div>

                                        <div className="fleet-timer">
                                            <span className="time">{formatDuration(timeLeft)}</span>
                                            <span className="status">{move.status}</span>
                                        </div>
                                    </div>
                                );
                            } else {
                                const isReturning = move.status === 'returning';
                                const targetTime = isReturning ? new Date(move.returnTime!).getTime() : new Date(move.arrivalTime).getTime();
                                const timeLeft = targetTime - now.getTime();

                                return (
                                    <div key={move.id} className={`fleet-row espionage ${move.status}`}>
                                        <div className="fleet-info">
                                            <span className="type">ESPIONAGE ({move.type === 'advanced_probe' ? 'ADV' : 'BASIC'})</span>
                                            <div className="details">
                                                {isReturning ? (
                                                    <>Returning to: <b>{move.fromPlanet.name}</b></>
                                                ) : (
                                                    <>From: <b>{move.fromPlanet.name}</b> <br /> Target: <b>[{move.targetX}, {move.targetY}]</b></>
                                                )}
                                            </div>
                                        </div>

                                        <div className="fleet-units">
                                            <span className="unit-badge">1 Recon Probe</span>
                                        </div>

                                        <div className="fleet-timer">
                                            <span className="time">{formatDuration(timeLeft)}</span>
                                            <span className="status">{move.status.toUpperCase()}</span>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
