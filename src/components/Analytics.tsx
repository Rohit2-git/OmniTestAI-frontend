import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Calendar, Clock, Activity, AlertTriangle, CheckCircle, Eye } from 'lucide-react';

export const Analytics: React.FC = () => {
  const { activeAppId, history } = useApp();
  const [selectedRun, setSelectedRun] = useState<any | null>(null);

  // Filter history for active app only
  const appHistory = history.filter(run => run.appId === activeAppId);

  const totalRuns = appHistory.length;
  const passedRuns = appHistory.filter(run => run.status === 'passed').length;
  const failedRuns = appHistory.filter(run => run.status === 'failed').length;
  const avgDurationMs = totalRuns > 0
    ? Math.round(appHistory.reduce((acc, run) => acc + (run.metrics?.durationMs || 0), 0) / totalRuns)
    : 0;

  const formatDate = (isoString: string) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '0.0s';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Chart: pass rate trend (last 6 runs, oldest to newest)
  const chartRuns = [...appHistory].reverse().slice(-6);
  const linePoints = chartRuns.map((run, idx) => {
    const x = 50 + idx * 60;
    const total = run.metrics?.stepsCount || 1;
    const passed = run.metrics?.passedCount || 0;
    const rate = Math.round((passed / total) * 100);
    const y = 150 - (rate / 100) * 110;
    return {
      x, y, rate,
      date: new Date(run.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    };
  });
  const polylinePoints = linePoints.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = linePoints.length > 0
    ? `50,150 ${polylinePoints} ${linePoints[linePoints.length - 1].x},150`
    : '';

  // Chart: duration bars (last 5 runs)
  const barRuns = [...appHistory].slice(0, 5).reverse();
  const maxDuration = Math.max(...barRuns.map(r => r.metrics?.durationMs || 0), 1000);
  const barPoints = barRuns.map((run, idx) => {
    const x = 60 + idx * 65;
    const dur = run.metrics?.durationMs || 0;
    const height = (dur / maxDuration) * 100;
    const y = 150 - height;
    return { x, y, height, label: formatDuration(dur) };
  });

  return (
    <div className="analytics-view">
      <div className="view-header">
        <h1>Metrics & Run History</h1>
        <p>Analyze test suite performance over time, examine pass rates, and review comprehensive visual reports for previous automation runs.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1.5rem' }}>
          <p>Please select an application to view analytics and execution log history.</p>
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Stats */}
          <div className="dashboard-grid" style={{ margin: 0 }}>
            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper purple"><Activity size={20} /></div>
              <div className="stats-meta">
                <span className="stats-value">{totalRuns}</span>
                <span className="stats-title">Total Runs Completed</span>
              </div>
            </div>
            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper green"><CheckCircle size={20} /></div>
              <div className="stats-meta">
                <span className="stats-value">{passedRuns}</span>
                <span className="stats-title">Passed Executions</span>
              </div>
            </div>
            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper warning"><AlertTriangle size={20} /></div>
              <div className="stats-meta">
                <span className="stats-value">{failedRuns}</span>
                <span className="stats-title">Failed Executions</span>
              </div>
            </div>
            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper cyan"><Clock size={20} /></div>
              <div className="stats-meta">
                <span className="stats-value">{formatDuration(avgDurationMs)}</span>
                <span className="stats-title">Average Duration</span>
              </div>
            </div>
          </div>

          {/* Charts */}
          {appHistory.length > 0 && (
            <div className="dashboard-grid" style={{ margin: 0 }}>
              <div className="glass-card col-6">
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>Pass Rate Trend</h3>
                <div className="svg-chart-container">
                  <svg width="400" height="180" viewBox="0 0 400 180">
                    <defs>
                      <linearGradient id="pass-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[40, 80, 120].map(y => (
                      <line key={y} x1="50" y1={y} x2="380" y2={y} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="4 4" />
                    ))}
                    {areaPoints && <polygon points={areaPoints} fill="url(#pass-grad)" />}
                    {linePoints.length > 1 && <polyline points={polylinePoints} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />}
                    {linePoints.map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r="5" fill={pt.rate === 100 ? '#10b981' : '#ef4444'} />
                        <text x={pt.x} y={pt.y - 12} fontSize="9" textAnchor="middle" fill="var(--text-main)" fontWeight="bold">{pt.rate}%</text>
                        <text x={pt.x} y="168" fontSize="8.5" textAnchor="middle" fill="var(--text-muted)">{pt.date}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              <div className="glass-card col-6">
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>Execution Duration</h3>
                <div className="svg-chart-container">
                  <svg width="400" height="180" viewBox="0 0 400 180">
                    <defs>
                      <linearGradient id="cyan-bar-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-cyan)" />
                        <stop offset="100%" stopColor="#00b0ff" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>
                    {[50, 100, 150].map(y => (
                      <line key={y} x1="50" y1={y} x2="350" y2={y} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="4 4" />
                    ))}
                    {barPoints.map((bar, i) => (
                      <g key={i}>
                        <rect x={bar.x - 14} y={bar.y} width="28" height={Math.max(bar.height, 4)} fill="url(#cyan-bar-grad)" rx="4" />
                        <text x={bar.x} y={bar.y - 8} fontSize="9" textAnchor="middle" fill="var(--text-main)" fontWeight="bold">{bar.label}</text>
                        <text x={bar.x} y="166" fontSize="8" textAnchor="middle" fill="var(--text-muted)">Run {i + 1}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* History Table */}
          <div className="glass-card">
            <h2>Execution Runs Archive</h2>
            {appHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <Calendar size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                <p>No executions have been logged for this application yet.</p>
              </div>
            ) : (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title / Mode</th>
                      <th>Date / Time</th>
                      <th>Steps</th>
                      <th>Duration</th>
                      <th>Result</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appHistory.map((run, idx) => (
                      <tr key={run.id} onClick={() => setSelectedRun(run)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 'bold' }}>#{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>
                          <div>{run.nlInstruction || 'Suite Run'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(run as any).mode || 'execution'}</div>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{formatDate(run.executedAt)}</td>
                        <td>
                          <strong style={{ color: 'var(--text-main)' }}>
                            {run.metrics?.passedCount}/{run.metrics?.stepsCount}
                          </strong> passed
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{formatDuration(run.metrics?.durationMs)}</td>
                        <td>
                          <span className={`badge ${run.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                            {run.status?.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <button type="button" className="btn btn-secondary btn-small"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.5rem' }}>
                            <Eye size={12} /><span>Logs</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Drawer */}
          {selectedRun && (
            <div className="test-details-drawer" style={{ width: '520px', boxShadow: '-8px 0 24px rgba(0,0,0,0.25)' }}>
              <div className="drawer-header">
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Run Report</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                    <span className={`badge ${selectedRun.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                      {selectedRun.status?.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(selectedRun.executedAt)}</span>
                  </div>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setSelectedRun(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.15)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Duration</span>
                    <strong>{formatDuration(selectedRun.metrics?.durationMs)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Steps</span>
                    <strong>{selectedRun.metrics?.passedCount} / {selectedRun.metrics?.stepsCount} Passed</strong>
                  </div>
                </div>

                <div className="drawer-meta-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span className="selector-label">Step Execution Traces</span>
                  <div className="console-container" style={{ flex: 1, maxHeight: '380px', overflowY: 'auto', background: '#020617', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {selectedRun.logs?.map((log: any, i: number) => (
                      <div key={i} style={{ marginBottom: '4px' }}>
                        <span style={{ color: log.type === 'success' ? '#10b981' : log.type === 'error' ? '#ef4444' : '#94a3b8', marginRight: '6px' }}>●</span>
                        <span style={{ color: '#64748b', marginRight: '6px' }}>[{log.timestamp}]</span>
                        <span style={{ color: '#cbd5e1' }}>{log.message}</span>
                      </div>
                    ))}
                    {(!selectedRun.logs || selectedRun.logs.length === 0) && (
                      <span style={{ color: '#475569' }}>No detailed logs available.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ background: 'var(--bg-panel)' }}>
                <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setSelectedRun(null)}>
                  Close Report
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};