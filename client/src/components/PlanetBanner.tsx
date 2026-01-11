import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import type { Planet } from '../lib/api';
import './PlanetBanner.css';

interface PlanetBannerProps {
  planet: Planet;
  mapContainer: PIXI.Container | null;
  onEnterPlanet: (planet: Planet) => void;
  onClose: () => void;
  onSendFleet: () => void;
  onSelectAsSource: () => void;
  onLaunchProbe?: () => void;
  hasIntelHub?: boolean;
}

export default function PlanetBanner({
  planet,
  mapContainer,
  onEnterPlanet,
  onClose,
  onSendFleet,
  onSelectAsSource,
  onLaunchProbe,
  hasIntelHub
}: PlanetBannerProps) {
  const bannerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!bannerRef.current) {
      return;
    }

    // Always show the banner
    bannerRef.current.style.display = 'block';

    if (!mapContainer) {
      // Fallback: center of screen if mapContainer not ready
      bannerRef.current.style.left = '50%';
      bannerRef.current.style.top = '20%';
      bannerRef.current.style.transform = 'translateX(-50%)';
      return;
    }

    let animationFrameId: number | null = null;
    let isRunning = true;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 16; // ~60fps for smooth movement

    const updatePosition = () => {
      if (!bannerRef.current || !mapContainer || !isRunning) {
        return;
      }

      const now = performance.now();
      if (now - lastUpdateTime < UPDATE_INTERVAL) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      lastUpdateTime = now;

      try {
        // Get the planet's world position
        const worldX = planet.x;
        // Offset Y by a fixed WORLD amount (e.g. 150 units) so it scales with zoom
        // The planet sprite scale is 0.15. Original size unknown, but likely ~1000px.
        // So visually it's ~150px tall. We want to be above it.
        // Reduced from 350 to 220 based on user feedback "way too high"
        const worldY = planet.y - 60;

        // Transform world coordinates to global (screen) coordinates
        const globalPos = mapContainer.toGlobal({ x: worldX, y: worldY });

        // Position banner at the calculated screen position
        if (bannerRef.current) {
          bannerRef.current.style.left = `${globalPos.x}px`;
          bannerRef.current.style.top = `${globalPos.y}px`;
          bannerRef.current.style.transform = 'translate(-50%, -100%)'; // Anchor bottom-center
          bannerRef.current.style.display = 'flex'; // Restore flex display
        }
      } catch (error) {
        console.error('Error updating banner position:', error);
      }

      // Continue updating position
      if (isRunning) {
        animationFrameId = requestAnimationFrame(updatePosition);
      }
    };

    // Start the update loop
    updatePosition();

    return () => {
      isRunning = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [planet, mapContainer]);

  if (!planet) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      className="planet-banner"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        pointerEvents: 'all',
        display: 'none', // Will be set to 'block' by useEffect
        zIndex: 99999,
      }}
    >
      <div className="banner-content">
        <div className="banner-title">{planet.name}</div>
        <button
          className="banner-close"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }}
        >×</button>
      </div>

      <div className="banner-buttons">
        <button
          className="banner-button enter-planet-btn"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEnterPlanet(planet);
          }}
          title="Enter Colony"
        >
          Enter Colony
        </button>
        <button
          className="banner-button attack-btn"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSendFleet();
          }}
          title="Send Fleet"
        >
          Fleet Ops
        </button>
      </div>
    </div>
  );
}

