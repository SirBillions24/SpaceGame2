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

function BattleReportView({ id, onBack }: { id: string, onBack: () => void }) {
    const [report, setReport] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getReport(id).then(setReport).finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="loading-detail">Decryption in progress...</div>;
    if (!report) return <div>Error loading report.</div>;

    const isVictory = report.winner === (report.isAttacker ? 'attacker' : 'defender');
    const loot = report.loot || report.resourcesStolen;

    const renderLane = (laneId: string, result: any, assignment: any) => {
        if (!result) return <div className="lane-col empty">Empty Lane</div>;

        return (
            <div className={`lane-col ${result.winner === 'attacker' ? 'attacker-win' : 'defender-win'}`}>
                <h4>{laneId.toUpperCase()}</h4>
                <div className="lane-result">
                    Winner: {result.winner.toUpperCase()}
                </div>
                {/* Detailed unit breakdown could go here */}
            </div>
        );
    };

    return (
        <div className="battle-report-detail">
            <button className="back-btn" onClick={onBack}>← Back</button>

            <div className={`report-header ${isVictory ? 'victory' : 'defeat'}`}>
                <h3>{isVictory ? 'VICTORY' : 'DEFEAT'}</h3>
                <div>{report.isAttacker ? 'Attacker' : 'Defender'}</div>
            </div>

            {loot && (
                <div className="loot-section">
                    <h4>Resources Plundered</h4>
                    <div className="loot-grid">
                        <div className="loot-item carbon">
                            <span className="icon">C</span> {loot.carbon}
                        </div>
                        <div className="loot-item titanium">
                            <span className="icon">Ti</span> {loot.titanium}
                        </div>
                        <div className="loot-item food">
                            <span className="icon">F</span> {loot.food}
                        </div>
                    </div>
                </div>
            )}

            <div className="combat-lanes">
                <div className="lanes-container">
                    {/* Visual representation of 3 lanes */}
                    {renderLane('Left', report.laneResults.left, {})}
                    {renderLane('Front', report.laneResults.front, {})}
                    {renderLane('Right', report.laneResults.right, {})}
                </div>
            </div>

            <div className="casualties-section">
                <h4>Casualties</h4>
                <div className="casualties-grid">
                    <div className="cas-col">
                        <h5>My Force</h5>
                        {Object.entries(report.myLosses).map(([u, count]: any) => (
                            <div key={u} className="cas-row red">
                                <span>{u}</span>
                                <span>-{count}</span>
                            </div>
                        ))}
                    </div>
                    <div className="cas-col">
                        <h5>Enemy Force</h5>
                        {Object.entries(report.enemyLosses).map(([u, count]: any) => (
                            <div key={u} className="cas-row green">
                                <span>{u}</span>
                                <span>-{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
