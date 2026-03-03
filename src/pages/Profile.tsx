import { useState } from 'react';
import { User, Building2, Briefcase, Mail, Check } from 'lucide-react';

const STORAGE_KEY = 'ip-profile';

interface ProfileData {
  name: string;
  organisation: string;
  role: string;
  email: string;
}

const DEFAULT_PROFILE: ProfileData = { name: '', organisation: '', role: '', email: '' };

function getProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PROFILE;
}

export default function Profile() {
  const [form, setForm] = useState<ProfileData>(getProfile);
  const [saved, setSaved] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      window.dispatchEvent(new Event('ip-profile-updated'));
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const initials = form.name
    ? form.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const fields = [
    { label: 'Full Name',     name: 'name',         icon: User,      placeholder: 'Your full name',      type: 'text' },
    { label: 'Organisation',  name: 'organisation',  icon: Building2, placeholder: 'Company or team name', type: 'text' },
    { label: 'Role',          name: 'role',          icon: Briefcase, placeholder: 'e.g. Finance Manager',  type: 'text' },
    { label: 'Email',         name: 'email',         icon: Mail,      placeholder: 'your@email.com',        type: 'email' },
  ] as const;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-lg font-bold">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{form.name || 'Your Profile'}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {[form.role, form.organisation].filter(Boolean).join(' at ') || 'Manage your personal details'}
          </p>
        </div>
      </div>

      <div className="max-w-lg">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {/* Avatar preview */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-2xl font-bold select-none">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{form.name || 'Your Name'}</p>
              <p className="text-sm text-slate-500 truncate">
                {form.role || 'Role'}{form.organisation ? ` · ${form.organisation}` : ''}
              </p>
              {form.email && <p className="text-xs text-slate-400 truncate mt-0.5">{form.email}</p>}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            {fields.map(({ label, name, icon: Icon, placeholder, type }) => (
              <div key={name}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  {label}
                </label>
                <div className="relative">
                  <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type={type}
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Check size={13} /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Save Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
