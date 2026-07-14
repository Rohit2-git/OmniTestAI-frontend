import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { 
  Play, Command, ListTodo, Trash2, CheckCircle2, 
  XCircle, Image as ImageIcon, Terminal as TerminalIcon, Loader2, Layers, Sparkles
} from 'lucide-react';

// In dev (npm run dev), falls back to localhost:8000 so local testing still
// works without Docker. In production, VITE_API_BASE_URL is injected at build
// time (see client/Dockerfile) as the relative path "/api", which nginx
// then proxies to the backend container - see nginx/nginx.conf.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface ExecutorProps {
  selectedTestIdsForRun: string[];
  clearSelectedTests: () => void;
  addToQueue?: (ids: string[]) => void;
}

const SlideshowPanel: React.FC<{ screenshots: any[]; isHeadfulOnly?: boolean; videoBase64?: string; videoPath?: string }> = ({
  screenshots, isHeadfulOnly = false, videoBase64, videoPath
}) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const total = screenshots.length;

  const slideSrc = (s: any) => s?.image_path ? `${API_BASE}${s.image_path}` : `data:image/png;base64,${s?.image_base64}`;
  const videoSrc = videoPath ? `${API_BASE}${videoPath}` : (videoBase64 ? `data:video/webm;base64,${videoBase64}` : null);

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
              src={slideSrc(screenshots[slideIdx])}
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
                <img src={slideSrc(s)} alt={`Step ${s.step_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {videoSrc && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>▶ SESSION RECORDING</span>
          </div>
          <video controls style={{ width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#000', maxHeight: '400px' }}
            src={videoSrc} />
        </div>
      )}
    </div>
  );
};

const TestCard: React.FC<{
  tc: any; result: any; isExpanded: boolean; isRunning: boolean; isProcessing: boolean;
  onExpand: () => void; onRun: ((tc: any) => void) | null; onRemove: (e: React.MouseEvent, id: string) => void;
  renderStepTrace: (steps: any[]) => React.ReactNode;
  onViewFullText?: (text: string) => void;
}> = ({ tc, result, isExpanded, isRunning, isProcessing, onExpand, onRun, onRemove, renderStepTrace, onViewFullText }) => {
  const isHeadfulOnly = result?.mode === 'headful_single' || (!result?.screenshots?.length && result?.mode !== 'headless_suite');
  const [titleExpanded, setTitleExpanded] = React.useState(false);

  const isTruncated = onViewFullText && (tc.title.endsWith('..."') || tc.fullCommand?.length > 35);
  const fullText = tc.fullCommand || tc.steps?.join('\n') || tc.title;

  // Determine passed status — for NL runs, also check step-level outcomes
  // in case the backend set passed=false but most steps actually succeeded.
  const isPassed = (() => {
    if (!result) return null;
    if (result.passed) return true;
    // Backend already fixed this in nl_executor.py, but guard here too:
    // if overall_status says PASSED, trust it over result.passed
    if (result.overall_status === 'PASSED') return true;
    return false;
  })();

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: isExpanded ? '#f8fafc' : '#fff' }}>
      <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: titleExpanded ? 'flex-start' : 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={onExpand}>
          {isRunning ? <Loader2 className="animate-spin" size={22} color="#6366f1" /> :
            result ? (isPassed ? <CheckCircle2 color="#10b981" size={22} /> : <XCircle color="#ef4444" size={22} />) :
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #e2e8f0', flexShrink: 0 }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
              {isTruncated ? (
                titleExpanded ? (
                  <span style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {`NL Action Run — "${fullText}"`}
                  </span>
                ) : (
                  <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tc.title}
                  </span>
                )
              ) : (
                <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tc.title}
                </span>
              )}
              {isTruncated && (
                <span
                  onClick={(e) => { e.stopPropagation(); setTitleExpanded(v => !v); }}
                  style={{ display: 'inline-block', marginTop: '2px', fontSize: '0.72rem', color: '#0891b2', fontWeight: 600, cursor: 'pointer' }}
                >
                  {titleExpanded ? 'show less' : '...more'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
              {tc.steps ? `${tc.steps.length} Actions` : 'Autonomous Actions'} •{' '}
              {result ? (isPassed ? '✓ Passed' : '✗ Failed') : 'Pending'} •{' '}
              <span style={{
                background: tc.priority === 'high' ? '#fee2e2' : tc.priority === 'medium' ? '#fef3c7' : '#dcfce7',
                color: tc.priority === 'high' ? '#dc2626' : tc.priority === 'medium' ? '#d97706' : '#16a34a',
                fontWeight: 700, fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>{(tc.priority || 'high').toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onRun && (
            <button onClick={(e) => { e.stopPropagation(); onRun(tc); }} disabled={isProcessing}
              style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', cursor: isProcessing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', opacity: isProcessing ? 0.5 : 1 }}>
              {isRunning ? <Loader2 className="animate-spin" size={16} color="#6366f1" /> : <Play size={16} style={{ color: '#0f172a' }} />}
            </button>
          )}
          {onRemove && (
            <button onClick={(e) => onRemove(e, tc.id)}
              style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={16} style={{ color: '#ef4444' }} />
            </button>
          )}
        </div>
      </div>
      {isExpanded && result && (
        <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', background: '#ffffff', overflow: 'hidden', borderRadius: '0 0 12px 12px' }}>
          {renderStepTrace(result.step_results || [])}
          <SlideshowPanel screenshots={result.screenshots || []} isHeadfulOnly={isHeadfulOnly} videoBase64={result.video_base64} videoPath={result.video_path} />
        </div>
      )}
    </div>
  );
};

export const Executor: React.FC<ExecutorProps> = ({ selectedTestIdsForRun, clearSelectedTests }) => {
  const { 
    applications, testCases, activeAppId, addExecutionRun,
    executionResults, setExecutionResults,
    activeExecutionId, setActiveExecutionId,
    isSuiteRunning, setIsSuiteRunning,
    isNLRunning, setIsNLRunning
  } = useApp();
  const { user } = useAuth();
  const isReadOnly = user?.role === 'qa_reviewer';

  const [nlCommand, setNlCommand] = useState('');
  const [nlHistoricalRuns, setNlHistoricalRuns] = useState<any[]>([]);

  const processingId = activeExecutionId;
  const setProcessingId = setActiveExecutionId;
  const isProcessing = isSuiteRunning || isNLRunning || activeExecutionId !== null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`omnitest_expanded_sections_${activeAppId || 'default'}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`omnitest_expanded_sections_${activeAppId || 'default'}`);
      setExpandedSections(saved ? JSON.parse(saved) : {});
    } catch { setExpandedSections({}); }
  }, [activeAppId]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [section]: prev[section] === false ? true : false };
      try { localStorage.setItem(`omnitest_expanded_sections_${activeAppId || 'default'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [showRunDropdown, setShowRunDropdown] = useState(false);
  const [showClearDropdown, setShowClearDropdown] = useState(false);
  const executionAbortRef = React.useRef<AbortController | null>(null);
  const nlAbortRef = React.useRef<AbortController | null>(null);

  const stagedKey = `omnitest_staged_ids_${activeAppId || 'default'}`;
  const [dbExecutionResults, setDbExecutionResults] = useState<Record<string, { screenshots: any[]; videoBase64?: string; videoPath?: string; passed?: boolean; step_results?: any[] }>>({});

  useEffect(() => {
    if (!activeAppId) return;

    const loadFromDb = async () => {
      try {
        const runsRes = await fetch(`${API_BASE}/results/?app_id=${activeAppId}`, { credentials: 'include' });
        if (!runsRes.ok) return;
        const runsData = await runsRes.json();
        const runs: any[] = runsData.runs || [];

        const merged: Record<string, { screenshots: any[]; videoBase64?: string; videoPath?: string; passed?: boolean; step_results?: any[] }> = {};

        await Promise.all(runs.map(async (run: any) => {
          try {
            const execRes = await fetch(`${API_BASE}/results/${run.run_id}/execution/latest`, { credentials: 'include' });
            if (!execRes.ok) return;
            const execData = await execRes.json();
            for (const tcResult of execData.test_case_results || []) {
              const stepResults: any[] = tcResult.step_results || [];
              const screenshots = stepResults
                .filter((s: any) => s.image_path || s.image_base64)
                .map((s: any) => ({
                  step_number: s.step_number,
                  step: s.step || s.detail || '',
                  status: s.status,
                  image_path: s.image_path || null,
                  image_base64: s.image_base64 || null,
                }));

              // NL runs are keyed elsewhere (nlHistoricalRuns, and the
              // live-run state set right after /execute/nl completes) using
              // a frontend-generated title: `NL Action Run — "..."` (35-char
              // truncation). The backend instead stores the row under
              // `Autonomous Run Goal — '...'` (50-char truncation, single
              // quotes). These never matched, so on reload this dictionary
              // was populated under a key nothing ever looked up — that's
              // why screenshots/video appeared to disappear after refresh
              // even though the files and DB row were both intact. Derive
              // the same frontend-format title here so both paths agree.
              const isNlRun = run.filename?.startsWith('NL:');
              const key = isNlRun
                ? (() => {
                    const fullCommand = run.filename.replace(/^NL:\s*/, '');
                    return `NL Action Run — "${fullCommand.substring(0, 35)}${fullCommand.length > 35 ? '...' : ''}"`;
                  })()
                : tcResult.title;

              merged[key] = {
                passed: tcResult.passed,
                step_results: stepResults,
                screenshots,
                videoPath: tcResult.video_path || undefined,
              };
            }
          } catch { /* skip this run, keep going */ }
        }));

        setDbExecutionResults(merged);

        const nlRuns = runs
          .filter((r: any) => r.filename?.startsWith('NL:'))
          .map((r: any) => {
            const fullCommand = r.filename.replace(/^NL:\s*/, '');
            return {
              id: `nl-run-${r.run_id}`,
              title: `NL Action Run — "${fullCommand.substring(0, 35)}${fullCommand.length > 35 ? '...' : ''}"`,
              priority: 'high',
              steps: fullCommand.split(/[\n;]+/).map((s: string) => s.trim()).filter(Boolean),
              runId: r.run_id,
              fullCommand,
            };
          });
        setNlHistoricalRuns(nlRuns);
      } catch (e) {
        console.error('Failed to load execution history from DB:', e);
      }
    };

    loadFromDb();
  }, [activeAppId]);

  const [completedExecutions, setCompletedExecutions] = useState<any[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);

  useEffect(() => {
    if (!isReadOnly || !activeAppId) return;
    const fetchCompleted = async () => {
      setCompletedLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/results/executions/completed?app_id=${activeAppId}`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const data = await res.json();
        setCompletedExecutions(data.results || []);
      } catch (e) {
        console.error('Failed to load completed executions:', e);
      } finally {
        setCompletedLoading(false);
      }
    };
    fetchCompleted();
  }, [activeAppId, isReadOnly]);

  const [stagedIds, setStagedIds] = useState<string[]>(() => {
    const key = `omnitest_staged_ids_${activeAppId || 'default'}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const savedStaged = localStorage.getItem(stagedKey);
    setStagedIds(savedStaged ? JSON.parse(savedStaged) : []);
    setExpandedId(null);
  }, [activeAppId]);

  const baseResults: Record<string, any> = executionResults[activeAppId || ''] || {};
  const testResults: Record<string, any> = Object.fromEntries(
    Array.from(new Set([...Object.keys(baseResults), ...Object.keys(dbExecutionResults)])).map(title => {
      const liveResult = baseResults[title];
      const stored = dbExecutionResults[title];

      if (liveResult && stored) {
        return [title, {
          ...liveResult,
          screenshots: (liveResult.screenshots && liveResult.screenshots.length > 0) ? liveResult.screenshots : (stored.screenshots || []),
          video_base64: liveResult.video_base64 || stored.videoBase64 || null,
          video_path: liveResult.video_path || stored.videoPath || null,
        }];
      }
      if (liveResult) return [title, liveResult];
      return [title, {
        passed: stored!.passed ?? false,
        step_results: stored!.step_results || [],
        screenshots: stored!.screenshots || [],
        video_base64: stored!.videoBase64 || null,
        video_path: stored!.videoPath || null,
      }];
    })
  );
  
  const setTestResults = (updater: Record<string, any> | ((current: Record<string, any>) => Record<string, any>)) => {
    setExecutionResults(prev => {
      const appKey = activeAppId || '';
      const current = prev[appKey] || {};
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [appKey]: next };
    });
  };

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setShowRunDropdown(false);
        setShowClearDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const handleClearAll = async () => {
    setTestResults({});
    setExpandedId(null);
    setStagedIds([]);
    setNlHistoricalRuns([]);
    setDbExecutionResults({});
    localStorage.removeItem(stagedKey);
    setExecutionResults(prev => {
      const next = { ...prev };
      delete next[activeAppId || ''];
      return next;
    });
    clearSelectedTests();

    if (activeAppId) {
      try {
        await fetch(`${API_BASE}/results/app/${activeAppId}/all`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (e) {
        console.error('Failed to clear all execution data from DB:', e);
      }
    }
  };

  const handleRemoveSingle = (e: React.MouseEvent, tcId: string) => {
    e.stopPropagation();
    setStagedIds(prev => prev.filter(id => id !== tcId));
  };

  const handleRemoveNL = (e: React.MouseEvent, localRunId: string) => {
    e.stopPropagation();
    setNlHistoricalRuns(prev => {
      const target = prev.find(r => r.id === localRunId);
      const updated = prev.filter(r => r.id !== localRunId);
      if (target?.runId != null) {
        fetch(`${API_BASE}/results/${target.runId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      }
      return updated;
    });
  };

  const handleClearAllNL = async () => {
    setShowClearDropdown(false);
    const runsToDelete = nlHistoricalRuns.filter(r => r.runId != null).map(r => r.runId);
    setNlHistoricalRuns([]);
    await Promise.all(
      runsToDelete.map((runId: number) =>
        fetch(`${API_BASE}/results/${runId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
      )
    );
  };

  const handleRerunNL = async (runItem: any) => {
    if (!activeApp?.url) {
      alert('No active application URL set — cannot rerun.');
      return;
    }
    if (isProcessing) {
      alert('Another execution is already running. Wait for it to finish before rerunning.');
      return;
    }
    const originalCommand = runItem.fullCommand
      || (runItem.steps?.length > 0 ? runItem.steps.join('\n') : '')
      || runItem.title.replace(/^NL Action Run — "/, '').replace(/"$/, '').replace(/\.\.\.$/, '');
    const abortController = new AbortController();
    nlAbortRef.current = abortController;
    setIsNLRunning(true);
    const startTime = Date.now();
    try {
      const steps = originalCommand.split(/[\n;]+/).map((s: string) => s.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/execute/nl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: activeApp.url, steps, appId: String(activeAppId) }),
        signal: abortController.signal
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.detail || `Rerun failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data?.aborted) return;
      const uniqueId = `nl-run-${Date.now()}`;
      const virtualTestCase = {
        id: uniqueId,
        title: `NL Action Run — "${originalCommand.length > 35 ? originalCommand.substring(0, 35) + '...' : originalCommand}"`,
        priority: 'high',
        steps,
        runId: data.run_id,
        fullCommand: originalCommand,
      };
      setTestResults(prev => ({ ...prev, [virtualTestCase.title]: data }));
      setNlHistoricalRuns(prev => [virtualTestCase, ...prev]);
      setExpandedId(uniqueId);
      if (activeAppId) {
        setDbExecutionResults(prev => ({ ...prev, [virtualTestCase.title]: { screenshots: data.screenshots || [], videoBase64: data.video_base64, videoPath: data.video_path } }));
      }
      saveToHistory(data, 'natural_language', [], originalCommand, startTime);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('NL re-run error:', err);
        alert(`Rerun failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      nlAbortRef.current = null;
      setIsNLRunning(false);
    }
  };

  const handleSingleExecution = async (tc: any) => {
    if (!activeApp?.url) return;
    const abortController = new AbortController();
    executionAbortRef.current = abortController;
    setIsSuiteRunning(true);
    setProcessingId(tc.id);
    setExpandedId(tc.id);
    const startTime = Date.now();
    try {
      const steps = tc.steps.map((s: any) => s.instruction || s);
      const res = await fetch(`${API_BASE}/execute/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: activeApp.url, steps, title: tc.title, expected_result: tc.steps[tc.steps.length - 1]?.expected || '', appId: activeAppId }),
        signal: abortController.signal
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [tc.title]: data }));
      if (activeAppId) {
        setDbExecutionResults(prev => ({ ...prev, [tc.title]: { screenshots: data.screenshots || [], videoBase64: data.video_base64, videoPath: data.video_path } }));
      }
      saveToHistory(data, 'headful_single', [tc.id], tc.title, startTime);
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Single execution error:', err);
    } finally {
      executionAbortRef.current = null;
      setIsSuiteRunning(false);
      setProcessingId(null);
    }
  };

  const handleBulkExecution = async () => {
    if (!activeApp?.url || stagedTests.length === 0) return;
    const abortController = new AbortController();
    executionAbortRef.current = abortController;
    setIsSuiteRunning(true);
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
        credentials: 'include',
        body: JSON.stringify({ base_url: activeApp.url, test_cases: testCasesPayload, appId: activeAppId }),
        signal: abortController.signal
      });
      const data = await res.json();
      if (!data?.aborted) {
        const resultMap: Record<string, any> = {};
        if (data?.results) {
          data.results.forEach((r: any) => { resultMap[r.title] = r; });
        }
        setTestResults(prev => ({ ...prev, ...resultMap }));
        if (activeAppId && data?.results) {
          const dbUpdates: Record<string, any> = {};
          for (const r of data.results) {
            dbUpdates[r.title] = { screenshots: r.screenshots || [], videoBase64: r.video_base64, videoPath: r.video_path };
          }
          setDbExecutionResults(prev => ({ ...prev, ...dbUpdates }));
        }
        saveToHistory(data, 'headless_suite', stagedTests.map(tc => tc.id), undefined, startTime);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Suite execution error:', err);
    } finally {
      executionAbortRef.current = null;
      setIsSuiteRunning(false);
    }
  };

  const handleRunSection = async (section: string) => {
    setShowRunDropdown(false);
    if (!activeApp?.url) return;
    const sectionTests = groupedTests[section] || [];
    if (sectionTests.length === 0) return;
    const abortController = new AbortController();
    executionAbortRef.current = abortController;
    setIsSuiteRunning(true);
    const startTime = Date.now();
    try {
      const testCasesPayload = sectionTests.map((tc: any) => ({
        title: tc.title,
        steps: tc.steps.map((s: any) => s.instruction || s),
        expected_result: tc.steps[tc.steps.length - 1]?.expected || '',
        type: tc.source || 'functional'
      }));
      const res = await fetch(`${API_BASE}/execute/suite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ base_url: activeApp.url, test_cases: testCasesPayload, appId: activeAppId }),
        signal: abortController.signal
      });
      const data = await res.json();
      if (!data?.aborted) {
        const resultMap: Record<string, any> = {};
        if (data?.results) {
          data.results.forEach((r: any) => { resultMap[r.title] = r; });
        }
        setTestResults((prev: any) => ({ ...prev, ...resultMap }));
        if (activeAppId && data?.results) {
          const dbUpdates: Record<string, any> = {};
          for (const r of data.results) {
            dbUpdates[r.title] = { screenshots: r.screenshots || [], videoBase64: r.video_base64, videoPath: r.video_path };
          }
          setDbExecutionResults(prev => ({ ...prev, ...dbUpdates }));
        }
        saveToHistory(data, 'headless_suite', sectionTests.map((tc: any) => tc.id), undefined, startTime);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Section execution error:', err);
    } finally {
      executionAbortRef.current = null;
      setIsSuiteRunning(false);
    }
  };

  const handleClearSection = (section: string) => {
    setShowClearDropdown(false);
    const sectionTests = groupedTests[section] || [];
    const sectionIds = sectionTests.map((tc: any) => tc.id);
    const sectionTitles = sectionTests.map((tc: any) => tc.title);
    setStagedIds(prev => prev.filter(id => !sectionIds.includes(id)));
    setTestResults((prev: any) => {
      const next = { ...prev };
      sectionTitles.forEach(title => delete next[title]);
      return next;
    });
    if (activeAppId) {
      setDbExecutionResults(prev => {
        const next = { ...prev };
        sectionTitles.forEach(title => delete next[title]);
        return next;
      });
      if (sectionTitles.length > 0) {
        fetch(`${API_BASE}/results/execution/delete-by-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ app_id: activeAppId, titles: sectionTitles })
        }).catch(e => console.error('Failed to delete section results from DB:', e));
      }
    }
  };

  const handleStopSuiteExecution = async () => {
    if (executionAbortRef.current) {
      executionAbortRef.current.abort();
      executionAbortRef.current = null;
    }
    if (nlAbortRef.current) {
      nlAbortRef.current.abort();
      nlAbortRef.current = null;
    }
    setIsSuiteRunning(false);
    setIsNLRunning(false);
    setProcessingId(null);
    if (!activeApp?.url) return;
    try {
      await fetch(`${API_BASE}/execute/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ base_url: activeApp.url })
      });
    } catch (err) {
      console.error('Failed to dispatch backend cancellation signal:', err);
    }
  };

  const handleNLExecution = async () => {
    if (!nlCommand.trim() || !activeApp?.url) return;
    const abortController = new AbortController();
    nlAbortRef.current = abortController;
    setIsNLRunning(true);
    const startTime = Date.now();
    const currentCommand = nlCommand;
    try {
      const steps = currentCommand.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/execute/nl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: activeApp.url, steps, appId: String(activeAppId) }),
        signal: abortController.signal
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.detail || `NL execution failed (HTTP ${res.status})`);
      }
      const data = await res.json();

      if (data?.aborted) return;

      const uniqueId = `nl-run-${Date.now()}`;
      const virtualTestCase = {
        id: uniqueId,
        title: `NL Action Run — "${currentCommand.length > 35 ? currentCommand.substring(0, 35) + '...' : currentCommand}"`,
        priority: 'high',
        steps: steps,
        runId: data.run_id,
        fullCommand: currentCommand,
      };

      setTestResults(prev => ({ ...prev, [virtualTestCase.title]: data }));
      setNlHistoricalRuns(prev => [virtualTestCase, ...prev]);
      setExpandedId(uniqueId);
      if (activeAppId) {
        setDbExecutionResults(prev => ({ ...prev, [virtualTestCase.title]: { screenshots: data.screenshots || [], videoBase64: data.video_base64, videoPath: data.video_path } }));
      }
      saveToHistory(data, 'natural_language', [], currentCommand, startTime);
      setNlCommand('');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('NL execution error:', err);
        alert(`NL execution failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      nlAbortRef.current = null;
      setIsNLRunning(false);
    }
  };

  const renderStepTrace = (stepResults: any[]) => (
    <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
      <div style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '0.05em' }}>
        <TerminalIcon size={14} /> ORCHESTRATION_TRACE_STREAM
      </div>
      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
        {stepResults?.map((st: any, i: number) => {
          const detail: string = st.detail || '';
          const isSelfHealed = detail.startsWith('[SELF-HEALED]');
          const healExplanation = isSelfHealed ? detail.replace('[SELF-HEALED]', '').trim() : null;

          return (
            <div key={i} style={{ color: '#cbd5e1', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '6px', lineHeight: '1.4' }}>
              <span style={{
                color: isSelfHealed ? '#f59e0b' : st.status === 'passed' ? '#10b981' : '#ef4444',
                marginRight: '8px'
              }}>●</span>
              <span style={{ color: '#475569', marginRight: '8px' }}>[{st.step_number ?? i + 1}]</span>
              {st.step}

              {isSelfHealed && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px',
                  padding: '1px 7px', borderRadius: '5px',
                  background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)',
                  color: '#f59e0b', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                  fontFamily: 'Inter, system-ui, sans-serif', verticalAlign: 'middle',
                }}>
                  ⚡ SELF-HEALED
                </span>
              )}

              {isSelfHealed && healExplanation && (
                <div style={{ color: '#fbbf24', fontStyle: 'italic', fontSize: '0.72rem', marginTop: '2px', marginLeft: '24px', opacity: 0.85 }}>
                  ↳ {healExplanation}
                </div>
              )}

              {st.status === 'failed' && !isSelfHealed && (
                <span style={{ color: '#fca5a5', fontStyle: 'italic' }}> ({detail})</span>
              )}
            </div>
          );
        })}
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
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '1rem' }}>Describe what you want to test in plain English — no step-by-step scripting needed. Just tell it the goal and it will figure out how to do it.</p>
        {isReadOnly ? (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(148,163,184,0.08)', border: '1px solid var(--border-light)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            View-only access — NL execution is restricted to QA Engineers and above.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <textarea className="input-field" value={nlCommand} onChange={(e) => setNlCommand(e.target.value)}
              placeholder={"e.g. Go to the homepage, log in with my credentials, search for a product and add it to the cart"}
              rows={3} style={{ flex: 1, padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b', background: '#f8fafc', fontWeight: 400 }} />
            <button onClick={handleNLExecution} disabled={isProcessing || !nlCommand.trim()}
              style={{ borderRadius: '8px', padding: '8px 20px', background: '#06b6d4', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', border: 'none', cursor: 'pointer', alignSelf: 'center', fontSize: '0.85rem' }}>
              {isNLRunning ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              <span>Run</span>
            </button>
          </div>
        )}
      </div>

      {/* QUEUE / COMPLETED EXECUTIONS PANEL */}
      <div className="glass-card" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListTodo size={18} color={isReadOnly ? '#0891b2' : '#6366f1'} />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isReadOnly ? `Completed Executions (${completedExecutions.length})` : `Staged Suite Queue (${stagedTests.length})`}
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>

            {/* CLEAR ALL — split button */}
            <div data-dropdown style={{ position: 'relative' }}>
              <div style={{ display: 'flex', borderRadius: '8px', overflow: 'visible', border: '1px solid #e2e8f0' }}>
                <button onClick={handleClearAll}
                  style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', borderRight: '1px solid #e2e8f0' }}>
                  Clear All
                </button>
                <button
                  onClick={() => { setShowClearDropdown(p => !p); setShowRunDropdown(false); }}
                  disabled={Object.keys(groupedTests).length === 0 && nlHistoricalRuns.length === 0}
                  style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 10px', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                  ▾
                </button>
              </div>
              {showClearDropdown && (Object.keys(groupedTests).length > 0 || nlHistoricalRuns.length > 0) && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '200px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Clear by batch</div>
                  {Object.entries(groupedTests).map(([section, tests]) => (
                    <button key={section} onClick={() => handleClearSection(section)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#374151', fontWeight: 600, textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <span>{section}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>({(tests as any[]).length})</span>
                    </button>
                  ))}
                  {nlHistoricalRuns.length > 0 && (
                    <>
                      {Object.keys(groupedTests).length > 0 && <div style={{ borderTop: '1px solid #f1f5f9' }} />}
                      <button onClick={handleClearAllNL}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Sparkles size={12} /> NL Executions
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600 }}>({nlHistoricalRuns.length})</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* STOP EXECUTION — visible for suite AND NL runs */}
            {(isSuiteRunning || isNLRunning) && (
              <button type="button" onClick={handleStopSuiteExecution}
                style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#e11d48', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onMouseEnter={e => e.currentTarget.style.background = '#ffe4e6'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff1f2'}>
                <XCircle size={15} />
                <span>Stop Execution</span>
              </button>
            )}

            {/* RUN SUITE — split button */}
            {!isReadOnly && <div data-dropdown style={{ position: 'relative' }}>
              <div style={{ display: 'flex', borderRadius: '8px', overflow: 'visible' }}>
                <button onClick={handleBulkExecution} disabled={isProcessing || stagedTests.length === 0}
                  style={{ background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 18px', fontWeight: 700, border: 'none', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px 0 0 8px' }}>
                  {isSuiteRunning ? <Loader2 className="animate-spin" size={16} /> : null}
                  Run Suite
                </button>
                <button
                  onClick={() => { setShowRunDropdown(p => !p); setShowClearDropdown(false); }}
                  disabled={isProcessing || Object.keys(groupedTests).length === 0}
                  style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '8px 10px', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', borderRadius: '0 8px 8px 0' }}>
                  ▾
                </button>
              </div>
              {showRunDropdown && Object.keys(groupedTests).length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '200px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9' }}>Run by batch</div>
                  {Object.entries(groupedTests).map(([section, tests]) => (
                    <button key={section} onClick={() => handleRunSection(section)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#374151', fontWeight: 600, textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <span>{section}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>({(tests as any[]).length})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>}

          </div>
        </div>

        {/* QA REVIEWER: read-only completed executions panel */}
        {isReadOnly ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {completedLoading ? (
              <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                <Loader2 className="animate-spin" size={28} style={{ opacity: 0.4, marginBottom: '1rem' }} />
                <p style={{ fontWeight: 500 }}>Loading execution results…</p>
              </div>
            ) : completedExecutions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                <Layers size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p style={{ fontWeight: 500 }}>No executions found for this application yet.</p>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>Results will appear here once tests have been run by a QA Engineer or Admin.</p>
              </div>
            ) : (
              completedExecutions.map((r: any) => {
                const cardId = `completed-${r.execution_result_id}`;
                const isExpanded = expandedId === cardId;
                const screenshots = (r.step_results || [])
                  .filter((s: any) => s.image_path || s.image_base64)
                  .map((s: any) => ({
                    step_number: s.step_number,
                    step: s.step || s.detail || '',
                    status: s.status,
                    image_path: s.image_path || null,
                    image_base64: s.image_base64 || null,
                  }));
                return (
                  <div key={cardId} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: isExpanded ? '#f8fafc' : '#fff', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : cardId)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                        {r.passed ? <CheckCircle2 color="#10b981" size={22} /> : <XCircle color="#ef4444" size={22} />}
                        <div>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>{r.title}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '2px' }}>
                            <span>{r.step_results?.length || 0} Actions</span>
                            <span>•</span>
                            <span style={{ color: r.passed ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                              {r.passed ? '✓ Passed' : '✗ Failed'}
                            </span>
                            <span>•</span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                              {r.executed_at ? new Date(r.executed_at).toLocaleString() : ''}
                            </span>
                            {screenshots.length > 0 && (
                              <><span>•</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#0891b2', fontSize: '0.72rem', fontWeight: 600 }}>
                                <ImageIcon size={11} /> {screenshots.length} screenshots
                              </span></>
                            )}
                            {r.video_path && (
                              <><span>•</span>
                              <span style={{ color: '#7c3aed', fontSize: '0.72rem', fontWeight: 600 }}>▶ video</span></>
                            )}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                        {renderStepTrace(r.step_results || [])}
                        <SlideshowPanel screenshots={screenshots} isHeadfulOnly={screenshots.length === 0} videoPath={r.video_path} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {nlHistoricalRuns.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div onClick={() => toggleSection('nl_executions_section')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', borderRadius: '8px', background: '#f5f3ff', border: '1px solid #ddd6fe', cursor: 'pointer', userSelect: 'none' }}>
                <Sparkles size={14} color="#7c3aed" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                  NL Executions
                </span>
                <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 600, marginRight: '0.5rem' }}>
                  ({nlHistoricalRuns.length})
                </span>
                <span style={{ fontSize: '0.7rem', color: '#7c3aed', transition: 'transform 0.2s', display: 'inline-block', transform: expandedSections['nl_executions_section'] === false ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              
              {expandedSections['nl_executions_section'] !== false && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {nlHistoricalRuns.map((runItem) => (
                    <TestCard
                      key={runItem.id}
                      tc={runItem}
                      result={testResults[runItem.title]}
                      isExpanded={expandedId === runItem.id}
                      isRunning={isNLRunning && expandedId === runItem.id}
                      isProcessing={isProcessing}
                      onExpand={() => setExpandedId(expandedId === runItem.id ? null : runItem.id)}
                      onRun={isReadOnly ? null : handleRerunNL}
                      onRemove={handleRemoveNL}
                      renderStepTrace={renderStepTrace}
                      onViewFullText={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {stagedTests.length === 0 ? (
            nlHistoricalRuns.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                <Layers size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p style={{ fontWeight: 500 }}>No scenarios staged. Select items from Test Cases to begin.</p>
              </div>
            )
          ) : (
            Object.entries(groupedTests).map(([section, tests]) => (
              <div key={section}>
                <div onClick={() => toggleSection(section)}
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
                        onRun={isReadOnly ? null : handleSingleExecution}
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
        )}
      </div>

      {lightboxImg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
          onClick={() => setLightboxImg(null)}>
          <img src={`data:image/png;base64,${lightboxImg}`} style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} alt="Fullscreen" />
        </div>
      )}
    </div>
  );
};