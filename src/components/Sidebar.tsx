import React, { useRef, useState } from 'react';
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

  const activeApp = applications.find(app => app.id === activeAppId);

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

  // Close when clicking backdrop (light dismiss)
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

      {/* Sidebar Footer info */}
      <div className="sidebar-footer">
        <span className="agent-status-pulse"></span>
        <span className="agent-status-text">Agent Core v1.4.2 (Idle)</span>
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
