
import { useState } from 'react';
import { api, type Planet } from '../lib/api';
import './WorkshopPanel.css';

interface WorkshopPanelProps {
    planet: Planet;
    type: 'defense_workshop' | 'siege_workshop';
    onClose: () => void;
    onUpdate: () => void;
}

const TOOLS: Record<string, any> = {
    'defense_workshop': [
        { id: 'sentry_drones', label: 'Sentry Drones', c: 40, t: 40, time: 30, desc: '+25% Shield Strength' },
        { id: 'hardened_bulkheads', label: 'Hardened Bulkheads', c: 280, t: 120, time: 60, desc: '+35% Hub Integrity' },
        { id: 'targeting_uplinks', label: 'Targeting Uplinks', c: 525, t: 225, time: 60, desc: '+25% Ranged Accuracy' }
    ],
    'siege_workshop': [
        { id: 'invasion_anchors', label: 'Invasion Anchors', c: 28, t: 12, time: 30, desc: '-10% Enemy Shield' },
        { id: 'plasma_breachers', label: 'Plasma Breachers', c: 56, t: 24, time: 60, desc: '-10% Enemy Hub' },
        { id: 'stealth_field_pods', label: 'Stealth Field Pods', c: 105, t: 45, time: 60, desc: '-10% Enemy Ranged Power' }
    ]
};

export default function WorkshopPanel({ planet, type, onClose, onUpdate }: WorkshopPanelProps) {
    const [selectedTool, setSelectedTool] = useState<string>(TOOLS[type][0].id);
    const [count, setCount] = useState(1);
    const [loading, setLoading] = useState(false);

    const tools = TOOLS[type];

    const handleManufacture = async () => {
        if (count <= 0) return;
        setLoading(true);
        try {
            await api.manufacture(planet.id, selectedTool, count);
            onUpdate();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Filter queue for relevant tools? Or just show all?
    // Usually a planet has one global queue or separate queues?
    // Our backend stored it in `manufacturingQueue` globally on planet.
    // So we show all manufacturing.
    const queue = planet.manufacturingQueue || [];

    return (
        <div className="workshop-overlay">
            <div className="workshop-panel">
                <div className="workshop-header">
                    <h2>{type === 'defense_workshop' ? 'Systems Workshop' : 'Munitions Factory'}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="workshop-content">
                    <div className="tools-list">
                        {tools.map((t: any) => (
                            <div
                                key={t.id}
                                className={`tool-card ${selectedTool === t.id ? 'selected' : ''}`}
                                onClick={() => setSelectedTool(t.id)}
                            >
                                <h4>{t.label}</h4>
                                <p className="tool-desc">{t.desc}</p>
                                <div className="tool-cost">
                                    <span>{t.c > 0 && `${t.c}C`} {t.t > 0 && `${t.t}Ti`}</span>
                                    <span>⏱ {t.time}s</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="production-controls">
                        <div className="amount-input">
                            <label>Quantity:</label>
                            <input
                                type="number"
                                min="1"
                                value={count}
                                onChange={e => setCount(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <button
                            className="produce-btn"
                            disabled={loading || count <= 0}
                            onClick={handleManufacture}
                        >
                            {loading ? 'Processing...' : 'MANUFACTURE'}
                        </button>
                    </div>

                    <div className="production-queue">
                        <h3>Production Queue</h3>
                        {queue.length === 0 && <div className="empty-queue">No active production</div>}
                        {queue.map((item: any, i: number) => {
                            const finish = new Date(item.finishTime).getTime();
                            const now = Date.now();
                            const diff = Math.ceil((finish - now) / 1000);
                            const isDone = diff <= 0;

                            // Find label
                            const label = [...TOOLS['defense_workshop'], ...TOOLS['siege_workshop']].find(t => t.id === item.tool)?.label || item.tool;

                            return (
                                <div key={i} className="queue-item">
                                    <span>{item.count} x {label}</span>
                                    <span className={isDone ? 'done' : 'processing'}>
                                        {isDone ? 'Complete' : `${Math.floor(diff / 60)}:${(diff % 60).toString().padStart(2, '0')}`}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
