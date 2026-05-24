import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { KnowledgeAsset } from '../types';
import { BookOpen, FileUp, Link2, Image, FileText, Trash2, Search, Tags } from 'lucide-react';

const typeLabels: Record<KnowledgeAsset['type'], string> = {
  doc: 'Document',
  link: 'Link',
  image: 'Image',
  pdf: 'PDF'
};

export const KnowledgeBase: React.FC = () => {
  const { activeAppId, applications, knowledgeAssets, addKnowledgeAsset, deleteKnowledgeAsset } = useApp();
  const [query, setQuery] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetSummary, setAssetSummary] = useState('');
  const [assetTags, setAssetTags] = useState('');
  const [assetType, setAssetType] = useState<KnowledgeAsset['type']>('doc');
  const [assetUrl, setAssetUrl] = useState('');
  const [simulatedFileName, setSimulatedFileName] = useState('');

  const uploadRef = useRef<HTMLInputElement>(null);
  const activeApp = applications.find((app) => app.id === activeAppId);

  const appAssets = useMemo(
    () => knowledgeAssets.filter((asset) => asset.appId === activeAppId),
    [knowledgeAssets, activeAppId]
  );

  const filteredAssets = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return appAssets;
    return appAssets.filter((asset) => {
      return (
        asset.name.toLowerCase().includes(normalized) ||
        asset.summary.toLowerCase().includes(normalized) ||
        asset.tags.join(' ').toLowerCase().includes(normalized)
      );
    });
  }, [appAssets, query]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeAppId || !assetName.trim() || !assetSummary.trim()) return;

    const tags = assetTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    addKnowledgeAsset({
      appId: activeAppId,
      name: simulatedFileName || assetName,
      summary: assetSummary,
      type: assetType,
      tags,
      url: assetType === 'link' ? assetUrl : undefined
    });

    setAssetName('');
    setAssetSummary('');
    setAssetTags('');
    setAssetType('doc');
    setAssetUrl('');
    setSimulatedFileName('');
  };

  const handleSimulatedUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setSimulatedFileName(selected.name);
    setAssetName(selected.name);

    const normalized = selected.name.toLowerCase();
    if (normalized.endsWith('.pdf')) {
      setAssetType('pdf');
    } else if (normalized.endsWith('.png') || normalized.endsWith('.jpg') || normalized.endsWith('.jpeg') || normalized.endsWith('.webp')) {
      setAssetType('image');
    } else {
      setAssetType('doc');
    }
  };

  const getAssetIcon = (type: KnowledgeAsset['type']) => {
    if (type === 'pdf') return <FileText size={14} />;
    if (type === 'image') return <Image size={14} />;
    if (type === 'link') return <Link2 size={14} />;
    return <BookOpen size={14} />;
  };

  return (
    <div className="dashboard-view">
      <div className="view-header-bar">
        <div>
          <h1>Knowledge Base Space</h1>
          <p>Upload project docs, add Jira links, and curate acceptance references that AI uses during test generation.</p>
        </div>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Select an application to manage its project-level knowledge space.</p>
        </div>
      ) : (
        <div className="repository-layout" style={{ gridTemplateColumns: '1.2fr 2fr' }}>
          <div className="glass-card" style={{ height: 'fit-content' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Add Source</h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Store references used by the AI generator: docs, images, PDFs, and links.
            </p>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="kb-upload" className="form-label">Upload File (simulated)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    ref={uploadRef}
                    id="kb-upload"
                    type="file"
                    style={{ display: 'none' }}
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.md"
                    onChange={handleSimulatedUpload}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => uploadRef.current?.click()}
                    style={{ width: '100%' }}
                  >
                    <FileUp size={14} />
                    <span>{simulatedFileName ? 'Change Selected File' : 'Select File'}</span>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="kb-name" className="form-label">Name</label>
                <input
                  id="kb-name"
                  className="input-field"
                  value={assetName}
                  onChange={(event) => setAssetName(event.target.value)}
                  placeholder="e.g. Checkout AC Sprint 12"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="kb-type" className="form-label">Asset Type</label>
                <select
                  id="kb-type"
                  className="select-field"
                  value={assetType}
                  onChange={(event) => setAssetType(event.target.value as KnowledgeAsset['type'])}
                >
                  <option value="doc">Document</option>
                  <option value="pdf">PDF</option>
                  <option value="image">Image</option>
                  <option value="link">Link</option>
                </select>
              </div>

              {assetType === 'link' && (
                <div className="form-group">
                  <label htmlFor="kb-link" className="form-label">Reference URL</label>
                  <input
                    id="kb-link"
                    className="input-field"
                    value={assetUrl}
                    onChange={(event) => setAssetUrl(event.target.value)}
                    placeholder="https://jira.example.com/browse/QA-294"
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="kb-summary" className="form-label">Summary</label>
                <textarea
                  id="kb-summary"
                  className="textarea-field"
                  value={assetSummary}
                  onChange={(event) => setAssetSummary(event.target.value)}
                  placeholder="What this source contains and how tests should use it"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="kb-tags" className="form-label">Tags (comma separated)</label>
                <input
                  id="kb-tags"
                  className="input-field"
                  value={assetTags}
                  onChange={(event) => setAssetTags(event.target.value)}
                  placeholder="checkout, security, payments"
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                <span>Add To Knowledge Space</span>
              </button>
            </form>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3>{activeApp?.name} Context Assets</h3>
                <p style={{ fontSize: '0.85rem' }}>Total assets: {appAssets.length}</p>
              </div>
              <div className="repo-search-wrapper" style={{ maxWidth: '280px' }}>
                <Search size={16} className="repo-search-icon" />
                <input
                  className="input-field repo-search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search docs, tags, stories"
                />
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center' }}>
                <p>No knowledge assets available for this filter.</p>
              </div>
            ) : (
              <div className="test-list-grid">
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="glass-card" style={{ marginBottom: '0.6rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          {getAssetIcon(asset.type)}
                          <strong>{asset.name}</strong>
                          <span className="badge badge-info">{typeLabels[asset.type]}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem' }}>{asset.summary}</p>
                        {!!asset.tags.length && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            <Tags size={13} />
                            {asset.tags.map((tag) => (
                              <span key={`${asset.id}-${tag}`} className="badge badge-purple">{tag}</span>
                            ))}
                          </div>
                        )}
                        {asset.url && (
                          <a href={asset.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.45rem' }}>
                            Open source link
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-danger btn-small"
                        onClick={() => deleteKnowledgeAsset(asset.id)}
                        aria-label={`Delete ${asset.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
