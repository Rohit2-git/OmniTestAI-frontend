import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Folder, 
  FileCheck, 
  Activity,
  Layers,
  ArrowRight,
  BookOpen,
  Bot,
  PenSquare
} from 'lucide-react';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { applications, testCases, history, activeAppId, setActiveAppId, knowledgeAssets } = useApp();

  // Calculations for stats
  const totalApps = applications.length;
  const totalTestCases = testCases.length;
  const manualTests = testCases.filter((testCase) => (testCase.source || 'manual') === 'manual').length;
  const aiTests = testCases.filter((testCase) => (testCase.source || 'manual') !== 'manual').length;
  
  const finishedRuns = history.filter(run => run.status !== 'running');
  const passedRunsCount = finishedRuns.filter(run => run.status === 'passed').length;
  const overallPassRate = finishedRuns.length > 0 
    ? Math.round((passedRunsCount / finishedRuns.length) * 100) 
    : 100;

  const runningExecutions = history.filter(run => run.status === 'running').length;
  const activeAppKnowledge = knowledgeAssets.filter((asset) => asset.appId === activeAppId).length;

  const handleSelectApp = (appId: string) => {
    setActiveAppId(appId);
    setActiveTab('repository');
  };

  const getAppName = (appId: string) => {
    const app = applications.find(a => a.id === appId);
    return app ? app.name : 'Unknown Application';
  };

  const getAppTestCount = (appId: string) => {
    return testCases.filter(tc => tc.appId === appId).length;
  };

  const getAppPassRate = (appId: string) => {
    const appRuns = history.filter(r => r.appId === appId && r.status !== 'running');
    if (appRuns.length === 0) return 'N/A';
    const passed = appRuns.filter(r => r.status === 'passed').length;
    return `${Math.round((passed / appRuns.length) * 100)}%`;
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="dashboard-view">
      <div className="view-header">
        <h1>Scalable Testing Command Center</h1>
        <p>Manage manual and AI-generated suites, feed the generator from Jira and acceptance context, and track execution reliability.</p>
      </div>

      {/* Global Stat Cards Grid */}
      <div className="dashboard-grid">
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper purple">
            <Layers size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{totalApps}</span>
            <span className="stats-title">Registered Apps</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper cyan">
            <Folder size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{totalTestCases}</span>
            <span className="stats-title">Total Test Cases</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper green">
            <FileCheck size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{overallPassRate}%</span>
            <span className="stats-title">Average Pass Rate</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper warning">
            <Activity size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{runningExecutions}</span>
            <span className="stats-title">Running Jobs</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '1rem' }}>
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper" style={{ background: 'var(--color-info-bg)' }}>
            <PenSquare size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{manualTests}</span>
            <span className="stats-title">Manual Authored</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper" style={{ background: 'var(--accent-cyan-glow)' }}>
            <Bot size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{aiTests}</span>
            <span className="stats-title">AI Generated</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper" style={{ background: 'var(--accent-purple-glow)' }}>
            <BookOpen size={24} />
          </div>
          <div className="stats-meta">
            <span className="stats-value">{activeAppKnowledge}</span>
            <span className="stats-title">Active App Knowledge</span>
          </div>
        </div>

        <div className="glass-card stats-card col-3">
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%' }}
            onClick={() => setActiveTab('knowledge')}
          >
            <BookOpen size={16} />
            <span>Open Knowledge Space</span>
          </button>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        {/* Applications Grid list */}
        <div className="col-8">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Target Applications</h2>
          </div>
          
          {applications.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p>No applications registered. Click the "+" button in the sidebar to create one!</p>
            </div>
          ) : (
            <div className="dashboard-apps-grid">
              {applications.map(app => {
                const isActive = app.id === activeAppId;
                return (
                  <div 
                    key={app.id} 
                    className={`glass-card hoverable app-card ${isActive ? 'active-app-border' : ''}`}
                    onClick={() => handleSelectApp(app.id)}
                    style={isActive ? { borderColor: 'var(--accent-cyan)', boxShadow: 'var(--glow-cyan)' } : {}}
                  >
                    <div>
                      <div className="app-card-header">
                        <span className="app-card-title">{app.name}</span>
                        <span className={`badge ${app.platform === 'web' ? 'badge-info' : app.platform === 'mobile' ? 'badge-purple' : 'badge-success'}`}>
                          {app.platform}
                        </span>
                      </div>
                      <p className="app-card-description">{app.description}</p>
                    </div>
                    
                    <div className="app-card-footer">
                      <span>{getAppTestCount(app.id)} Test Cases</span>
                      <span>Pass Rate: <strong style={{ color: 'var(--text-main)' }}>{getAppPassRate(app.id)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Runs Widget */}
        <div className="col-4">
          <h2>Recent Activity</h2>
          <div className="glass-card" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {history.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '1.5rem 0' }}>No executions recorded yet.</p>
            ) : (
              history.slice(0, 4).map(run => (
                <div 
                  key={run.id} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.4rem', 
                    paddingBottom: '0.75rem', 
                    borderBottom: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span 
                      style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
                      onClick={() => {
                        setActiveAppId(run.appId);
                        setActiveTab('analytics');
                      }}
                    >
                      {getAppName(run.appId)}
                    </span>
                    <span className={`badge ${run.status === 'passed' ? 'badge-success' : run.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>
                      {run.status}
                    </span>
                  </div>
                  
                  {run.nlInstruction && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} className="environment-url">
                      "{run.nlInstruction}"
                    </span>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>{run.metrics.stepsCount} steps • {(run.metrics.durationMs / 1000).toFixed(1)}s</span>
                    <span>{formatDate(run.executedAt)}</span>
                  </div>
                </div>
              ))
            )}
            
            <button 
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setActiveTab('analytics')}
              style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <span>View All History</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
