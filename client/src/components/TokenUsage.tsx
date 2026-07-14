import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Coins, Zap, TrendingUp, RefreshCw, Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react';

const MODEL_DISPLAY: Record<string, { label: string; inputPrice: number; outputPrice: number; color: string }> = {
  "gemini-3-flash-preview":              { label: "Gemini 3 Flash Preview",        inputPrice: 0.50,  outputPrice: 3.00,  color: "#06b6d4" },
  "gemini-3.5-flash":                    { label: "Gemini 3.5 Flash",              inputPrice: 1.50,  outputPrice: 9.00,  color: "#0ea5e9" },
  "gemini-3.1-flash-lite":               { label: "Gemini 3.1 Flash Lite",         inputPrice: 0.25,  outputPrice: 1.50,  color: "#22d3ee" },
  "gemini-3.1-pro-preview":              { label: "Gemini 3.1 Pro Preview",        inputPrice: 2.00,  outputPrice: 12.00, color: "#a78bfa" },
  "gemini-3.1-flash-image":              { label: "Gemini 3.1 Flash Image",        inputPrice: 0.50,  outputPrice: 3.00,  color: "#34d399" },
  "gemini-2.5-pro":                      { label: "Gemini 2.5 Pro",                inputPrice: 1.25,  outputPrice: 10.00, color: "#f59e0b" },
  "gemini-2.5-flash":                    { label: "Gemini 2.5 Flash",              inputPrice: 0.30,  outputPrice: 2.50,  color: "#8b5cf6" },
  "gemini-2.5-flash-lite":               { label: "Gemini 2.5 Flash Lite",         inputPrice: 0.10,  outputPrice: 0.40,  color: "#10b981" },
  "gemini-2.5-flash-image":              { label: "Gemini 2.5 Flash Image",        inputPrice: 0.30,  outputPrice: 30.00, color: "#f472b6" },
  "gemini-robotics-er-1.6-preview":      { label: "Gemini Robotics ER 1.6",        inputPrice: 1.00,  outputPrice: 5.00,  color: "#fb923c" },
};

const fmt = (n: number) => n.toLocaleString();
const fmtCost = (n: number) => {
  if (n === 0) return '$0.000000';
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 0.01)  return `$${n.toFixed(5)}`;
  return `$${n.toFixed(4)}`;
};
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const typeLabel = (type: string) => {
  if (type === 'generation_pass1') return { text: 'Pass 1 · Blueprint', color: '#8b5cf6' };
  if (type === 'generation_pass2') return { text: 'Pass 2 · Expand',    color: '#06b6d4' };
  if (type === 'self_healing')     return { text: 'Self-Heal',           color: '#f59e0b' };
  if (type === 'execution_agent_step') return { text: 'Execution · Agent Step', color: '#22c55e' };
  return { text: type, color: '#94a3b8' };
};

export const TokenUsage: React.FC = () => {
  const { activeAppId, applications } = useApp();
  const [data, setData]                       = useState<any>(null);
  const [loading, setLoading]                 = useState(false);
  const [filterAll, setFilterAll]             = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [showRawLog, setShowRawLog]           = useState(false);
  const [clearing, setClearing]               = useState(false);
  const [showModelPanel, setShowModelPanel]   = useState(false);

  const activeApp = applications.find(a => a.id === activeAppId);
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const authHeaders = {
    'Content-Type': 'application/json',
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterAll || !activeAppId
        ? `${API_BASE}/api/token-usage`
        : `${API_BASE}/api/token-usage?app_id=${activeAppId}`;
      const res = await fetch(url, { headers: authHeaders, credentials: 'include' });
      if (!res.ok) { console.error('Token usage fetch failed:', res.status); return; }
      setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeAppId, filterAll]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClear = async () => {
    if (!confirm('Clear all token usage logs? This cannot be undone.')) return;
    setClearing(true);
    await fetch(`${API_BASE}/api/token-usage`, { method: 'DELETE', headers: authHeaders, credentials: 'include' });
    setClearing(false);
    fetchData();
  };

  const totals   = data?.totals   || { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0, call_count: 0 };
  const byBatch  = data?.by_batch || [];
  const entries  = data?.entries  || [];
  const byPhase  = data?.by_phase || { generation: { totals: {}, batches: [] }, execution: { totals: {}, batches: [] }, unknown: { totals: {}, batches: [] } };

  return (
    <div className="analytics-view">
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div className="view-header">
        <h1>Token Usage & Cost</h1>
        <p>Track Gemini API token consumption and estimated cost across generation and execution.</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <Info size={13} />
          {filterAll ? 'Showing all apps' : `Showing: ${activeApp?.name || 'current app'}`}
        </div>
        <button
          onClick={() => setFilterAll(p => !p)}
          style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: filterAll ? 'var(--accent-cyan)' : 'var(--bg-panel)', color: filterAll ? '#000' : 'var(--text-muted)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          {filterAll ? '✓ All Apps' : 'All Apps'}
        </button>
        <button onClick={fetchData} disabled={loading} style={{ padding: '6px 10px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <button onClick={handleClear} disabled={clearing} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, background: 'transparent', border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Trash2 size={13} /> Clear Log
        </button>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-grid" style={{ margin: '1.25rem 0 0 0' }}>
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper cyan"><Zap size={20} /></div>
          <div className="stats-meta">
            <span className="stats-value">{fmt(totals.total_tokens)}</span>
            <span className="stats-title">Total Tokens Used</span>
          </div>
        </div>
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper purple"><TrendingUp size={20} /></div>
          <div className="stats-meta">
            <span className="stats-value">{fmt(totals.input_tokens)}</span>
            <span className="stats-title">Input Tokens</span>
          </div>
        </div>
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper green"><TrendingUp size={20} /></div>
          <div className="stats-meta">
            <span className="stats-value">{fmt(totals.output_tokens)}</span>
            <span className="stats-title">Output Tokens</span>
          </div>
        </div>
        <div className="glass-card stats-card col-3">
          <div className="stats-icon-wrapper warning"><Coins size={20} /></div>
          <div className="stats-meta">
            <span className="stats-value" style={{ color: '#f59e0b' }}>{fmtCost(totals.cost_usd)}</span>
            <span className="stats-title">Estimated Cost (USD)</span>
          </div>
        </div>
      </div>

      {/* Active Model Bar + Model Panel Toggle */}
      {(() => {
        const activeKey = "gemini-3-flash-preview";
        const m = MODEL_DISPLAY[activeKey];
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.75rem 1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color, boxShadow: `0 0 6px ${m.color}` }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: m.color }}>{m.label}</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, background: `${m.color}22`, color: m.color, padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.04em' }}>ACTIVE</span>
              </div>
              <div style={{ display: 'flex', gap: '1.25rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Input: <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>${m.inputPrice}/1M</strong></span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Output: <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>${m.outputPrice}/1M</strong></span>
              </div>
            </div>
            <button
              onClick={() => setShowModelPanel(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '5px 13px', fontSize: '0.78rem', fontWeight: 600, background: showModelPanel ? 'var(--accent-cyan)' : 'var(--bg-main)', color: showModelPanel ? '#000' : 'var(--text-muted)', border: '1px solid var(--border-light)', borderRadius: '7px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <Info size={12} /> {showModelPanel ? 'Hide Models' : 'All Models & Pricing'}
            </button>
          </div>
        );
      })()}

      {/* Side Panel Layout — main content left, model panel right */}
      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1.25rem', alignItems: 'flex-start' }}>

        {/* Main content area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Generation vs Execution split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {([
          { key: 'generation', label: 'Generation', color: '#8b5cf6', icon: '⚙️' },
          { key: 'execution',  label: 'Execution',   color: '#22c55e', icon: '▶️' },
        ] as const).map(({ key, label, color, icon }) => {
          const phaseData = byPhase[key] || { totals: {}, batches: [] };
          const t = phaseData.totals || {};
          const batches = phaseData.batches || [];
          return (
            <div key={key} className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <h3 style={{ margin: 0, color }}>{label}</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Tokens</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem' }}>{fmt(t.total_tokens || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. Cost</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f59e0b' }}>{fmtCost(t.cost_usd || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Input</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#8b5cf6' }}>{fmt(t.input_tokens || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Output</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#06b6d4' }}>{fmt(t.output_tokens || 0)}</div>
                </div>
              </div>
              {batches.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No {label.toLowerCase()} usage recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {batches.map((b: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '4px 0', borderBottom: i < batches.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={b.batch_label}>
                        {b.batch_label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(b.total_tokens)} <span style={{ color: '#f59e0b' }}>· {fmtCost(b.cost_usd)}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* By Batch Table */}
      <div className="glass-card" style={{ marginTop: '1.25rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Usage by Batch</h2>
        {byBatch.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Zap size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p>No token usage recorded yet. Generate some test cases to see data here.</p>
          </div>
        ) : (
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Batch / Source File</th>
                  <th>Time</th>
                  <th>API Calls</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Total Tokens</th>
                  <th>Est. Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byBatch.map((batch: any, idx: number) => {
                  const isExpanded  = expandedBatches[batch.batch_label];
                  const batchEntries = entries.filter((e: any) => (e.batch_label || 'Unknown') === batch.batch_label);
                  return (
                    <React.Fragment key={idx}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedBatches(p => ({ ...p, [batch.batch_label]: !p[batch.batch_label] }))}>
                        <td style={{ fontWeight: 600 }}>{batch.batch_label}</td>
                        <td style={{ fontSize: '0.8rem' }}>{fmtDate(batch.timestamp)}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{batch.call_count}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#8b5cf6' }}>{fmt(batch.input_tokens)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#06b6d4' }}>{fmt(batch.output_tokens)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(batch.total_tokens)}</td>
                        <td><span style={{ fontWeight: 700, color: '#f59e0b' }}>{fmtCost(batch.cost_usd)}</span></td>
                        <td>{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                      </tr>
                      {isExpanded && batchEntries.map((e: any, i: number) => {
                        const tl = typeLabel(e.type);
                        return (
                          <tr key={i} style={{ background: 'rgba(0,0,0,0.18)', fontSize: '0.8rem' }}>
                            <td style={{ paddingLeft: '2rem', color: 'var(--text-muted)' }}>{e.test_title || '—'}</td>
                            <td style={{ fontSize: '0.75rem' }}>{fmtDate(e.timestamp)}</td>
                            <td><span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '4px', background: `${tl.color}22`, color: tl.color, fontWeight: 700 }}>{tl.text}</span></td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: '#8b5cf680' }}>{fmt(e.input_tokens)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: '#06b6d480' }}>{fmt(e.output_tokens)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{fmt(e.total_tokens)}</td>
                            <td style={{ color: '#f59e0b80' }}>{fmtCost(e.cost_usd)}</td>
                            <td></td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {byBatch.length > 1 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-light)' }}>
                    <td colSpan={2} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>TOTAL</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{totals.call_count}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#8b5cf6' }}>{fmt(totals.input_tokens)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#06b6d4' }}>{fmt(totals.output_tokens)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{fmt(totals.total_tokens)}</td>
                    <td style={{ color: '#f59e0b', fontWeight: 800 }}>{fmtCost(totals.cost_usd)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Raw Log */}
      {entries.length > 0 && (
        <div className="glass-card" style={{ marginTop: '1.25rem' }}>
          <button
            onClick={() => setShowRawLog(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem' }}
          >
            {showRawLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Raw API Call Log ({entries.length} entries)
          </button>
          {showRawLog && (
            <div style={{ marginTop: '0.75rem', background: '#020617', borderRadius: '8px', padding: '1rem', maxHeight: '280px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {entries.map((e: any, i: number) => {
                const tl = typeLabel(e.type);
                return (
                  <div key={i} style={{ marginBottom: '5px', display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                    <span style={{ color: '#475569', minWidth: '130px' }}>{fmtDate(e.timestamp)}</span>
                    <span style={{ color: tl.color, minWidth: '145px' }}>{tl.text}</span>
                    <span style={{ color: '#94a3b8', minWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.test_title || e.batch_label || '—'}</span>
                    <span style={{ color: '#8b5cf6' }}>in:{fmt(e.input_tokens)}</span>
                    <span style={{ color: '#06b6d4' }}>out:{fmt(e.output_tokens)}</span>
                    <span style={{ color: '#f59e0b' }}>{fmtCost(e.cost_usd)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </div>

        {/* Model Pricing Side Panel — RIGHT */}
        {showModelPanel && (
          <div style={{ width: '280px', flexShrink: 0, borderRadius: '14px', overflow: 'hidden', position: 'sticky', top: '1rem', border: '1px solid var(--border-light)', background: 'var(--bg-panel)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            {/* Header */}
            <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Model Pricing</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Standard tier · per 1M tokens</span>
            </div>
            {/* Model list */}
            <div style={{ overflowY: 'auto', maxHeight: '520px', padding: '0.5rem' }}>
              {Object.entries(MODEL_DISPLAY).map(([key, m]) => {
                const isActive = key === 'gemini-3-flash-preview';
                return (
                  <div key={key} style={{ marginBottom: '0.4rem', borderRadius: '10px', border: `1px solid ${isActive ? m.color + '55' : 'var(--border-light)'}`, background: isActive ? `${m.color}0e` : 'var(--bg-main)', padding: '0.65rem 0.85rem', transition: 'all 0.15s' }}>
                    {/* Model name row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: m.color, boxShadow: isActive ? `0 0 6px ${m.color}` : 'none', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: m.color, flex: 1 }}>{m.label}</span>
                      {isActive && (
                        <span style={{ fontSize: '0.58rem', fontWeight: 800, background: m.color, color: '#fff', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.04em' }}>IN USE</span>
                      )}
                    </div>
                    {/* Pricing row */}
                    <div style={{ display: 'flex', gap: '0.75rem', paddingLeft: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Input</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>${m.inputPrice}<span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 400 }}>/1M</span></span>
                      </div>
                      <div style={{ width: '1px', background: 'var(--border-light)', alignSelf: 'stretch' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Output</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>${m.outputPrice}<span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 400 }}>/1M</span></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};