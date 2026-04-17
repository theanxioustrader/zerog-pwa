import React, { useState } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import './LoginScreen.css';

interface LoginScreenProps {
  onLogin: (token: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!secret.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.auth(secret.trim());
      auth.save({ token: res.token, expires: res.expires, userId: res.userId });
      window.location.hash = `token=${res.token}`;
      onLogin(res.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not connect';
      if (msg.toLowerCase().includes('invalid')) {
        setError('Invalid pairing secret. Double-check and try again.');
      } else if (msg.includes('fetch') || msg.includes('Failed') || msg.includes('Network')) {
        setError('Cannot reach ZeroG server. Check your internet connection.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="orbit-backdrop">
        <div className="orbit-ring ring-1"></div>
        <div className="orbit-ring ring-2"></div>
        <div className="orbit-ring ring-3"></div>
        <div className="logo-core">
          <span className="logo-letter">Z</span>
        </div>
      </div>

      <div className="wordmark-wrap">
        <span className="wordmark-zero">ZERO</span>
        <span className="wordmark-g">G</span>
        <span className="wordmark-remote"> REMOTE</span>
      </div>
      <p className="tagline">Mission Control for Antigravity AI</p>

      <div className="status-chip">
        <div className="status-dot"></div>
        <span className="status-chip-text">Secure Connection</span>
      </div>

      <form className="login-form" onSubmit={handleConnect}>
        <label className="input-label">PAIRING SECRET</label>
        <div className={`input-wrap ${error ? 'input-error' : ''}`}>
          <input
            type={showSecret ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            className="login-input"
            placeholder="Enter your 6-digit PIN..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            disabled={loading}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
          />
          <button
            type="button"
            className="eye-btn"
            onClick={() => setShowSecret(!showSecret)}
          >
            {showSecret ? '🙈' : '👁'}
          </button>
        </div>

        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            <p className="error-text">{error}</p>
          </div>
        )}

        <button
          type="button"
          className={`connect-btn ${(!secret.trim() || loading) ? 'btn-disabled' : ''}`}
          onClick={handleConnect}
        >
          {loading ? (
            <div className="spinner"></div>
          ) : (
            <>
              <span className="btn-icon">⚡</span>
              Connect to Agent
            </>
          )}
        </button>
      </form>

      <div className="help-wrap">
        <p className="help-text">
          Your pairing secret links this app to your<br />
          Antigravity agent running on your computer.
        </p>
      </div>
    </div>
  );
};
