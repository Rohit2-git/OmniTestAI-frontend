import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { TestCase } from '../types';
import { ClipboardCheck, CheckCircle, Save, Sparkles, Ticket, ClipboardList, Database } from 'lucide-react';

type GenerationMode = 'jira' | 'acceptance';

interface GeneratorLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'step';
  message: string;
}

export const Generator: React.FC = () => {
  const { applications, activeAppId, addTestCase, knowledgeAssets } = useApp();
  const [mode, setMode] = useState<GenerationMode>('jira');
  const [sourceInput, setSourceInput] = useState('');
  const [focusArea, setFocusArea] = useState('Critical user journey');
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [logs, setLogs] = useState<GeneratorLog[]>([]);
  const [generatedTests, setGeneratedTests] = useState<Omit<TestCase, 'id' | 'createdAt'>[]>([]);

  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const activeApp = applications.find((app) => app.id === activeAppId);
  const appKnowledgeAssets = useMemo(
    () => knowledgeAssets.filter((asset) => asset.appId === activeAppId),
    [knowledgeAssets, activeAppId]
  );

  const pushLog = (type: GeneratorLog['type'], message: string) => {
    const timestamp = new Date().toTimeString().split(' ')[0];
    setLogs((prev) => [...prev, { timestamp, type, message }]);
    queueMicrotask(() => {
      consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const buildSteps = (input: string, usesKnowledge: boolean) => {
    const hint = usesKnowledge ? 'using linked knowledge assets' : 'using base product heuristics';
    if (mode === 'jira') {
      return [
        { id: `jira-1-${Date.now()}`, instruction: `Open story scope from: ${input}`, expected: 'Scope and acceptance blocks are parsed' },
        { id: `jira-2-${Date.now()}`, instruction: `Validate happy path flow for ${focusArea}`, expected: `Primary journey passes with deterministic assertions (${hint})` },
        { id: `jira-3-${Date.now()}`, instruction: 'Validate edge conditions and permission boundaries', expected: 'System returns expected errors and guardrails' }
      ];
    }

    return [
      { id: `ac-1-${Date.now()}`, instruction: 'Parse acceptance criteria into Given-When-Then checkpoints', expected: 'Criteria transformed into executable steps' },
      { id: `ac-2-${Date.now()}`, instruction: `Execute acceptance flow for ${focusArea}`, expected: `Each acceptance condition is asserted (${hint})` },
      { id: `ac-3-${Date.now()}`, instruction: 'Execute negative assertions from implied constraints', expected: 'Error states and fallback behavior are verified' }
    ];
  };

  const simulateGeneration = async () => {
    if (!activeAppId || !sourceInput.trim()) return;

    setIsGenerating(true);
    setGeneratedTests([]);
    setSaveStatus('idle');
    setLogs([]);

    const usesKnowledge = appKnowledgeAssets.length > 0;
    pushLog('info', `Preparing AI planner for ${activeApp?.name || 'selected app'}`);
    await new Promise((resolve) => setTimeout(resolve, 450));
    pushLog('step', mode === 'jira' ? 'Reading Jira story structure and dependencies' : 'Reading acceptance criteria blocks and constraints');
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (usesKnowledge) {
      pushLog('step', `Merging ${appKnowledgeAssets.length} knowledge assets into generation context`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      pushLog('warning', 'No app-level knowledge assets detected. Generation will rely on generic product patterns');
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    pushLog('info', `Building scalable test packs with focus area: ${focusArea}`);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const generated: Omit<TestCase, 'id' | 'createdAt'>[] = [
      {
        appId: activeAppId,
        title: mode === 'jira' ? 'Jira Story Flow Verification' : 'Acceptance Criteria End-to-End Validation',
        description: mode === 'jira'
          ? 'AI-generated test from Jira story context and linked assets.'
          : 'AI-generated test from supplied acceptance criteria and supporting project context.',
        priority: 'high',
        source: mode === 'jira' ? 'ai-jira' : 'ai-acceptance',
        sourceReference: sourceInput.trim(),
        section: mode === 'jira' ? 'Story Validation' : 'Acceptance Coverage',
        steps: buildSteps(sourceInput.trim(), usesKnowledge)
      },
      {
        appId: activeAppId,
        title: mode === 'jira' ? 'Story Risk Guardrail Assertions' : 'Acceptance Boundary Regression Pack',
        description: 'Companion AI test focused on failure handling, rollback behavior, and validation constraints.',
        priority: 'medium',
        source: mode === 'jira' ? 'ai-jira' : 'ai-acceptance',
        sourceReference: sourceInput.trim(),
        section: 'Risk & Resilience',
        steps: [
          { id: `risk-1-${Date.now()}`, instruction: 'Trigger constrained input path', expected: 'Validation blocks invalid submission' },
          { id: `risk-2-${Date.now()}`, instruction: 'Force backend timeout simulation', expected: 'Graceful fallback message is shown' },
          { id: `risk-3-${Date.now()}`, instruction: 'Re-run the primary action after recovery', expected: 'Flow returns to a stable successful state' }
        ]
      }
    ];

    setGeneratedTests(generated);
    pushLog('success', `Generation complete. ${generated.length} AI test cases are ready for repository commit.`);
    setIsGenerating(false);
  };

  const handleSaveToRepository = () => {
    if (!generatedTests.length) return;

    setSaveStatus('saving');
    generatedTests.forEach((testCase) => {
      addTestCase(testCase);
    });

    setTimeout(() => {
      setSaveStatus('saved');
      setGeneratedTests([]);
    }, 600);
  };

  return (
    <div className="generator-view">
      <div className="view-header">
        <h1>AI Test Design Studio</h1>
        <p>Generate scalable test packs from Jira stories or acceptance criteria while grounding output on project knowledge assets.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1.5rem' }}>
          <p>Select or create an application to enable AI generation.</p>
        </div>
      ) : (
        <div className="generator-split" style={{ marginTop: '1.5rem' }}>
          <div className="glass-card generator-prompt-pane">
            <h3>Generation Input</h3>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className={`btn btn-secondary btn-small ${mode === 'jira' ? 'active-app-border' : ''}`}
                onClick={() => setMode('jira')}
              >
                <Ticket size={14} />
                <span>Jira Story</span>
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-small ${mode === 'acceptance' ? 'active-app-border' : ''}`}
                onClick={() => setMode('acceptance')}
              >
                <ClipboardList size={14} />
                <span>Acceptance Criteria</span>
              </button>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ai-source-input">
                {mode === 'jira' ? 'Jira Story Link / Story Body' : 'Acceptance Criteria'}
              </label>
              <textarea
                id="ai-source-input"
                className="textarea-field"
                value={sourceInput}
                onChange={(event) => setSourceInput(event.target.value)}
                placeholder={mode === 'jira'
                  ? 'Paste Jira URL, story summary, and acceptance notes'
                  : 'Paste the acceptance criteria text you want converted to tests'}
                style={{ minHeight: '140px' }}
                disabled={isGenerating}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="focus-area">Focus Area</label>
              <input
                id="focus-area"
                className="input-field"
                value={focusArea}
                onChange={(event) => setFocusArea(event.target.value)}
                placeholder="e.g. checkout, auth, transfer, onboarding"
                disabled={isGenerating}
              />
            </div>

            <div className="glass-card" style={{ padding: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <Database size={14} />
                <strong style={{ fontSize: '0.9rem' }}>Knowledge Context</strong>
              </div>
              <p style={{ fontSize: '0.85rem' }}>
                {appKnowledgeAssets.length > 0
                  ? `${appKnowledgeAssets.length} assets available from Knowledge Space and included in generation context.`
                  : 'No assets found. Add docs/links/images in Knowledge Space to improve coverage quality.'}
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={simulateGeneration}
              disabled={isGenerating || !sourceInput.trim()}
            >
              <ClipboardCheck size={18} />
              <span>{isGenerating ? 'Generating...' : 'Generate AI Test Pack'}</span>
            </button>
          </div>

          <div className="generator-output-pane">
            <div className="glass-card generator-console">
              <div className="console-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={15} />
                  <span>Reasoning Console</span>
                </div>
              </div>

              <div className="console-container" style={{ flex: 1, minHeight: '140px' }}>
                {logs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>Console idle. Configure source input and start generation.</p>
                ) : (
                  logs.map((log, index) => (
                    <div key={`${log.timestamp}-${index}`} className="console-log-line">
                      <span className="console-timestamp">[{log.timestamp}]</span>
                      <span className={`console-type-${log.type}`}>{log.type.toUpperCase()}:</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleBottomRef} />
              </div>
            </div>

            <div className="glass-card generator-results" style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>Generated Tests</h3>
                {!!generatedTests.length && (
                  <button
                    type="button"
                    className="btn btn-accent btn-small"
                    disabled={saveStatus === 'saving'}
                    onClick={handleSaveToRepository}
                  >
                    {saveStatus === 'saved' ? (
                      <>
                        <CheckCircle size={14} />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Save To Repository</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {!generatedTests.length ? (
                <p style={{ color: 'var(--text-muted)' }}>No generated tests yet.</p>
              ) : (
                <div className="test-list-grid">
                  {generatedTests.map((testCase, index) => (
                    <div key={`${testCase.title}-${index}`} className="generated-test-card">
                      <div className="generated-test-header">
                        <strong>{testCase.title}</strong>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <span className="badge badge-purple">{testCase.section}</span>
                          <span className="badge badge-info">{testCase.source}</span>
                        </div>
                      </div>
                      <p style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>{testCase.description}</p>
                      <ol className="generated-steps-summary">
                        {testCase.steps.map((step) => (
                          <li key={step.id}>{step.instruction} {'->'} {step.expected}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
