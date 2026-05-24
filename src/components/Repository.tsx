import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { TestCase, TestCaseStep } from '../types';
import { 
  Search, 
  Folder, 
  Plus, 
  ChevronRight, 
  Play, 
  Trash2, 
  X, 
  FileText,
  FolderOpen,
  Download,
  Upload
} from 'lucide-react';

interface RepositoryProps {
  setActiveTab: (tab: string) => void;
  setSelectedTestIdsForRun: (ids: string[]) => void;
}

export const Repository: React.FC<RepositoryProps> = ({ setActiveTab, setSelectedTestIdsForRun }) => {
  const { 
    applications, 
    testCases, 
    activeAppId, 
    addTestCase, 
    updateTestCase,
    deleteTestCase
  } = useApp();

  const [activeFolder, setActiveFolder] = useState<string>('All Modules');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  
  // Drawer & Edit Modal states
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  
  // Form fields for new test case
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formSource, setFormSource] = useState<'manual' | 'ai-jira' | 'ai-acceptance'>('manual');
  const [formSection, setFormSection] = useState('General');
  const [formSteps, setFormSteps] = useState<Omit<TestCaseStep, 'id'>[]>([{ instruction: '', expected: '' }]);

  const addDialogRef = useRef<HTMLDialogElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const activeApp = applications.find(app => app.id === activeAppId);

  // Filter test cases by active app
  const appTestCases = testCases.filter(tc => tc.appId === activeAppId);

  // Dynamic modules list based on data
  const folders = ['All Modules', ...Array.from(new Set(appTestCases.map(tc => tc.section)))];

  // Reset states when app changes
  useEffect(() => {
    setActiveFolder('All Modules');
    setSelectedTestCase(null);
    setSelectedTests([]);
  }, [activeAppId]);

  // Apply filters
  const filteredTestCases = appTestCases.filter(tc => {
    const matchesFolder = activeFolder === 'All Modules' || tc.section === activeFolder;
    const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tc.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || tc.priority === priorityFilter.toLowerCase();
    
    return matchesFolder && matchesSearch && matchesPriority;
  });

  const escapeCsv = (value: string) => {
    const normalized = value.replace(/\r?\n/g, ' ').trim();
    if (/[",]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  };

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map((item) => item.trim());
  };

  const handleSelectTestCase = (tc: TestCase) => {
    setSelectedTestCase(tc);
  };

  const handleCheckboxToggle = (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setSelectedTests(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllToggle = () => {
    if (selectedTests.length === filteredTestCases.length) {
      setSelectedTests([]);
    } else {
      setSelectedTests(filteredTestCases.map(tc => tc.id));
    }
  };

  // Add Step Row
  const handleAddStepRow = () => {
    setFormSteps(prev => [...prev, { instruction: '', expected: '' }]);
  };

  // Remove Step Row
  const handleRemoveStepRow = (idx: number) => {
    if (formSteps.length === 1) return;
    setFormSteps(prev => prev.filter((_, i) => i !== idx));
  };

  // Update step field
  const handleStepChange = (idx: number, field: 'instruction' | 'expected', value: string) => {
    setFormSteps(prev => prev.map((step, i) => i === idx ? { ...step, [field]: value } : step));
  };

  const handleOpenAddModal = () => {
    setEditingTestId(null);
    setFormTitle('');
    setFormDesc('');
    setFormPriority('medium');
    setFormSource('manual');
    setFormSection(activeFolder === 'All Modules' ? 'General' : activeFolder);
    setFormSteps([{ instruction: '', expected: '' }]);
    addDialogRef.current?.showModal();
  };

  const handleOpenEditModal = (testCase: TestCase) => {
    setEditingTestId(testCase.id);
    setFormTitle(testCase.title);
    setFormDesc(testCase.description);
    setFormPriority(testCase.priority);
    setFormSource(testCase.source || 'manual');
    setFormSection(testCase.section);
    setFormSteps(
      testCase.steps.map((step) => ({
        instruction: step.instruction,
        expected: step.expected
      }))
    );
    addDialogRef.current?.showModal();
  };

  const handleCloseAddModal = () => {
    setEditingTestId(null);
    addDialogRef.current?.close();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === addDialogRef.current) {
      handleCloseAddModal();
    }
  };

  const handleSubmitTestCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !activeAppId) return;

    // Filter out blank steps
    const validSteps = formSteps
      .filter(s => s.instruction.trim() !== '')
      .map((s, i) => ({
        id: `step-${Date.now()}-${i}`,
        instruction: s.instruction,
        expected: s.expected || 'Success'
      }));

    if (validSteps.length === 0) {
      alert('Please add at least one execution step.');
      return;
    }

    if (editingTestId) {
      const existing = testCases.find(tc => tc.id === editingTestId);
      if (!existing) {
        alert('Unable to find the selected test case for editing.');
        return;
      }

      updateTestCase({
        ...existing,
        title: formTitle,
        description: formDesc,
        priority: formPriority,
        source: formSource,
        section: formSection || 'General',
        steps: validSteps
      });

      if (selectedTestCase?.id === existing.id) {
        setSelectedTestCase({
          ...existing,
          title: formTitle,
          description: formDesc,
          priority: formPriority,
          source: formSource,
          section: formSection || 'General',
          steps: validSteps
        });
      }
    } else {
      addTestCase({
        appId: activeAppId,
        title: formTitle,
        description: formDesc,
        priority: formPriority,
        source: formSource,
        section: formSection || 'General',
        steps: validSteps
      });
    }

    handleCloseAddModal();
  };

  const handleDeleteTestCase = (id: string) => {
    if (confirm('Delete this test case permanently?')) {
      deleteTestCase(id);
      setSelectedTestCase(null);
      setSelectedTests(prev => prev.filter(item => item !== id));
    }
  };

  const handleRunTestCase = (tc: TestCase) => {
    setSelectedTestIdsForRun([tc.id]);
    setActiveTab('executor');
  };

  const handleRunSelectedTests = () => {
    if (selectedTests.length === 0) return;
    setSelectedTestIdsForRun(selectedTests);
    setActiveTab('executor');
  };

  const handleExportCsv = () => {
    if (!activeAppId || appTestCases.length === 0) {
      alert('No test cases available to export for the selected application.');
      return;
    }

    const header = 'title,description,priority,section,source,sourceReference,steps';
    const rows = appTestCases.map((testCase) => {
      const steps = testCase.steps
        .map((step, index) => `${index + 1}) ${step.instruction} => ${step.expected}`)
        .join('; ');

      return [
        escapeCsv(testCase.title),
        escapeCsv(testCase.description),
        escapeCsv(testCase.priority),
        escapeCsv(testCase.section),
        escapeCsv(testCase.source || 'manual'),
        escapeCsv(testCase.sourceReference || ''),
        escapeCsv(steps)
      ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeApp?.name?.replace(/\s+/g, '-').toLowerCase() || 'test-cases'}-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportCsvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeAppId) return;

    const content = await file.text();
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      alert('CSV file does not contain any test case rows.');
      event.target.value = '';
      return;
    }

    const headerColumns = parseCsvLine(lines[0]).map((column) => column.toLowerCase());
    const expectedHeader = ['title', 'description', 'priority', 'section', 'source', 'sourcereference', 'steps'];
    const hasRequiredHeader = expectedHeader.every((column) => headerColumns.includes(column));

    if (!hasRequiredHeader) {
      alert('Invalid CSV header. Expected columns: title, description, priority, section, source, sourceReference, steps');
      event.target.value = '';
      return;
    }

    const titleIdx = headerColumns.indexOf('title');
    const descriptionIdx = headerColumns.indexOf('description');
    const priorityIdx = headerColumns.indexOf('priority');
    const sectionIdx = headerColumns.indexOf('section');
    const sourceIdx = headerColumns.indexOf('source');
    const sourceReferenceIdx = headerColumns.indexOf('sourcereference');
    const stepsIdx = headerColumns.indexOf('steps');

    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const title = values[titleIdx]?.trim();
      if (!title) continue;

      const parsedPriority = values[priorityIdx]?.trim().toLowerCase();
      const priority: 'low' | 'medium' | 'high' =
        parsedPriority === 'low' || parsedPriority === 'high' ? parsedPriority : 'medium';

      const parsedSource = values[sourceIdx]?.trim().toLowerCase();
      const source: 'manual' | 'ai-jira' | 'ai-acceptance' =
        parsedSource === 'ai-jira' || parsedSource === 'ai-acceptance' ? parsedSource : 'manual';

      const rawSteps = values[stepsIdx] || '';
      const normalizedSteps = rawSteps.includes(';') ? rawSteps.split(';') : rawSteps.split('|');

      const stepPairs = normalizedSteps
        .map((segment) => segment.trim())
        .filter(Boolean);

      const steps: TestCaseStep[] = stepPairs.length > 0
        ? stepPairs.map((segment, index) => {
            const cleanedSegment = segment.replace(/^\d+\)\s*/, '');
            const [instructionPart, expectedPart] = cleanedSegment.split('=>').map((part) => part?.trim());
            return {
              id: `step-${Date.now()}-${i}-${index}`,
              instruction: instructionPart || `Imported step ${index + 1}`,
              expected: expectedPart || 'Expected outcome'
            };
          })
        : [{ id: `step-${Date.now()}-${i}-0`, instruction: 'Run imported scenario', expected: 'Scenario completes successfully' }];

      addTestCase({
        appId: activeAppId,
        title,
        description: values[descriptionIdx] || 'Imported from CSV',
        priority,
        source,
        sourceReference: values[sourceReferenceIdx] || undefined,
        section: values[sectionIdx] || 'General',
        steps
      });

      importedCount++;
    }

    alert(`Imported ${importedCount} test case(s) from CSV.`);
    event.target.value = '';
  };

  return (
    <div className="repository-view">
      
      {/* Header Controls */}
      <div className="view-header-bar">
        <div>
          <h1>Test Case Manager</h1>
          <p>Author, maintain, and execute curated manual test cases for {activeApp?.name || 'your application'}.</p>
        </div>
        
        {activeAppId && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleImportCsvChange}
            />

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleImportClick}
            >
              <Upload size={16} />
              <span>Import CSV</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>

            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleOpenAddModal}
            >
              <Plus size={18} />
              <span>Create Test Case</span>
            </button>
          </div>
        )}
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Please register or select an application from the sidebar selector to view the test case repository.</p>
        </div>
      ) : (
        <div className="repository-layout">
          
          {/* Left panel: folders */}
          <div className="repo-folders">
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Modules</h3>
            {folders.map(folder => {
              const isActive = activeFolder === folder;
              const count = folder === 'All Modules' 
                ? appTestCases.length 
                : appTestCases.filter(tc => tc.section === folder).length;
              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setActiveFolder(folder)}
                  className={`repo-folder-btn ${isActive ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isActive ? <FolderOpen size={16} style={{ color: 'var(--accent-cyan)' }} /> : <Folder size={16} />}
                    <span className="environment-url" style={{ maxWidth: '140px' }}>{folder}</span>
                  </div>
                  <span className="folder-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Right panel: list of test cases */}
          <div className="repo-main">
            
            {/* Filter controls row */}
            <div className="repo-filter-row">
              <div className="repo-search-wrapper">
                <Search size={16} className="repo-search-icon" />
                <input 
                  type="search" 
                  className="input-field repo-search-input" 
                  placeholder="Search test cases..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="form-label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Priority:</span>
                <select 
                  className="select-field" 
                  style={{ width: '120px', padding: '0.5rem' }}
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="All">All</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {selectedTests.length > 0 && (
                <button 
                  type="button" 
                  className="btn btn-accent btn-small"
                  onClick={handleRunSelectedTests}
                >
                  <Play size={14} />
                  <span>Execute ({selectedTests.length})</span>
                </button>
              )}
            </div>

            {/* Test Case list */}
            {filteredTestCases.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                <p>No test cases match your search criteria.</p>
              </div>
            ) : (
              <div className="test-list-grid">
                
                {/* Select All Row */}
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '0.5rem 1rem', 
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    gap: '1rem'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedTests.length === filteredTestCases.length && filteredTestCases.length > 0} 
                    onChange={handleSelectAllToggle}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Select All visible ({filteredTestCases.length})</span>
                </div>

                {/* List entries */}
                {filteredTestCases.map(tc => {
                  const isChecked = selectedTests.includes(tc.id);
                  const isSelected = selectedTestCase?.id === tc.id;
                  return (
                    <div 
                      key={tc.id} 
                      className={`glass-card hoverable test-row-item ${isSelected ? 'active-app-border' : ''}`}
                      style={isSelected ? { borderColor: 'var(--accent-purple)' } : {}}
                      onClick={() => handleSelectTestCase(tc)}
                    >
                      <div className="test-row-info">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={(e) => handleCheckboxToggle(tc.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer' }}
                        />
                        <div className="test-row-title-meta">
                          <span className="test-row-title">{tc.title}</span>
                          <span className="test-row-desc">{tc.description}</span>
                        </div>
                      </div>

                      <div className="test-row-actions">
                        <span className={`badge ${tc.priority === 'high' ? 'badge-error' : tc.priority === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                          {tc.priority}
                        </span>
                        <span className="badge badge-info">{tc.source || 'manual'}</span>
                        <span className="badge badge-purple">{tc.section}</span>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Test Case Details Slide Drawer */}
          {selectedTestCase && (
            <div className="test-details-drawer">
              <div className="drawer-header">
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedTestCase.title}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <span className={`badge ${selectedTestCase.priority === 'high' ? 'badge-error' : selectedTestCase.priority === 'medium' ? 'badge-warning' : 'badge-success'}`}>
                      {selectedTestCase.priority} Priority
                    </span>
                    <span className="badge badge-purple">{selectedTestCase.section}</span>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="modal-close-btn" 
                  onClick={() => setSelectedTestCase(null)}
                  aria-label="Close details"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="drawer-body">
                <div className="drawer-meta-section">
                  <span className="selector-label">Description</span>
                  <p style={{ fontSize: '0.9rem' }}>{selectedTestCase.description}</p>
                </div>

                <div className="drawer-meta-section">
                  <span className="selector-label">Steps Hierarchy ({selectedTestCase.steps.length})</span>
                  <ul className="steps-list">
                    {selectedTestCase.steps.map((step, idx) => (
                      <li key={step.id} className="step-card">
                        <div className="step-header">Step {idx + 1}</div>
                        <div className="step-instruction">{step.instruction}</div>
                        <div className="step-expected">Expected: {step.expected}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 'auto', background: 'var(--bg-panel)' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => handleOpenEditModal(selectedTestCase)}
                >
                  <span>Edit</span>
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger btn-small"
                  onClick={() => handleDeleteTestCase(selectedTestCase.id)}
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
                <button 
                  type="button" 
                  className="btn btn-accent btn-small"
                  onClick={() => handleRunTestCase(selectedTestCase)}
                >
                  <Play size={14} />
                  <span>Execute Test</span>
                </button>
              </div>
            </div>
          )}

          {/* Add Test Case Native Modal */}
          <dialog 
            ref={addDialogRef} 
            onClick={handleBackdropClick}
            aria-labelledby="add-modal-title"
            style={{ maxWidth: '600px' }}
          >
            <div className="modal-header">
              <h2 id="add-modal-title">{editingTestId ? 'Edit Test Case' : 'Script New Test Case'}</h2>
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={handleCloseAddModal}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitTestCase} className="modal-form">
              <div className="form-group">
                <label htmlFor="test-title" className="form-label">Test Case Title</label>
                <input 
                  type="text" 
                  id="test-title" 
                  className="input-field" 
                  placeholder="e.g. Verify password requirements constraints"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="test-desc" className="form-label">Description</label>
                <textarea 
                  id="test-desc" 
                  className="textarea-field" 
                  placeholder="Explain what visual elements, variables, or api parameters this test case tests..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  style={{ minHeight: '60px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="test-priority" className="form-label">Priority</label>
                  <select 
                    id="test-priority" 
                    className="select-field"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as 'low' | 'medium' | 'high')}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="test-source" className="form-label">Source</label>
                  <select
                    id="test-source"
                    className="select-field"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value as 'manual' | 'ai-jira' | 'ai-acceptance')}
                  >
                    <option value="manual">manual</option>
                    <option value="ai-jira">ai-jira</option>
                    <option value="ai-acceptance">ai-acceptance</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="test-section" className="form-label">Module / Category</label>
                  <input 
                    type="text" 
                    id="test-section" 
                    className="input-field" 
                    placeholder="e.g. Authentication, Checkout"
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic steps grid list */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Execution Steps</label>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-small"
                    onClick={handleAddStepRow}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    + Add Step
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {formSteps.map((step, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex', 
                        gap: '0.5rem', 
                        alignItems: 'flex-start',
                        background: 'rgba(0,0,0,0.15)',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-light)'
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        #{idx + 1}
                      </span>
                      
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <input 
                          type="text" 
                          className="input-field" 
                          placeholder="Instruction (e.g. Click Login button)" 
                          value={step.instruction}
                          onChange={(e) => handleStepChange(idx, 'instruction', e.target.value)}
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          required
                        />
                        <input 
                          type="text" 
                          className="input-field" 
                          placeholder="Expected result (e.g. URL shifts to /dashboard)" 
                          value={step.expected}
                          onChange={(e) => handleStepChange(idx, 'expected', e.target.value)}
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                        />
                      </div>

                      {formSteps.length > 1 && (
                        <button 
                          type="button" 
                          className="app-delete-btn"
                          onClick={() => handleRemoveStepRow(idx)}
                          style={{ marginTop: '0.25rem' }}
                          title="Remove Step"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleCloseAddModal}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  {editingTestId ? 'Update Test Case' : 'Add Test Case'}
                </button>
              </div>
            </form>
          </dialog>

        </div>
      )}
    </div>
  );
};
