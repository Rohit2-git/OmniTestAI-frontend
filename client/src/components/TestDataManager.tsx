import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import {
  Plus, Trash2, Loader2, Sparkles,
  X, Eye, EyeOff, ChevronDown, ChevronRight, Wand2, Info, Tag, LayoutTemplate, Layers, Table,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface TestDataTemplate {
  id: string;
  appId: string;
  name: string;
  scenario: string;
  fields: Record<string, string>;
  type: 'template';
}

interface TestDataCondition {
  id: string;
  appId: string;
  description: string;
  resolvedFields: string[];
  isDefault: boolean;
  createdAt: string;
  type: 'condition';
}

interface SyntheticBatch {
  id: string;
  appId: string;
  sourceTemplateId: string;
  sourceTemplateName: string;
  name: string;
  recordCount: number;
  records: Record<string, string>[];
  createdAt: string;
  type: 'batch';
}

interface FieldRow {
  key: string;
  value: string;
}

// Common scenario suggestions shown as quick-fill chips
const SCENARIO_SUGGESTIONS = [
  'login', 'checkout', 'registration', 'address form',
  'payment', 'search', 'profile update', 'admin',
];

// ── Component ──────────────────────────────────────────────────────────────

export const TestDataManager: React.FC = () => {
  const { applications, activeAppId } = useApp();
  const activeApp = applications.find((a) => a.id === activeAppId);

  const [activeTab, setActiveTab] = useState<'templates' | 'conditions'>('templates');
  const [templates, setTemplates] = useState<TestDataTemplate[]>([]);
  const [conditions, setConditions] = useState<TestDataCondition[]>([]);
  const [batches, setBatches] = useState<SyntheticBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Bulk record generation form state
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [bulkCount, setBulkCount] = useState<number>(20);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Records-table modal for a batch (the Eye button opens this)
  const [viewingBatch, setViewingBatch] = useState<SyntheticBatch | null>(null);

  // Template form state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateScenario, setNewTemplateScenario] = useState('');
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([
    { key: 'name', value: '' },
    { key: 'email', value: '' },
  ]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Condition form state
  const [showConditionForm, setShowConditionForm] = useState(false);
  const [newConditionText, setNewConditionText] = useState('');
  const [savingCondition, setSavingCondition] = useState(false);

  // Preview / expand state
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!activeAppId) return;
    setLoading(true);
    try {
      const [t, c, b] = await Promise.all([
        apiService.listTestDataTemplates(activeAppId),
        apiService.listTestDataConditions(activeAppId),
        apiService.listSyntheticBatches(activeAppId),
      ]);
      setTemplates(t || []);
      setConditions(c || []);
      setBatches(b || []);
    } catch (err) {
      console.error('Failed to load test data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAppId]);

  useEffect(() => {
    loadData();
    setShowTemplateForm(false);
    setShowConditionForm(false);
    setShowBulkForm(false);
    setPreviewingId(null);
    setPreviewValues(null);
    setViewingBatch(null);
  }, [loadData]);

  // ── Field row helpers ─────────────────────────────────────────────────────

  const handleAddFieldRow = () => setFieldRows(r => [...r, { key: '', value: '' }]);
  const handleFieldRowChange = (i: number, field: 'key' | 'value', val: string) =>
    setFieldRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const handleRemoveFieldRow = (i: number) =>
    setFieldRows(rows => rows.filter((_, idx) => idx !== i));

  // ── Template handlers ─────────────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    if (!activeAppId || !newTemplateName.trim() || !newTemplateScenario.trim()) return;
    const validRows = fieldRows.filter(r => r.key.trim());
    if (validRows.length === 0) return;
    const fields: Record<string, string> = {};
    validRows.forEach(r => { fields[r.key.trim()] = r.value; });
    setSavingTemplate(true);
    try {
      await apiService.createTestDataTemplate({
        appId: activeAppId,
        name: newTemplateName.trim(),
        scenario: newTemplateScenario.trim().toLowerCase(),
        fields,
      });
      setNewTemplateName('');
      setNewTemplateScenario('');
      setFieldRows([{ key: 'name', value: '' }, { key: 'email', value: '' }]);
      setShowTemplateForm(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await apiService.deleteTestDataTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) { console.error(err); }
  };

  // ── Condition handlers ────────────────────────────────────────────────────

  const handleSaveCondition = async () => {
    if (!activeAppId || !newConditionText.trim()) return;
    setSavingCondition(true);
    try {
      await apiService.createTestDataCondition({ appId: activeAppId, description: newConditionText.trim() });
      setNewConditionText('');
      setShowConditionForm(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save condition:', err);
    } finally {
      setSavingCondition(false);
    }
  };

  const handleDeleteCondition = async (id: string) => {
    try {
      await apiService.deleteTestDataCondition(id);
      setConditions(prev => prev.filter(c => c.id !== id));
    } catch (err) { console.error(err); }
  };

  const handleSetDefaultCondition = async (id: string) => {
    try {
      await apiService.setDefaultTestDataCondition(id);
      await loadData();
    } catch (err) { console.error(err); }
  };

  // ── Bulk synthetic batch handlers ───────────────────────────────────────

  const handleGenerateBatch = async () => {
    if (!activeAppId || !bulkTemplateId || bulkCount < 1) return;
    setGeneratingBatch(true);
    setBulkError(null);
    try {
      await apiService.createSyntheticBatch({
        appId: activeAppId,
        templateId: bulkTemplateId,
        count: bulkCount,
      });
      setBulkTemplateId('');
      setBulkCount(20);
      setShowBulkForm(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to generate synthetic batch:', err);
      setBulkError(err?.message || 'Generation failed — try again.');
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    try {
      await apiService.deleteSyntheticBatch(id);
      setBatches(prev => prev.filter(b => b.id !== id));
      if (viewingBatch?.id === id) setViewingBatch(null);
    } catch (err) { console.error(err); }
  };

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = async (mode: 'template' | 'condition', id: string) => {
    if (!activeAppId) return;
    if (previewingId === id) { setPreviewingId(null); setPreviewValues(null); return; }
    setPreviewingId(id);
    setPreviewValues(null);
    setPreviewLoading(true);
    try {
      const res = await apiService.previewTestData(activeAppId, mode, id);
      setPreviewValues(res.values || {});
    } catch (err) { console.error(err); }
    finally { setPreviewLoading(false); }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!activeAppId || !activeApp) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Select an application from the sidebar to manage its test data.
        </p>
      </div>
    );
  }

  // ── Shared mini-components ────────────────────────────────────────────────

  const ScenarioBadge = ({ scenario }: { scenario: string }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '99px',
      fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
      background: 'rgba(37, 226, 204, 0.08)', color: 'var(--accent-cyan)',
      border: '1px solid rgba(37, 226, 204, 0.25)',
    }}>
      <Tag size={9} /> {scenario}
    </span>
  );

  const DefaultBadge = () => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '99px',
      fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
      background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)',
      border: '1px solid rgba(139, 92, 246, 0.25)',
    }}>
      Default
    </span>
  );

  const FieldBadge = ({ label }: { label: string }) => (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: '99px',
      fontSize: '0.72rem', fontWeight: 600,
      background: 'rgba(139, 92, 246, 0.07)', color: 'var(--accent-purple)',
      border: '1px solid rgba(139, 92, 246, 0.15)',
      marginRight: '6px', marginBottom: '6px',
    }}>
      {label}
    </span>
  );

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
    marginBottom: '8px', display: 'block',
  };

  const pillBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '6px 16px', borderRadius: '8px',
    border: '1px solid var(--border-light)',
    background: 'var(--bg-card)', color: 'var(--accent-purple)',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s ease',
  };

  const pillBtnActive: React.CSSProperties = {
    ...pillBtn,
    background: 'var(--accent-purple)', color: '#ffffff',
    border: '1px solid var(--accent-purple)',
  };

  const submitBtn = (disabled: boolean): React.CSSProperties => ({
    width: '100%', padding: '14px',
    borderRadius: '10px', border: 'none',
    background: disabled ? 'var(--text-muted)' : 'var(--accent-purple)',
    color: '#ffffff', fontWeight: 700, fontSize: '0.9rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    marginTop: '0.5rem',
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '6px' }}>Test Data</h1>
          <p className="page-subtitle">
            Manage data templates and synthetic conditions for{' '}
            <strong style={{ color: 'var(--text-main)' }}>{activeApp.name}</strong>
          </p>
        </div>
        <button
          type="button"
          style={{ ...(showInfo ? pillBtnActive : pillBtn), marginTop: '4px' }}
          onClick={() => setShowInfo(v => !v)}
        >
          <Info size={13} /> Info
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div style={{
          marginBottom: '2rem', padding: '1.25rem 1.5rem',
          background: 'var(--bg-card)', borderRadius: '12px',
          border: '1px solid var(--border-light)',
          borderLeft: '4px solid var(--accent-cyan)',
        }}>
          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-purple)', margin: '0 0 10px' }}>
            How Test Data works
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-main)' }}>Data Templates</strong> — Create named templates for specific
            scenarios (e.g. "Checkout", "Login"). Each template holds real field values like name, address, card number.
            During generation, the AI automatically picks the best-matching template for each test case based on its title
            and objective — no manual assignment needed. Values are baked verbatim into the step text.
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-main)' }}>Synthetic Conditions</strong> — Describe what fields a test needs
            in plain English. Gemini extracts the field keys and draws realistic fake values from its data bank — a fresh
            record per test case. Best for volume testing where you want varied data, not one real person's values repeated.
            Set one as Default to apply it to the entire app's generation automatically.
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-main)' }}>Bulk Records</strong> — Pick an existing Data Template and a
            record count, and Gemini generates that many distinct records matching the template's fields (e.g. 20 real-looking
            logins from one "Login" template). Select the resulting batch in the AI Test Design data-source picker to spread
            those records across a whole generation run, one per test case.
          </p>
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
        <button type="button" style={activeTab === 'templates' ? pillBtnActive : pillBtn} onClick={() => setActiveTab('templates')}>
          <LayoutTemplate size={13} /> Data Templates
        </button>
        <button type="button" style={activeTab === 'conditions' ? pillBtnActive : pillBtn} onClick={() => setActiveTab('conditions')}>
          <Wand2 size={13} /> Synthetic Conditions
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', padding: '3rem 0' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
        </div>

      ) : activeTab === 'templates' ? (
        <>
          {/* New Template Form */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '14px',
            border: '1px solid var(--border-light)',
            marginBottom: '1.5rem', overflow: 'hidden',
          }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1.25rem 1.5rem', cursor: 'pointer',
                borderBottom: showTemplateForm ? '1px solid var(--border-light)' : 'none',
              }}
              onClick={() => setShowTemplateForm(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Plus size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Add Data Template
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {showTemplateForm ? 'Collapse' : 'Expand'}
              </span>
            </div>

            {showTemplateForm && (
              <div style={{ padding: '1.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  Create a template for a specific test scenario. The AI will automatically assign it to matching test cases during generation.
                </p>

                {/* Template Name */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={sectionLabel}>Template Name</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder='e.g. "Standard Checkout User", "Admin Login"'
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                  />
                </div>

                {/* Scenario */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={sectionLabel}>Scenario</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder='e.g. "checkout", "login", "address form"'
                    value={newTemplateScenario}
                    onChange={e => setNewTemplateScenario(e.target.value)}
                    style={{ marginBottom: '10px' }}
                  />
                  {/* Quick-fill scenario chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {SCENARIO_SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewTemplateScenario(s)}
                        style={{
                          ...pillBtn,
                          padding: '4px 12px', fontSize: '0.75rem',
                          background: newTemplateScenario === s ? 'var(--accent-cyan)' : 'var(--bg-card)',
                          color: newTemplateScenario === s ? '#0a1628' : 'var(--text-muted)',
                          border: `1px solid ${newTemplateScenario === s ? 'var(--accent-cyan)' : 'var(--border-light)'}`,
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fields */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={sectionLabel}>Fields</label>
                  {fieldRows.map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="field key (e.g. name)"
                        value={row.key}
                        onChange={e => handleFieldRowChange(i, 'key', e.target.value)}
                        style={{ flex: '0 0 35%' }}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="value"
                        value={row.value}
                        onChange={e => handleFieldRowChange(i, 'value', e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFieldRow(i)}
                        disabled={fieldRows.length === 1}
                        style={{ ...pillBtn, padding: '6px 10px', flexShrink: 0, opacity: fieldRows.length === 1 ? 0.4 : 1 }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button type="button" style={pillBtn} onClick={handleAddFieldRow}>
                    <Plus size={12} /> Add field
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !newTemplateName.trim() || !newTemplateScenario.trim()}
                  style={submitBtn(savingTemplate || !newTemplateName.trim() || !newTemplateScenario.trim())}
                >
                  {savingTemplate && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  {savingTemplate ? 'Saving Template…' : 'Save Template'}
                </button>
              </div>
            )}
          </div>

          {/* Template list */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={sectionLabel}>
              {templates.length} Template{templates.length !== 1 ? 's' : ''} for {activeApp.name}
            </label>
          </div>

          {templates.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px',
              border: '1px solid var(--border-light)',
              padding: '3.5rem 2rem', textAlign: 'center',
            }}>
              <LayoutTemplate size={32} style={{ color: 'var(--border-light)', marginBottom: '12px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 6px' }}>
                No templates yet.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                Add a template above — the AI will automatically assign it to matching test cases during generation.
              </p>
            </div>
          ) : (
            templates.map(template => (
              <div key={template.id} style={{
                background: 'var(--bg-card)', borderRadius: '14px',
                border: '1px solid var(--border-light)',
                padding: '1.25rem 1.5rem', marginBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Name + scenario badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' as const }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        {template.name}
                      </span>
                      <ScenarioBadge scenario={template.scenario} />
                    </div>

                    {/* Expand/collapse fields toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedTemplateId(expandedTemplateId === template.id ? null : template.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '2px 0' }}
                    >
                      {expandedTemplateId === template.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {Object.keys(template.fields).length} field{Object.keys(template.fields).length !== 1 ? 's' : ''}
                    </button>

                    {expandedTemplateId === template.id && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap' as const, gap: '4px 20px', padding: '10px 14px', background: 'var(--bg-darker)', borderRadius: '8px' }}>
                        {Object.entries(template.fields).map(([k, v]) => (
                          <span key={k} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' as const, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em' }}>{k}</span>
                            <span style={{ margin: '0 4px', color: 'var(--border-light)' }}>→</span>
                            <strong style={{ color: 'var(--text-main)' }}>{v}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(template.id)}
                      style={{ ...pillBtn, color: 'var(--color-error)', borderColor: 'rgba(239,68,68,0.25)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </>

      ) : (
        <>
          {/* Generate Bulk Records — creates N records from an existing Data Template */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '14px',
            border: '1px solid var(--border-light)',
            marginBottom: '1.5rem', overflow: 'hidden',
          }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1.25rem 1.5rem', cursor: 'pointer',
                borderBottom: showBulkForm ? '1px solid var(--border-light)' : 'none',
              }}
              onClick={() => setShowBulkForm(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Generate Bulk Records
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {showBulkForm ? 'Collapse' : 'Expand'}
              </span>
            </div>

            {showBulkForm && (
              <div style={{ padding: '1.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  Pick an existing Data Template and how many records you need. Gemini generates that many distinct,
                  realistic records matching the template's field schema — useful when you need volume (e.g. 20 different
                  logins) rather than one repeated value. The result appears below as its own entry; open it with the
                  eye icon to view every generated record.
                </p>

                {templates.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No Data Templates yet — create one in the "Data Templates" tab first, then come back here.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                      <div>
                        <label style={sectionLabel}>Data Template</label>
                        <select
                          className="input-field"
                          value={bulkTemplateId}
                          onChange={e => setBulkTemplateId(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="">Select a template…</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.scenario}) — {Object.keys(t.fields).length} fields
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={sectionLabel}>Number of Records</label>
                        <input
                          type="number"
                          className="input-field"
                          min={1}
                          max={200}
                          value={bulkCount}
                          onChange={e => setBulkCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    {bulkError && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-error)', marginBottom: '1rem' }}>{bulkError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handleGenerateBatch}
                      disabled={generatingBatch || !bulkTemplateId}
                      style={submitBtn(generatingBatch || !bulkTemplateId)}
                    >
                      {generatingBatch
                        ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Layers size={14} />}
                      {generatingBatch ? `Generating ${bulkCount} records…` : `Generate ${bulkCount} Records`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bulk-generated batches list */}
          {batches.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={sectionLabel}>
                  {batches.length} Bulk Batch{batches.length !== 1 ? 'es' : ''}
                </label>
              </div>
              {batches.map(batch => (
                <div key={batch.id} style={{
                  background: 'var(--bg-card)', borderRadius: '14px',
                  border: '1px solid var(--border-light)',
                  padding: '1.25rem 1.5rem', marginBottom: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' as const }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                          {batch.name}
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '3px 10px', borderRadius: '99px',
                          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                          background: 'rgba(37, 226, 204, 0.08)', color: 'var(--accent-cyan)',
                          border: '1px solid rgba(37, 226, 204, 0.25)',
                        }}>
                          <Layers size={9} /> {batch.recordCount} records
                        </span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                        From template "{batch.sourceTemplateName}"
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button type="button" style={pillBtn} onClick={() => setViewingBatch(batch)}>
                        <Eye size={12} /> View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch.id)}
                        style={{ ...pillBtn, color: 'var(--color-error)', borderColor: 'rgba(239,68,68,0.25)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Condition Form */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '14px',
            border: '1px solid var(--border-light)',
            marginBottom: '1.5rem', overflow: 'hidden',
          }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1.25rem 1.5rem', cursor: 'pointer',
                borderBottom: showConditionForm ? '1px solid var(--border-light)' : 'none',
              }}
              onClick={() => setShowConditionForm(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Add Synthetic Condition
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {showConditionForm ? 'Collapse' : 'Expand'}
              </span>
            </div>

            {showConditionForm && (
              <div style={{ padding: '1.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  Describe what fields your test cases need in plain English. Gemini will extract the field keys and automatically
                  pick realistic synthetic values from the data bank. A fresh record is drawn per test case — great for volume testing
                  with varied data. Set one as <strong style={{ color: 'var(--text-main)' }}>Default</strong> to apply it
                  to the whole app's generation automatically.
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={sectionLabel}>Condition Description</label>
                  <textarea
                    className="textarea-field"
                    rows={3}
                    placeholder='e.g. "Test cases that need a user name, email address, and age" or "login tests with username and password"'
                    value={newConditionText}
                    onChange={e => setNewConditionText(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveCondition}
                  disabled={savingCondition || !newConditionText.trim()}
                  style={submitBtn(savingCondition || !newConditionText.trim())}
                >
                  {savingCondition
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Sparkles size={14} />}
                  {savingCondition ? 'Extracting fields…' : 'Create Synthetic Condition'}
                </button>
              </div>
            )}
          </div>

          {/* Condition list */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={sectionLabel}>
              {conditions.length} Condition{conditions.length !== 1 ? 's' : ''} for {activeApp.name}
            </label>
          </div>

          {conditions.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '14px',
              border: '1px solid var(--border-light)',
              padding: '3.5rem 2rem', textAlign: 'center',
            }}>
              <Wand2 size={32} style={{ color: 'var(--border-light)', marginBottom: '12px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                No conditions yet. Describe what fields a test case needs and we'll pick realistic synthetic values automatically.
              </p>
            </div>
          ) : (
            conditions.map(condition => (
              <div key={condition.id} style={{
                background: 'var(--bg-card)', borderRadius: '14px',
                border: '1px solid var(--border-light)',
                padding: '1.25rem 1.5rem', marginBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' as const }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        {condition.description}
                      </span>
                      {condition.isDefault && <DefaultBadge />}
                    </div>

                    <div style={{ marginBottom: '4px' }}>
                      {condition.resolvedFields.map(f => <FieldBadge key={f} label={f} />)}
                    </div>

                    {/* Condition preview */}
                    {previewingId === condition.id && (
                      <div style={{
                        marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
                        background: 'var(--bg-darker)',
                        border: '1px solid rgba(37, 226, 204, 0.2)',
                      }}>
                        {previewLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Resolving synthetic record…
                          </div>
                        ) : previewValues && (
                          <>
                            <label style={{ ...sectionLabel, color: 'var(--accent-cyan)', marginBottom: '8px' }}>Sample resolved values</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px 24px' }}>
                              {Object.entries(previewValues).map(([k, v]) => (
                                <span key={k} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                  <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' as const, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em' }}>{k}</span>
                                  <span style={{ margin: '0 4px', color: 'var(--border-light)' }}>→</span>
                                  <strong style={{ color: 'var(--text-main)' }}>{v}</strong>
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button type="button" style={pillBtn} onClick={() => handlePreview('condition', condition.id)}>
                      {previewingId === condition.id ? <EyeOff size={12} /> : <Eye size={12} />}
                      {previewingId === condition.id ? 'Hide' : 'Preview'}
                    </button>
                    {!condition.isDefault && (
                      <button type="button" style={pillBtn} onClick={() => handleSetDefaultCondition(condition.id)}>
                        Set Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteCondition(condition.id)}
                      style={{ ...pillBtn, color: 'var(--color-error)', borderColor: 'rgba(239,68,68,0.25)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Records table modal for a bulk batch */}
      {viewingBatch && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '2rem',
          }}
          onClick={() => setViewingBatch(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)', borderRadius: '16px',
              border: '1px solid var(--border-light)',
              maxWidth: '900px', width: '100%', maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Table size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  {viewingBatch.name}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  ({viewingBatch.recordCount} records)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingBatch(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflow: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-darker)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 700 }}>#</th>
                    {viewingBatch.records[0] && Object.keys(viewingBatch.records[0]).map(k => (
                      <th key={k} style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 700 }}>
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewingBatch.records.map((record, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                      {Object.keys(viewingBatch.records[0] || record).map(k => (
                        <td key={k} style={{ padding: '10px 16px', color: 'var(--text-main)', whiteSpace: 'nowrap' as const }}>
                          {record[k]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};