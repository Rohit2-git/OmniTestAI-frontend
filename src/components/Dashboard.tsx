import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import { 
  Folder, 
  FileCheck, 
  Activity,
  Layers,
  ArrowRight,
  BookOpen,
  Bot,
  PenSquare,
  Loader2,
  Settings2,
  X,
  Check,
  Trash2
} from 'lucide-react';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { applications, testCases, history, activeAppId, setActiveAppId, updateApplication, deleteApplication } = useApp();
  
  const [serverMetrics, setServerMetrics] = useState({
    totalTestCases: 0,
    aiGeneratedTests: 0,
    manualAuthoredTests: 0,
    overallPassRate: 100,
    runningJobs: 0,
    totalKnowledgeAssets: 0
  });
  const [loading, setLoading] = useState(true);

  // Management Modal UI States
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await apiService.getLiveDashboardMetrics();
        setServerMetrics(data);
      } catch (err) {
        console.error("Dashboard glass template data synchronization failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [applications, history, testCases]);

  const totalApps = applications.length;
  const totalSavedTestCases = testCases.length;

  const aiTestsCount = testCases.filter(tc => 
    tc.runId || tc.source === 'ai' || !tc.source || tc.source !== 'manual'
  ).length;

  const manualTestsCount = testCases.filter(tc => 
    tc.source === 'manual'
  ).length;

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

  const startEditing = (app: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAppId(app.id);
    setEditName(app.name);
    setEditDesc(app.description || '');
  };

  const saveAppEdits = (app: any, e: React.MouseEvent) => {
    e.stopPropagation();
    updateApplication({
      ...app,
      name: editName,
      description: editDesc
    });
    setEditingAppId(null);
  };

  const handleDeleteAppClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you absolutely sure you want to delete this target environment profile? This permanently purges all linked blueprints!")) {
      deleteApplication(id);
    }
  };

  return (
    <div className="dashboard-view" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2rem', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', minHeight: '100vh' }}>
      
      {/* HEADER SECTION */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.04em' }}>Quality Operations Hub</h1>
          <p style={{ color: '#475569', marginTop: '0.4rem', fontSize: '1.05rem', fontWeight: 500 }}>Monitor cross-platform test coverage, AI generation metrics, and system runtime execution reliability.</p>
        </div>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#06b6d4', fontSize: '0.9rem', fontWeight: 600, background: '#ffffff', padding: '8px 16px', borderRadius: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <Loader2 className="animate-spin" size={16} />
            <span>Telemetry Refreshing...</span>
          </div>
        )}
      </div>

      {/* STATS TILES GLASS GRID */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#f3e8ff', color: '#a855f7', padding: '12px', borderRadius: '12px' }}><Layers size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{totalApps}</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Registered Applications</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#ecfeff', color: '#06b6d4', padding: '12px', borderRadius: '12px' }}><Folder size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{totalSavedTestCases}</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Total Test Suite Size</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '12px', borderRadius: '12px' }}><FileCheck size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{serverMetrics.overallPassRate}%</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Average Success Rate</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#fffbeb', color: '#d97706', padding: '12px', borderRadius: '12px' }}><Activity size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{serverMetrics.runningJobs}</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Running Agents</span>
          </div>
        </div>
      </div>

      {/* SUB GRID CARD METRICS ROW 2 */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '10px', borderRadius: '10px' }}><PenSquare size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{manualTestsCount}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Manual Authored</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#ecfeff', color: '#06b6d4', padding: '10px', borderRadius: '10px' }}><Bot size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{aiTestsCount}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>AI Generated</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '10px', borderRadius: '10px' }}><BookOpen size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{serverMetrics.totalKnowledgeAssets}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Grounding Contexts</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('knowledge')}
          style={{ background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '20px', padding: '1.25rem', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(15,23,42,0.15)', transition: 'background 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0f172a'}
        >
          <BookOpen size={16} />
          <span>Access Knowledge Space</span>
        </button>
      </div>

      {/* MODULE LAYOUT SPLIT ROW */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        
        {/* WORKSPACE APP GRIDS */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Target Verification Ecosystems</h2>
            <button 
              onClick={() => setIsManageModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              <Settings2 size={14} />
              <span>Configure Environments</span>
            </button>
          </div>
          
          {applications.length === 0 ? (
            <div style={{ background: '#ffffff', textAlign: 'center', padding: '4rem', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
              <p style={{ color: '#64748b', fontWeight: 500 }}>No environment configurations found. Select the sidebar "+" node to deploy.</p>
            </div>
          ) : (
            <div className="dashboard-apps-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {applications.map(app => {
                const isActive = app.id === activeAppId;
                return (
                  <div 
                    key={app.id} 
                    className="app-card"
                    onClick={() => handleSelectApp(app.id)}
                    style={{ background: '#ffffff', border: isActive ? '2px solid #06b6d4' : '1px solid #e2e8f0', boxShadow: isActive ? '0 12px 20px -3px rgba(6,182,212,0.12)' : '0 4px 6px -1px rgba(0,0,0,0.02)', borderRadius: '20px', padding: '1.5rem', cursor: 'pointer', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>{app.name}</strong>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, background: app.platform === 'web' ? '#ecfeff' : '#f5f3ff', color: app.platform === 'web' ? '#0891b2' : '#7c3aed', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {app.platform}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.6', minHeight: '4.5em', margin: 0 }}>
                      {app.description || "Active cross-platform verification framework layout profile target assignment."}
                    </p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', pt: '1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                      <span>{getAppTestCount(app.id)} Active Blueprints</span>
                      <span>Pass Index: <strong style={{ color: '#0f172a', fontWeight: 700 }}>{getAppPassRate(app.id)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STREAMING RECENT ACTIVITY TIMELINE */}
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.25rem', letterSpacing: '-0.01em' }}>Telemetry Stream</h2>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {history.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>No automation logs stored.</p>
            ) : (
              history.slice(0, 4).map(run => (
                <div key={run.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{getAppName(run.appId)}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', background: run.status === 'passed' ? '#dcfce7' : '#fee2e2', color: run.status === 'passed' ? '#15803d' : '#b91c1c', padding: '2px 8px', borderRadius: '6px' }}>
                      {run.status}
                    </span>
                  </div>
                  {run.nlInstruction && (
                    <span style={{ fontSize: '0.75rem', color: '#334155', background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      "{run.nlInstruction}"
                    </span>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                    <span>{run.metrics?.stepsCount || 0} operations • {((run.metrics?.durationMs || 0) / 1000).toFixed(1)}s</span>
                    <span>{formatDate(run.executedAt)}</span>
                  </div>
                </div>
              ))
            )}
            <button 
              type="button" 
              onClick={() => setActiveTab('analytics')} 
              style={{ width: '100%', height: '38px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
            >
              <span>Explore Execution History</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* DYNAMIC CONFIGURATION OVERLAY MODAL */}
      {isManageModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', width: '580px', borderRadius: '24px', padding: '1.75rem', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Target Environment Infrastructure</h3>
              <button onClick={() => { setIsManageModalOpen(false); setEditingAppId(null); }} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
              {applications.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontWeight: 500, padding: '2rem' }}>No telemetry roots mapped.</p>
              ) : (
                applications.map(app => (
                  <div key={app.id} style={{ border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', background: '#f8fafc' }}>
                    {editingAppId === app.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <input 
                          type="text" 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}
                        />
                        <textarea 
                          rows={2}
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', resize: 'none', lineHeight: '1.5' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <button onClick={() => setEditingAppId(null)} style={{ padding: '6px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                          <button onClick={(e) => saveAppEdits(app, e)} style={{ padding: '6px 12px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}><Check size={14} /> Update</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ maxWidth: '82%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>{app.name}</strong>
                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{app.platform}</span>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.5rem', lineHeight: '1.5', margin: 0 }}>{app.description || "No environment specifics declared."}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={(e) => startEditing(app, e)} style={{ padding: '6px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', cursor: 'pointer' }}><PenSquare size={14} /></button>
                          <button onClick={(e) => handleDeleteAppClick(app.id, e)} style={{ padding: '6px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', color: '#e11d48', cursor: 'pointer' }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};