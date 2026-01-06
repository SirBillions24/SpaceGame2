import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './AdmiralPanel.css';

interface AdmiralPanelProps {
  onClose: () => void;
}

interface Admiral {
  id: string;
  name: string;
  gear: {
    weapon?: GearPiece;
    helmet?: GearPiece;
    spacesuit?: GearPiece;
    shield?: GearPiece;
  };
  meleeStrengthBonus?: number;
  rangedStrengthBonus?: number;
  wallReductionBonus?: number;
  // Legacy fields
  attackBonus?: number;
  defenseBonus?: number;
}

interface GearPiece {
  id: string;
  slotType: string;
  name: string;
  rarity: string;
  level: number;
  meleeStrengthBonus: number;
  rangedStrengthBonus: number;
  wallReductionBonus: number;
  // Legacy fields
  attackBonus?: number;
  defenseBonus?: number;
  setName?: string;
  iconName?: string;
}

const GEAR_SLOTS = ['weapon', 'helmet', 'spacesuit', 'shield'] as const;
type GearSlot = typeof GEAR_SLOTS[number];

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  spacesuit: 'Spacesuit',
  shield: 'Shield',
};

const RARITY_COLORS: Record<string, string> = {
  common: '#9d9d9d',
  uncommon: '#1eff00',
  rare: '#0070dd',
  epic: '#a335ee',
  legendary: '#ff8000',
};

export default function AdmiralPanel({ onClose }: AdmiralPanelProps) {
  const [admiral, setAdmiral] = useState<Admiral | null>(null);
  const [inventory, setInventory] = useState<GearPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<GearSlot | 'all'>('all');
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [admiralData, inventoryData] = await Promise.all([
        api.getAdmiral(),
        api.getGearInventory().catch(() => ({ inventory: [] })),
      ]);
      setAdmiral(admiralData);
      setInventory(inventoryData.inventory || []);
      setNameInput(admiralData.name);
      
      if (admiralData.hasNavalAcademy === false) {
        setError('Note: Naval Academy required for full admiral features. Your admiral has been created but some features may be limited.');
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
      const errorMsg = err.message || 'Failed to load admiral';
      
      if (errorMsg.includes('Naval Academy')) {
        setError('Naval Academy required. Please build a Naval Academy on your planet first.');
      } else if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
        setError('Authentication required. Please log in again.');
      } else {
        setError(`Failed to load: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const updated = await api.updateAdmiralName(nameInput.trim());
      setAdmiral(updated);
      setEditingName(false);
    } catch (err: any) {
      console.error('Failed to update name:', err);
      setError(err.message || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleEquip = async (pieceId: string, slotType: GearSlot) => {
    try {
      setEquipping(pieceId);
      setError(null);
      const updated = await api.equipGearPiece(pieceId, slotType);
      setAdmiral(updated);
      await loadData(); // Reload to refresh inventory
    } catch (err: any) {
      console.error('Failed to equip gear:', err);
      setError(err.message || 'Failed to equip gear');
    } finally {
      setEquipping(null);
    }
  };

  const handleUnequip = async (slotType: GearSlot) => {
    try {
      setEquipping(slotType);
      setError(null);
      const updated = await api.unequipGearPiece(slotType);
      setAdmiral(updated);
      await loadData(); // Reload to refresh inventory
    } catch (err: any) {
      console.error('Failed to unequip gear:', err);
      setError(err.message || 'Failed to unequip gear');
    } finally {
      setEquipping(null);
    }
  };

  const filteredInventory = selectedCategory === 'all'
    ? inventory
    : inventory.filter(piece => piece.slotType === selectedCategory);

  if (loading) {
    return (
      <div className="admiral-panel">
        <div className="admiral-panel-header">
          <h3>Admiral Command</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="admiral-panel-content">
          <p>Loading admiral data...</p>
        </div>
      </div>
    );
  }

  if (!admiral) {
    return (
      <div className="admiral-panel">
        <div className="admiral-panel-header">
          <h3>Admiral Command</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="admiral-panel-content">
          <p className="error">Failed to load admiral</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admiral-panel">
      <div className="admiral-panel-header">
        <h3>Admiral Command</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="admiral-panel-content">
        {error && <div className="error-message">{error}</div>}

        <div className="admiral-section">
          <h4>Admiral Information</h4>
          <div className="admiral-name-section">
            {editingName ? (
              <div className="name-edit">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Admiral name"
                  maxLength={50}
                />
                <button onClick={handleSaveName} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(admiral.name); }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="name-display">
                <span className="admiral-name">{admiral.name}</span>
                <button onClick={() => setEditingName(true)} className="edit-btn">
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="admiral-section">
          <h4>Combat Bonuses (Attack Only)</h4>
          <div className="bonus-display">
            <div className="bonus-item">
              <span className="bonus-label">Melee Strength:</span>
              <span className="bonus-value positive">
                +{admiral.meleeStrengthBonus || 0}%
              </span>
            </div>
            <div className="bonus-item">
              <span className="bonus-label">Ranged Strength:</span>
              <span className="bonus-value positive">
                +{admiral.rangedStrengthBonus || 0}%
              </span>
            </div>
            <div className="bonus-item">
              <span className="bonus-label">Wall Reduction:</span>
              <span className="bonus-value positive">
                {admiral.wallReductionBonus || 0}%
              </span>
            </div>
          </div>
          <p className="bonus-note">
            Bonuses are capped at +100% for melee/ranged and -100% for wall reduction.
            These bonuses apply only when attacking. Defense bonuses are handled separately.
          </p>
        </div>

        {/* Gear Slots Section */}
        <div className="admiral-section">
          <h4>Equipped Gear</h4>
          <div className="gear-slots-grid">
            {GEAR_SLOTS.map((slot) => {
              const equipped = admiral.gear[slot];
              return (
                <div key={slot} className="gear-slot-container">
                  <div className="gear-slot-label">{SLOT_LABELS[slot]}</div>
                  <div
                    className={`gear-slot ${equipped ? 'filled' : 'empty'}`}
                    onClick={() => {
                      if (equipped) {
                        handleUnequip(slot);
                      } else {
                        setSelectedCategory(slot);
                      }
                    }}
                  >
                    {equipped ? (
                      <>
                        <div className="gear-slot-icon" style={{ borderColor: RARITY_COLORS[equipped.rarity] || '#9d9d9d' }}>
                          <img 
                            src={`/assets/admiral/${equipped.slotType}.jpeg`} 
                            alt={equipped.name}
                            onError={(e) => {
                              // Fallback to emoji if image doesn't exist
                              (e.target as HTMLImageElement).style.display = 'none';
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent) {
                                parent.textContent = equipped.iconName || '⚔️';
                              }
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div className="gear-slot-name">{equipped.name}</div>
                        <div className="gear-slot-stats">
                          {equipped.meleeStrengthBonus > 0 && (
                            <span className="stat-attack">+{equipped.meleeStrengthBonus}% Melee</span>
                          )}
                          {equipped.rangedStrengthBonus > 0 && (
                            <span className="stat-attack">+{equipped.rangedStrengthBonus}% Ranged</span>
                          )}
                          {equipped.wallReductionBonus < 0 && (
                            <span className="stat-defense">{equipped.wallReductionBonus}% Wall</span>
                          )}
                        </div>
                        <div className="gear-slot-rarity" style={{ color: RARITY_COLORS[equipped.rarity] || '#9d9d9d' }}>
                          {equipped.rarity}
                        </div>
                        <button
                          className="gear-unequip-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnequip(slot);
                          }}
                          disabled={equipping === slot}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <div className="gear-slot-empty">
                        <span>+</span>
                        <span className="empty-label">Empty</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gear Inventory Console */}
        <div className="admiral-section">
          <h4>Gear Inventory</h4>
          
          {/* Category Tabs */}
          <div className="gear-category-tabs">
            <button
              className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {GEAR_SLOTS.map((slot) => (
              <button
                key={slot}
                className={`category-tab ${selectedCategory === slot ? 'active' : ''}`}
                onClick={() => setSelectedCategory(slot)}
              >
                {SLOT_LABELS[slot]}
              </button>
            ))}
          </div>

          {/* Inventory Grid */}
          <div className="gear-inventory-grid">
            {filteredInventory.length === 0 ? (
              <div className="inventory-empty">
                <p>No gear in inventory</p>
                <p className="inventory-hint">Gear is obtained by attacking NPC bases</p>
              </div>
            ) : (
              filteredInventory.map((piece) => {
                const isEquipped = admiral.gear[piece.slotType as GearSlot]?.id === piece.id;
                return (
                  <div
                    key={piece.id}
                    className={`gear-inventory-item ${isEquipped ? 'equipped' : ''} ${equipping === piece.id ? 'equipping' : ''}`}
                    onClick={() => {
                      if (!isEquipped) {
                        handleEquip(piece.id, piece.slotType as GearSlot);
                      }
                    }}
                  >
                    <div
                      className="gear-item-icon"
                      style={{ borderColor: RARITY_COLORS[piece.rarity] || '#9d9d9d' }}
                    >
                      <img 
                        src={`/assets/admiral/${piece.slotType}.jpeg`} 
                        alt={piece.name}
                        onError={(e) => {
                          // Fallback to emoji if image doesn't exist
                          (e.target as HTMLImageElement).style.display = 'none';
                          const parent = (e.target as HTMLImageElement).parentElement;
                          if (parent) {
                            parent.textContent = piece.iconName || '⚔️';
                          }
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div className="gear-item-name">{piece.name}</div>
                    <div className="gear-item-rarity" style={{ color: RARITY_COLORS[piece.rarity] || '#9d9d9d' }}>
                      {piece.rarity} Lv.{piece.level}
                    </div>
                    <div className="gear-item-stats">
                      {piece.meleeStrengthBonus > 0 && (
                        <span className="stat-attack">+{piece.meleeStrengthBonus}% Melee</span>
                      )}
                      {piece.rangedStrengthBonus > 0 && (
                        <span className="stat-attack">+{piece.rangedStrengthBonus}% Ranged</span>
                      )}
                      {piece.wallReductionBonus < 0 && (
                        <span className="stat-defense">{piece.wallReductionBonus}% Wall</span>
                      )}
                    </div>
                    {isEquipped && (
                      <div className="gear-item-equipped-badge">EQUIPPED</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="admiral-footer">
          <button onClick={onClose} className="close-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
