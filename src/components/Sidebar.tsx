import React, { useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
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
  BookOpen,
  ChevronsLeft,
  ChevronsRight
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
    addApplication
  } = useApp();
  
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');
  const [newAppPlatform, setNewAppPlatform] = useState<'web' | 'mobile' | 'api'>('web');
  const [newAppUrl, setNewAppUrl] = useState('');
  
  // Real-time task metrics tracker states
  const [runningTasksCount, setRunningTasksCount] = useState(0);
  const [localProcessing, setLocalProcessing] = useState(false);

  const activeApp = applications.find(app => app.id === activeAppId);

  // 🛠️ FAILSAFE HEARTBEAT: Listen for local script memory execution triggers alongside database polling
  useEffect(() => {
    // Check if the current browser window session tab cache has any active processing states
    const checkLocalAndServerStatus = async () => {
      // 1. Fetch live metrics directly from database counters
      try {
        const response = await fetch('http://localhost:8000/dashboard/metrics');
        if (response.ok) {
          const data = await response.json();
          setRunningTasksCount(data.runningJobs || 0);
        }
      } catch (err) {
        console.warn("Sidebar remote status sync timed out:", err);
      }

      // 2. Fallback check: Look at the visual UI spinners state to guarantee real-time updates
      const hasActiveUiSpinners = document.querySelector('.animate-spin') !== null || 
                                  document.querySelector('[class*="spinner"]') !== null;
      setLocalProcessing(hasActiveUiSpinners);
    };

    // Fast-frequency sampling loop (checks every 800ms) to update perfectly during live runs
    checkLocalAndServerStatus();
    const interval = setInterval(checkLocalAndServerStatus, 800);
    return () => clearInterval(interval);
  }, []);

  // Switches status if either backend reports an agent job OR frontend is animating a spinner card
  const isCurrentlyExecuting = runningTasksCount > 0 || localProcessing;

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
    { id: 'dashboard', name: 'Overview', icon: LayoutDashboard },
    { id: 'repository', name: 'Test Cases', icon: Database },
    { id: 'generator', name: 'AI Test Design', icon: ClipboardCheck },
    { id: 'knowledge', name: 'Knowledge Space', icon: BookOpen },
    { id: 'executor', name: 'Execution Lab', icon: Play },
    { id: 'analytics', name: 'Insights & History', icon: BarChart3 }
  ];

  const getPlatformIcon = (platform: 'web' | 'mobile' | 'api') => {
    switch (platform) {
      case 'web': return <Globe size={14} className="platform-icon-cyan" />;
      case 'mobile': return <Smartphone size={14} className="platform-icon-pink" />;
      case 'api': return <Server size={14} className="platform-icon-purple" />;
    }
  };

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Brand logo */}
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

      {/* App Selector Dropdown wrapper */}
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

      {/* Main navigation menu */}
      <nav className="sidebar-nav">
        <ul>
          {navigationItems.map(item => {
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

      {/* FIXED DYNAMIC SIDEBAR FOOTER STATUS */}
      <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem 1.5rem', background: 'transparent' }}>
        <span 
          className="agent-status-pulse" 
          style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: isCurrentlyExecuting ? '#ef4444' : '#10b981',
            boxShadow: isCurrentlyExecuting ? '0 0 10px #ef4444' : '0 0 10px #10b981',
            animation: 'pulse 2s infinite',
            transition: 'background 0.3s ease, box-shadow 0.3s ease'
          }}
        ></span>
        <span 
          className="agent-status-text" 
          style={{ 
            fontSize: '0.8rem', 
            fontWeight: 700, 
            color: isCurrentlyExecuting ? '#ef4444' : '#94a3b8',
            transition: 'color 0.3s ease'
          }}
        >
          {isCurrentlyExecuting ? 'OmniTestAI (In Progress)' : 'OmniTestAI (Idle)'}
        </span>
      </div>

      {/* Add New App Native Dialog Modal */}
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