import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import { BookOpen, FileUp, Link2, Image, FileText, Trash2, Search, Tags, Loader2, Plus, Info } from 'lucide-react';

const typeLabels: Record<string, string> = {
  doc: 'Document',
  link: 'Link',
  image: 'Image',
  pdf: 'PDF'
};

export const KnowledgeBase: React.FC = () => {
  const { activeAppId, applications } = useApp();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  
  // Interactive Form States
  const [assetName, setAssetName] = useState('');
  const [assetSummary, setAssetSummary] = useState('');
  const [assetTags, setAssetTags] = useState('');
  const [assetType, setAssetType] = useState('doc');
  const [assetUrl, setAssetUrl] = useState('');
  const [simulatedFileName, setSimulatedFileName] = useState('');

  const uploadRef = useRef<HTMLInputElement>(null);
  const activeApp = applications.find((app) => app.id === activeAppId);

  // Core Data Retrieval Handler Pipeline
  const fetchProjectContextAssets = async () => {
    if (!activeAppId) return;
    setLoading(true);
    try {
      const serverData = await apiService.getKnowledgeAssets(activeAppId);
      // Ensure data integrity before appending to the local state vector
      const sanitized = Array.isArray(serverData) ? serverData : [];
      setAssets(sanitized);
    } catch (err) {
      console.error("Networking Pipeline Exception: Failed rendering target context elements.", err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectContextAssets();
  }, [activeAppId]);

  const filteredAssets = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return assets;
    return assets.filter((asset) => {
      const nameMatch = asset?.name?.toLowerCase().includes(normalized);
      const summaryMatch = asset?.summary?.toLowerCase().includes(normalized);
      const tagMatch = Array.isArray(asset?.tags) && asset.tags.some((t: string) => t.toLowerCase().includes(normalized));
      return nameMatch || summaryMatch || tagMatch;
    });
  }, [assets, query]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeAppId || !assetName.trim() || !assetSummary.trim()) return;

    const tagsList = assetTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const postPayload = {
      appId: activeAppId,
      name: simulatedFileName || assetName,
      summary: assetSummary,
      type: assetType,
      tags: tagsList,
      url: assetType === 'link' ? assetUrl : undefined
    };

    try {
      await apiService.addKnowledgeAsset(postPayload);
      
      // Flush inputs on successful commit
      setAssetName('');
      setAssetSummary('');
      setAssetTags('');
      setAssetType('doc');
      setAssetUrl('');
      setSimulatedFileName('');
      
      // Force refresh data structures from the SQLite backend repository context
      await fetchProjectContextAssets();
    } catch (err) {
      alert("Operational Write Exception: Server failed routing context asset record payload boundaries.");
    }
  };

  const handleSimulatedUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setSimulatedFileName(selected.name);
    setAssetName(selected.name);

    const normalized = selected.name.toLowerCase();
    if (normalized.endsWith('.pdf')) {
      setAssetType('pdf');
    } else if (/\.(png|jpg|jpeg|webp)$/.test(normalized)) {
      setAssetType('image');
    } else {
      setAssetType('doc');
    }
  };

  const handleDeleteAssetNode = async (assetId: number) => {
    if (!confirm("Are you sure you want to permanently delete this context source asset node from operational database storage?")) return;
    try {
      await apiService.deleteKnowledgeAsset(assetId);
      await fetchProjectContextAssets();
    } catch (err) {
      alert("Purge Failure Intercept: System rejected deletion pipeline command.");
    }
  };

  const getAssetIcon = (type: string) => {
    if (type === 'pdf') return <FileText size={15} style={{ color: '#ef4444' }} />;
    if (type === 'image') return <Image size={15} style={{ color: '#3b82f6' }} />;
    if (type === 'link') return <Link2 size={15} style={{ color: '#06b6d4' }} />;
    return <BookOpen size={15} style={{ color: '#10b981' }} />;
  };

  return (
    <div className="generator-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Banner Context Block Header */}
      <div className="view-header">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>Knowledge Base Space</h1>
        <p style={{ color: '#4b5563', marginTop: '0.25rem', fontSize: '0.95rem' }}>Upload project docs, link Jira criteria references, and map operational data frameworks used by AI during test suite compilation streams.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', fontWeight: 500 }}>Select an active application project node from the side navigation workspace sidebar panel layout.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* TOP ENTRY CONFIG PANEL CARD ENGINE */}
          <div className="glass-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Plus size={16} style={{ color: 'var(--accent-cyan)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Add Grounding Context Source</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1.25rem' }}>Inject static software asset dependencies, user-story configurations, or operational link maps into the AI repository stack.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Form Grid Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr', gap: '1rem', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Upload Document Block</span>
                  <input ref={uploadRef} type="file" style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.md" onChange={handleSimulatedUpload} />
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#ffffff', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'} onClick={() => uploadRef.current?.click()}>
                    <FileUp size={14} style={{ color: '#4b5563' }} />
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }}>{simulatedFileName ? 'Change Selection' : 'Choose Local File'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Source Identifier Name</span>
                  <input id="kb-name" className="input-field" style={{ height: '40px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none' }} value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="e.g. Sprint 14 Biometric Authentication Criteria Ruleset" required />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Asset Category Type</span>
                  <select id="kb-type" className="select-field" style={{ height: '40px', padding: '0 0.5rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#ffffff', fontSize: '0.9rem', outline: 'none' }} value={assetType} onChange={(event) => setAssetType(event.target.value)}>
                    <option value="doc">Text Document</option>
                    <option value="pdf">PDF Spec</option>
                    <option value="image">UI Capture Image</option>
                    <option value="link">External URL Link</option>
                  </select>
                </div>
              </div>

              {/* Collapsible Sub Link Row */}
              {assetType === 'link' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', animation: 'fadeIn 0.2s ease-in-out' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Reference URL Path Link</span>
                  <input id="kb-link" className="input-field" style={{ height: '40px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem' }} value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} placeholder="https://jira.enterprise-node.com/browse/FIN-4293" required />
                </div>
              )}

              {/* Form Grid Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Context Summary Description</span>
                  <textarea id="kb-summary" className="textarea-field" style={{ minHeight: '42px', maxHeight: '42px', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none', resize: 'none' }} value={assetSummary} onChange={(event) => setAssetSummary(event.target.value)} placeholder="Explain briefly what rules this document dictates so the agent knows when to apply it..." required />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.02em' }}>Relational Tag Array Flags</span>
                  <input id="kb-tags" className="input-field" style={{ height: '42px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem' }} value={assetTags} onChange={(event) => setAssetTags(event.target.value)} placeholder="e.g. biometric, security, checkout" />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px', marginTop: '0.5rem', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s ease' }}>
                <span>Commit Document to Active Knowledge Space</span>
              </button>
            </form>
          </div>

          {/* LOWER GRID LAYOUT DISPLAY PANEL ROW */}
          <div className="glass-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Active Context Storage Libraries</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.15rem' }}>Currently grounding project node <strong style={{ color: '#111827' }}>"{activeApp?.name}"</strong> with <span style={{ color: '#008080', fontWeight: 700 }}>{assets.length} database entries</span>.</p>
              </div>
              <div className="repo-search-wrapper" style={{ maxWidth: '300px', width: '100%', position: 'relative' }}>
                <Search size={15} className="repo-search-icon" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="input-field repo-search-input" style={{ height: '36px', width: '100%', paddingLeft: '2.25rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by token title, summary details, tags..." />
              </div>
            </div>

            {loading ? (
              <div style={{ display: 'flex', padding: '4rem', justifyContent: 'center', width: '100%', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                <Loader2 className="animate-spin" size={20} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Reading live remote database cluster map array indexes...</span>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem', border: '1px dashed #e5e7eb', borderRadius: '8px', background: '#fefefe' }}>
                <Info size={24} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
                <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>No functional repository assets matched your workspace criteria filters.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="generated-test-card" style={{ padding: '1.25rem', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.005)' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = '#cbd5e1'} onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', minWidth: 0 }}>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '2px' }}>
                        {getAssetIcon(asset.type)}
                      </div>
                      
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>{asset.name}</h4>
                          <span style={{ background: asset.type === 'link' ? '#ecfeff' : asset.type === 'pdf' ? '#fff1f2' : '#f0fdf4', color: asset.type === 'link' ? '#0891b2' : asset.type === 'pdf' ? '#e11d48' : '#16a34a', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                            {typeLabels[asset.type] || 'Standard Document'}
                          </span>
                        </div>
                        
                        <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '4px 0 6px 0', lineHeight: '1.5' }}>{asset.summary}</p>
                        
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          {Array.isArray(asset.tags) && asset.tags.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <Tags size={12} style={{ color: '#94a3b8' }} />
                              {asset.tags.map((tag: string, tIdx: number) => (
                                <span key={`${asset.id}-${tag}-${tIdx}`} className="badge badge-purple" style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{tag}</span>
                              ))}
                            </div>
                          )}
                          
                          {asset.url && (
                            <a href={asset.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#008080', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }} onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
                              Link Target Resource Array {'↗'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      style={{ height: '34px', width: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', flexShrink: 0, transition: 'all 0.2s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.transform = 'none'; }}
                      onClick={() => handleDeleteAssetNode(asset.id)}
                      aria-label={`Purge ${asset.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};