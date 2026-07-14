import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Database,
  ClipboardCheck,
  Play,
  BarChart3,
  Plus,
  Layers,
  Globe,
  Smartphone,
  Server,
  X,
  ShieldCheck,
  Shield,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Coins,
  UserCog
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  onToggleCollapse
}) => {
  const {
    applications,
    activeAppId,
    setActiveAppId,
    addApplication,
    activeExecutionId,
    isSuiteRunning,
    isNLRunning,
    // ⚡ READ THE NEW PROGRESS VARIABLE DIRECTLY FROM PROVIDER CONTEXT
    isGenerationRunning
  } = useApp();

  const { user, logout, hasRole } = useAuth();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');
  const [newAppPlatform, setNewAppPlatform] = useState<'web' | 'mobile' | 'api'>('web');
  const [newAppUrl, setNewAppUrl] = useState('');

  const activeApp = applications.find(app => app.id === activeAppId);

  // ⚡ SYSTEM-WIDE LIVE COMPILING TELEMETRY STATE EVALUATION
  const isCurrentlyExecuting = isSuiteRunning || isNLRunning || activeExecutionId !== null;
  const isSystemBusy = isCurrentlyExecuting || isGenerationRunning;

  const handleOpenDialog = () => {
    setNewAppName('');
    setNewAppDesc('');
    setNewAppPlatform('web');
    setNewAppUrl('');
    dialogRef.current?.showModal();
  };

  const handleCloseDialog = () => {
    dialogRef.current?.close();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleCloseDialog();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;

    const created = addApplication({
      name: newAppName,
      description: newAppDesc,
      platform: newAppPlatform,
      url: newAppUrl || 'http://localhost',
      status: 'active'
    });

    handleCloseDialog();
    setActiveAppId(created.id);
  };

  const navigationItems = [
    { id: 'dashboard', name: 'Overview', icon: LayoutDashboard, roles: ['admin', 'qa_engineer', 'developer', 'qa_reviewer'] },
    { id: 'repository', name: 'Test Cases', icon: Database, roles: ['admin', 'qa_engineer', 'developer', 'qa_reviewer'] },
    { id: 'generator', name: 'AI Test Design', icon: ClipboardCheck, roles: ['admin', 'qa_engineer', 'developer'] },
    { id: 'knowledge', name: 'Knowledge Space', icon: BookOpen, roles: ['admin', 'qa_engineer', 'developer', 'qa_reviewer'] },
    { id: 'test-data', name: 'Test Data', icon: UserCog, roles: ['admin', 'qa_engineer', 'developer'] },
    { id: 'executor', name: 'Execution Lab', icon: Play, roles: ['admin', 'qa_engineer', 'developer', 'qa_reviewer'] },
    { id: 'analytics', name: 'Insights & History', icon: BarChart3, roles: ['admin', 'qa_engineer', 'developer', 'qa_reviewer'] },
    { id: 'token-usage', name: 'Token & Cost', icon: Coins, roles: ['admin'] },
    { id: 'admin', name: 'Admin Console', icon: Shield, roles: ['admin', 'qa_engineer'] },
  ];

  const visibleNavigationItems = navigationItems.filter(item => hasRole(...(item.roles as any)));

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    qa_engineer: 'QA Engineer',
    qa_reviewer: 'QA Reviewer',
    developer: 'Developer',
  };

  const getPlatformIcon = (platform: 'web' | 'mobile' | 'api') => {
    switch (platform) {
      case 'web': return <Globe size={14} className="platform-icon-cyan" />;
      case 'mobile': return <Smartphone size={14} className="platform-icon-pink" />;
      case 'api': return <Server size={14} className="platform-icon-purple" />;
    }
  };

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-logo">
          <ShieldCheck size={24} className="logo-icon-glow" />
        </div>
        <div className="brand-meta">
          <span className="brand-name">OmniTestAI</span>
          <span className="brand-subtitle">AI TESTING PLATFORM</span>
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>

      <div className="app-selector-section">
        <label className="selector-label">Target Application</label>
        <div className="selector-dropdown-wrapper">
          <div className="app-select-container">
            <Layers size={16} className="text-secondary select-prefix-icon" />
            <select
              value={activeAppId || ''}
              onChange={(e) => setActiveAppId(e.target.value || null)}
              className="app-select select-field"
            >
              {applications.length === 0 ? (
                <option value="">No applications</option>
              ) : (
                applications.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.platform.toUpperCase()})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-icon-only"
            onClick={handleOpenDialog}
            title="Create New Application"
            aria-label="Create New Application"
          >
            <Plus size={16} />
          </button>
        </div>

        {activeApp && (
          <div className="active-app-badge-details">
            <span className="platform-indicator">
              {getPlatformIcon(activeApp.platform)}
              {activeApp.platform.toUpperCase()}
            </span>
            <span className="environment-url" title={activeApp.url}>{activeApp.url}</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <ul>
          {visibleNavigationItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`nav-button ${isActive ? 'active' : ''}`}
                  title={item.name}
                >
                  <Icon size={18} className="nav-icon" />
                  <span>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 🔴 FLIPS TO HOT RED INSTANTLY DURING SECTOR RUNS OR COMPILATION STEPS */}
      <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem 1.5rem', background: 'transparent' }}>
        <span
          className="agent-status-pulse"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isSystemBusy ? '#ef4444' : '#10b981',
            boxShadow: isSystemBusy ? '0 0 10px #ef4444' : '0 0 10px #10b981',
            animation: 'pulse 2s infinite',
            transition: 'background 0.3s ease, box-shadow 0.3s ease'
          }}
        ></span>
        <span
          className="agent-status-text"
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: isSystemBusy ? '#ef4444' : '#94a3b8',
            transition: 'color 0.3s ease'
          }}
        >
          {isGenerationRunning
            ? 'OmniTestAI (Compiling...)'
            : isCurrentlyExecuting
              ? 'OmniTestAI (In Progress)'
              : 'OmniTestAI (Idle)'}
        </span>
      </div>

      {user && (
        <div
          className="sidebar-user"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '0.75rem 1.5rem',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon-only"
            onClick={logout}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">New Application</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleCloseDialog}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="app-name" className="form-label">Application Name</label>
            <input
              type="text"
              id="app-name"
              className="input-field"
              placeholder="e.g. SwiftCart E-Commerce"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="app-desc" className="form-label">Description</label>
            <textarea
              id="app-desc"
              className="textarea-field"
              placeholder="Provide details about the platform features, APIs, and key pages..."
              value={newAppDesc}
              onChange={(e) => setNewAppDesc(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="app-platform" className="form-label">Platform Type</label>
            <select
              id="app-platform"
              className="select-field"
              value={newAppPlatform}
              onChange={(e) => setNewAppPlatform(e.target.value as 'web' | 'mobile' | 'api')}
            >
              <option value="web">Web App</option>
              <option value="mobile">Mobile App</option>
              <option value="api">API Endpoint Suite</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="app-url" className="form-label">Environment URL</label>
            <input
              type="url"
              id="app-url"
              className="input-field"
              placeholder="https://example.com"
              value={newAppUrl}
              onChange={(e) => setNewAppUrl(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseDialog}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create Application
            </button>
          </div>
        </form>
      </dialog>
    </aside>
  );
};