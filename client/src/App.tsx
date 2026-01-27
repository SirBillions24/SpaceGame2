import { useState, useEffect, useCallback } from 'react';
import WorldMap from './components/WorldMap';
import FleetPanel from './components/FleetPanel';
import LoginPanel from './components/LoginPanel';
import PlanetBanner from './components/PlanetBanner';
import PlanetInterior from './components/PlanetInterior';
import RegionSelector from './components/RegionSelector';
import GlobalHUD from './components/GlobalHUD';
import TravelOverview from './components/TravelOverview';
import CoalitionPanel from './components/CoalitionPanel';
import AlienInvasionPanel from './components/AlienInvasionPanel';
import EventAttackPanel from './components/EventAttackPanel';
import { SourcePlanetDropdown } from './components/SourcePlanetDropdown';
import { api, setAuthToken, getAuthToken, getCurrentUser, type Planet } from './lib/api';
import { useSocketEvent } from './hooks/useSocketEvent';
import './App.css';

function App() {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(null);
  const [mapContainer, setMapContainer] = useState<any>(null);
  const [sourcePlanet, setSourcePlanet] = useState<Planet | null>(null);
  const [targetPlanet, setTargetPlanet] = useState<Planet | null>(null);
  const [showFleetPanel, setShowFleetPanel] = useState(false);
  const [showPlanetInterior, setShowPlanetInterior] = useState(false);
  const [showTravelOverview, setShowTravelOverview] = useState(false);
  const [showCoalitionPanel, setShowCoalitionPanel] = useState(false);
  const [showAlienPanel, setShowAlienPanel] = useState(false);
  const [hasActiveEvent, setHasActiveEvent] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [selectedEventShip, setSelectedEventShip] = useState<any | null>(null);
  const [teleportTarget, setTeleportTarget] = useState<{ x: number; y: number } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsSpawn, setNeedsSpawn] = useState(false);
  const [hudPlanet, setHudPlanet] = useState<Planet | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isEspionageMode, setIsEspionageMode] = useState(false);
  const [hasIntelHub, setHasIntelHub] = useState(false);
  // Multi-planet state
  const [ownedPlanets, setOwnedPlanets] = useState<{ id: string; x: number; y: number; name: string; planetType: string; ownerId: string }[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Check for stored auth token & load initial data
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsLoggedIn(true);
      checkUserStatus();
    }
  }, []);

  // WebSocket subscription for real-time user updates
  useSocketEvent<any>('user:updated', useCallback((data) => {
    setCurrentUser((prev: any) => prev ? { ...prev, ...data } : data);
  }, []));

  // WebSocket subscription for real-time planet updates
  useSocketEvent<Planet>('planet:updated', useCallback((data) => {
    if (hudPlanet && data.id === hudPlanet.id) {
      setHudPlanet(data);
    }
  }, [hudPlanet?.id]));

  const checkUserStatus = (targetPlanetId?: string) => {
    // Fetch full user profile (with XP/Level)
    api.getMe().then(u => {
      setCurrentUser(u);

      const user = getCurrentUser();
      if (user) {
        // If we have a specific planet we're looking at, refresh that one specifically for the HUD
        const planetToRefresh = targetPlanetId || hudPlanet?.id;
        if (planetToRefresh) {
          api.getPlanet(planetToRefresh).then(setHudPlanet).catch(console.error);
        }

        api.getPlanets().then(data => {
          const myPlanets = data.planets.filter(p => p.ownerId === user.userId && !p.isNpc);
          setHasIntelHub(myPlanets.some(p => p.buildings?.some(b => b.type === 'tavern' && b.status === 'active')));

          // Update owned planets list for dropdown
          setOwnedPlanets(myPlanets.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            name: p.name,
            planetType: (p as any).planetType || 'colony',
            ownerId: p.ownerId // Needed for transfer panel to detect owned targets
          })));

          // Auto-select first planet if none selected
          if (myPlanets.length > 0 && !selectedSourceId) {
            setSelectedSourceId(myPlanets[0].id);
          }

          if (myPlanets.length === 0) {
            setNeedsSpawn(true);
          } else if (!hudPlanet) {
            // Initial load of hud planet if none set
            api.getPlanet(myPlanets[0].id).then(setHudPlanet);
          }
        }).catch(e => console.error(e));

        // Check for active event
        api.getActiveEvent().then(result => {
          setHasActiveEvent(!!result.event);
          if (result.event) setActiveEventId(result.event.id);
        }).catch(() => {
          setHasActiveEvent(false);
          setActiveEventId(null);
        });
      }
    }).catch(e => {
      console.error("Failed to fetch user profile", e);
    });
  };

  const handleLogin = () => {
    setIsLoggedIn(true);
    // Store token if available
    const token = getAuthToken();
    if (token) {
      localStorage.setItem('authToken', token);
      checkUserStatus();
    }
  };


  const handlePlanetClick = useCallback((planet: Planet) => {
    // Show banner above the planet - DO NOT open interior
    setShowPlanetInterior(false); // Explicitly close interior
    setSelectedPlanet(planet);
    // setSourcePlanet(null); // REMOVED: Keep source selected so we can attack this target!

    // Update HUD if it's my planet
    const user = getCurrentUser();
    if (user && planet.ownerId === user.userId) {
      api.getPlanet(planet.id).then(setHudPlanet);
    }
  }, []);

  const handleMapContainerReady = useCallback((container: any) => {
    setMapContainer(container);
  }, []);

  const handleEnterPlanet = useCallback((planet: Planet) => {
    setSelectedPlanet(planet); // Ensure we have the planet for interior view
    setShowPlanetInterior(true);
    // Update HUD
    api.getPlanet(planet.id).then(setHudPlanet);
  }, []);

  const handleCloseBanner = () => {
    setSelectedPlanet(null);
  };

  const handleFleetCreated = () => {
    setSourcePlanet(null);
    setTargetPlanet(null);
    setShowFleetPanel(false);
    // Fleet updates are received via WebSocket 'fleet:updated' event in WorldMap
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsLoggedIn(false);
    setAuthToken(''); // Clear from api memory
    setCurrentUser(null);
  };

  // Show login panel if not logged in
  if (!isLoggedIn) {
    return <LoginPanel onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <GlobalHUD user={currentUser || getCurrentUser()} currentPlanet={hudPlanet} />

      <WorldMap
        onPlanetClick={handlePlanetClick}
        sourcePlanetId={selectedSourceId}
        onMapContainerReady={handleMapContainerReady}
        currentUserId={isLoggedIn ? getCurrentUser()?.userId : undefined}
        isEspionageMode={isEspionageMode}
        onEspionageModeChange={setIsEspionageMode}
        teleportTo={teleportTarget}
        onTeleportComplete={() => setTeleportTarget(null)}
      />

      <div className="hud-overlay" style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1000 }}>
        {/* Source Planet Selector */}
        {!showPlanetInterior && !showFleetPanel && ownedPlanets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(30, 40, 60, 0.9)', borderRadius: '4px', border: '1px solid rgba(100, 150, 255, 0.3)' }}>
            <span style={{ color: '#8899bb', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚓ Source:</span>
            <select
              value={selectedSourceId || ''}
              onChange={(e) => {
                setSelectedSourceId(e.target.value);
                api.getPlanet(e.target.value).then(setHudPlanet);
              }}
              style={{
                padding: '4px 8px',
                background: 'rgba(20, 30, 50, 0.9)',
                border: '1px solid rgba(100, 150, 255, 0.4)',
                borderRadius: '3px',
                color: '#e0e8ff',
                fontSize: '12px',
                cursor: 'pointer',
                minWidth: '140px'
              }}
            >
              {ownedPlanets.map(planet => (
                <option key={planet.id} value={planet.id}>
                  {planet.planetType === 'harvester' ? '🌀' : '🌍'} {planet.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasIntelHub && (
          <button
            onClick={() => setIsEspionageMode(!isEspionageMode)}
            style={{
              background: isEspionageMode ? '#00f2ff' : '#1e3a3d',
              color: isEspionageMode ? '#000' : '#00f2ff',
              border: '2px solid #00f2ff',
              padding: '10px 20px',
              cursor: 'pointer',
              borderRadius: '4px',
              fontWeight: 'bold',
              boxShadow: isEspionageMode ? '0 0 15px #00f2ff' : 'none'
            }}
          >
            {isEspionageMode ? 'Cancel Probe' : 'Launch Probe'}
          </button>
        )}
        <button onClick={() => setShowTravelOverview(true)} style={{ background: '#ff9800', color: 'black', border: '2px solid #e65100', padding: '10px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
          Travel Overview
        </button>
        {hasActiveEvent && (
          <button
            onClick={() => setShowAlienPanel(true)}
            style={{
              background: 'linear-gradient(135deg, #9c27b0, #7b1fa2)',
              color: 'white',
              border: '2px solid #9c27b0',
              padding: '10px 20px',
              cursor: 'pointer',
              borderRadius: '4px',
              fontWeight: 'bold',
              animation: 'pulse 2s infinite',
              boxShadow: '0 0 15px rgba(156, 39, 176, 0.5)'
            }}
          >
            👾 Invasion
          </button>
        )}
        <button onClick={() => setShowCoalitionPanel(true)} style={{ background: '#9c27b0', color: 'white', border: '2px solid #7b1fa2', padding: '10px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
          Coalition
        </button>
        <button onClick={handleLogout} style={{ background: '#d32f2f', color: 'white', border: '2px solid #b71c1c', padding: '10px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
          Logout
        </button>
      </div>

      {needsSpawn && (
        <RegionSelector onSpawnComplete={() => {
          setNeedsSpawn(false);
          window.location.reload();
        }} />
      )}

      {selectedPlanet && !showFleetPanel && !showPlanetInterior && (
        <PlanetBanner
          planet={selectedPlanet}
          mapContainer={mapContainer}
          onEnterPlanet={handleEnterPlanet}
          onClose={handleCloseBanner}
          hasIntelHub={hasIntelHub && (selectedPlanet.ownerId === currentUser?.userId || selectedPlanet.ownerId === getCurrentUser()?.userId)}
          onLaunchProbe={() => {
            setIsEspionageMode(true);
            setSelectedPlanet(null);
          }}
          onSendFleet={() => {
            setTargetPlanet(selectedPlanet);
            setShowFleetPanel(true);
          }}
          onSelectAsSource={() => {
            setSourcePlanet(selectedPlanet);
            // Update HUD
            api.getPlanet(selectedPlanet.id).then(setHudPlanet);
          }}
        />
      )}

      {showPlanetInterior && selectedPlanet && (
        <PlanetInterior
          planet={selectedPlanet}
          onUpdate={checkUserStatus}
          onClose={() => {
            setShowPlanetInterior(false);
            setSelectedPlanet(null);
            // Re-fetch HUD to update resources if changed
            api.getPlanet(selectedPlanet.id).then(setHudPlanet);
          }}
        />
      )}

      {showFleetPanel && selectedSourceId && targetPlanet && (
        <FleetPanel
          fromPlanet={ownedPlanets.find(p => p.id === selectedSourceId) as any || hudPlanet}
          toPlanet={targetPlanet}
          onClose={() => {
            setShowFleetPanel(false);
            setTargetPlanet(null);
          }}
          onFleetCreated={handleFleetCreated}
        />
      )}

      {showTravelOverview && (
        <TravelOverview onClose={() => setShowTravelOverview(false)} />
      )}

      {showCoalitionPanel && (
        <CoalitionPanel onClose={() => setShowCoalitionPanel(false)} />
      )}

      {showAlienPanel && (
        <AlienInvasionPanel
          onClose={() => setShowAlienPanel(false)}
          onTeleportToPortal={(x, y) => setTeleportTarget({ x, y })}
          onShipClick={(ship) => {
            // Only allow attack if we have a source planet selected (or HUD planet)
            // But HUD planet might be a harvester, so prefer selectedSourceId if available, else hudPlanet
            if (ownedPlanets.length === 0) {
              alert("You need a colony to launch attacks from!");
              return;
            }
            setSelectedEventShip(ship);
            setShowAlienPanel(false); // Close main panel to focus on attack
          }}
        />
      )}

      {selectedEventShip && (selectedSourceId || hudPlanet) && (
        <EventAttackPanel
          eventId={activeEventId || selectedEventShip.eventId || ''} // We need eventId. WorldMap might need to pass it or we get it from activeEvent state
          ship={selectedEventShip}
          fromPlanet={ownedPlanets.find(p => p.id === selectedSourceId) || hudPlanet as Planet}
          onClose={() => setSelectedEventShip(null)}
          onAttackComplete={(result) => {
            setSelectedEventShip(null);
            if (result.success) {
              let msg = result.victory ? "VICTORY! " : "DEFEAT. ";
              msg += `Cores: ${result.xenoCoresAwarded}. Damage: ${result.damageDealt}.`;
              if (result.mothershipKilled) msg += " MOTHERSHIP DESTROYED!";
              alert(msg);
              // Refresh user/planet data
              checkUserStatus();
            } else {
              alert(`Attack Failed: ${result.error}`);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
