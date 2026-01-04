import { useState, useEffect, useCallback } from 'react';
import WorldMap from './components/WorldMap';
import FleetPanel from './components/FleetPanel';
import LoginPanel from './components/LoginPanel';
import PlanetBanner from './components/PlanetBanner';
import PlanetInterior from './components/PlanetInterior';
import RegionSelector from './components/RegionSelector';
import GlobalHUD from './components/GlobalHUD';
import TravelOverview from './components/TravelOverview';
import { api, setAuthToken, getAuthToken, getCurrentUser, type Planet } from './lib/api';
import './App.css';

function App() {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(null);
  const [mapContainer, setMapContainer] = useState<any>(null);
  const [sourcePlanet, setSourcePlanet] = useState<Planet | null>(null);
  const [targetPlanet, setTargetPlanet] = useState<Planet | null>(null);
  const [showFleetPanel, setShowFleetPanel] = useState(false);
  const [showPlanetInterior, setShowPlanetInterior] = useState(false);
  const [showTravelOverview, setShowTravelOverview] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsSpawn, setNeedsSpawn] = useState(false);
  const [hudPlanet, setHudPlanet] = useState<Planet | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Check for stored auth token & load initial data
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsLoggedIn(true);
      checkUserStatus();
    }
  }, []);

  const checkUserStatus = () => {
    // Fetch full user profile (with XP/Level)
    api.getMe().then(u => {
      setCurrentUser(u);

      const user = getCurrentUser(); // Keep using token for ID if needed broadly logic
      if (user) {
        api.getPlanets().then(data => {
          const myPlanets = data.planets.filter(p => p.ownerId === user.userId && !p.isNpc);
          if (myPlanets.length === 0) {
            setNeedsSpawn(true);
          } else if (myPlanets.length === 1) {
            setSourcePlanet(myPlanets[0]);
            // Also fetch full details for HUD
            api.getPlanet(myPlanets[0].id).then(setHudPlanet);
          } else if (myPlanets.length > 0) {
            // Default HUD to first planet
            api.getPlanet(myPlanets[0].id).then(setHudPlanet);
          }
        }).catch(e => console.error(e));
      }
    }).catch(e => {
      console.error("Failed to fetch user profile", e);
      // Fallback if /me fails but token valid? Or logout?
      // For now just log error.
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
    // Refresh map to show new fleet - WorldMap polls every 2s, so we don't need to force reload.
    // window.location.reload(); 
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsLoggedIn(false);
    setAuthToken(''); // Clear from api memory
    setCurrentUser(null);
  };

  const mapImageUrl = '/assets/world-map.png';

  // Show login panel if not logged in
  if (!isLoggedIn) {
    return <LoginPanel onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <GlobalHUD user={currentUser || getCurrentUser()} currentPlanet={hudPlanet} />

      <WorldMap
        mapImageUrl={mapImageUrl}
        onPlanetClick={handlePlanetClick}
        sourcePlanetId={sourcePlanet?.id}
        onMapContainerReady={handleMapContainerReady}
        currentUserId={isLoggedIn ? getCurrentUser()?.userId : undefined}
      />

      <div className="hud-overlay" style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: '10px', zIndex: 1000 }}>
        <button onClick={() => setShowTravelOverview(true)} style={{ background: '#ff9800', color: 'black', border: '2px solid #e65100', padding: '10px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
          Travel Overview
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
          onClose={() => {
            setShowPlanetInterior(false);
            setSelectedPlanet(null);
            // Re-fetch HUD to update resources if changed
            api.getPlanet(selectedPlanet.id).then(setHudPlanet);
          }}
        />
      )}

      {showFleetPanel && sourcePlanet && targetPlanet && (
        <FleetPanel
          fromPlanet={sourcePlanet}
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
    </div>
  );
}

export default App;
