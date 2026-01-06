import { useState } from 'react';
import { api, type Planet } from '../lib/api';
import './ExpansionModal.css';

interface ExpansionModalProps {
  planet: Planet;
  onClose: () => void;
  onExpand: () => void;
}

const MAX_GRID_SIZE = 50;
const EXPANSION_BASE_COST_CARBON = 1000;
const EXPANSION_BASE_COST_TITANIUM = 500;
const EXPANSION_COST_MULTIPLIER = 1.5;

export default function ExpansionModal({ planet, onClose, onExpand }: ExpansionModalProps) {
  const [direction, setDirection] = useState<'x' | 'y' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gridSizeX = planet.gridSizeX || planet.gridSize || 10;
  const gridSizeY = planet.gridSizeY || planet.gridSize || 10;

  const canExpandX = gridSizeX < MAX_GRID_SIZE;
  const canExpandY = gridSizeY < MAX_GRID_SIZE;

  const calculateCost = (dir: 'x' | 'y') => {
    const currentSize = dir === 'x' ? gridSizeX : gridSizeY;
    const expansionNumber = Math.floor((currentSize - 10) / 10);
    return {
      carbon: Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber)),
      titanium: Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber))
    };
  };

  const handleExpand = async () => {
    if (!direction) return;

    setLoading(true);
    setError(null);

    try {
      await api.expandPlanet(planet.id, direction);
      onExpand();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Expansion failed');
    } finally {
      setLoading(false);
    }
  };

  const xCost = canExpandX ? calculateCost('x') : null;
  const yCost = canExpandY ? calculateCost('y') : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content expansion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Colony Expansion</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="expansion-info">
            <div className="current-size">
              <strong>Current Size:</strong> {gridSizeX} × {gridSizeY}
            </div>
            <div className="max-size">
              <strong>Maximum Size:</strong> {MAX_GRID_SIZE} × {MAX_GRID_SIZE}
            </div>
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="expansion-options">
            <div className={`expansion-option ${!canExpandX ? 'disabled' : direction === 'x' ? 'selected' : ''}`}>
              <div className="option-header">
                <h3>Expand Width (X)</h3>
                {!canExpandX && <span className="max-reached">MAX</span>}
              </div>
              {canExpandX && (
                <>
                  <div className="option-preview">
                    {gridSizeX} × {gridSizeY} → {Math.min(gridSizeX + 10, MAX_GRID_SIZE)} × {gridSizeY}
                  </div>
                  {xCost && (
                    <div className="option-cost">
                      <span>Cost: {xCost.carbon.toLocaleString()} Carbon</span>
                      <span>{xCost.titanium.toLocaleString()} Titanium</span>
                    </div>
                  )}
                  <button
                    className="select-btn"
                    onClick={() => setDirection('x')}
                    disabled={loading}
                  >
                    {direction === 'x' ? '✓ Selected' : 'Select'}
                  </button>
                </>
              )}
            </div>

            <div className={`expansion-option ${!canExpandY ? 'disabled' : direction === 'y' ? 'selected' : ''}`}>
              <div className="option-header">
                <h3>Expand Height (Y)</h3>
                {!canExpandY && <span className="max-reached">MAX</span>}
              </div>
              {canExpandY && (
                <>
                  <div className="option-preview">
                    {gridSizeX} × {gridSizeY} → {gridSizeX} × {Math.min(gridSizeY + 10, MAX_GRID_SIZE)}
                  </div>
                  {yCost && (
                    <div className="option-cost">
                      <span>Cost: {yCost.carbon.toLocaleString()} Carbon</span>
                      <span>{yCost.titanium.toLocaleString()} Titanium</span>
                    </div>
                  )}
                  <button
                    className="select-btn"
                    onClick={() => setDirection('y')}
                    disabled={loading}
                  >
                    {direction === 'y' ? '✓ Selected' : 'Select'}
                  </button>
                </>
              )}
            </div>
          </div>

          {direction && (
            <div className="selected-cost">
              <strong>Total Cost:</strong>
              <div>
                {direction === 'x' && xCost && (
                  <>
                    {xCost.carbon.toLocaleString()} Carbon
                    {' + '}
                    {xCost.titanium.toLocaleString()} Titanium
                  </>
                )}
                {direction === 'y' && yCost && (
                  <>
                    {yCost.carbon.toLocaleString()} Carbon
                    {' + '}
                    {yCost.titanium.toLocaleString()} Titanium
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleExpand}
            disabled={!direction || loading}
          >
            {loading ? 'Expanding...' : 'Expand Colony'}
          </button>
        </div>
      </div>
    </div>
  );
}

