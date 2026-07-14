import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();
  const {
    applications,
    testCases,
    history,
    knowledgeAssets,
    activeAppId,
    setActiveAppId,
    updateApplication,
    deleteApplication
  } = useApp();

  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessReason, setAccessReason] = useState('');
  const [accessRequestedRole, setAccessRequestedRole] = useState<'qa_engineer' | 'developer'>('qa_engineer');
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessSuccess, setAccessSuccess] = useState('');
  const [myRequest, setMyRequest] = useState<any>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const authHeaders = { 'Content-Type': 'application/json' };

  // Only qa_reviewer and developer can request upgrades
  const canRequestUpgrade = user?.role === 'qa_reviewer' || user?.role === 'developer';

  useEffect(() => {
    if (user && canRequestUpgrade) {
      fetch(`${API_BASE}/auth/role-request/mine`, { headers: authHeaders, credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          if (data.length > 0) {
            const latest = data[0];
            // If approved but user already has that role (re-logged in), clear the banner
            if (latest.status === 'approved' && user.role === latest.requestedRole) {
              setMyRequest(null);
            } else {
              setMyRequest(latest);
            }
          }
        })
        .catch(() => {});
    } else {
      setMyRequest(null); // clear for admin/qa_engineer
    }
  }, [user?.role]);

  const handleSubmitAccessRequest = async () => {
    setAccessError('');
    if (accessReason.trim().length < 10) { setAccessError('Please provide a reason (at least 10 characters)'); return; }
    setAccessSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/role-request`, {
        method: 'POST', headers: authHeaders, credentials: 'include',
        body: JSON.stringify({ requestedRole: accessRequestedRole, reason: accessReason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit');
      setMyRequest({ status: 'pending', requestedRole: accessRequestedRole, reason: accessReason.trim() });
      setAccessSuccess('Request submitted! An admin will review it shortly.');
      setAccessReason('');
    } catch (e: any) {
      setAccessError(e.message);
    } finally {
      setAccessSubmitting(false);
    }
  };
  
  // ⚡ DYNAMIC CLIENT DERIVATIONS - ALWAYS 100% IN SYNC WITH CURRENT APP WORKSPACE
  const totalApps = applications.length;
  const totalTestCases = testCases.length;
  const aiGeneratedTests = testCases.filter(tc => tc.source === 'ai-jira' || tc.source === 'ai-acceptance').length;
  const manualAuthoredTests = testCases.filter(tc => tc.source === 'manual' || !tc.source).length;
  const totalKnowledgeAssets = knowledgeAssets?.length || 0;

  // Derive running jobs cleanly by inspecting active execution histories dynamically
  const runningJobs = history.filter(run => run.status === 'running').length;

  // Calculate the live success rating mathematically based on completed executions
  const overallPassRate = useMemo(() => {
    const completedRuns = history.filter(run => run.status === 'passed' || run.status === 'failed');
    if (completedRuns.length === 0) return 100; // Default baseline index
    const passedRuns = completedRuns.filter(run => run.status === 'passed').length;
    return Math.round((passedRuns / completedRuns.length) * 100);
  }, [history]);

  const [loading] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

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
    if (!isoString) return "N/A";
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

      {/* ROLE ACCESS BANNER — shown for all users, actionable for non-admins */}
      {user && (() => {
        const ROLE_META: Record<string, { icon: string; chipBg: string; label: string }> = {
          admin:        { icon: '👑', chipBg: '#fef3c7', label: 'Admin' },
          qa_engineer:  { icon: '🧪', chipBg: '#dbeafe', label: 'QA Engineer' },
          qa_reviewer:  { icon: '🔍', chipBg: 'rgba(255,255,255,0.15)', label: 'QA Reviewer' },
          developer:    { icon: '💻', chipBg: 'rgba(255,255,255,0.15)', label: 'Developer' },
        };
        const meta = ROLE_META[user.role] || { icon: '👤', chipBg: 'rgba(255,255,255,0.15)', label: user.role };
        const isNonAdmin = canRequestUpgrade; // only qa_reviewer and developer

        return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: isNonAdmin ? 'linear-gradient(135deg, #0f172a, #1e40af)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          border: isNonAdmin ? 'none' : '1px solid rgba(255,255,255,0.7)',
          borderRadius: '14px', padding: '0.9rem 1.4rem', marginBottom: '1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: meta.chipBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isNonAdmin ? '#fff' : '#0f172a' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: isNonAdmin ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                {isNonAdmin && myRequest?.status === 'pending' ? '⏳ Upgrade Pending Review' :
                 `Role: ${meta.label}`}
              </div>
            </div>
          </div>

          {isNonAdmin && (
            myRequest?.status === 'pending' ? (
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 14px', fontSize: '0.8rem', color: '#fde68a', fontWeight: 600 }}>
                Request under review
              </div>
            ) : (
              <button
                onClick={() => { setShowAccessModal(true); setAccessError(''); setAccessSuccess(''); }}
                style={{ background: '#fff', color: '#0f172a', border: 'none', borderRadius: '8px', padding: '7px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Request Higher Access →
              </button>
            )
          )}
        </div>
        );
      })()}

      {/* ACCESS REQUEST MODAL */}
      {showAccessModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '480px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Request Role Upgrade</h2>
              <button onClick={() => setShowAccessModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>

            {/* Role picker */}
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Which role are you requesting?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { role: 'qa_engineer' as const, icon: '🧪', label: 'QA Engineer', perks: ['AI test generation', 'Run executions', 'Knowledge base'] },
                { role: 'developer' as const, icon: '💻', label: 'Developer', perks: ['View test results', 'App-scoped access', 'Read-only insights'] },
              ].map(opt => (
                <div
                  key={opt.role}
                  onClick={() => setAccessRequestedRole(opt.role)}
                  style={{ border: `2px solid ${accessRequestedRole === opt.role ? '#1d4ed8' : '#e2e8f0'}`, borderRadius: '12px', padding: '1rem', cursor: 'pointer', background: accessRequestedRole === opt.role ? '#eff6ff' : '#fff', transition: 'all 0.15s' }}
                >
                  <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{opt.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.5rem' }}>{opt.label}</div>
                  {opt.perks.map(p => (
                    <div key={p} style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> {p}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Describe your use case
            </label>
            <textarea
              value={accessReason}
              onChange={e => setAccessReason(e.target.value)}
              placeholder={accessRequestedRole === 'qa_engineer' ? "e.g. I'm joining the QA team and need to run automated test suites..." : "e.g. I'm a developer who needs to monitor test results for my application..."}
              rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', marginBottom: '4px' }}
            />
            <div style={{ fontSize: '0.72rem', color: accessReason.length < 10 ? '#dc2626' : '#94a3b8', textAlign: 'right', marginBottom: '1rem' }}>
              {accessReason.length} / 10 min characters
            </div>

            {accessError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 14px', color: '#dc2626', fontSize: '0.82rem', marginBottom: '1rem' }}>{accessError}</div>}
            {accessSuccess && <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 14px', color: '#166534', fontSize: '0.82rem', marginBottom: '1rem' }}>{accessSuccess}</div>}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowAccessModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleSubmitAccessRequest}
                disabled={accessSubmitting || accessReason.trim().length < 10 || !!accessSuccess}
                style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: accessReason.trim().length < 10 || accessSuccess ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {accessSubmitting ? 'Submitting...' : accessSuccess ? 'Submitted ✓' : `Request ${accessRequestedRole === 'qa_engineer' ? 'QA Engineer' : 'Developer'} Access`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS TILES GLASS GRID - ROW 1 */}
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
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{totalTestCases}</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Total Test Suite Size</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '12px', borderRadius: '12px' }}><FileCheck size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{overallPassRate}%</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Average Success Rate</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#fffbeb', color: '#d97706', padding: '12px', borderRadius: '12px' }}><Activity size={24} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>{runningJobs}</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Running Agents</span>
          </div>
        </div>
      </div>

      {/* SUB GRID CARD METRICS ROW 2 */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '10px', borderRadius: '10px' }}><PenSquare size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{manualAuthoredTests}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Manual Authored</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#ecfeff', color: '#06b6d4', padding: '10px', borderRadius: '10px' }}><Bot size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{aiGeneratedTests}</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>AI Generated</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.7)', borderRadius: '20px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '10px', borderRadius: '10px' }}><BookOpen size={20} /></div>
          <div>
            <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{totalKnowledgeAssets}</span>
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

      {/* OPTIMIZED MASTER COLUMN LAYOUT SPLIT (62% Ecosystems vs 38% Telemetry Module) */}
      <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', gap: '2rem', alignItems: 'start' }}>
        
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {applications.map(app => {
                const isActive = app.id === activeAppId;
                return (
                  <div 
                    key={app.id} 
                    onClick={() => handleSelectApp(app.id)}
                    style={{ background: '#ffffff', border: isActive ? '2px solid #06b6d4' : '1px solid #e2e8f0', boxShadow: isActive ? '0 12px 20px -3px rgba(6,182,212,0.12)' : '0 4px 6px -1px rgba(0,0,0,0.02)', borderRadius: '20px', padding: '1.25rem', cursor: 'pointer', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>{app.name}</strong>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, background: app.platform === 'web' ? '#ecfeff' : '#f5f3ff', color: app.platform === 'web' ? '#0891b2' : '#7c3aed', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                        {app.platform}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5', minHeight: '4.5em', margin: '0 0 1rem 0' }}>
                      {app.description || "Active cross-platform verification framework layout profile target assignment."}
                    </p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                      <span>{getAppTestCount(app.id)} Active Blueprints</span>
                      <span>Pass Index: <strong style={{ color: '#0f172a', fontWeight: 700 }}>{getAppPassRate(app.id)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TELEMETRY STREAM PANEL */}
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.25rem', letterSpacing: '-0.01em' }}>Telemetry Stream</h2>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {history.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3.5rem 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>No automation logs stored.</p>
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

      {/* CONFIGURATION OVERLAY MODAL */}
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