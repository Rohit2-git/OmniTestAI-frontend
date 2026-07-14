import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Application, TestCase, ExecutionRun, KnowledgeAsset } from '../types';
import { apiService } from '../services/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface AppContextType {
  applications: Application[];
  allApplications: Application[]; // admin/qa_engineer see all
  testCases: TestCase[];
  refreshTestCases: () => Promise<void>;
  history: ExecutionRun[];
  knowledgeAssets: KnowledgeAsset[];
  activeAppId: string | null;
  setActiveAppId: (id: string | null) => void;
  addApplication: (app: Omit<Application, 'id' | 'createdAt'>) => Application;
  updateApplication: (app: Application) => void;
  deleteApplication: (id: string) => void;
  addTestCase: (tc: Omit<TestCase, 'id' | 'createdAt'>) => TestCase;
  updateTestCase: (tc: TestCase) => void;
  deleteTestCase: (id: string) => void;
  addExecutionRun: (run: ExecutionRun) => void;
  addKnowledgeAsset: (asset: Omit<KnowledgeAsset, 'id' | 'createdAt'>) => KnowledgeAsset;
  deleteKnowledgeAsset: (id: string) => void;
  generationBatches: any[];
  setGenerationBatches: React.Dispatch<React.SetStateAction<any[]>>;
  executionResults: Record<string, Record<string, any>>;
  setExecutionResults: React.Dispatch<React.SetStateAction<Record<string, Record<string, any>>>>;
  activeExecutionId: string | null;
  setActiveExecutionId: React.Dispatch<React.SetStateAction<string | null>>;
  isSuiteRunning: boolean;
  setIsSuiteRunning: React.Dispatch<React.SetStateAction<boolean>>;
  isNLRunning: boolean;
  setIsNLRunning: React.Dispatch<React.SetStateAction<boolean>>;
  isGenerationRunning: boolean;
  setIsGenerationRunning: React.Dispatch<React.SetStateAction<boolean>>;
  generatorFormState: {
    mode: string;
    sourceInput: string;
    batchName: string;
    testCaseCount: number;
    stagedFiles: Array<{ id: string; name: string; type: string; rawBase64?: string }>;
  };
  setGeneratorFormState: React.Dispatch<React.SetStateAction<{
    mode: string;
    sourceInput: string;
    batchName: string;
    testCaseCount: number;
    stagedFiles: Array<{ id: string; name: string; type: string; rawBase64?: string }>;
  }>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode; userRole?: string }> = ({ children, userRole }) => {
  const restrictedRoles = ['qa_reviewer', 'developer'];
  const isRestricted = userRole ? restrictedRoles.includes(userRole) : false;
  // Auth is cookie-based (httpOnly) — credentials: 'include' on each fetch
  // is what actually authenticates these requests, no Authorization header needed.
  const authHeaders = { 'Content-Type': 'application/json' };

  const [allApplications, setAllApplications] = useState<Application[]>(() => {
    const saved = localStorage.getItem('ai_agent_applications');
    return saved ? JSON.parse(saved) : [];
  });

  const [applications, setApplications] = useState<Application[]>([]);

  // Fetch the real application list from the DB. /auth/apps already scopes
  // correctly server-side: qa_reviewer gets only their assigned apps, every
  // other role gets the full list. localStorage is just the instant-load
  // cache shown before this fetch resolves — the DB response is what
  // actually replaces it, so apps stay consistent across browsers/devices.
  useEffect(() => {
    if (!userRole) return;

    const syncAndFetch = async () => {
      // One-time migration: push any apps that exist locally but were
      // created before DB-sync existed, so they aren't silently dropped
      // once the DB response below replaces local state.
      if (!isRestricted && allApplications.length > 0) {
        try {
          const existingRes = await fetch(`${API_BASE}/auth/apps`, { headers: authHeaders, credentials: 'include' });
          const existingApps: Application[] = existingRes.ok ? await existingRes.json() : [];
          const existingIds = new Set(existingApps.map(a => a.id));
          const localOnly = allApplications.filter(a => !existingIds.has(a.id));
          for (const app of localOnly) {
            await fetch(`${API_BASE}/auth/apps`, {
              method: 'POST', headers: authHeaders, credentials: 'include',
              body: JSON.stringify({ id: app.id, name: app.name, description: app.description || '', platform: app.platform, url: app.url, status: app.status || 'active' })
            }).catch(() => { });
          }
        } catch {
          // If this migration step fails, fall through to the fetch below anyway.
        }
      }

      fetch(`${API_BASE}/auth/apps`, { headers: authHeaders, credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((dbApps: Application[] | null) => {
          if (dbApps === null) return; // fetch failed — keep whatever localStorage had
          if (isRestricted) {
            setApplications(dbApps);
            if (dbApps.length > 0) setActiveAppId(dbApps[0].id);
            else setActiveAppId(null);
          } else {
            setAllApplications(dbApps);
            setApplications(dbApps);
          }
        })
        .catch(() => { /* keep localStorage fallback on network failure */ });
    };

    syncAndFetch();
  }, [userRole]);

  // ── Test cases: DB is the sole source of truth ────────────────────────
  // Deliberately NOT hydrated from localStorage. These counts are scoped
  // per user/role/app-access on the backend (see results.py), and this key
  // is a plain browser-wide string with no per-user namespace — hydrating
  // from it on mount showed whatever a DIFFERENT, previously-logged-in user
  // on this same browser had cached (e.g. a QA Reviewer with zero assigned
  // apps briefly/persistently seeing another user's real 9 test cases).
  // Starting empty and letting fetchFromDB populate it is slightly slower
  // to first paint but can never leak another account's data.
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // ── History: same reasoning as testCases above ────────────────────────
  const [history, setHistory] = useState<ExecutionRun[]>([]);

  // ── Knowledge assets: same reasoning as testCases above ───────────────
  const [knowledgeAssets, setKnowledgeAssets] = useState<KnowledgeAsset[]>([]);

  const [activeAppId, setActiveAppId] = useState<string | null>(() => {
    const saved = localStorage.getItem('ai_agent_active_appid');
    if (saved) return saved;
    return allApplications.length > 0 ? allApplications[0].id : null;
  });

  // ── Fetch test cases + execution history from DB on mount ─────────────
  // Exposed so callers (e.g. Generator after Save to Repo) can force a refresh
  // without reloading the page. Defined outside the useEffect so it's reachable.
  // Immediately drop any previous session's account-scoped state the moment
  // the logged-in role changes (e.g. logout/login in the same tab without a
  // full page reload) — so a new user never even briefly sees whatever was
  // in memory for whoever was logged in before. The DB fetch below then
  // repopulates from scratch, scoped correctly to the new user.
  // One-time cleanup: these three keys were written by the pre-fix version of
  // this file and may still hold another user's leaked data in browsers that
  // already hit this bug. They're no longer used — remove them outright so
  // nothing lingers, rather than leaving dead but sensitive data sitting in
  // localStorage indefinitely.
  useEffect(() => {
    localStorage.removeItem('ai_agent_testcases');
    localStorage.removeItem('ai_agent_history');
    localStorage.removeItem('ai_agent_knowledge_assets');
  }, []);

  useEffect(() => {
    setTestCases([]);
    setHistory([]);
    setKnowledgeAssets([]);
  }, [userRole]);

  const fetchFromDB = async () => {
    if (!userRole) return;
    try {
      const runsRes = await fetch(`${API_BASE}/results/`, { headers: authHeaders, credentials: 'include' });
      if (!runsRes.ok) return;
      const runsData = await runsRes.json();
      const runs: any[] = runsData.runs || [];

      const allTestCases: TestCase[] = [];
      const allHistory: ExecutionRun[] = [];

      await Promise.all(runs.map(async (run: any) => {
        // Skip NL execution runs — they are not generated test cases
        const filename: string = run.filename || '';
        if (filename.startsWith('NL:') || filename.startsWith('Execute:')) return;

        try {
          const detailRes = await fetch(`${API_BASE}/results/${run.run_id}`, { headers: authHeaders, credentials: 'include' });
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const runAppId = detail.app_id || run.app_id;
            if (!runAppId) return;

            detail.test_cases?.forEach((tc: any) => {
              if (tc.type === 'natural_language' || tc.type === 'execution') return;
              allTestCases.push({
                id: `db-${run.run_id}-${tc.id}`,
                appId: runAppId,
                title: tc.title,
                description: tc.expected_result || '',
                steps: Array.isArray(tc.steps)
                  ? tc.steps.map((s: any, i: number) => ({
                    id: `step-${i}`,
                    instruction: typeof s === 'string' ? s : s.instruction || s,
                    expected: tc.expected_result || ''
                  }))
                  : [],
                priority: 'medium',
                source: 'ai-jira',
                section: detail.display_label || detail.filename || 'Generated',
                createdAt: tc.created_at || run.created_at || new Date().toISOString()
              });
            });
          }

          const execRes = await fetch(`${API_BASE}/results/${run.run_id}/execution`, { headers: authHeaders, credentials: 'include' });
          if (execRes.ok) {
            const execData = await execRes.json();
            execData.executions?.forEach((exec: any) => {
              allHistory.push({
                id: `exec-${exec.execution_run_id}`,
                appId: activeAppId || 'unknown',
                testCaseIds: [],
                status: exec.summary.failed > 0 ? 'failed' : 'passed',
                logs: [],
                metrics: {
                  durationMs: 0,
                  stepsCount: exec.summary.executed || 0,
                  passedCount: exec.summary.passed || 0,
                },
                executedAt: exec.executed_at || new Date().toISOString()
              });
            });
          }
        } catch { }
      }));

      // Always update — even if allTestCases is empty (e.g. first save just cleared
      // stale local state). The old `if (length > 0)` guard was swallowing first saves.
      setTestCases(prev => {
        const dbIds = new Set(allTestCases.map(tc => tc.id));
        const localOnly = prev.filter(tc => !tc.id.startsWith('db-') && !dbIds.has(tc.id));
        return [...allTestCases, ...localOnly];
      });
      setHistory(prev => {
        const dbIds = new Set(allHistory.map(h => h.id));
        const localOnly = prev.filter(h => !h.id.startsWith('exec-') && !dbIds.has(h.id));
        return [...allHistory, ...localOnly];
      });
    } catch (err) {
      console.error('DB sync error:', err);
    }
  };

  useEffect(() => {
    fetchFromDB();
  }, [userRole, activeAppId]);

  // Fetch knowledge assets from DB when active app changes
  useEffect(() => {
    if (!userRole || !activeAppId) {
      // No active app (e.g. this user has zero assigned applications) —
      // there is nothing to show, so make sure state reflects that instead
      // of leaving behind whatever was fetched for a previously active app.
      setKnowledgeAssets([]);
      return;
    }
    fetch(`${API_BASE}/knowledge/${activeAppId}`, { headers: authHeaders, credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Always replace — including clearing to [] when this app genuinely
        // has zero assets — so a real "0" is never masked by stale state
        // left over from a previously active app or a previous user.
        const assets = data?.assets || [];
        setKnowledgeAssets(assets.map((a: any) => ({
          id: `kb-db-${a.id}`,
          appId: activeAppId,
          name: a.name,
          type: a.type || 'doc',
          summary: a.summary,
          url: a.url || undefined,
          tags: typeof a.tags === 'string' ? JSON.parse(a.tags || '[]') : (a.tags || []),
          createdAt: a.createdAt || new Date().toISOString()
        })));
      })
      .catch(() => { setKnowledgeAssets([]); });
  }, [activeAppId, userRole]);

  const [generationBatches, setGenerationBatches] = useState<any[]>(() => {
    const saved = localStorage.getItem('ai_agent_temp_batches');
    return saved ? JSON.parse(saved) : [];
  });

  // executionResults is session-only — Executor.tsx loads from DB on mount.
  const [executionResults, setExecutionResults] = useState<Record<string, Record<string, any>>>({});

  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [isSuiteRunning, setIsSuiteRunning] = useState(false);
  const [isNLRunning, setIsNLRunning] = useState(false);
  const [isGenerationRunning, setIsGenerationRunning] = useState(false);

  // ⚡ COMPREHENSIVE RECOVERY FALLBACK STATE MAP
  const [generatorFormState, setGeneratorFormState] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_agent_generator_form');
      return saved ? JSON.parse(saved) : {
        mode: 'jira',
        sourceInput: '',
        batchName: '',
        testCaseCount: 10,
        stagedFiles: []
      };
    } catch {
      return {
        mode: 'jira',
        sourceInput: '',
        batchName: '',
        testCaseCount: 10,
        stagedFiles: []
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ai_agent_applications', JSON.stringify(allApplications));
    } catch (e) {
      console.warn('applications exceeded localStorage quota — clearing local cache (data is safe in the database):', e);
      try { localStorage.removeItem('ai_agent_applications'); } catch { }
    }
  }, [allApplications]);
  // testCases, history, and knowledgeAssets are no longer written to
  // localStorage — they're account-scoped data with no per-user namespace,
  // and persisting them here is exactly what caused one user's counts to
  // leak into another user's session on the same browser. The DB is the
  // sole source of truth for these now; see fetchFromDB and the knowledge
  // asset effect above.
  useEffect(() => { if (activeAppId) localStorage.setItem('ai_agent_active_appid', activeAppId); }, [activeAppId]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_agent_temp_batches', JSON.stringify(generationBatches));
    } catch (e) {
      console.warn('generationBatches exceeded localStorage quota — clearing local cache:', e);
      try { localStorage.removeItem('ai_agent_temp_batches'); } catch { }
    }
  }, [generationBatches]);

  useEffect(() => {
    try { localStorage.setItem('ai_agent_generator_form', JSON.stringify(generatorFormState)); } catch { }
  }, [generatorFormState]);

  // executionResults intentionally NOT persisted to localStorage —
  // screenshots and videos are large and the DB + /media/ static files
  // are the source of truth. Executor.tsx loads results from DB on mount.

  const addApplication = (appData: Omit<Application, 'id' | 'createdAt'>) => {
    const newApp: Application = { ...appData, id: `app-${Date.now()}`, createdAt: new Date().toISOString() };
    setAllApplications(prev => [newApp, ...prev]);
    setApplications(prev => [newApp, ...prev]);
    if (!activeAppId) setActiveAppId(newApp.id);
    // Sync to DB so restricted users can be assigned this app
    if (userRole) {
      fetch(`${API_BASE}/auth/apps`, {
        method: 'POST', headers: authHeaders, credentials: 'include',
        body: JSON.stringify({ id: newApp.id, name: newApp.name, description: newApp.description, platform: newApp.platform, url: newApp.url, status: newApp.status })
      }).catch(console.error);
    }
    return newApp;
  };

  const updateApplication = (updatedApp: Application) => {
    setAllApplications(prev => prev.map(app => app.id === updatedApp.id ? updatedApp : app));
    setApplications(prev => prev.map(app => app.id === updatedApp.id ? updatedApp : app));
  };

  const deleteApplication = (id: string) => {
    setAllApplications(prev => prev.filter(app => app.id !== id));
    setApplications(prev => prev.filter(app => app.id !== id));
    setTestCases(prev => prev.filter(tc => tc.appId !== id));
    setHistory(prev => prev.filter(run => run.appId !== id));
    setKnowledgeAssets(prev => prev.filter(asset => asset.appId !== id));
    if (activeAppId === id) {
      const remaining = allApplications.filter(app => app.id !== id);
      setActiveAppId(remaining.length > 0 ? remaining[0].id : null);
    }
    // Sync deletion to DB
    if (userRole) {
      fetch(`${API_BASE}/auth/apps/${id}`, { method: 'DELETE', headers: authHeaders, credentials: 'include' }).catch(console.error);
    }
  };

  const addTestCase = (tcData: Omit<TestCase, 'id' | 'createdAt'>) => {
    const newTestCase: TestCase = {
      ...tcData,
      id: `tc-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString()
    };
    setTestCases(prev => [...prev, newTestCase]);
    return newTestCase;
  };

  const updateTestCase = (updatedTestCase: TestCase) => {
    setTestCases(prev => prev.map(tc => tc.id === updatedTestCase.id ? updatedTestCase : tc));
  };

  const deleteTestCase = async (id: string) => {
    setTestCases(prev => prev.filter(tc => tc.id !== id));
    const numericId = parseInt(id.replace(/^\D+/g, ''), 10);
    if (!isNaN(numericId)) {
      try {
        await apiService.deleteRunRecord(numericId);
      } catch (err) {
        console.error("Backend single sync delete execution failure context:", err);
      }
    }
  };

  const addExecutionRun = (run: ExecutionRun) => { setHistory(prev => [run, ...prev]); };
  const addKnowledgeAsset = (assetData: Omit<KnowledgeAsset, 'id' | 'createdAt'>) => {
    const newAsset: KnowledgeAsset = { ...assetData, id: `kb-${Date.now()}`, createdAt: new Date().toISOString() };
    setKnowledgeAssets(prev => [newAsset, ...prev]);
    return newAsset;
  };
  const deleteKnowledgeAsset = (id: string) => { setKnowledgeAssets(prev => prev.filter(asset => asset.id !== id)); };

  return (
    <AppContext.Provider value={{
      applications, allApplications, testCases, refreshTestCases: fetchFromDB, history, knowledgeAssets, activeAppId, setActiveAppId,
      addApplication, updateApplication, deleteApplication, addTestCase, updateTestCase,
      deleteTestCase, addExecutionRun, addKnowledgeAsset, deleteKnowledgeAsset,
      generationBatches, setGenerationBatches,
      executionResults, setExecutionResults,
      activeExecutionId, setActiveExecutionId,
      isSuiteRunning, setIsSuiteRunning,
      isNLRunning, setIsNLRunning,
      isGenerationRunning, setIsGenerationRunning,
      generatorFormState, setGeneratorFormState
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};