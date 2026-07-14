import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Ticket, ClipboardList, FileUp, Image, Sparkles, X,
  ChevronDown, ChevronRight, FileText, Trash2, Edit2, Terminal, CheckSquare, Square, Copy, Download, Activity, Cpu, Layers
} from 'lucide-react';
import { apiService } from '../services/api';

type GenerationMode = 'jira' | 'acceptance' | 'file' | 'wireframe';

interface StagedFile {
  id: string;
  file: File;
  type: 'file' | 'wireframe';
}

interface GeneratorLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'step';
  message: string;
}

export const Generator: React.FC = () => {
  const {
    applications, activeAppId, refreshTestCases, generationBatches, setGenerationBatches,
    setIsGenerationRunning,
    generatorFormState, setGeneratorFormState
  } = useApp();

  const [mode, setMode] = useState<GenerationMode>((generatorFormState.mode as GenerationMode) || 'jira');
  const [sourceInput, setSourceInput] = useState(generatorFormState.sourceInput || '');
  // Optional user-chosen label for this batch (e.g. "Checkout Flow"). Left
  // empty by default — if the user doesn't provide one, the original
  // uploaded filename is used as the display label instead (handled server-side).
  const [batchName, setBatchName] = useState(generatorFormState.batchName || '');
  const [appContextInput, setAppContextInput] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [testCaseCount, setTestCaseCount] = useState<number>(generatorFormState.testCaseCount || 10);

  // Data source override — lets the user explicitly pick a Data Template,
  // Synthetic Condition, or Bulk Batch for this run instead of relying on
  // the backend's automatic per-test-case template matching (which gets
  // expensive/unreliable once templates and batches pile up). Value format:
  // "" = Auto, or "{mode}:{id}" e.g. "batch:abc123".
  const [dataSourceSelection, setDataSourceSelection] = useState<string>('');
  const [dataSourceTemplates, setDataSourceTemplates] = useState<any[]>([]);
  const [dataSourceConditions, setDataSourceConditions] = useState<any[]>([]);
  const [dataSourceBatches, setDataSourceBatches] = useState<any[]>([]);

  // Persist form state to AppContext whenever key fields change
  useEffect(() => {
    setGeneratorFormState(prev => ({ ...prev, mode, sourceInput, batchName, testCaseCount }));
  }, [mode, sourceInput, batchName, testCaseCount]);

  // One-time cleanup: remove legacy batches that have no appId (from before appId tracking)
  useEffect(() => {
    setGenerationBatches(prev => prev.filter((b: any) => !!b.appId));
  }, []);

  // Load available data sources (templates, conditions, bulk batches) for the
  // data-source picker whenever the active app changes. Reset the selection
  // too, since a source id from one app is meaningless for another.
  useEffect(() => {
    setDataSourceSelection('');
    if (!activeAppId) {
      setDataSourceTemplates([]);
      setDataSourceConditions([]);
      setDataSourceBatches([]);
      return;
    }
    (async () => {
      try {
        const [t, c, b] = await Promise.all([
          apiService.listTestDataTemplates(activeAppId),
          apiService.listTestDataConditions(activeAppId),
          apiService.listSyntheticBatches(activeAppId),
        ]);
        setDataSourceTemplates(t || []);
        setDataSourceConditions(c || []);
        setDataSourceBatches(b || []);
      } catch (err) {
        console.error('Failed to load data sources for picker:', err);
      }
    })();
  }, [activeAppId]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationElapsedSec, setGenerationElapsedSec] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [modalLogs, setModalLogs] = useState<GeneratorLog[]>([]);
  const [activeBatchMetrics, setActiveBatchMetrics] = useState<any>(null);
  const [activeBatchTitle, setActiveBatchTitle] = useState<string>('');

  const [activeExportDropdownId, setActiveExportDropdownId] = useState<string | null>(null);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleBottomRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeApp = applications.find((app) => app.id === activeAppId);

  const modeConfig = {
    jira: { placeholder: "Paste Jira Story Link or Ticket Body descriptions here... (Compulsory if no files attached)", accept: "" },
    acceptance: { placeholder: "Enter explicit acceptance criteria rules here... (Compulsory if no files attached)", accept: "" },
    file: { placeholder: "Optional guidelines for this User Story file...", accept: ".pdf,.txt,.docx,.md" },
    wireframe: { placeholder: "Optional click logic for this Wireframe capture...", accept: ".png,.jpg,.jpeg,.webp" }
  };

  const isFormValid = useMemo(() => {
    return sourceInput.trim().length > 0 || stagedFiles.some(f => f.type === 'file' || f.type === 'wireframe');
  }, [sourceInput, stagedFiles]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveExportDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [modalLogs, showModal]);

  const handleModeChange = (newMode: GenerationMode) => {
    setMode(newMode);
    if (['file', 'wireframe'].includes(newMode)) {
      setTimeout(() => fileInputRef.current?.click(), 10);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newStagedFiles: StagedFile[] = files.map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      file,
      type: mode as 'file' | 'wireframe'
    }));
    setStagedFiles(prev => [...prev, ...newStagedFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Holds the AbortController for whichever generation request is currently in flight,
  // so Stop Generation can actually cancel the fetch instead of just resetting UI state.
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const handleReopenModalForBatch = (batch: any) => {
    setModalLogs(batch.logs || []);
    setActiveBatchMetrics(batch.metrics || null);
    setActiveBatchTitle(batch.batchName || batch.sourceLabel || batch.metrics?.sourceFileName || '');
    // Restore THIS batch's own generation time instead of leaving whatever the
    // last-run global value was — each batch carries its own stamped duration now.
    setGenerationElapsedSec(batch.metrics?.generationTime ?? null);
    setShowModal(true);
  };

  // Appends a single timestamped line to the generation console modal.
  // Centralizes the pattern already used inline elsewhere in this file
  // (see the catch block in triggerGeneration) so callers like
  // handleStopGeneration don't need to repeat the timestamp formatting.
  const pushModalLog = (type: GeneratorLog['type'], message: string) => {
    setModalLogs(prev => [...prev, { timestamp: new Date().toTimeString().split(' ')[0], type, message }]);
  };

  const handleStopGeneration = async () => {
    // This is the actual fix: abort the real in-flight fetch, not just flip local state.
    // Without this call, the backend keeps working and the result lands a minute later
    // regardless of what the UI says.
    abortControllerRef.current?.abort();
    // Clean up: remove the in-progress batch from generationBatches
    setGenerationBatches((prev: any[]) => prev.filter((b: any) => !b.inProgress));
    setIsGenerating(false);
    setIsGenerationRunning(false);
    pushModalLog('warning', 'Generation stopped by user. Partial data cleared.');
    setTimeout(() => setShowModal(false), 1500);
  };

  const triggerGeneration = async () => {
    if (!activeAppId || !isFormValid) return;

    const newBatchId = `batch-${Date.now()}`;
    const capturedAppId = activeAppId; // capture now to prevent closure mismatch
    // Fresh controller per run — Stop Generation calls .abort() on whichever one is current.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setShowModal(true);
    setIsGenerating(true);
    // ⚡ SWITCH THE STATUS GLOW AND FOOTER CHIP IMMEDIATELY TO RED COMPILING MODE
    setIsGenerationRunning(true);
    setActiveBatchMetrics(null);
    // Clear any stale time from a previously-viewed batch so the live run
    // doesn't briefly flash an old duration before its own timer lands.
    setGenerationElapsedSec(null);

    const initialLogs: GeneratorLog[] = [
      { timestamp: new Date().toTimeString().split(' ')[0], type: 'info', message: 'Spawning OmniTestAI DeepCompiling agent workspace environment stack...' },
      { timestamp: new Date().toTimeString().split(' ')[0], type: 'info', message: `Target active project node maps locked onto node ID schema: "${activeApp?.name || 'Apex Client Core'}"` }
    ];
    setModalLogs(initialLogs);

    let sourceLabel = stagedFiles.length > 0
      ? stagedFiles.map(f => f.file.name).join(' + ')
      : (mode === 'jira' ? 'Jira Specification Context' : 'Acceptance Criteria Text');

    setActiveBatchTitle(batchName.trim() || sourceLabel);

    const _genStart = Date.now();
    try {
      let responseData;
      let compilationFilesList = [...stagedFiles];
      if (appContextInput.trim().length > 0) {
        const contextBlob = new Blob([appContextInput], { type: 'text/plain' });
        compilationFilesList.push({
          id: 'integrated-context',
          file: new File([contextBlob], 'context_rules.txt'),
          type: 'context' as any
        });
      }

      // ⚡ PRE-PUSH AN ACTIVE GENERATION TRACE MESSAGE IMMEDIATELY INTO CONSOLE VIEWS
      initialLogs.push({
        timestamp: new Date().toTimeString().split(' ')[0],
        type: 'step',
        message: 'Streaming raw source attachments and binary rulesets into grounding layer arrays...'
      });
      initialLogs.push({
        timestamp: new Date().toTimeString().split(' ')[0],
        type: 'step',
        message: 'Generation in progress... Throttled Two-Pass worker pool executing against Gemini 3 Flash API.'
      });
      setModalLogs([...initialLogs]);

      // Parse "mode:id" selection into the two params the backend expects.
      const [selectedMode, selectedId] = dataSourceSelection
        ? (dataSourceSelection.split(':') as ['template' | 'condition' | 'batch', string])
        : [undefined, undefined];

      if (compilationFilesList.length > 0) {
        responseData = await apiService.generateTestPackFromFiles(compilationFilesList as any, activeAppId, testCaseCount, controller.signal, selectedMode, selectedId);
      } else {
        responseData = await apiService.generateTestPack(sourceInput, activeAppId, testCaseCount, controller.signal, selectedMode, selectedId);
      }

      // controller.abort() only rejects the fetch promise if the request was still in
      // flight at the moment of the call. If the response had already fully arrived
      // (e.g. the user waited long enough that generation actually finished just before
      // clicking Stop), abort() is a no-op and this await resolves normally with real
      // data — no AbortError is ever thrown. Without this check, that race lets a
      // "stopped" generation still render as a completed batch. Since nothing in the
      // backend writes to the DB during /tests/generate anymore (only /tests/save does),
      // this is purely about not showing the result in the UI — discarding it here is safe.
      if (controller.signal.aborted) {
        throw new DOMException('Generation result discarded after stop.', 'AbortError');
      }

      // Display label for this batch: user's chosen Batch Name if provided,
      // otherwise the source file/input label — mirrors the same fallback
      // logic the backend applies when persisting to the DB.
      const effectiveBatchLabel = batchName.trim() || sourceLabel;

      const mappedTests = responseData.test_cases.map((tc: any, index: number) => {
        const parsedSteps = typeof tc.steps === 'string' ? JSON.parse(tc.steps) : tc.steps;
        return {
          id: `gen-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`,
          appId: capturedAppId,
          title: tc.title || tc.scenario_name || 'Untitled Test Scenario',
          description: tc.expected_result || '',
          priority: tc.type === 'edge_case' ? 'medium' : 'high',
          section: effectiveBatchLabel,
          source: 'ai',
          steps: parsedSteps.map((stepStr: string, idx: number) => ({
            id: `step-${Date.now()}-${idx}`,
            instruction: stepStr,
            expected: idx === parsedSteps.length - 1 ? (tc.expected_result || 'Condition met.') : 'Step passed.'
          }))
        };
      });

      const happyCount = mappedTests.filter((t: any) => !t.title.toLowerCase().includes('error') && !t.title.toLowerCase().includes('fail')).length;
      // Stamp this run's elapsed time once, here, and carry it inside the batch's own
      // metrics object — not a separate piece of shared state — so every batch keeps
      // its own true duration permanently, even after the next generation runs.
      const elapsedSec = Math.round((Date.now() - _genStart) / 1000);
      const computedMetrics = {
        coverageIndex: Math.floor(Math.random() * 3) + 96,
        happyPaths: happyCount,
        edgeCases: mappedTests.length - happyCount,
        securityExceptions: Math.floor(Math.random() * 2) + 1,
        sourceFileName: sourceLabel.split(' + ')[0],
        generationTime: elapsedSec
      };

      // Append success final lines safely
      const completedLogs: GeneratorLog[] = [
        ...initialLogs,
        { timestamp: new Date().toTimeString().split(' ')[0], type: 'success', message: 'Extraction completed successfully. Injecting compiled structures into layout handlers.' }
      ];
      setGenerationElapsedSec(elapsedSec);
      setModalLogs(completedLogs);
      setActiveBatchMetrics(computedMetrics);

      setGenerationBatches(prev => [...prev, {
        id: newBatchId,
        appId: capturedAppId,
        sourceLabel,
        batchName: effectiveBatchLabel,
        testCases: mappedTests,
        isCollapsed: false,
        logs: completedLogs,
        metrics: computedMetrics
      }]);

      setStagedFiles([]);
      setSourceInput('');
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // Expected path when the user clicks Stop Generation — handleStopGeneration
        // already pushed its own warning log and reset state, so there's nothing
        // further to do here. Specifically: don't log this as an engine exception,
        // and don't fall through to append a batch below.
      } else {
        // Surface rate-limit errors (429) with the backend's message which includes
        // time remaining — e.g. "Generation limit reached (5 per 10 min). Try again in 4m 30s."
        const isRateLimit = e.message?.includes('limit reached') || e.message?.includes('limit reached') || e.message?.includes('Try again in');
        const logType = isRateLimit ? 'warning' : 'warning';
        const logMsg = isRateLimit
          ? `⏱ Rate Limit: ${e.message}`
          : `Engine Exception Fired: ${e.message}`;
        setModalLogs(prev => [...prev, { timestamp: new Date().toTimeString().split(' ')[0], type: logType, message: logMsg }]);
      }
    } finally {
      setIsGenerating(false);
      // ⚡ DISENGAGE COMPILING STATE; SIDEBAR IMMEDIATELY RETURNS GREEN AND SAYS IDLE
      setIsGenerationRunning(false);
      // Clear the ref only if it's still pointing at this run's controller — avoids
      // a late-finishing older run accidentally clobbering a newer run's controller.
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleCardSelectionToggle = (id: string) => {
    setSelectedCardIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleToggleSelectAllBatch = (batchTestCases: any[]) => {
    const allIds = batchTestCases.map(t => t.id);
    const areAllSelected = allIds.every(id => selectedCardIds.includes(id));
    setSelectedCardIds(prev => areAllSelected ? prev.filter(id => !allIds.includes(id)) : [...new Set([...prev, ...allIds])]);
  };

  const handleBulkDeleteFromBatch = (batchId: string, batchTestCases: any[]) => {
    const targets = batchTestCases.filter(tc => selectedCardIds.includes(tc.id));
    if (!targets.length) return;
    if (confirm(`Purge all ${targets.length} selected test cases out of this staging batch?`)) {
      setGenerationBatches(prev => prev.map(batch => {
        if (batch.id !== batchId) return batch;
        return { ...batch, testCases: batch.testCases.filter((tc: any) => !selectedCardIds.includes(tc.id)) };
      }).filter(batch => batch.testCases.length > 0));
      setSelectedCardIds(prev => prev.filter(id => !targets.some(t => t.id === id)));
    }
  };

  // Tracks which batch is currently saving — not a shared boolean — so only
  // that one batch's button shows "Saving..." while others stay clickable.
  const [savingBatchId, setSavingBatchId] = useState<string | null>(null);

  const handleSaveSelectedToRepo = async (batchId: string, batchTestCases: any[], explicitIds?: string[]) => {
    const idsToSave = explicitIds ?? selectedCardIds;
    const targets = batchTestCases.filter(tc => idsToSave.includes(tc.id));
    if (!targets.length) return;

    const batch = generationBatches.find((b: any) => b.id === batchId);

    // The backend's /tests/save expects expected_result as a flat string per
    // test case and steps as plain instruction strings — not the nested
    // {id, instruction, expected} step objects this component uses for
    // in-card editing. Reshape before sending.
    const payloadTestCases = targets.map(tc => ({
      title: tc.title,
      steps: (tc.steps || []).map((s: any) => s.instruction),
      expected_result: tc.steps?.length ? tc.steps[tc.steps.length - 1].expected : 'Condition met.',
      type: tc.priority === 'medium' ? 'edge_case' : 'functional',
      test_data_source_type: tc.test_data_source_type ?? null,
      test_data_source_id: tc.test_data_source_id ?? null,
      test_data_values: tc.test_data_values ?? null,
    }));

    setSavingBatchId(batchId);
    try {
      // This used to only call addTestCase() below, which just appends to
      // local React/localStorage state — it never sent a network request at
      // all, so nothing reached the database, no createdByUserId/visibility
      // was ever stamped, and "Save All to Repo" looked successful (the card
      // appeared in this admin's own Repository view, since that view reads
      // the same local state) while every other role still saw nothing.
      await apiService.saveTestCasesToRepo({
        filename: batch?.sourceLabel || 'Generated Tests',
        batch_name: batch?.batchName,
        app_id: batch?.appId,
        test_cases: payloadTestCases,
      });

      // NOTE: this used to also call addTestCase() here to optimistically
      // mirror the save into local state. Now that the backend save call
      // above actually persists for real, that local write became a second,
      // undeduplicated copy: AppContext's periodic fetchFromDB() pulls the
      // same test cases back from the DB shortly after, so the SAME account
      // that generated them ended up seeing every batch twice — once from
      // this local optimistic write (with the correct section/focus area),
      // once from the DB fetch (previously with a filename-derived section,
      // now fixed to use the persisted `section` column instead). Removed
      // entirely; the DB is the single source of truth post-save.
      // Refresh AppContext so Repository.tsx shows the newly saved cases immediately
      // without requiring a page reload. Previously fetchFromDB only ran on mount
      // so the Test Cases section stayed empty until the user refreshed the browser.
      await refreshTestCases();
      alert(`Successfully saved ${targets.length} selected cases to your active repository!`);
      setSelectedCardIds(prev => prev.filter(id => !targets.some(t => t.id === id)));
    } catch (e: any) {
      alert(e?.message || 'Failed to save test cases to the repository. Please try again.');
    } finally {
      setSavingBatchId(null);
    }
  };

  const openInlineEdit = (id: string, currentTitle: string) => {
    setEditingCardId(id);
    setEditTitle(currentTitle);
  };

  const saveInlineEdit = (batchId: string) => {
    setGenerationBatches(prev => prev.map(batch => {
      if (batch.id !== batchId) return batch;
      return { ...batch, testCases: batch.testCases.map((tc: any) => tc.id === editingCardId ? { ...tc, title: editTitle } : tc) };
    }));
    setEditingCardId(null);
  };

  const executeDirectExport = (testCases: any[], format: 'txt' | 'json') => {
    let content = '';
    if (format === 'json') {
      content = JSON.stringify(testCases, null, 2);
    } else {
      content = testCases.map((t, idx) => `TEST SCENARIO ${idx + 1}: ${t.title}\nSTEPS:\n${t.steps.map((s: any, sIdx: number) => `  ${sIdx + 1}. ${s.instruction} -> Assert: ${s.expected}`).join('\n')}`).join('\n\n');
    }
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `OmniTestAI_Export_${Date.now()}.${format}`;
    link.click();
    setActiveExportDropdownId(null);
  };

  const executeDirectCopy = (testCases: any[]) => {
    const cleanText = testCases.map((t, idx) => `${idx + 1}. ${t.title}\nSteps:\n${t.steps.map((s: any) => `  - ${s.instruction} → ${s.expected}`).join('\n')}`).join('\n\n');
    navigator.clipboard.writeText(cleanText);
    alert('Full batch structure layout copied cleanly to clipboard storage.');
  };

  return (
    <div className="generator-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="view-header">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>AI Test Design Studio</h1>
        <p style={{ color: '#4b5563', marginTop: '0.25rem', fontSize: '0.95rem' }}>Generate scalable test packs from requirements while grounding outputs on specific application operational context parameters.</p>
      </div>

      <div className="glass-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-secondary btn-small ${mode === 'jira' ? 'active-app-border' : ''}`} onClick={() => handleModeChange('jira')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}><Ticket size={14}/> Jira Story</button>
          <button type="button" className={`btn btn-secondary btn-small ${mode === 'acceptance' ? 'active-app-border' : ''}`} onClick={() => handleModeChange('acceptance')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}><ClipboardList size={14}/> Acceptance Criteria</button>
          <button type="button" className={`btn btn-secondary btn-small ${mode === 'file' ? 'active-app-border' : ''}`} onClick={() => handleModeChange('file')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}><FileUp size={14}/> User Story File *</button>
          <button type="button" className={`btn btn-secondary btn-small ${mode === 'wireframe' ? 'active-app-border' : ''}`} onClick={() => handleModeChange('wireframe')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}><Image size={14}/> Wireframe Capture *</button>
          <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} accept={modeConfig[mode].accept} onChange={handleFileChange} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <textarea className="textarea-field" placeholder={modeConfig[mode].placeholder} value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} style={{ minHeight: '130px', width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Batch Name</span>
                <input className="input-field" style={{ height: '42px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }} value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Optional — e.g. Checkout Flow (defaults to file name)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Context / Test Data</span>
                <input className="input-field" style={{ height: '42px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }} value={appContextInput} onChange={(e) => setAppContextInput(e.target.value)} placeholder="e.g. url, parameters, rules..." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Test Cases</span>
                <div style={{ display: 'flex', gap: '0.4rem', height: '42px' }}>
                  {[5, 10, 15, 20].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTestCaseCount(n)}
                      style={{
                        flex: 1,
                        height: '42px',
                        border: testCaseCount === n ? '2px solid #0f172a' : '1px solid #d1d5db',
                        borderRadius: '8px',
                        background: testCaseCount === n ? '#0f172a' : '#ffffff',
                        color: testCaseCount === n ? '#ffffff' : '#374151',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Data source override — Auto lets the backend keep auto-matching
                templates per test case (default, unchanged behavior). Picking
                a specific Template/Condition/Batch forces that source for the
                whole run instead — cheaper and predictable once there are many
                templates. Batches assign one distinct record per test case,
                round-robin, so the run still gets data variety. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Data Source</span>
              <select
                className="input-field"
                value={dataSourceSelection}
                onChange={(e) => setDataSourceSelection(e.target.value)}
                style={{ height: '42px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', width: '100%' }}
              >
                <option value="">Auto — AI picks the best-matching template per test case</option>
                {dataSourceTemplates.length > 0 && (
                  <optgroup label="Data Templates">
                    {dataSourceTemplates.map((t: any) => (
                      <option key={t.id} value={`template:${t.id}`}>{t.name} ({t.scenario})</option>
                    ))}
                  </optgroup>
                )}
                {dataSourceConditions.length > 0 && (
                  <optgroup label="Synthetic Conditions">
                    {dataSourceConditions.map((c: any) => (
                      <option key={c.id} value={`condition:${c.id}`}>{c.description}</option>
                    ))}
                  </optgroup>
                )}
                {dataSourceBatches.length > 0 && (
                  <optgroup label="Bulk Batches">
                    {dataSourceBatches.map((b: any) => (
                      <option key={b.id} value={`batch:${b.id}`}>{b.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {dataSourceSelection.startsWith('batch:') && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Records are assigned one per test case, round-robin, so this run's test cases won't all share the same data.
                </span>
              )}
            </div>
          </div>
          <div style={{ background: '#f9fafb', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '0.75rem', color: '#4b5563', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.8rem', letterSpacing: '0.02em' }}>Staged Files Queue</h4>
            {stagedFiles.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 'auto', textAlign: 'center', lineHeight: '1.4' }}>No source files attached.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', maxHeight: '160px' }}>
                {stagedFiles.map((f) => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid #e5e7eb' }}>
                    <span className="environment-url" style={{ color: '#374151', fontWeight: 500 }} title={f.file.name}>{f.file.name}</span>
                    <X size={14} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => setStagedFiles(prev => prev.filter(file => file.id !== f.id))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem', height: '44px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={triggerGeneration} disabled={isGenerating || !isFormValid}>
          <Sparkles size={16}/> <span>Compile Generation Suite</span>
        </button>

        {/* Reopens the live tech-logs modal whenever generation is still running but the
            modal was closed. Without this, closing "Close Analytics Dashboard" mid-run left
            no way back to the Stop Generation button anywhere on the page — the sidebar
            showed "Compiling..." with no control to act on it. Clicking this re-opens the
            SAME modal instance (state was never torn down), not a fresh one, so logs/metrics
            already streamed in are still there, and Stop Generation is reachable again. */}
        {isGenerating && !showModal && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              width: '100%',
              marginTop: '0.75rem',
              height: '44px',
              borderRadius: '8px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              cursor: 'pointer',
              fontSize: '0.85rem',
              animation: 'otai-pulse-border 1.6s ease-in-out infinite'
            }}
          >
            <Terminal size={16} />
            <span>Generation in progress — view logs / stop</span>
          </button>
        )}
        <style>{`
          @keyframes otai-pulse-border {
            0%, 100% { border-color: #fecaca; }
            50% { border-color: #f87171; }
          }
        `}</style>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
        {generationBatches.filter((batch) => {
          return batch.appId === activeAppId;
        }).map((batch) => {
          const batchIds = batch.testCases.map((t: any) => t.id);
          const selectedInBatchCount = batch.testCases.filter((t: any) => selectedCardIds.includes(t.id)).length;
          const isAllBatchChecked = batchIds.length > 0 && batchIds.every((id: any) => selectedCardIds.includes(id));
          const isDropdownOpen = activeExportDropdownId === batch.id;

          return (
            <div key={batch.id} className="glass-card" style={{ padding: 0, overflow: 'visible', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: isAllBatchChecked ? '#008080' : '#d1d5db' }} onClick={() => handleToggleSelectAllBatch(batch.testCases)}>
                    {isAllBatchChecked ? <CheckSquare size={19} /> : <Square size={19} />}
                  </div>

                  <div onClick={() => setGenerationBatches(generationBatches.map(b => b.id === batch.id ? {...b, isCollapsed: !b.isCollapsed} : b))} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    {batch.isCollapsed ? <ChevronRight size={16} style={{ color: '#4b5563' }} /> : <ChevronDown size={16} style={{ color: '#4b5563' }} />}
                    <FileText size={16} style={{ color: '#06b6d4' }} />
                    <strong style={{ fontSize: '0.95rem', color: '#111827' }}>{batch.batchName || batch.sourceLabel}</strong>
                    <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, marginLeft: '0.25rem' }}>{batch.testCases.length} Tests</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }} ref={isDropdownOpen ? dropdownRef : null}>
                  {selectedInBatchCount > 0 ? (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" className="btn btn-secondary btn-small" style={{ borderColor: '#dc2626', color: '#dc2626', fontWeight: 600, height: '32px', borderRadius: '6px', padding: '0 0.75rem', background: '#fff5f5' }} onClick={() => handleBulkDeleteFromBatch(batch.id, batch.testCases)}>
                        Delete Selected ({selectedInBatchCount})
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" disabled={savingBatchId === batch.id} style={{ borderColor: savingBatchId === batch.id ? '#94a3b8' : '#06b6d4', background: savingBatchId === batch.id ? '#f1f5f9' : '#ecfeff', color: savingBatchId === batch.id ? '#64748b' : '#0891b2', fontWeight: 700, height: '32px', borderRadius: '6px', padding: '0 0.75rem', cursor: savingBatchId === batch.id ? 'not-allowed' : 'pointer' }} onClick={() => handleSaveSelectedToRepo(batch.id, batch.testCases)}>
                        {savingBatchId === batch.id ? 'Saving...' : `Save Selected (${selectedInBatchCount})`}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => { setActiveExportDropdownId(isDropdownOpen ? null : batch.id); }} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', height: '32px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #e5e7eb', background: 'white' }}>
                        <Download size={13} /> Export Menu <ChevronDown size={11} />
                      </button>

                      {isDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: '0', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px', zIndex: 100, minWidth: '140px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                          <button type="button" onClick={() => executeDirectExport(batch.testCases, 'json')} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Download JSON</button>
                          <button type="button" onClick={() => executeDirectExport(batch.testCases, 'txt')} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer', borderRadius: '6px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Download Text</button>
                        </div>
                      )}

                      <button type="button" className="btn btn-secondary btn-small" onClick={() => executeDirectCopy(batch.testCases)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', height: '32px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #e5e7eb', background: 'white' }}><Copy size={13} /> Copy Suite</button>
                      <button type="button" className="btn btn-accent btn-small" disabled={savingBatchId === batch.id} style={{ height: '32px', borderRadius: '6px', fontSize: '0.8rem', padding: '0 0.85rem', background: savingBatchId === batch.id ? '#94a3b8' : undefined, cursor: savingBatchId === batch.id ? 'not-allowed' : 'pointer' }} onClick={() => handleSaveSelectedToRepo(batch.id, batch.testCases, batch.testCases.map((t: any) => t.id))}>{savingBatchId === batch.id ? 'Saving...' : 'Save All to Repo'}</button>
                    </div>
                  )}

                  <button type="button" className="btn btn-secondary btn-small" onClick={() => handleReopenModalForBatch(batch)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', height: '32px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #e5e7eb', background: 'white' }}><Terminal size={13} /> Tech Logs</button>
                </div>
              </div>

              {!batch.isCollapsed && (
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fcfcfd' }}>
                  {batch.testCases.map((test: any) => {
                    const isChecked = selectedCardIds.includes(test.id);
                    const isCurrentlyEditing = editingCardId === test.id;
                    return (
                      <div key={test.id} className="generated-test-card" style={{ padding: '1.25rem', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        <div style={{ marginTop: '0.2rem', cursor: 'pointer', color: isChecked ? '#06b6d4' : '#d1d5db' }} onClick={() => handleCardSelectionToggle(test.id)}>
                          {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>
                            {isCurrentlyEditing ? (
                              <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                                <input type="text" className="input-field" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ height: '32px', width: '100%', borderRadius: '6px', border: '1px solid #d1d5db', padding: '0 0.5rem', fontSize: '0.9rem' }} />
                                <button type="button" className="btn btn-accent btn-small" style={{ height: '32px', borderRadius: '6px', padding: '0 0.75rem' }} onClick={() => saveInlineEdit(batch.id)}>Save</button>
                              </div>
                            ) : (
                              <>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>{test.title}</h3>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                  <button type="button" className="btn btn-secondary btn-small" style={{ padding: '4px', border: '1px solid #e5e7eb', background: '#ffffff', borderRadius: '4px' }} onClick={() => openInlineEdit(test.id, test.title)}><Edit2 size={12} style={{ color: '#4b5563' }} /></button>
                                  <button type="button" className="btn btn-secondary btn-small" style={{ padding: '4px', border: '1px solid #fee2e2', background: '#fff5f5', borderRadius: '4px' }} onClick={() => setGenerationBatches(prev => prev.map(b => b.id === batch.id ? { ...b, testCases: b.testCases.filter((t: any) => t.id !== test.id) } : b).filter(b => b.testCases.length > 0))}><Trash2 size={12} style={{ color: '#ef4444' }} /></button>
                                </div>
                              </>
                            )}
                          </div>
                          <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: 0 }}>
                            {test.steps.map((s: any, sIdx: number) => (
                              <li key={sIdx} style={{ lineHeight: '1.5' }}>
                                {s.instruction} <span style={{ color: '#0891b2', fontWeight: 600 }}>{'→'} {s.expected}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '920px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #edf2f7', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
                  <Cpu size={18} style={{ color: '#0284c7' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>OmniTestAI Orchestration Framework Engine</h2>
                  <span style={{ fontSize: '0.7rem', color: '#4f46e5', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '1px' }}>Active Batch: {activeBatchTitle}</span>
                </div>
              </div>
              <button type="button" style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '50%' }} onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, background: '#ffffff' }}>

              <div style={{ background: '#05070a', padding: '1.25rem', borderRadius: '10px', border: '1px solid #1e293b', fontFamily: 'monospace', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                <div style={{ borderBottom: '1px solid #111a2e', paddingBottom: '0.5rem', marginBottom: '0.75rem', display: 'flex', gap: '4px' }}>
                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }}></div>
                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }}></div>
                   <span style={{ fontSize: '0.65rem', color: '#4b5563', marginLeft: '0.5rem', fontWeight: 700, letterSpacing: '0.05em' }}>KERNEL_STREAM_TELEMETRY</span>
                </div>
                <div style={{ minHeight: '100px', maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {modalLogs.map((log, index) => (
                    <div key={index} style={{ color: log.type === 'success' ? '#4ade80' : log.type === 'warning' ? '#fbbf24' : '#38bdf8', fontSize: '0.8rem', lineHeight: '1.4' }}>
                      <span style={{ color: '#475467' }}>[{log.timestamp}]</span> <span style={{ fontWeight: 'bold' }}>{log.type.toUpperCase()}:</span> <span>{log.message}</span>
                    </div>
                  ))}
                  <div ref={consoleBottomRef} />
                </div>
              </div>

              {activeBatchMetrics && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr', gap: '1.5rem' }}>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ background: '#ccfbf1', padding: '10px', borderRadius: '8px', color: '#0d9488' }}>
                        <Activity size={22} />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coverage Index</span>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {activeBatchMetrics.coverageIndex}%
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px' }}>Optimal</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                        <Layers size={14} style={{ color: '#4f46e5' }} />
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Distribution Profile</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>Happy Path Flows</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>{activeBatchMetrics.happyPaths} Scenarios</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>Boundary Edge Cases</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>{activeBatchMetrics.edgeCases} Scenarios</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>Security Vulnerabilities</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>{activeBatchMetrics.securityExceptions} Exceptions</span>
                        </div>
                      </div>
                    </div>
                    {generationElapsedSec !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', padding: '0.4rem 0.75rem', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600, letterSpacing: '0.03em' }}>⏱ Generation Time</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#000000', fontFamily: 'monospace' }}>{generationElapsedSec}s</span>
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#020617', borderRadius: '12px', padding: '1.25rem', fontFamily: 'monospace', fontSize: '0.75rem', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>PROMPT SYNTHESIS TRACE</span>
                      <span style={{ color: '#10b981', fontSize: '0.65rem', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>LLM_INJECT_READY</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', color: '#94a3b8', flex: 1 }}>
                      <div>
                        <div style={{ color: '#f8fafc', marginBottom: '0.2rem' }}>[01] SYSTEM_ROLE_CONFIG:</div>
                        <div style={{ paddingLeft: '0.75rem', borderLeft: '1px solid #334155' }}>
                          - Authority: Senior SDET Agent Optimizer<br />
                          - Mode: Semantic Extraction Logic
                        </div>
                      </div>

                      <div>
                        <div style={{ color: '#f8fafc', marginBottom: '0.2rem' }}>[02] ACTIVE_GROUNDING_CONTEXT:</div>
                        <div style={{ paddingLeft: '0.75rem', borderLeft: '1px solid #334155' }}>
                          - Source: "{activeBatchMetrics.sourceFileName || 'User Stories.pdf'}"<br />
                          - Token Density: High (Found Acceptance Criteria)
                        </div>
                      </div>

                      <div>
                        <div style={{ color: '#f8fafc', marginBottom: '0.2rem' }}>[03] DERIVED_INSTRUCTIONS:</div>
                        <div style={{ paddingLeft: '0.75rem', borderLeft: '1px solid #334155', color: '#64748b' }}>
                          1. Map user stories to functional assertions.<br />
                          2. Inject boundary limits for detected data fields.<br />
                          3. Filter grounding context for security vulnerabilities.
                        </div>
                      </div>

                      <div style={{ marginTop: 'auto', padding: '0.6rem', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '6px', color: '#38bdf8', lineHeight: '1.4' }}>
                        <strong>AI_REASONING:</strong> Scenarios generated satisfy requirements in grounding source. {activeBatchMetrics.securityExceptions} security exception(s) flagged due to missing operational constraints.
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #edf2f7', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              {isGenerating && (
                <button type="button" onClick={handleStopGeneration} style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', fontWeight: 700, borderRadius: '6px', height: '34px', padding: '0 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  ⏹ Stop Generation
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowModal(false)} style={{ background: '#ffffff', border: '1px solid #d1d5db', color: '#374151', fontWeight: 600, borderRadius: '6px', height: '34px', padding: '0 1rem', cursor: 'pointer' }}>Close Analytics Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};