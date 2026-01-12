import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './ResourceBreakdownPanel.css';

interface BuildingBreakdown {
    id: string;
    type: string;
    level: number;
    baseRate: number;
    workforceApplied: number;
    finalRate: number;
}

interface ProductionData {
    baseHubRate: number;
    buildingBaseTotal: number;
    buildings: BuildingBreakdown[];
    workforceMultiplier: number;
    stabilityMultiplier: number;
    finalRate: number;
}

interface TroopConsumption {
    unitType: string;
    count: number;
    upkeepPerUnit: number;
    totalConsumption: number;
}

interface ConsumptionData {
    troops: TroopConsumption[];
    totalConsumption: number;
}

interface ResourceBreakdownPanelProps {
    resourceType: 'carbon' | 'titanium' | 'food';
    production: ProductionData;
    consumption?: ConsumptionData;
    onClose: () => void;
}

export default function ResourceBreakdownPanel({ resourceType, production, consumption, onClose }: ResourceBreakdownPanelProps) {
    // Fetch dynamic labels from server
    const [unitLabels, setUnitLabels] = useState<Record<string, string>>({});
    const [buildingLabels, setBuildingLabels] = useState<Record<string, string>>({});

    useEffect(() => {
        // Load unit types
        api.getUnitTypes().then(data => {
            const labels: Record<string, string> = {};
            Object.entries(data.units).forEach(([id, unit]: [string, any]) => {
                labels[id] = unit.name;
            });
            setUnitLabels(labels);
        }).catch(console.error);

        // Load building types
        api.getBuildingTypes().then(data => {
            const labels: Record<string, string> = {};
            Object.entries(data.buildings).forEach(([id, building]: [string, any]) => {
                labels[id] = building.name;
            });
            setBuildingLabels(labels);
        }).catch(console.error);
    }, []);

    const resourceNames: Record<string, string> = {
        carbon: 'Carbon',
        titanium: 'Titanium',
        food: 'Food'
    };

    const name = resourceNames[resourceType];

    // Calculate hub contribution with multipliers
    const hubFinalRate = production.baseHubRate * production.workforceMultiplier * production.stabilityMultiplier;

    return (
        <div className="resource-breakdown-overlay" onClick={onClose}>
            <div className="resource-breakdown-panel" onClick={e => e.stopPropagation()}>
                <div className="breakdown-header">
                    <h3>{name} Production Breakdown</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="breakdown-content">
                    {/* Summary Card */}
                    <div className="breakdown-summary">
                        <div className="summary-stat">
                            <span className="stat-label">Total {resourceType === 'food' ? 'Gross' : 'Rate'}</span>
                            <span className="stat-value positive">+{production.finalRate.toFixed(2)}/h</span>
                        </div>
                        {resourceType === 'food' && consumption && (
                            <>
                                <div className="summary-stat">
                                    <span className="stat-label">Consumption</span>
                                    <span className="stat-value negative">-{consumption.totalConsumption.toFixed(2)}/h</span>
                                </div>
                                <div className="summary-stat">
                                    <span className="stat-label">Net Rate</span>
                                    <span className={`stat-value ${(production.finalRate - consumption.totalConsumption) >= 0 ? 'positive' : 'negative'}`}>
                                        {(production.finalRate - consumption.totalConsumption) >= 0 ? '+' : ''}{(production.finalRate - consumption.totalConsumption).toFixed(2)}/h
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Multipliers Section */}
                    <div className="breakdown-section">
                        <h4>Active Multipliers</h4>
                        <div className="bonus-display">
                            <div className="bonus-item">
                                <span className="bonus-label">Workforce Efficiency</span>
                                <span className={`bonus-value ${production.workforceMultiplier >= 1 ? 'positive' : 'warning'}`}>
                                    ×{(production.workforceMultiplier * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="bonus-item">
                                <span className="bonus-label">Stability Bonus</span>
                                <span className={`bonus-value ${production.stabilityMultiplier >= 1 ? 'positive' : 'negative'}`}>
                                    ×{(production.stabilityMultiplier * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="bonus-item highlight">
                                <span className="bonus-label">Combined Multiplier</span>
                                <span className="bonus-value positive">
                                    ×{((production.workforceMultiplier * production.stabilityMultiplier) * 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Production Sources Section */}
                    <div className="breakdown-section">
                        <h4>Production Sources</h4>
                        <table className="breakdown-table">
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>Base</th>
                                    <th>× Workforce</th>
                                    <th>× Stability</th>
                                    <th>Final</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="hub-row">
                                    <td>Colony Hub (Base)</td>
                                    <td>{production.baseHubRate}/h</td>
                                    <td>{(production.baseHubRate * production.workforceMultiplier).toFixed(1)}/h</td>
                                    <td>{hubFinalRate.toFixed(1)}/h</td>
                                    <td className="final-col">{hubFinalRate.toFixed(2)}/h</td>
                                </tr>
                                {production.buildings.map((b, idx) => (
                                    <tr key={b.id || idx}>
                                        <td>{buildingLabels[b.type] || b.type} Lvl {b.level}</td>
                                        <td>{b.baseRate}/h</td>
                                        <td>{b.workforceApplied.toFixed(1)}/h</td>
                                        <td>{b.finalRate.toFixed(1)}/h</td>
                                        <td className="final-col">{b.finalRate.toFixed(2)}/h</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td><strong>Total Production</strong></td>
                                    <td>{production.baseHubRate + production.buildingBaseTotal}/h</td>
                                    <td>{((production.baseHubRate + production.buildingBaseTotal) * production.workforceMultiplier).toFixed(1)}/h</td>
                                    <td>{production.finalRate.toFixed(1)}/h</td>
                                    <td className="final-col"><strong>{production.finalRate.toFixed(2)}/h</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Food Consumption (only for food) */}
                    {resourceType === 'food' && consumption && consumption.troops.length > 0 && (
                        <div className="breakdown-section consumption-section">
                            <h4>Troop Consumption</h4>
                            <table className="breakdown-table">
                                <thead>
                                    <tr>
                                        <th>Unit Type</th>
                                        <th>Count</th>
                                        <th>Upkeep Each</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {consumption.troops.map((t, idx) => (
                                        <tr key={idx}>
                                            <td>{unitLabels[t.unitType] || t.unitType}</td>
                                            <td>{t.count}</td>
                                            <td>{t.upkeepPerUnit}/h</td>
                                            <td className="negative">-{t.totalConsumption.toFixed(1)}/h</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={3}><strong>Total Consumption</strong></td>
                                        <td className="negative"><strong>-{consumption.totalConsumption.toFixed(2)}/h</strong></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* Formula Explanation */}
                    <div className="formula-section">
                        <p className="formula-note">
                            Final Rate = (Base + Buildings) × Workforce × Stability
                        </p>
                        <p className="formula-calc">
                            {production.finalRate.toFixed(2)} = ({production.baseHubRate} + {production.buildingBaseTotal}) × {(production.workforceMultiplier * 100).toFixed(0)}% × {(production.stabilityMultiplier * 100).toFixed(0)}%
                        </p>
                    </div>

                    <div className="breakdown-footer">
                        <button onClick={onClose} className="close-button">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
