import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Play, Command, ListTodo, Trash2, CheckCircle2, 
  XCircle, Image as ImageIcon, Terminal as TerminalIcon, Maximize2, Loader2, Layers
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

interface ExecutorProps {
  selectedTestIdsForRun: string[];
  clearSelectedTests: () => void;
  addToQueue?: (ids: string[]) => void;
}


// RESULTS_KEY is app-scoped — defined inside component

const SlideshowPanel: React.FC<{ screenshots: any[]; isHeadfulOnly?: boolean; videoBase64?: string }> = ({
  screenshots, isHeadfulOnly = false, videoBase64
}) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const total = screenshots.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.08em' }}>▣ VISUAL_CHRONOLOGY SLIDESHOW</span>
      </div>

      {isHeadfulOnly || total === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No checkpoints captured. (Interactive display targets execute completely live inside the headful desktop window frame).</p>
      ) : (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '16/9', marginBottom: '0.75rem' }}>
            <img
              src={`data:image/png;base64,${screenshots[slideIdx]?.image_base64}`}
              alt={`Step ${screenshots[slideIdx]?.step_number}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {slideIdx > 0 && (
              <button onClick={() => setSlideIdx(i => i - 1)}
                style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ‹
              </button>
            )}
            {slideIdx < total - 1 && (
              <button onClick={() => setSlideIdx(i => i + 1)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ›
              </button>
            )}
            <div style={{ position: 'absolute', bottom: '8px', right: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              {slideIdx + 1} / {total}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
              Step {screenshots[slideIdx]?.step_number}: {screenshots[slideIdx]?.step}
            </span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
              background: screenshots[slideIdx]?.status === 'passed' ? '#dcfce7' : '#fee2e2',
              color: screenshots[slideIdx]?.status === 'passed' ? '#16a34a' : '#dc2626'
            }}>
              {screenshots[slideIdx]?.status?.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {screenshots.map((s: any, i: number) => (
              <div key={i} onClick={() => setSlideIdx(i)}
                style={{ flexShrink: 0, width: '64px', height: '42px', borderRadius: '5px', overflow: 'hidden', cursor: 'pointer', border: i === slideIdx ? '2px solid #0891b2' : '2px solid transparent', opacity: i === slideIdx ? 1 : 0.6, transition: 'all 0.15s' }}>
                <img src={`data:image/png;base64,${s.image_base64}`} alt={`Step ${s.step_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {videoBase64 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>▶ SESSION RECORDING</span>
          </div>
          <video controls style={{ width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#000', maxHeight: '400px' }}
            src={`data:video/webm;base64,${videoBase64}`} />
        </div>
      )}
    </div>
  );
};

// Extracted as proper React component — SlideshowPanel inside uses useState hooks
// which cannot be called from a plain render function inside another component
const TestCard: React.FC<{
  tc: any; result: any; isExpanded: boolean; isRunning: boolean; isProcessing: boolean;
  onExpand: () => void; onRun: (tc: any) => void; onRemove: (e: React.MouseEvent, id: string) => void;
  renderStepTrace: (steps: any[]) => React.ReactNode;
}> = ({ tc, result, isExpanded, isRunning, isProcessing, onExpand, onRun, onRemove, renderStepTrace }) => {
  const isHeadfulOnly = result?.mode === 'headful_single' || (!result?.screenshots?.length && result?.mode !== 'headless_suite');
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: isExpanded ? '#f8fafc' : '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, cursor: 'pointer' }} onClick={onExpand}>
          {isRunning ? <Loader2 className="animate-spin" size={22} color="#6366f1" /> :
            result ? (result.passed ? <CheckCircle2 color="#10b981" size={22} /> : <XCircle color="#ef4444" size={22} />) :
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #e2e8f0' }} />}
          <div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>{tc.title}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
              {tc.steps.length} Actions •{' '}
              {result ? (result.passed ? '✓ Passed' : '✗ Failed') : 'Pending'} •{' '}
              <span style={{
                background: tc.priority === 'high' ? '#fee2e2' : tc.priority === 'medium' ? '#fef3c7' : '#dcfce7',
                color: tc.priority === 'high' ? '#dc2626' : tc.priority === 'medium' ? '#d97706' : '#16a34a',
                fontWeight: 700, fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>{(tc.priority || 'high').toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={(e) => { e.stopPropagation(); onRun(tc); }} disabled={isProcessing}
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Play size={16} style={{ color: '#0f172a' }} />
          </button>
          <button onClick={(e) => onRemove(e, tc.id)}
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={16} style={{ color: '#ef4444' }} />
          </button>
        </div>
      </div>
      {isExpanded && result && (
        <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
          {renderStepTrace(result.step_results || [])}
          <SlideshowPanel screenshots={result.screenshots || []} isHeadfulOnly={isHeadfulOnly} videoBase64={result.video_base64} />
        </div>
      )}
    </div>
  );
};

export const Executor: React.FC<ExecutorProps> = ({ selectedTestIdsForRun, clearSelectedTests }) => {
  const { applications, testCases, activeAppId, addExecutionRun } = useApp();
  const [nlCommand, setNlCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (section: string) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const stagedKey = `omnitest_staged_ids_${activeAppId || 'default'}`;
  const [stagedIds, setStagedIds] = useState<string[]>(() => {
    const key = `omnitest_staged_ids_${activeAppId || 'default'}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });

  // Reload app-scoped staged queue and results when active app changes
  useEffect(() => {
    const savedStaged = localStorage.getItem(stagedKey);
    setStagedIds(savedStaged ? JSON.parse(savedStaged) : []);
    const savedResults = sessionStorage.getItem(`omnitest_exec_results_${activeAppId || 'default'}`);
    setTestResults(savedResults ? JSON.parse(savedResults) : {});
    setExpandedId(null);
  }, [activeAppId]);

  const resultsKey = `omnitest_exec_results_${activeAppId || 'default'}`;
  const [testResults, setTestResults] = useState<Record<string, any>>(() => {
    const key = `omnitest_exec_results_${activeAppId || 'default'}`;
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : {};
  });

  const activeApp = applications.find(app => app.id === activeAppId);

  useEffect(() => {
    if (selectedTestIdsForRun.length > 0) {
      setStagedIds(prev => {
        const merged = [...prev];
        selectedTestIdsForRun.forEach(id => {
          if (!merged.includes(id)) merged.push(id);
        });
        return merged;
      });
    }
  }, [selectedTestIdsForRun]);

  useEffect(() => { localStorage.setItem(stagedKey, JSON.stringify(stagedIds)); }, [stagedIds, stagedKey]);

  // Strip base64 screenshots before saving to sessionStorage — they're too large and crash storage
  useEffect(() => {
    try {
      const stripped = Object.fromEntries(
        Object.entries(testResults).map(([k, v]: [string, any]) => [
          k,
          { ...v, screenshots: [], video_base64: undefined }
        ])
      );
      sessionStorage.setItem(resultsKey, JSON.stringify(stripped));
    } catch {
      // If still too large, skip persisting results
    }
  }, [testResults, resultsKey]);

  const stagedTests = stagedIds
    .map(id => testCases.find(tc => tc.id === id))
    .filter(Boolean)
    .filter((tc: any) => tc.appId === activeAppId) as any[];

  const groupedTests = stagedTests.reduce((acc: Record<string, any[]>, tc) => {
    const section = tc.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(tc);
    return acc;
  }, {});

  // Helper to save execution run to AppContext history
  const saveToHistory = (data: any, mode: string, testCaseIds: string[], nlInstruction?: string, startTime?: number) => {
    if (!activeAppId) return;
    const durationMs = startTime ? Date.now() - startTime : 0;
    const stepResults = data.step_results || data.results?.flatMap((r: any) => r.step_results || []) || [];
    const passedCount = stepResults.filter((s: any) => s.status === 'passed').length;
    const stepsCount = stepResults.length;
    const status = data.passed || data.overall_status === 'PASSED' || (data.summary && data.summary.failed === 0 && data.summary.passed > 0) ? 'passed' : 'failed';

    const logs = stepResults.map((s: any) => ({
      timestamp: new Date().toTimeString().split(' ')[0],
      type: s.status === 'passed' ? 'success' : 'error',
      message: `[${s.step_number || '?'}] ${s.step}${s.detail ? ` — ${s.detail}` : ''}`
    }));

    addExecutionRun({
      id: `run-${Date.now()}`,
      appId: activeAppId,
      testCaseIds,
      status,
      nlInstruction,
      logs,
      screenshots: [],
      metrics: { durationMs, stepsCount, passedCount },
      executedAt: new Date().toISOString(),
      mode
    } as any);
  };

  const handleClearAll = () => {
    setTestResults({});
    setExpandedId(null);
    setStagedIds([]);
    sessionStorage.removeItem(resultsKey);
    localStorage.removeItem(stagedKey);
    clearSelectedTests();
  };

  const handleRemoveSingle = (e: React.MouseEvent, tcId: string) => {
    e.stopPropagation();
    setStagedIds(prev => prev.filter(id => id !== tcId));
  };

  const handleSingleExecution = async (tc: any) => {
    if (!activeApp?.url) return;
    setIsProcessing(true);
    setProcessingId(tc.id);
    setExpandedId(tc.id);
    const startTime = Date.now();
    try {
      const steps = tc.steps.map((s: any) => s.instruction || s);
      const res = await fetch(`${API_BASE}/execute/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: activeApp.url, steps, title: tc.title, expected_result: tc.steps[tc.steps.length - 1]?.expected || '' })
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [tc.title]: data }));
      saveToHistory(data, 'headful_single', [tc.id], tc.title, startTime);
    } catch (err) {
      console.error('Single execution error:', err);
    } finally {
      setIsProcessing(false);
      setProcessingId(null);
    }
  };

  const handleBulkExecution = async () => {
    if (!activeApp?.url || stagedTests.length === 0) return;
    setIsProcessing(true);
    const startTime = Date.now();
    try {
      const testCasesPayload = stagedTests.map(tc => ({
        title: tc.title,
        steps: tc.steps.map((s: any) => s.instruction || s),
        expected_result: tc.steps[tc.steps.length - 1]?.expected || '',
        type: tc.source || 'functional'
      }));
      const res = await fetch(`${API_BASE}/execute/suite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: activeApp.url, test_cases: testCasesPayload })
      });
      const data = await res.json();
      const resultMap: Record<string, any> = {};
      if (data?.results) {
        data.results.forEach((r: any) => { resultMap[r.title] = r; });
      }
      setTestResults(prev => ({ ...prev, ...resultMap }));
      saveToHistory(data, 'headless_suite', stagedTests.map(tc => tc.id), undefined, startTime);
    } catch (err) {
      console.error('Suite execution error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNLExecution = async () => {
    if (!nlCommand.trim() || !activeApp?.url) return;
    setIsProcessing(true);
    const startTime = Date.now();
    try {
      const steps = nlCommand.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/execute/nl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: activeApp.url, steps })
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, ['NL Ad-hoc Script Engine Trace']: data }));
      setExpandedId('nl-adhoc-card');
      saveToHistory(data, 'headful_nl', [], nlCommand, startTime);
    } catch (err) {
      console.error('NL execution error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStepTrace = (stepResults: any[]) => (
    <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
      <div style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '0.05em' }}>
        <TerminalIcon size={14} /> ORCHESTRATION_TRACE_STREAM
      </div>
      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
        {stepResults?.map((st: any, i: number) => (
          <div key={i} style={{ color: '#cbd5e1', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '6px', lineHeight: '1.4' }}>
            <span style={{ color: st.status === 'passed' ? '#10b981' : '#ef4444', marginRight: '8px' }}>●</span>
            <span style={{ color: '#475569', marginRight: '8px' }}>[{st.step_number ?? i + 1}]</span>
            {st.step}
            {st.status === 'failed' && <span style={{ color: '#fca5a5', fontStyle: 'italic' }}> ({st.detail})</span>}
          </div>
        ))}
      </div>
    </div>
  );



  return (
    <div className="dashboard-view">
      <div className="view-header" style={{ marginBottom: '2rem' }}>
        <h1>Execution Lab Space</h1>
        <p>Execute individual test cases in an interactive browser session or run full suites in headless mode with automated step-by-step screenshot capture.</p>
      </div>

      {/* NL CONTROLLER */}
      <div className="glass-card" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Command size={18} color="#0891b2" />
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>NL Execution Controller</span>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '1rem' }}>Enter plain-English test instructions, one per line or separated by semicolons. Executes in an interactive browser session with screenshot capture.</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <textarea className="input-field" value={nlCommand} onChange={(e) => setNlCommand(e.target.value)}
            placeholder={"Navigate to the login page\nEnter valid email and password\nClick the login button"}
            rows={3} style={{ flex: 1, padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b', background: '#f8fafc', fontWeight: 400 }} />
          <button onClick={handleNLExecution} disabled={isProcessing || !nlCommand.trim()}
            style={{ borderRadius: '8px', padding: '8px 20px', background: '#06b6d4', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', border: 'none', cursor: 'pointer', alignSelf: 'center', fontSize: '0.85rem' }}>
            {isProcessing && !processingId ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* QUEUE */}
      <div className="glass-card" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListTodo size={18} color="#6366f1" />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Staged Suite Queue ({stagedTests.length})
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleClearAll} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Clear All</button>
            <button onClick={handleBulkExecution} disabled={isProcessing || stagedTests.length === 0}
              style={{ background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 20px', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              {isProcessing && !processingId ? <Loader2 className="animate-spin" size={16} /> : null}
              Run Suite
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* NL Result */}
          {testResults['NL Ad-hoc Script Engine Trace'] && (
            <div style={{ border: '1px solid #06b6d4', borderRadius: '12px', background: '#f0fdfa', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === 'nl-adhoc-card' ? null : 'nl-adhoc-card')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  {testResults['NL Ad-hoc Script Engine Trace'].overall_status === 'PASSED' || testResults['NL Ad-hoc Script Engine Trace'].passed
                    ? <CheckCircle2 color="#10b981" size={22} /> : <XCircle color="#ef4444" size={22} />}
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>NL Ad-hoc Script Engine Trace</div>
                    <div style={{ fontSize: '0.8rem', color: '#0891b2', fontWeight: 600 }}>Autonomous Step Execution — Headful (Live)</div>
                  </div>
                </div>
              </div>
              {expandedId === 'nl-adhoc-card' && (
                <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                  {renderStepTrace(testResults['NL Ad-hoc Script Engine Trace'].step_results || [])}
                  {<SlideshowPanel screenshots={testResults['NL Ad-hoc Script Engine Trace'].screenshots || []} videoBase64={testResults['NL Ad-hoc Script Engine Trace'].video_base64} />}
                </div>
              )}
            </div>
          )}

          {/* Grouped test cases */}
          {stagedTests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
              <Layers size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
              <p style={{ fontWeight: 500 }}>No scenarios staged. Select items from Test Cases to begin.</p>
            </div>
          ) : (
            Object.entries(groupedTests).map(([section, tests]) => (
              <div key={section}>
                <div
                  onClick={() => toggleSection(section)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                  <Layers size={14} color="#6366f1" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{section}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, marginRight: '0.5rem' }}>({tests.length})</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', transition: 'transform 0.2s', display: 'inline-block', transform: expandedSections[section] === false ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                </div>
                {expandedSections[section] !== false && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {(tests as any[]).map(tc => (
                    <TestCard
                      key={tc.id}
                      tc={tc}
                      result={testResults[tc.title]}
                      isExpanded={expandedId === tc.id}
                      isRunning={processingId === tc.id}
                      isProcessing={isProcessing}
                      onExpand={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
                      onRun={handleSingleExecution}
                      onRemove={handleRemoveSingle}
                      renderStepTrace={renderStepTrace}
                    />
                  ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightboxImg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
          onClick={() => setLightboxImg(null)}>
          <img src={`data:image/png;base64,${lightboxImg}`} style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} alt="Fullscreen" />
        </div>
      )}
    </div>
  );
};