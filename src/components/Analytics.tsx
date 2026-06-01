import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { ExecutionRun } from '../types';
import { 
  X, 
  Calendar, 
  Clock, 
  Activity, 
  AlertTriangle, 
  CheckCircle,
  Eye,
  AlertCircle
} from 'lucide-react';

export const Analytics: React.FC = () => {
  const { history, activeAppId } = useApp();
  const [selectedRun, setSelectedRun] = useState<ExecutionRun | null>(null);

  // Filter history by active app
  const appHistory = history.filter(run => run.appId === activeAppId);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Helper stats for selected application
  const totalRuns = appHistory.length;
  const passedRuns = appHistory.filter(run => run.status === 'passed');
  const failedRuns = appHistory.filter(run => run.status === 'failed');

  
  const avgDurationMs = totalRuns > 0 
    ? Math.round(appHistory.reduce((acc, run) => acc + run.metrics.durationMs, 0) / totalRuns) 
    : 0;

  // Chart 1 data: Pass Rate trend (last 6 runs in order of execution - oldest to newest)
  const chartRuns = [...appHistory].reverse().slice(-6);
  const linePoints = chartRuns.map((run, idx) => {
    const x = 50 + idx * 60;
    // Map pass rate (0 - 100%) to y (150 - 30)
    // Formula: 150 - (rate / 100) * 120
    const rate = run.status === 'passed' ? 100 : (run.metrics.passedCount / (run.metrics.stepsCount || 1)) * 100;
    const y = 150 - (rate / 100) * 110;
    return { x, y, rate: Math.round(rate), date: new Date(run.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  });

  const polylinePoints = linePoints.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = linePoints.length > 0 
    ? `50,150 ${polylinePoints} ${linePoints[linePoints.length - 1].x},150` 
    : '';

  // Chart 2 data: Execution Duration Bar (last 5 runs)
  const barRuns = [...appHistory].slice(0, 5).reverse();
  const maxDuration = Math.max(...barRuns.map(r => r.metrics.durationMs), 1000);
  const barPoints = barRuns.map((run, idx) => {
    const x = 60 + idx * 65;
    // Map duration (0 - maxDuration) to height (0 - 110)
    const height = (run.metrics.durationMs / maxDuration) * 100;
    const y = 150 - height;
    return { x, y, height, label: `${(run.metrics.durationMs / 1000).toFixed(1)}s`, date: new Date(run.executedAt).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' }) };
  });

  return (
    <div className="analytics-view">
      <div className="view-header">
        <h1>Metrics & Run History</h1>
        <p>Analyze test suites performance over time, examine pass rates, and review comprehensive visual reports for previous automation runs.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1.5rem' }}>
          <p>Please select an application to view analytics and execution log history.</p>
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Top summary row */}
          <div className="dashboard-grid" style={{ margin: 0 }}>
            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper purple">
                <Activity size={20} />
              </div>
              <div className="stats-meta">
                <span className="stats-value">{totalRuns}</span>
                <span className="stats-title">Total Runs Completed</span>
              </div>
            </div>

            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper green">
                <CheckCircle size={20} />
              </div>
              <div className="stats-meta">
                <span className="stats-value">{passedRuns.length}</span>
                <span className="stats-title">Passed Executions</span>
              </div>
            </div>

            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper warning">
                <AlertTriangle size={20} />
              </div>
              <div className="stats-meta">
                <span className="stats-value">{failedRuns.length}</span>
                <span className="stats-title">Failed Executions</span>
              </div>
            </div>

            <div className="glass-card stats-card col-3">
              <div className="stats-icon-wrapper cyan">
                <Clock size={20} />
              </div>
              <div className="stats-meta">
                <span className="stats-value">{(avgDurationMs / 1000).toFixed(1)}s</span>
                <span className="stats-title">Average Duration</span>
              </div>
            </div>
          </div>

          {/* SVG Charts Panels */}
          {totalRuns > 0 && (
            <div className="chart-panel-grid">
              
              {/* Pass Rate Area Chart */}
              <div className="glass-card">
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Pass Rate Trend</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>(Last 6 runs)</span>
                </h3>
                
                <div className="svg-chart-container">
                  <svg width="400" height="180" viewBox="0 0 400 180">
                    <defs>
                      <linearGradient id="purple-glow-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-purple)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="var(--accent-purple)" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    <line x1="50" y1="40" x2="350" y2="40" className="svg-grid-line" />
                    <line x1="50" y1="95" x2="350" y2="95" className="svg-grid-line" />
                    <line x1="50" y1="150" x2="350" y2="150" className="svg-grid-line" />

                    {/* Y Axis labels */}
                    <text x="15" y="44" className="svg-chart-axis">100%</text>
                    <text x="22" y="99" className="svg-chart-axis">50%</text>
                    <text x="28" y="154" className="svg-chart-axis">0%</text>

                    {/* Area under the line */}
                    {areaPoints && (
                      <polygon points={areaPoints} fill="url(#purple-glow-grad)" />
                    )}

                    {/* Line path */}
                    {polylinePoints && (
                      <polyline
                        fill="none"
                        stroke="var(--accent-purple)"
                        strokeWidth="3"
                        points={polylinePoints}
                      />
                    )}

                    {/* Circles & labels for points */}
                    {linePoints.map((pt, i) => (
                      <g key={i}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="5"
                          className="svg-tooltip-marker"
                          style={{ fill: pt.rate === 100 ? 'var(--color-success)' : 'var(--color-error)' }}
                        />
                        <text x={pt.x} y={pt.y - 12} fontSize="9" textAnchor="middle" fill="var(--text-main)" fontWeight="bold">
                          {pt.rate}%
                        </text>
                        <text x={pt.x} y="168" fontSize="8.5" textAnchor="middle" fill="var(--text-muted)">
                          {pt.date}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Duration Bar Chart */}
              <div className="glass-card">
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Execution Duration</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>(Recent runs)</span>
                </h3>

                <div className="svg-chart-container">
                  <svg width="400" height="180" viewBox="0 0 400 180">
                    <defs>
                      <linearGradient id="cyan-bar-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-cyan)" />
                        <stop offset="100%" stopColor="#00b0ff" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    <line x1="50" y1="50" x2="350" y2="50" className="svg-grid-line" />
                    <line x1="50" y1="100" x2="350" y2="100" className="svg-grid-line" />
                    <line x1="50" y1="150" x2="350" y2="150" className="svg-grid-line" />

                    {/* Bars */}
                    {barPoints.map((bar, i) => (
                      <g key={i}>
                        <rect
                          x={bar.x - 14}
                          y={bar.y}
                          width="28"
                          height={bar.height}
                          fill="url(#cyan-bar-grad)"
                          rx="4"
                        />
                        <text x={bar.x} y={bar.y - 8} fontSize="9" textAnchor="middle" fill="var(--text-main)" fontWeight="bold">
                          {bar.label}
                        </text>
                        <text x={bar.x} y="166" fontSize="8" textAnchor="middle" fill="var(--text-muted)">
                          Run {i+1}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

            </div>
          )}

          {/* Runs history table */}
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
                      <th>Execution ID</th>
                      <th>Method / Description</th>
                      <th>Date / Time</th>
                      <th>Steps Verified</th>
                      <th>Duration</th>
                      <th>Result</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appHistory.map(run => {
                      const desc = run.nlInstruction 
                        ? `Ad-hoc NL: "${run.nlInstruction}"` 
                        : `${run.testCaseIds.length} suite cases`;
                      return (
                        <tr key={run.id} onClick={() => setSelectedRun(run)}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{run.id}</td>
                          <td style={{ fontWeight: 500 }} className="environment-url">{desc}</td>
                          <td style={{ fontSize: '0.85rem' }}>{formatDate(run.executedAt)}</td>
                          <td>
                            <strong style={{ color: 'var(--text-main)' }}>
                              {run.metrics.passedCount}/{run.metrics.stepsCount}
                            </strong> passed
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{(run.metrics.durationMs / 1000).toFixed(1)}s</td>
                          <td>
                            <span className={`badge ${run.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                              {run.status}
                            </span>
                          </td>
                          <td>
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-small"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.5rem' }}
                            >
                              <Eye size={12} />
                              <span>Logs</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Run Detail drawer */}
          {selectedRun && (
            <div className="test-details-drawer" style={{ width: '520px' }}>
              <div className="drawer-header">
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Run Report: {selectedRun.id}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                    <span className={`badge ${selectedRun.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                      {selectedRun.status.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(selectedRun.executedAt)}</span>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="modal-close-btn" 
                  onClick={() => setSelectedRun(null)}
                  aria-label="Close run detail"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="drawer-body">
                {/* Stats indicators */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Duration</span>
                    <strong style={{ fontSize: '1rem' }}>{(selectedRun.metrics.durationMs / 1000).toFixed(2)} seconds</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assertions Verified</span>
                    <strong style={{ fontSize: '1rem' }}>{selectedRun.metrics.passedCount} / {selectedRun.metrics.stepsCount} passed</strong>
                  </div>
                </div>

                {/* Simulated screenshot if failed */}
                {selectedRun.screenshots && selectedRun.screenshots.length > 0 && (
                  <div className="drawer-meta-section">
                    <span className="selector-label">Failure Screenshot Capture</span>
                    <div 
                      style={{ 
                        border: '1px solid var(--color-error)', 
                        background: '#121218', 
                        borderRadius: '6px', 
                        padding: '1rem',
                        position: 'relative',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-error)', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <AlertCircle size={16} />
                        <span>ASSERTION FAIL: Visual state mismatch detected</span>
                      </div>
                      
                      {/* Drawing a miniature mockup box inside log details drawer */}
                      <div style={{ border: '1px solid var(--border-light)', background: '#f8fafc', height: '140px', borderRadius: '4px', position: 'relative', display: 'flex', flexDirection: 'column', color: '#1e293b' }}>
                        <div style={{ background: '#e2e8f0', padding: '4px 8px', fontSize: '0.55rem', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1' }}>
                          <strong>SWIFTCART CHECKOUT</strong>
                          <span>$100.00</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', padding: '10px' }}>
                          <div style={{ padding: '8px', border: '2px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
                            Coupon SAVE15 failed. Total is $100.00 (expected $85.00)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Console Log records */}
                <div className="drawer-meta-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span className="selector-label">Complete Console Outputs</span>
                  <div className="console-container" style={{ flex: 1, maxHeight: '350px', overflowY: 'auto', background: '#07070d' }}>
                    {selectedRun.logs.map((log, idx) => (
                      <div key={idx} className="console-log-line">
                        <span className="console-timestamp">[{log.timestamp}]</span>
                        <span className={`console-type-${log.type}`}>{log.type.toUpperCase()}:</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ background: 'var(--bg-panel)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: '100%' }}
                  onClick={() => setSelectedRun(null)}
                >
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
