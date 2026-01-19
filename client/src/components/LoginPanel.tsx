import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import './LoginPanel.css';

interface LoginPanelProps {
  onLogin: () => void;
}

interface Star {
  x: number;
  y: number;
  size: number;
  color: string;
  twinkleOffset: number;
  layer: number; // 1-3 for parallax depth
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface Debris {
  x: number;
  y: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  vx: number;
  vy: number;
  opacity: number;
}

export default function LoginPanel({ onLogin }: LoginPanelProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosRef = useRef({ x: 0.5, y: 0.5 });
  const starsRef = useRef<Star[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const debrisRef = useRef<Debris[]>([]);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let frame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width, canvas.height);
    };

    const initParticles = (w: number, h: number) => {
      // Initialize stars
      const colors = ['#ffffff', '#e0f0ff', '#00f2ff', '#ff7799', '#cc99ff', '#ffdd44'];
      starsRef.current = [];
      for (let i = 0; i < 500; i++) {
        const layer = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
        starsRef.current.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: layer === 3 ? Math.random() * 3 + 1.5 : layer === 2 ? Math.random() * 2 + 0.5 : Math.random() * 1.5 + 0.3,
          color: colors[Math.floor(Math.random() * colors.length)],
          twinkleOffset: Math.random() * Math.PI * 2,
          layer
        });
      }

      // Initialize debris
      debrisRef.current = [];
      for (let i = 0; i < 25; i++) {
        debrisRef.current.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: Math.random() * 25 + 8,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.015,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          opacity: Math.random() * 0.12 + 0.03
        });
      }
    };

    const animate = () => {
      frame++;
      const time = frame * 0.016;
      const w = canvas.width;
      const h = canvas.height;
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;

      // FULL CLEAR - no trails since it was causing the black screen
      ctx.fillStyle = '#030510';
      ctx.fillRect(0, 0, w, h);

      // === NEBULA BACKGROUND ===
      // Purple nebula top-left
      const neb1x = w * 0.2 + Math.sin(time * 0.2) * 30;
      const neb1y = h * 0.25 + Math.cos(time * 0.3) * 20;
      const nebula1 = ctx.createRadialGradient(neb1x, neb1y, 0, neb1x, neb1y, w * 0.45);
      nebula1.addColorStop(0, `rgba(100, 40, 160, ${0.12 + Math.sin(time * 0.5) * 0.03})`);
      nebula1.addColorStop(0.4, 'rgba(60, 20, 100, 0.06)');
      nebula1.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula1;
      ctx.fillRect(0, 0, w, h);

      // Crimson nebula bottom-right
      const neb2x = w * 0.8 + Math.cos(time * 0.15) * 40;
      const neb2y = h * 0.75 + Math.sin(time * 0.25) * 30;
      const nebula2 = ctx.createRadialGradient(neb2x, neb2y, 0, neb2x, neb2y, w * 0.4);
      nebula2.addColorStop(0, `rgba(180, 40, 70, ${0.1 + Math.cos(time * 0.7) * 0.025})`);
      nebula2.addColorStop(0.4, 'rgba(120, 20, 50, 0.04)');
      nebula2.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula2;
      ctx.fillRect(0, 0, w, h);

      // Cyan nebula center
      const nebula3 = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.35);
      nebula3.addColorStop(0, `rgba(0, 180, 220, ${0.06 + Math.sin(time * 0.4) * 0.02})`);
      nebula3.addColorStop(0.5, 'rgba(0, 100, 140, 0.02)');
      nebula3.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula3;
      ctx.fillRect(0, 0, w, h);

      // === STARS with parallax ===
      const parallaxX = (mx - 0.5) * 50;
      const parallaxY = (my - 0.5) * 50;

      starsRef.current.forEach(star => {
        const twinkle = Math.sin(time * 2.5 + star.twinkleOffset) * 0.35 + 0.65;
        const pFactor = star.layer * 0.4;
        let sx = star.x + parallaxX * pFactor;
        let sy = star.y + parallaxY * pFactor;

        // Wrap around
        sx = ((sx % w) + w) % w;
        sy = ((sy % h) + h) % h;

        // Draw star
        ctx.beginPath();
        ctx.arc(sx, sy, star.size * twinkle, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = twinkle;
        ctx.fill();

        // Glow for bigger stars
        if (star.size > 1.8) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.size * 5);
          glow.addColorStop(0, star.color);
          glow.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(sx, sy, star.size * 5, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.globalAlpha = twinkle * 0.25;
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // === SHOOTING STARS ===
      if (Math.random() < 0.025) {
        shootingStarsRef.current.push({
          x: Math.random() * w,
          y: -20,
          vx: (Math.random() - 0.5) * 5,
          vy: Math.random() * 8 + 5,
          life: 0,
          maxLife: 70 + Math.random() * 50
        });
      }

      shootingStarsRef.current = shootingStarsRef.current.filter(star => {
        star.x += star.vx;
        star.y += star.vy;
        star.life++;

        const alpha = Math.sin((star.life / star.maxLife) * Math.PI);

        // Trail
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x - star.vx * 12, star.y - star.vy * 12);
        const grad = ctx.createLinearGradient(star.x, star.y, star.x - star.vx * 12, star.y - star.vy * 12);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        grad.addColorStop(0.4, `rgba(0, 220, 255, ${alpha * 0.6})`);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(star.x, star.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();

        return star.life < star.maxLife && star.y < h + 100;
      });

      // === FLOATING DEBRIS ===
      ctx.globalAlpha = 1;
      debrisRef.current.forEach(d => {
        d.x += d.vx;
        d.y += d.vy;
        d.rotation += d.rotationSpeed;

        if (d.x < -60) d.x = w + 60;
        if (d.x > w + 60) d.x = -60;
        if (d.y < -60) d.y = h + 60;
        if (d.y > h + 60) d.y = -60;

        const dx = d.x + parallaxX * 0.2;
        const dy = d.y + parallaxY * 0.2;

        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(d.rotation);
        ctx.globalAlpha = d.opacity;
        ctx.strokeStyle = '#445566';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(-d.size * 0.7, -d.size * 0.4);
        ctx.lineTo(-d.size * 0.1, -d.size * 0.85);
        ctx.lineTo(d.size * 0.6, -d.size * 0.5);
        ctx.lineTo(d.size * 0.85, d.size * 0.2);
        ctx.lineTo(d.size * 0.3, d.size * 0.75);
        ctx.lineTo(-d.size * 0.45, d.size * 0.4);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      // === CENTRAL VORTEX ===
      const cx = w / 2;
      const cy = h / 2;

      // Accretion rings
      for (let i = 0; i < 6; i++) {
        const radius = 180 + i * 35 + Math.sin(time * 1.5 + i * 0.5) * 12;
        const rot = time * (0.35 - i * 0.04);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.28, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 220, 255, ${0.2 - i * 0.025})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Spiral arms
      ctx.save();
      ctx.translate(cx, cy);
      for (let arm = 0; arm < 4; arm++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        for (let i = 0; i < 70; i++) {
          const angle = i * 0.13 + time * 0.5;
          const r = i * 3.2;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r * 0.28;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = arm % 2 === 0 ? 'rgba(140, 70, 220, 0.25)' : 'rgba(220, 50, 90, 0.2)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();

      // Core
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      coreGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
      coreGrad.addColorStop(0.4, 'rgba(0, 40, 60, 0.5)');
      coreGrad.addColorStop(0.7, 'rgba(0, 80, 100, 0.2)');
      coreGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Energy sparks
      if (frame % 2 === 0) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 130 + Math.random() * 70;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist * 0.28, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 230, ${0.4 + Math.random() * 0.4})`;
        ctx.fill();
      }

      // === DATA STREAMS ===
      ctx.font = 'bold 11px monospace';
      const streams = 10;
      for (let s = 0; s < streams; s++) {
        const baseX = (w / streams) * s + 30;
        for (let c = 0; c < 18; c++) {
          const charY = ((time * 45 + c * 22 + s * 80) % (h + 300)) - 150;
          const char = String.fromCharCode(65 + Math.floor((time * 8 + c + s * 3) % 26));
          const alpha = c === 0 ? 1 : Math.max(0, 0.7 - c * 0.04);
          ctx.fillStyle = c === 0 ? `rgba(0, 255, 200, ${alpha})` : `rgba(0, 140, 130, ${alpha})`;
          ctx.fillText(char, baseX, charY);
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mousePosRef.current = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isRegister) {
        const result = await api.register(username, email, password);
        setSuccess(`Colony established, Commander ${result.user.username}! Initializing warp drive...`);
        setTimeout(() => onLogin(), 2000);
      } else {
        await api.login(email, password);
        setSuccess('Identity verified. Engaging hyperdrive...');
        setTimeout(() => onLogin(), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subspace relay failure. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabSwitch = (register: boolean) => {
    if (register !== isRegister) {
      setIsRegister(register);
      setError(null);
      setSuccess(null);
    }
  };

  return (
    <div className="login-panel-overlay" onMouseMove={handleMouseMove}>
      <canvas ref={canvasRef} className="space-canvas" />
      <div className="scanlines" />
      <div className="vignette" />

      {/* HUD Corners */}
      <div className="hud-corner hud-corner-tl">
        <div className="hud-line hud-line-h"></div>
        <div className="hud-line hud-line-v"></div>
        <div className="hud-text">SYS-ONLINE</div>
      </div>
      <div className="hud-corner hud-corner-tr">
        <div className="hud-line hud-line-h"></div>
        <div className="hud-line hud-line-v"></div>
        <div className="hud-text">SEC-7</div>
      </div>
      <div className="hud-corner hud-corner-bl">
        <div className="hud-line hud-line-h"></div>
        <div className="hud-line hud-line-v"></div>
        <div className="hud-text">LINK-OK</div>
      </div>
      <div className="hud-corner hud-corner-br">
        <div className="hud-line hud-line-h"></div>
        <div className="hud-line hud-line-v"></div>
        <div className="hud-data">
          <span className="data-label">LAT:</span>
          <span className="data-value">47.2°N</span>
        </div>
      </div>

      {/* Status indicators */}
      <div className="status-indicators">
        <div className="status-item status-pulse">
          <span className="status-dot"></span>
          <span className="status-text">QUANTUM LINK ACTIVE</span>
        </div>
        <div className="status-item">
          <span className="status-dot status-dot-warning"></span>
          <span className="status-text">SECTOR SCAN: 94%</span>
        </div>
      </div>

      {/* Orbital rings */}
      <div className="orbital-system">
        <div className="orbital-ring orbital-ring-1"></div>
        <div className="orbital-ring orbital-ring-2"></div>
        <div className="orbital-ring orbital-ring-3"></div>
        <div className="orbital-dot orbital-dot-1"></div>
        <div className="orbital-dot orbital-dot-2"></div>
      </div>

      {/* Login Card */}
      <div className="login-panel">
        <div className="border-beam border-beam-top"></div>
        <div className="border-beam border-beam-right"></div>
        <div className="border-beam border-beam-bottom"></div>
        <div className="border-beam border-beam-left"></div>
        <div className="holo-overlay"></div>

        <div className="login-logo">
          <div className="logo-glitch" data-text="DREAD">DREAD</div>
          <div className="logo-glitch logo-horizon" data-text="HORIZON">HORIZON</div>
          <div className="subtitle">
            <span className="subtitle-bracket">[</span>
            STRATEGIC COMMAND INTERFACE
            <span className="subtitle-bracket">]</span>
          </div>
          <div className="logo-underline"></div>
        </div>

        <div className="login-tabs">
          <button className={!isRegister ? 'active' : ''} onClick={() => handleTabSwitch(false)} type="button">
            <span className="tab-icon">◈</span> LOGIN
          </button>
          <button className={isRegister ? 'active' : ''} onClick={() => handleTabSwitch(true)} type="button">
            <span className="tab-icon">◇</span> REGISTER
          </button>
          <div className="tab-indicator" style={{ transform: `translateX(${isRegister ? '100%' : '0'})` }}></div>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label htmlFor="username"><span className="label-icon">►</span> COMMANDER NAME</label>
              <div className="input-wrapper">
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Enter your callsign" autoComplete="username" />
                <div className="input-glow"></div>
                <div className="input-scan"></div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email"><span className="label-icon">►</span> SECURE CHANNEL</label>
            <div className="input-wrapper">
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="commander@fleet.gov" autoComplete="email" />
              <div className="input-glow"></div>
              <div className="input-scan"></div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password"><span className="label-icon">►</span> PASSWORD</label>
            <div className="input-wrapper">
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••••••" minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} />
              <div className="input-glow"></div>
              <div className="input-scan"></div>
            </div>
          </div>

          {error && <div className="error-message"><span className="message-icon">⚠</span>{error}</div>}
          {success && <div className="success-message"><span className="message-icon">✓</span>{success}</div>}

          <button type="submit" disabled={loading} className={`submit-btn ${loading ? 'loading' : ''}`}>
            <span className="btn-text">{loading ? 'ESTABLISHING LINK...' : isRegister ? '◈ INITIALIZE COLONY ◈' : '◈ ACCESS COMMAND BRIDGE ◈'}</span>
            <div className="btn-shine"></div>
            <div className="btn-particles"><span></span><span></span><span></span><span></span></div>
          </button>
        </form>

        {isRegister && (
          <p className="info-text">
            <span className="info-icon">🛸</span>
            Your colony will be established in a strategic sector upon registration.
            <span className="info-blink">_</span>
          </p>
        )}

        <div className="version-tag">v2.4.7-alpha</div>
      </div>
    </div>
  );
}
