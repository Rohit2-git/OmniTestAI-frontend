import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import type { TestCase, TestCaseStep } from '../types';
import { 
  Search, Folder, Plus, ChevronRight, Play, Trash2, X, FolderOpen, Upload
} from 'lucide-react';

interface RepositoryProps {
  setActiveTab: (tab: string) => void;
  setSelectedTestIdsForRun: (ids: string[]) => void;
}

export const Repository: React.FC<RepositoryProps> = ({ setActiveTab, setSelectedTestIdsForRun }) => {
  const { applications, testCases, activeAppId, addTestCase, updateTestCase, deleteTestCase, refreshTestCases } = useApp();

  const [activeFolder, setActiveFolder] = useState<string>('All Modules');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter] = useState<string>('All');
  
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  // The drawer is fixed-positioned and vertically centered in whatever part of
  // the screen is currently visible, so it's always in frame the instant you
  // click a row — no scrolling needed regardless of where in the list you
  // clicked. We only need to track its horizontal position (drawerLeftPx),
  // measured from the reserved column so it still lines up under the list.
  const [drawerLeftPx, setDrawerLeftPx] = useState<number | null>(null);
  const drawerColRef = useRef<HTMLDivElement>(null);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formSource, setFormSource] = useState<'manual' | 'ai-jira' | 'ai-acceptance'>('manual');
  const [formSection, setFormSection] = useState('General');
  const [formSteps, setFormSteps] = useState<Omit<TestCaseStep, 'id'>[]>([{ instruction: '', expected: '' }]);

  const addDialogRef = useRef<HTMLDialogElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const activeApp = applications.find(app => app.id === activeAppId);
  const appTestCases = testCases.filter(tc => tc.appId === activeAppId);
  const folders = ['All Modules', ...Array.from(new Set(appTestCases.map(tc => tc.section)))];

  useEffect(() => {
    setActiveFolder('All Modules');
    setSelectedTestCase(null);
    setSelectedTests([]);
  }, [activeAppId]);

  const filteredTestCases = appTestCases.filter(tc => {
    const matchesFolder = activeFolder === 'All Modules' || tc.section === activeFolder;
    const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tc.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || tc.priority === priorityFilter.toLowerCase();
    return matchesFolder && matchesSearch && matchesPriority;
  });

  const handleCheckboxToggle = (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setSelectedTests(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  // The drawer is fixed-positioned (so it's always vertically centered in the
  // current viewport, never requiring a scroll to see the steps), which takes
  // it out of the normal flex flow horizontally too — so we measure where its
  // reserved column actually sits on screen and pin the drawer there. Re-runs
  // whenever the drawer opens and on window resize, so it stays aligned even
  // if the surrounding layout (app sidebar, folder panel) changes width.
  useLayoutEffect(() => {
    if (!selectedTestCase) return;
    const measure = () => {
      if (drawerColRef.current) {
        setDrawerLeftPx(drawerColRef.current.getBoundingClientRect().left);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selectedTestCase]);

  const handleSelectAllToggle = () => {
    if (selectedTests.length === filteredTestCases.length) { setSelectedTests([]); } 
    else { setSelectedTests(filteredTestCases.map(tc => tc.id)); }
  };

  const handleOpenAddModal = () => {
    setEditingTestId(null);
    setFormTitle(''); setFormDesc(''); setFormPriority('medium'); setFormSource('manual');
    setFormSection(activeFolder === 'All Modules' ? 'General' : activeFolder);
    setFormSteps([{ instruction: '', expected: '' }]);
    addDialogRef.current?.showModal();
  };

  const handleOpenEditModal = (testCase: TestCase) => {
    setEditingTestId(testCase.id);
    setFormTitle(testCase.title); setFormDesc(testCase.description);
    setFormPriority(testCase.priority); setFormSource(testCase.source || 'manual'); setFormSection(testCase.section);
    setFormSteps(testCase.steps.map(s => ({ instruction: s.instruction, expected: s.expected })));
    addDialogRef.current?.showModal();
  };

  const handleSubmitTestCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !activeAppId) return;
    const validSteps = formSteps.filter(s => s.instruction.trim() !== '').map((s, i) => ({ id: `step-${Date.now()}-${i}`, instruction: s.instruction, expected: s.expected || 'Success' }));
    
    if (editingTestId) {
      const existing = testCases.find(tc => tc.id === editingTestId);
      if (existing) updateTestCase({ ...existing, title: formTitle, description: formDesc, priority: formPriority, source: formSource, section: formSection || 'General', steps: validSteps });
    } else {
      addTestCase({ appId: activeAppId, title: formTitle, description: formDesc, priority: formPriority, source: formSource, section: formSection || 'General', steps: validSteps });
    }
    addDialogRef.current?.close();
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to permanently delete all ${selectedTests.length} selected test cases from the database?`)) {
      for (const id of selectedTests) {
        await deleteTestCase(id);
      }
      if (selectedTestCase && selectedTests.includes(selectedTestCase.id)) {
        setSelectedTestCase(null);
      }
      setSelectedTests([]);
      alert("Selected test cases purged cleanly from local storage and backend.");
    }
  };

  const handleImportCsvClick = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so selecting the same file again still fires onChange
    if (!file || !activeAppId) return;

    setIsImporting(true);
    try {
      const result = await apiService.importTestCasesFromCsv(file, activeAppId);
      const importedCases: any[] = result?.test_cases || [];
      if (importedCases.length === 0) {
        alert('No test cases were found in that CSV.');
        return;
      }
      // Previously this only called addTestCase() below, which just appends
      // to local React state — nothing was ever sent to the backend, so the
      // imported cases lived only in memory and vanished on reload while
      // AppContext's fetchFromDB() rebuilt testCases purely from real
      // TestRun/TestResult rows in the DB. AI Test Design's "Save to Repo"
      // avoids this by calling /tests/save (see Generator.tsx); CSV import
      // needs the same treatment so it actually persists.
      const payloadTestCases = importedCases.map((tc) => ({
        title: tc.title || 'Untitled Test Case',
        steps: Array.isArray(tc.steps) ? tc.steps : [],
        expected_result: tc.expected_result || 'Success',
        type: tc.type || 'functional',
        test_data_source_type: tc.test_data_source_type ?? null,
        test_data_source_id: tc.test_data_source_id ?? null,
        test_data_values: tc.test_data_values ?? null,
      }));

      await apiService.saveTestCasesToRepo({
        filename: file.name,
        app_id: activeAppId,
        test_cases: payloadTestCases,
      });

      // Refresh AppContext from the DB so the newly-saved cases show up
      // immediately without needing a manual page reload. No addTestCase()
      // call here — the DB is now the single source of truth for this
      // batch, and adding locally too would just create a duplicate until
      // the next fetchFromDB() pass caught up.
      await refreshTestCases();
      alert(`Imported ${importedCases.length} test case${importedCases.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (err: any) {
      alert(`CSV import failed: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="repository-view">
      <div className="view-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>Test Case Manager</h1>
          <p style={{ color: '#4b5563', marginTop: '0.25rem' }}>Author, maintain, and execute curated test cases for {activeApp?.name || 'your application'}.</p>
        </div>
        {activeAppId && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvFileSelected} />
            <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={handleImportCsvClick} disabled={isImporting}>
              <Upload size={18} /> <span>{isImporting ? 'Importing…' : 'Import CSV'}</span>
            </button>
            <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={handleOpenAddModal}>
              <Plus size={18} /> <span>Create Test Case</span>
            </button>
          </div>
        )}
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}><p>Select an application to view repository data.</p></div>
      ) : (
        <div className="repository-layout" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', minHeight: 'calc(100vh - 160px)' }}>
          
          <div className="repo-folders" style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>Modules</h3>
            {folders.map(folder => (
              <button key={folder} type="button" onClick={() => setActiveFolder(folder)} className={`repo-folder-btn ${activeFolder === folder ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: activeFolder === folder ? 'rgba(0,128,128,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {activeFolder === folder ? <FolderOpen size={18} style={{ color: '#008080' }} /> : <Folder size={18} style={{ color: '#4b5563' }} />}
                  <span style={{ fontWeight: activeFolder === folder ? 600 : 500, color: activeFolder === folder ? '#008080' : '#111827', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder}</span>
                </div>
                <span className="folder-count" style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, color: '#4b5563' }}>{folder === 'All Modules' ? appTestCases.length : appTestCases.filter(tc => tc.section === folder).length}</span>
              </button>
            ))}
          </div>

          <div className="repo-main" style={{ flex: 1, minWidth: 0 }}>
            <div className="repo-filter-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="repo-search-wrapper" style={{ flex: 1, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="search" className="input-field" style={{ paddingLeft: '2.5rem', width: '100%', height: '42px', borderRadius: '8px' }} placeholder="Search test cases..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              {/* FIXED: Bulk Delete button sits alongside Bulk Execution triggers */}
              {selectedTests.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button type="button" className="btn btn-secondary" style={{ height: '42px', padding: '0 1.25rem', borderColor: '#dc2626', color: '#dc2626' }} onClick={handleBulkDelete}>
                    <Trash2 size={15} /> <span style={{ marginLeft: '0.5rem' }}>Delete Selected ({selectedTests.length})</span>
                  </button>
                  <button type="button" className="btn btn-accent" style={{ height: '42px', padding: '0 1.25rem' }} onClick={() => { setSelectedTestIdsForRun(selectedTests); setActiveTab('executor'); }}>
                    <Play size={15} /> <span style={{ marginLeft: '0.5rem' }}>Execute Selected ({selectedTests.length})</span>
                  </button>
                </div>
              )}
            </div>

            <div className="test-list-grid" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1.25rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', color: '#4b5563', gap: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
                <input type="checkbox" style={{ transform: 'scale(1.15)', cursor: 'pointer' }} checked={selectedTests.length === filteredTestCases.length && filteredTestCases.length > 0} onChange={handleSelectAllToggle} />
                <span style={{ fontWeight: 600 }}>Select All visible ({filteredTestCases.length})</span>
              </div>

              {filteredTestCases.map(tc => (
                <div key={tc.id} className={`glass-card hoverable test-row-item ${selectedTestCase?.id === tc.id ? 'active-app-border' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', cursor: 'pointer', borderRadius: '8px', border: selectedTestCase?.id === tc.id ? '2px solid #008080' : '1px solid #e5e7eb', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }} onClick={() => setSelectedTestCase(tc)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: 0 }}>
                    <input type="checkbox" style={{ transform: 'scale(1.15)', cursor: 'pointer' }} checked={selectedTests.includes(tc.id)} onChange={(e) => handleCheckboxToggle(tc.id, e)} onClick={(e) => e.stopPropagation()} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tc.title}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>Focus Module Mapping: {tc.section}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '12px', background: tc.priority === 'high' ? '#fee2e2' : '#fef3c7', color: tc.priority === 'high' ? '#dc2626' : '#d97706' }}>{tc.priority}</span>
                    <ChevronRight size={18} style={{ color: '#9ca3af' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedTestCase && (
            // Outer wrapper stays a normal flex sibling reserving the same
            // 460px column width the drawer always used — this is what keeps
            // the test list from reflowing/jumping when the drawer opens or
            // closes. The drawer itself is fixed-positioned and vertically
            // centered in the CURRENT viewport (not anchored to document
            // flow), so it's always fully in frame the moment you click a
            // row — no scrolling required, regardless of where in the list
            // you clicked or how far down the page you'd scrolled.
            <div ref={drawerColRef} style={{ width: '460px', flexShrink: 0, position: 'relative' }}>
              <div className="test-details-drawer" style={{
                width: '460px', background: 'white', border: '1px solid #e5e7eb', padding: '1.5rem',
                display: 'flex', flexDirection: 'column', gap: '1.5rem', borderRadius: '12px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.12)', position: 'fixed', top: '50%',
                left: drawerLeftPx !== null ? `${drawerLeftPx}px` : undefined,
                transform: 'translateY(-50%)', maxHeight: '85vh', zIndex: 50,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem' }}>
                <div style={{ maxWidth: '85%' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', lineHeight: '1.3' }}>{selectedTestCase.title}</h3>
                  <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 600, background: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '12px', marginTop: '0.5rem' }}>{selectedTestCase.section}</span>
                </div>
                <button type="button" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', borderRadius: '50%' }} onClick={() => setSelectedTestCase(null)}><X size={20} /></button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.05em' }}>Steps Hierarchy ({selectedTestCase.steps.length})</span>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedTestCase.steps.map((step, idx) => (
                    <li key={step.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '8px' }}>
                      <div style={{ color: '#008080', fontSize: '0.75rem', fontWeight: 700 }}>Step {idx + 1}</div>
                      <div style={{ color: '#111827', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.25rem', lineHeight: '1.4' }}>{step.instruction}</div>
                      <div style={{ color: '#4b5563', fontSize: '0.8rem', marginTop: '0.25rem' }}>Expected: <span style={{ color: '#059669', fontWeight: 500 }}>{step.expected}</span></div>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, height: '38px' }} onClick={() => handleOpenEditModal(selectedTestCase)}>Edit</button>
                <button type="button" className="btn btn-danger" style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} onClick={() => { deleteTestCase(selectedTestCase.id); setSelectedTestCase(null); }}><Trash2 size={14} /> Delete</button>
                <button type="button" className="btn btn-accent" style={{ flex: 1.5, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} onClick={() => { setSelectedTestIdsForRun([selectedTestCase.id]); setActiveTab('executor'); }}><Play size={14} /> Execute</button>
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT TEST CASE DIALOG */}
      <dialog ref={addDialogRef} onClick={(e) => { if (e.target === addDialogRef.current) addDialogRef.current?.close(); }}
        style={{ borderRadius: '16px', border: '1px solid #e5e7eb', padding: 0, maxWidth: '560px', width: '90vw', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', background: '#fff' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>
            {editingTestId ? 'Edit Test Case' : 'Create Test Case'}
          </h2>
          <button type="button" onClick={() => addDialogRef.current?.close()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmitTestCase} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Test Case Title *</label>
            <input className="input-field" required value={formTitle} onChange={e => setFormTitle(e.target.value)}
              placeholder="e.g. Login with valid credentials"
              style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem', outline: 'none', width: '100%' }} />
          </div>

          {/* Section & Priority row */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Module / Section</label>
              <input className="input-field" value={formSection} onChange={e => setFormSection(e.target.value)}
                placeholder="e.g. Auth, Checkout"
                style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Priority</label>
              <select className="select-field" value={formPriority} onChange={e => setFormPriority(e.target.value as any)}
                style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none', background: '#fff' }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Test Steps ({formSteps.length})
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formSteps.map((step, idx) => (
                <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', background: '#f9fafb', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#008080' }}>Step {idx + 1}</span>
                    {formSteps.length > 1 && (
                      <button type="button" onClick={() => setFormSteps(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    value={step.instruction}
                    onChange={e => setFormSteps(prev => prev.map((s, i) => i === idx ? { ...s, instruction: e.target.value } : s))}
                    placeholder="Describe what to do (e.g. Click the login button)"
                    required
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem', outline: 'none', background: '#fff', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                  />
                  <input
                    value={step.expected}
                    onChange={e => setFormSteps(prev => prev.map((s, i) => i === idx ? { ...s, expected: e.target.value } : s))}
                    placeholder="Expected result (e.g. User is redirected to dashboard)"
                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              {/* Add step button */}
              <button type="button"
                onClick={() => setFormSteps(prev => [...prev, { instruction: '', expected: '' }])}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem', borderRadius: '8px', border: '1.5px dashed #d1d5db', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#008080'; (e.currentTarget as HTMLButtonElement).style.color = '#008080'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; }}>
                <Plus size={16} /> Add Another Step
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={() => addDialogRef.current?.close()}
              style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#008080', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
              {editingTestId ? 'Save Changes' : 'Create Test Case'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};