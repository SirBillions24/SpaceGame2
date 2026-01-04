import { useState } from 'react';
import { api } from '../lib/api';
import './LoginPanel.css';

interface LoginPanelProps {
  onLogin: () => void;
}

export default function LoginPanel({ onLogin }: LoginPanelProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isRegister) {
        const result = await api.register(username, email, password);
        setSuccess(`Account created! Welcome, ${result.user.username}. Your castle has been spawned!`);
        // Auto-login after registration
        setTimeout(() => {
          onLogin();
        }, 1500);
      } else {
        await api.login(email, password);
        setSuccess('Login successful!');
        setTimeout(() => {
          onLogin();
        }, 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-panel-overlay">
      <div className="login-panel">
        <h2>{isRegister ? 'Create Account' : 'Login'}</h2>
        
        <div className="login-tabs">
          <button
            className={!isRegister ? 'active' : ''}
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
          >
            Login
          </button>
          <button
            className={isRegister ? 'active' : ''}
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Choose a username"
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Please wait...' : isRegister ? 'Create Account & Spawn Castle' : 'Login'}
          </button>
        </form>

        {isRegister && (
          <p className="info-text">
            Creating an account will automatically spawn your starting castle on the map!
          </p>
        )}
      </div>
    </div>
  );
}

