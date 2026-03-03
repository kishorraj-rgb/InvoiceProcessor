import { useEffect, useState } from 'react';
import {
  Shield,
  UserPlus,
  Mail,
  CheckCircle2,
  Eye,
  Briefcase,
  Crown,
  Trash2,
  ChevronDown,
  X,
} from 'lucide-react';
import { getUsers, inviteUser, updateUserRole, removeUser } from '../lib/supabase';
import type { AppUser } from '../types';

const ROLES = ['Admin', 'Finance / Accounts', 'Viewer'];

const ROLE_META: Record<string, { color: string; icon: React.ReactNode; description: string }> = {
  Admin: {
    color: 'bg-indigo-100 text-indigo-700',
    icon: <Crown size={14} />,
    description: 'Full access — upload, approve, pay, manage vendors and team.',
  },
  'Finance / Accounts': {
    color: 'bg-emerald-100 text-emerald-700',
    icon: <Briefcase size={14} />,
    description: 'View all invoices, approve, and record payments. No team management.',
  },
  Viewer: {
    color: 'bg-slate-100 text-slate-600',
    icon: <Eye size={14} />,
    description: 'Read-only access to invoices, vendors, and categories.',
  },
};

function getRoleMeta(role: string) {
  return ROLE_META[role] ?? { color: 'bg-amber-100 text-amber-700', icon: <Shield size={14} />, description: 'Custom role.' };
}

function Avatar({ name, email }: { name?: string; email: string }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
      {initials}
    </div>
  );
}

export default function Team() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', name: '', role: 'Viewer' });
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite() {
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const user = await inviteUser(form.email.trim(), form.name.trim(), form.role);
      setUsers(prev => [...prev, user]);
      setShowInvite(false);
      setForm({ email: '', name: '', role: 'Viewer' });
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to invite user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(user: AppUser, role: string) {
    await updateUserRole(user.id, role);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role } : u));
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId);
    try {
      await removeUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } finally {
      setRemovingId(null);
    }
  }

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const adminCount = users.filter(u => u.role === 'Admin').length;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Role Management</h1>
            <p className="text-slate-500 text-sm mt-0.5">Control user access and permissions</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setShowInvite(true); setFormError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <UserPlus size={15} />
          Invite User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Users', value: totalUsers, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Active Users', value: activeUsers, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Administrators', value: adminCount, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
              <Shield size={18} className={color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Team Table */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">Team Members</p>
                <p className="text-xs text-slate-500 mt-0.5">{totalUsers} of {totalUsers} users</p>
              </div>
            </div>

            {/* Invite form */}
            {showInvite && (
              <div className="px-5 py-4 bg-indigo-50 border-b border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-indigo-900">Invite New User</p>
                  <button type="button" onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="name@company.com"
                      title="Email address"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      title="Full name"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                    <select
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      title="Role"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                {formError && <p className="text-xs text-red-600 mb-2">{formError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={saving}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {saving ? (
                      <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full inline-block" />
                    ) : (
                      <Mail size={13} />
                    )}
                    Send Invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInvite(false)}
                    className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full" />
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-500 font-medium uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-5 py-3">User</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map(user => {
                    const meta = getRoleMeta(user.role);
                    const isAdmin = user.role === 'Admin';
                    return (
                      <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                        {/* User */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.name} email={user.email} />
                            <div>
                              <p className="text-sm font-medium text-slate-900 leading-tight">
                                {user.name || '—'}
                              </p>
                              <p className="text-xs text-slate-400">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role badge */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                            {meta.icon}
                            {user.role}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {user.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                              <CheckCircle2 size={13} />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                              <Mail size={13} />
                              Invited
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          {isAdmin ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {/* Role picker */}
                              <div className="relative">
                                <select
                                  value={user.role}
                                  onChange={e => handleRoleChange(user, e.target.value)}
                                  title="Change role"
                                  className="text-xs border border-slate-200 rounded-lg pl-2.5 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white appearance-none cursor-pointer"
                                >
                                  {ROLES.filter(r => r !== 'Admin').map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                                <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                              {/* Remove */}
                              <button
                                type="button"
                                onClick={() => handleRemove(user.id)}
                                disabled={removingId === user.id}
                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                title="Remove user"
                              >
                                {removingId === user.id
                                  ? <span className="animate-spin w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full inline-block" />
                                  : <Trash2 size={14} />
                                }
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Role Permissions Panel */}
        <div className="w-72 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={15} className="text-slate-500" />
              <p className="text-sm font-semibold text-slate-900">Role Permissions</p>
            </div>
            <div className="space-y-4">
              {ROLES.map(role => {
                const meta = getRoleMeta(role);
                return (
                  <div key={role} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{role}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{meta.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
