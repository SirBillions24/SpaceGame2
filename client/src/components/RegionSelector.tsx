import { useState } from 'react';
import { api } from '../lib/api';

interface RegionSelectorProps {
    onSpawnComplete: () => void;
}

export default function RegionSelector({ onSpawnComplete }: RegionSelectorProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSpawn = async (quadrant: 'NW' | 'NE' | 'SW' | 'SE') => {
        setLoading(true);
        setError('');
        try {
            await api.spawnPlanet(quadrant);
            onSpawnComplete();
        } catch (e: any) {
            setError(e.message || 'Failed to spawn');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#00f3ff', zIndex: 5000
        }}>
            <h2 style={{ textTransform: 'uppercase', letterSpacing: 4, marginBottom: 40 }}>Protocol: Sector Selection</h2>

            <p style={{ maxWidth: 600, textAlign: 'center', marginBottom: 40, color: '#aaa' }}>
                Commander, initialization required. Select your deployment sector.
                Coordinate with allies to deploy in the same quadrant.
            </p>

            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
                width: 400, height: 400, position: 'relative'
            }}>
                {/* Visual crosshair */}
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 1, background: '#005a70' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, height: '100%', width: 1, background: '#005a70' }} />

                <button onClick={() => handleSpawn('NW')} disabled={loading} style={btnStyle}>North West</button>
                <button onClick={() => handleSpawn('NE')} disabled={loading} style={btnStyle}>North East</button>
                <button onClick={() => handleSpawn('SW')} disabled={loading} style={btnStyle}>South West</button>
                <button onClick={() => handleSpawn('SE')} disabled={loading} style={btnStyle}>South East</button>
            </div>

            {error && <div style={{ color: 'red', marginTop: 20 }}>{error}</div>}
            {loading && <div style={{ marginTop: 20 }}>Deploying Colony Ship...</div>}
        </div>
    );
}

const btnStyle = {
    background: 'rgba(0, 243, 255, 0.1)',
    border: '1px solid #00f3ff',
    color: '#c0ffff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
} as const;
