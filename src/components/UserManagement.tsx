import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface ManagedUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'qa_engineer' | 'qa_reviewer' | 'developer';
  isActive: boolean;
}

const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  admin:       { bg: '#fef3c7', color: '#92400e', label: 'Admin' },
  qa_engineer: { bg: '#dbeafe', color: '#1e40af', label: 'QA Engineer' },
  qa_reviewer: { bg: '#f1f5f9', color: '#475569', label: 'QA Reviewer' },
  developer:   { bg: '#ede9fe', color: '#6d28d9', label: 'Developer' },
};

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const isQaEngineer = currentUser?.role === 'qa_engineer';

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'access'>(isAdmin ? 'users' : 'access');
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'qa_reviewer' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // App Access tab state — one reviewer selected at a time, edit their full app list
  const [reviewers, setReviewers] = useState<{ id: number; email: string; name: string; isActive: boolean }[]>([]);
  const [applications, setApplications] = useState<{ id: string; name: string; platform: string }[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | null>(null);
  const [assignedAppIds, setAssignedAppIds] = useState<string[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessSuccess, setAccessSuccess] = useState('');
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  const API_BASE = 'http://localhost:8000';

  // Auth is cookie-based (httpOnly), so credentials: 'include' on each fetch
  // is what actually authenticates these requests — no Authorization header needed.
  const authHeaders = { 'Content-Type': 'application/json' };

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/users`, { headers: authHeaders, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      setUsers(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoleRequests = async () => {
    setRequestsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/role-requests?status_filter=all`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) setRoleRequests(await res.json());
    } catch {}
    finally { setRequestsLoading(false); }
  };

  const reviewRequest = async (requestId: number, action: 'approve' | 'reject', reviewNote?: string) => {
    setReviewingId(requestId);
    try {
      const res = await fetch(`${API_BASE}/auth/role-requests/${requestId}`, {
        method: 'PATCH',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ action, reviewNote: reviewNote || '' })
      });
      if (!res.ok) throw new Error('Review failed');
      await Promise.all([fetchRoleRequests(), fetchUsers()]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReviewingId(null);
    }
  };

  const fetchAppAccessData = async () => {
    setAccessLoading(true);
    setAccessError('');
    try {
      const [appsRes, reviewersRes] = await Promise.all([
        fetch(`${API_BASE}/auth/apps`, { headers: authHeaders, credentials: 'include' }),
        fetch(`${API_BASE}/auth/reviewers`, { headers: authHeaders, credentials: 'include' }),
      ]);
      if (!appsRes.ok) throw new Error('Failed to load applications');
      if (!reviewersRes.ok) throw new Error('Failed to load reviewers');
      setApplications(await appsRes.json());
      setReviewers(await reviewersRes.json());
    } catch (e: any) {
      setAccessError(e.message);
    } finally {
      setAccessLoading(false);
    }
  };

  const selectReviewer = async (reviewerId: number) => {
    setSelectedReviewerId(reviewerId);
    setAccessError('');
    setAccessSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/users/${reviewerId}/apps`, { headers: authHeaders, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load this reviewer\'s app access');
      const data = await res.json();
      setAssignedAppIds(data.map((d: any) => d.appId));
    } catch (e: any) {
      setAccessError(e.message);
      setAssignedAppIds([]);
    }
  };

  const toggleAppForReviewer = (appId: string) => {
    setAssignedAppIds(prev =>
      prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]
    );
  };

  const saveReviewerAccess = async () => {
    if (selectedReviewerId == null) return;
    setIsSavingAccess(true);
    setAccessError('');
    setAccessSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/users/${selectedReviewerId}/apps`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ appIds: assignedAppIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save access');
      setAccessSuccess('Access updated.');
    } catch (e: any) {
      setAccessError(e.message);
    } finally {
      setIsSavingAccess(false);
    }
  };

  useEffect(() => {
    // /auth/users and /auth/role-requests are admin-only server-side —
    // qa_engineer would get a 403 from these, so only admins fetch them.
    if (isAdmin) {
      fetchUsers();
      fetchRoleRequests();
    } else {
      setIsLoading(false);
    }
    // App access data (reviewers/grants) is available to both admin and qa_engineer.
    fetchAppAccessData();
  }, [isAdmin]);

  const updateUser = async (userId: number, data: Partial<ManagedUser>) => {
    setUpdating(userId);
    try {
      const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
        method: 'PATCH',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdating(null);
    }
  };

  const handleAddUser = async () => {
    setAddError('');
    if (!newUser.email || !newUser.name || !newUser.password) {
      setAddError('All fields are required');
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/admin/create-user`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify(newUser)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }
      await fetchUsers();
      setShowAddUser(false);
      setNewUser({ email: '', name: '', password: '', role: 'qa_reviewer' });
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.email) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/auth/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete user');
      }
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase()) ||
                        u.name.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    qa_engineer: users.filter(u => u.role === 'qa_engineer').length,
    qa_reviewer: users.filter(u => u.role === 'qa_reviewer').length,
    developer: users.filter(u => u.role === 'developer').length,
    inactive: users.filter(u => !u.isActive).length,
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          {isAdmin ? 'Admin Console' : 'App Access'}
        </h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.9rem' }}>
          {isAdmin
            ? 'Manage user accounts, roles, and access permissions.'
            : 'Decide which apps each QA Reviewer can see.'}
        </p>
      </div>

      {/* Stats row — admin only, qa_engineer has no use for account-wide stats */}
      {isAdmin && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total Users', value: stats.total, color: '#0f172a' },
          { label: 'Admins', value: stats.admin, color: '#92400e' },
          { label: 'QA Engineers', value: stats.qa_engineer, color: '#1e40af' },
          { label: 'QA Reviewers', value: stats.qa_reviewer, color: '#475569' },
          { label: 'Developers', value: stats.developer, color: '#6d28d9' },
          { label: 'Inactive', value: stats.inactive, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>
      )}
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0' }}>
        {[
          ...(isAdmin ? [
            { id: 'users', label: 'Users' },
            { id: 'requests', label: `Role Requests ${roleRequests.filter(r => r.status === 'pending').length > 0 ? `(${roleRequests.filter(r => r.status === 'pending').length})` : ''}` },
          ] : []),
          { id: 'access', label: 'App Access' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.875rem',
              color: activeTab === tab.id ? '#0f172a' : '#94a3b8',
              borderBottom: activeTab === tab.id ? '2px solid #0f172a' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.15s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (<>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', outline: 'none' }}
        />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="qa_engineer">QA Engineer</option>
          <option value="qa_reviewer">QA Reviewer</option>
          <option value="developer">Developer</option>
        </select>
        <button
          onClick={() => setShowAddUser(true)}
          style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Add User
        </button>
        <button
          onClick={fetchUsers}
          style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* User table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 120px 100px 200px', padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
            <div key={h} style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading users...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No users found.</div>
        ) : filtered.map((u, i) => {
          const roleStyle = ROLE_COLORS[u.role] || { bg: '#fee2e2', color: '#991b1b', label: u.role || 'Unknown' };
          const isSelf = u.id === currentUser?.id;
          const isUpdating = updating === u.id;

          return (
            <div key={u.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1.5fr 120px 100px 200px',
              padding: '14px 20px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
              background: !u.isActive ? '#fafafa' : '#fff',
              opacity: isUpdating ? 0.6 : 1, transition: 'opacity 0.2s'
            }}>
              {/* Name */}
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
                  {u.name} {isSelf && <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>(you)</span>}
                </div>
              </div>

              {/* Email */}
              <div style={{ color: '#475569', fontSize: '0.85rem' }}>{u.email}</div>

              {/* Role selector — admin can't change their own role */}
              <div>
                {isSelf ? (
                  <span style={{ background: roleStyle.bg, color: roleStyle.color, padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {roleStyle.label}
                  </span>
                ) : (
                  <select
                    value={u.role}
                    disabled={isUpdating}
                    onChange={e => updateUser(u.id, { role: e.target.value as any })}
                    style={{
                      background: roleStyle.bg, color: roleStyle.color,
                      border: 'none', borderRadius: '20px', padding: '3px 10px',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', outline: 'none'
                    }}
                  >
                    <option value="qa_reviewer">QA Reviewer</option>
                    <option value="qa_engineer">QA Engineer</option>
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>

              {/* Active status */}
              <div>
                <span style={{
                  background: u.isActive ? '#dcfce7' : '#fee2e2',
                  color: u.isActive ? '#166534' : '#991b1b',
                  padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700
                }}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!isSelf && (
                  <>
                    <button
                      onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                      disabled={isUpdating}
                      style={{
                        background: u.isActive ? '#fff1f2' : '#f0fdf4',
                        color: u.isActive ? '#dc2626' : '#16a34a',
                        border: `1px solid ${u.isActive ? '#fecdd3' : '#bbf7d0'}`,
                        borderRadius: '6px', padding: '4px 10px',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(u); setDeleteConfirmText(''); setDeleteError(''); }}
                      disabled={isUpdating}
                      style={{
                        background: '#fff1f2', color: '#dc2626',
                        border: '1px solid #fecdd3',
                        borderRadius: '6px', padding: '4px 10px',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      🗑 Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      </>)}

      {/* Role Requests Tab */}
      {activeTab === 'requests' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 1fr 160px', padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['User', 'Email', 'Wants', 'Reason', 'Action'].map(h => (
              <div key={h} style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>

          {requestsLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading requests...</div>
          ) : roleRequests.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No role requests yet.</div>
          ) : roleRequests.map((r, i) => {
            const isPending = r.status === 'pending';
            const statusStyle = {
              pending:  { bg: '#fef9c3', color: '#854d0e' },
              approved: { bg: '#dcfce7', color: '#166534' },
              rejected: { bg: '#fee2e2', color: '#991b1b' },
            }[r.status as string] || { bg: '#f1f5f9', color: '#475569' };

            return (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1.5fr 100px 1fr 160px',
                padding: '14px 20px', alignItems: 'center',
                borderBottom: i < roleRequests.length - 1 ? '1px solid #f1f5f9' : 'none',
                background: isPending ? '#fffbeb' : '#fff',
                opacity: reviewingId === r.id ? 0.6 : 1
              }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{r.userName}</div>
                <div style={{ color: '#475569', fontSize: '0.82rem' }}>{r.userEmail}</div>
                <div>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {r.requestedRole}
                  </span>
                </div>
                <div style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.4 }}>{r.reason}</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {isPending ? (
                    <>
                      <button
                        onClick={() => reviewRequest(r.id, 'approve')}
                        disabled={reviewingId === r.id}
                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => reviewRequest(r.id, 'reject')}
                        disabled={reviewingId === r.id}
                        style={{ background: '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✗ Reject
                      </button>
                    </>
                  ) : (
                    <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'access' && (
        <div>
          {accessError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 16px', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {accessError}
            </div>
          )}
          {accessSuccess && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 16px', color: '#16a34a', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {accessSuccess}
            </div>
          )}

          {accessLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
              {/* Reviewer list */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  QA Reviewers
                </div>
                {reviewers.length === 0 ? (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    No QA Reviewer accounts yet.
                  </div>
                ) : reviewers.map(r => (
                  <button
                    key={r.id}
                    onClick={() => selectReviewer(r.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 16px', border: 'none', borderBottom: '1px solid #f1f5f9',
                      background: selectedReviewerId === r.id ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.email}</div>
                  </button>
                ))}
              </div>

              {/* App checklist for selected reviewer */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
                {selectedReviewerId == null ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', padding: '2rem 0' }}>
                    Select a QA Reviewer to manage which apps they can see.
                  </div>
                ) : applications.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', padding: '2rem 0' }}>
                    No applications exist yet. Create one from the sidebar first.
                  </div>
                ) : (
                  <>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Apps this reviewer can see
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                      {applications.map(app => (
                        <label key={app.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: assignedAppIds.includes(app.id) ? '#eff6ff' : 'transparent' }}>
                          <input
                            type="checkbox"
                            checked={assignedAppIds.includes(app.id)}
                            onChange={() => toggleAppForReviewer(app.id)}
                          />
                          <span style={{ fontSize: '0.875rem', color: '#0f172a', fontWeight: 600 }}>{app.name}</span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>{app.platform}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={saveReviewerAccess}
                      disabled={isSavingAccess}
                      style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontWeight: 700, fontSize: '0.85rem', cursor: isSavingAccess ? 'not-allowed' : 'pointer', opacity: isSavingAccess ? 0.6 : 1 }}
                    >
                      {isSavingAccess ? 'Saving...' : 'Save Access'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '440px', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Delete Account</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
                You are about to permanently delete <strong style={{ color: '#0f172a' }}>{deleteTarget.name}</strong>'s account.
                This will remove all their data, role requests, session history, and cannot be undone.
              </p>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>
                Type the user's email to confirm deletion:
              </p>
              <code style={{ display: 'block', background: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.6rem', border: '1px solid #fecaca' }}>
                {deleteTarget.email}
              </code>
              <input
                type="email"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type email here..."
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1.5px solid ${deleteConfirmText === deleteTarget.email ? '#16a34a' : '#e2e8f0'}`, fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {deleteError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); setDeleteError(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={isDeleting || deleteConfirmText !== deleteTarget.email}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  background: deleteConfirmText === deleteTarget.email ? '#dc2626' : '#94a3b8',
                  color: '#fff', fontWeight: 700, cursor: deleteConfirmText === deleteTarget.email ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '420px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Add New User</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'John Doe' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'john@company.com' },
                { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(newUser as any)[f.key]}
                    onChange={e => setNewUser(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.875rem', background: '#fff' }}
                >
                  <option value="qa_reviewer">QA Reviewer</option>
                  <option value="qa_engineer">QA Engineer</option>
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {addError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', color: '#dc2626', fontSize: '0.8rem' }}>{addError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '8px' }}>
                <button onClick={() => { setShowAddUser(false); setAddError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleAddUser} disabled={addLoading} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {addLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};