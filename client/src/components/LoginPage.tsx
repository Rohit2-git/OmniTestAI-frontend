import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Mail, Lock, User as UserIcon, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = () => setError(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="otai-auth-c2">
      <style>{CSS_C2}</style>
      <div className="otai-minimal-stack">
        
        {/* Simplified Branding Header */}
        <div className="otai-header-node">
          <div className="otai-brand-badge">
            <ShieldCheck size={20} color="#ffffff" />
          </div>
          <h1 className="otai-platform-title">OmniTestAI</h1>
          <p className="otai-platform-subtitle">AI TESTING PLATFORM</p>
        </div>

        {/* Clean Container Block */}
        <div className="otai-white-card">
          <div className="otai-card-meta">
            <h2 className="otai-form-title">
              {mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}
            </h2>
            <p className="otai-form-subtitle">
              {mode === 'login' ? 'Enter your credentials to access your dashboards.' : 'Fill in your details to get started.'}
            </p>
          </div>

          {error && (
            <div className="otai-alert" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="otai-form-fields" noValidate>
            {mode === 'register' && (
              <div className="otai-input-cell">
                <label htmlFor="name" className="otai-input-label">Full name</label>
                <div className="otai-input-wrap">
                  <UserIcon size={15} className="otai-input-icon" />
                  <input id="name" type="text" placeholder="Jane Doe" value={name} onChange={(e) => { setName(e.target.value); clearError(); }} required autoFocus />
                </div>
              </div>
            )}

            <div className="otai-input-cell">
              <label htmlFor="email" className="otai-input-label">Email address</label>
              <div className="otai-input-wrap">
                <Mail size={15} className="otai-input-icon" />
                <input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} required autoFocus={mode === 'login'} />
              </div>
            </div>

            <div className="otai-input-cell">
              <label htmlFor="password" className="otai-input-label">Password</label>
              <div className="otai-input-wrap">
                <Lock size={15} className="otai-input-icon" />
                <input id="password" type="password" placeholder="••••••••••" value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} required minLength={8} />
              </div>
            </div>

            <button type="submit" className="otai-prime-btn" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 size={15} className="otai-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                <><>{mode === 'login' ? 'Sign in' : 'Create account'}</> <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="otai-split-bar"><span>or</span></div>

          <div className="otai-switch-action">
            {mode === 'login' ? (
              <span>Don't have an account? <button type="button" onClick={() => { setMode('register'); setError(null); }}>Create one</button></span>
            ) : (
              <span>Already have an account? <button type="button" onClick={() => { setMode('login'); setError(null); }}>Sign in</button></span>
            )}
          </div>

          <p className="otai-legal-note">By signing in, you agree to OmniTestAI's internal usage policies.</p>
        </div>

      </div>
    </div>
  );
};

const CSS_C2 = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; background: #f1f5f9; font-family: 'Inter', sans-serif; }
.otai-auth-c2 { width: 100%; min-height: 100vh; background: #f1f5f9; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.otai-minimal-stack { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 1.75rem; }

.otai-header-node { text-align: center; display: flex; flex-direction: column; align-items: center; }
.otai-brand-badge { width: 42px; height: 42px; background: #003D5B; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem; box-shadow: 0 4px 12px rgba(0,61,91,0.15); }
.otai-platform-title { font-size: 1.25rem; font-weight: 800; color: #003D5B; letter-spacing: -0.01em; }
.otai-platform-subtitle { font-size: 0.62rem; font-weight: 700; color: #64748b; letter-spacing: 0.12em; margin-top: 2px; }

.otai-white-card { background: #ffffff !important; border: 1px solid #e2e8f0 !important; border-top: 4px solid #003D5B !important; border-radius: 16px; padding: 2.5rem 2.25rem; box-shadow: 0 10px 30px -10px rgba(0,61,91,0.08); }
.otai-card-meta { margin-bottom: 1.75rem; }
.otai-form-title { font-size: 1.35rem; font-weight: 800; color: #003D5B; letter-spacing: -0.02em; margin-bottom: 0.35rem; }
.otai-form-subtitle { font-size: 0.85rem; color: #64748b; line-height: 1.45; }

.otai-alert { display: flex; align-items: center; gap: 0.5rem; background: #fff5f5; border: 1px solid #fed7d7; color: #c53030; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.82rem; margin-bottom: 1.25rem; }
.otai-form-fields { display: flex; flex-direction: column; gap: 1.1rem; }
.otai-input-cell { display: flex; flex-direction: column; gap: 0.45rem; }
.otai-input-label { font-size: 0.72rem; font-weight: 800; color: #003D5B; letter-spacing: 0.04em; text-transform: uppercase; }
.otai-input-wrap { position: relative; display: flex; align-items: center; }
.otai-input-icon { position: absolute; left: 0.9rem; color: #94a3b8; pointer-events: none; }
.otai-input-wrap input { width: 100%; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 0.72rem 0.9rem 0.72rem 2.5rem; color: #0f172a; font-size: 0.9rem; outline: none; transition: all 0.15s ease; }
.otai-input-wrap input::placeholder { color: #cbd5e1; }
.otai-input-wrap input:focus { border-color: #003D5B; box-shadow: 0 0 0 3px rgba(0,61,91,0.08); background: #ffffff; }

.otai-prime-btn { margin-top: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #003D5B; color: #ffffff; font-weight: 700; font-size: 0.9rem; border: none; border-radius: 10px; padding: 0.82rem 1rem; cursor: pointer; transition: background 0.15s; }
.otai-prime-btn:hover:not(:disabled) { background: #002b40; }
.otai-prime-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.otai-split-bar { display: flex; align-items: center; gap: 0.75rem; margin: 1.5rem 0 1.25rem; color: #cbd5e1; font-size: 0.78rem; }
.otai-split-bar::before, .otai-split-bar::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
.otai-switch-action { font-size: 0.85rem; color: #64748b; text-align: center; margin-bottom: 1.25rem; }
.otai-switch-action button { background: none; border: none; color: #003D5B; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

.otai-legal-note { font-size: 0.72rem; color: #94a3b8; text-align: center; line-height: 1.4; }
.otai-spin { animation: otai-rotate 0.9s linear infinite; }
@keyframes otai-rotate { to { transform: rotate(360deg); } }
`;