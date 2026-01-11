/**
 * SourcePlanetDropdown.tsx
 * 
 * Dropdown component for selecting the source planet for fleet operations.
 * Displays all planets owned by the current user and allows quick switching.
 */

import React from 'react';
import './SourcePlanetDropdown.css';

interface OwnedPlanet {
    id: string;
    name: string;
    planetType: string;
    x: number;
    y: number;
}

interface SourcePlanetDropdownProps {
    ownedPlanets: OwnedPlanet[];
    selectedSourceId: string | null;
    onSourceChange: (planetId: string) => void;
}

export const SourcePlanetDropdown: React.FC<SourcePlanetDropdownProps> = ({
    ownedPlanets,
    selectedSourceId,
    onSourceChange,
}) => {
    if (ownedPlanets.length === 0) {
        return null;
    }

    const selectedPlanet = ownedPlanets.find(p => p.id === selectedSourceId);
    const planetIcon = (type: string) => type === 'harvester' ? '🌀' : '🌍';

    return (
        <div className="source-planet-dropdown">
            <label className="source-label">
                <span className="source-icon">⚓</span>
                Fleet Source:
            </label>
            <select
                className="source-select"
                value={selectedSourceId || ''}
                onChange={(e) => onSourceChange(e.target.value)}
            >
                {ownedPlanets.map(planet => (
                    <option key={planet.id} value={planet.id}>
                        {planetIcon(planet.planetType)} {planet.name}
                    </option>
                ))}
            </select>
            {selectedPlanet && (
                <span className="source-coords">
                    ({selectedPlanet.x}, {selectedPlanet.y})
                </span>
            )}
        </div>
    );
};
