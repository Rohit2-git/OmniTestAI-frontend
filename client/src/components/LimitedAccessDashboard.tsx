import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface RoleRequestRecord {
  id: number;
  requestedRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: '#fef9c3', color: '#854d0e', label: '⏳ Pending Review' },
  approved: { bg: '#dcfce7', color: '#166534', label: '✓ Approved' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: '✗ Rejected' },
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  qa_engineer: 'QA Engineer',
  qa_reviewer: 'QA Reviewer',
  developer: 'Developer',
};

// Read-only landing view for non-admin, non-engineer roles (QA Reviewer, Developer).
// Both can browse but not generate/execute, so they share this "request more access" view.
export const LimitedAccessDashboard: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RoleRequestRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  // Auth is cookie-based (httpOnly) — credentials: 'include' on each fetch
  // is what authenticates these requests, no Authorization header needed.
  const authHeaders = { 'Content-Type': 'application/json' };

  const roleLabel = user ? (ROLE_LABELS[user.role] || user.role) : '';

  const fetchMyRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/role-request/mine`, {
        headers: authHeaders, credentials: 'include'
      });
      if (res.ok) setRequests(await res.json());
    } catch {}
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchMyRequests(); }, []);

  const hasPending = requests.some(r => r.status === 'pending');

  const handleSubmit = async () => {
    setSubmitError('');
    if (reason.trim().length < 10) {
      setSubmitError('Please provide a reason (at least 10 characters)');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/role-request`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ requestedRole: 'qa_engineer', reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit');
      setSubmitSuccess('Your request has been submitted! An admin will review it shortly.');
      setShowForm(false);
      setReason('');
      await fetchMyRequests();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>

      {/* Welcome card */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            👋
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
              Welcome, {user?.name}
            </h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
              You're logged in as a <strong>{roleLabel}</strong>
            </p>
          </div>
        </div>

        {/* What viewers can do */}
        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your current access
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { icon: '✓', text: 'View the Overview dashboard', allowed: true },
              { icon: '✓', text: 'Browse existing test cases', allowed: true },
              { icon: '✓', text: 'View Insights & History', allowed: true },
              { icon: '✗', text: 'Generate AI test cases', allowed: false },
              { icon: '✗', text: 'Run test executions', allowed: false },
              { icon: '✗', text: 'Manage Knowledge Space', allowed: false },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontWeight: 700, color: item.allowed ? '#16a34a' : '#dc2626', fontSize: '0.8rem', width: '14px' }}>{item.icon}</span>
                <span style={{ fontSize: '0.875rem', color: item.allowed ? '#374151' : '#94a3b8' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade CTA */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e40af)', borderRadius: '10px', padding: '1.25rem', color: '#fff' }}>
          <p style={{ margin: '0 0 0.4rem', fontWeight: 800, fontSize: '0.95rem' }}>Want full access?</p>
          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Request a <strong style={{ color: '#60a5fa' }}>QA Engineer</strong> role to unlock AI test generation, execution, and knowledge management.
          </p>
          {hasPending ? (
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 14px', fontSize: '0.82rem', color: '#fde68a', fontWeight: 600 }}>
              ⏳ You have a pending request — an admin will review it soon.
            </div>
          ) : (
            <button
              onClick={() => { setShowForm(true); setSubmitSuccess(''); setSubmitError(''); }}
              style={{ background: '#fff', color: '#0f172a', border: 'none', borderRadius: '8px', padding: '9px 20px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Request QA Engineer Access →
            </button>
          )}
        </div>
      </div>

      {/* Success message */}
      {submitSuccess && (
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', color: '#166534', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          {submitSuccess}
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Request QA Engineer Access</h2>
          <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.85rem' }}>
            Tell the admin why you need QA Engineer access. They'll review and respond.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Reason for request
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. I'm joining the QA team and need to run automated test suites for the upcoming release..."
              rows={4}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = '#1d4ed8'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <div style={{ fontSize: '0.75rem', color: reason.length < 10 ? '#dc2626' : '#94a3b8', marginTop: '4px', textAlign: 'right' }}>
              {reason.length} / 10 min characters
            </div>
          </div>

          {submitError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 14px', color: '#dc2626', fontSize: '0.82rem', marginBottom: '1rem' }}>
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => { setShowForm(false); setReason(''); setSubmitError(''); }}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || reason.trim().length < 10}
              style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: isSubmitting || reason.trim().length < 10 ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Request history */}
      {!isLoading && requests.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.75rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Your Request History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {requests.map(r => {
              const style = STATUS_STYLES[r.status];
              return (
                <div key={r.id} style={{ border: '1px solid #f1f5f9', borderRadius: '10px', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                      Requested: <span style={{ color: '#1d4ed8' }}>{r.requestedRole}</span> role
                    </span>
                    <span style={{ background: style.bg, color: style.color, padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {style.label}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: '#475569' }}>{r.reason}</p>
                  {r.reviewNote && (
                    <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', color: '#64748b', marginTop: '0.5rem' }}>
                      <strong>Admin note:</strong> {r.reviewNote}
                    </div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};