import { useEffect, useState, useRef } from 'react';
import { Users, Search, Building2, CreditCard, Hash, RefreshCw, Pencil, Trash2, Check, X, GitMerge, CheckCircle, ChevronRight } from 'lucide-react';
import { getVendors, deleteVendor, updateVendorName, findDuplicateVendors, mergeVendors } from '../lib/supabase';
import type { DuplicateGroup } from '../lib/supabase';
import type { Vendor } from '../types';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function InfoChip({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
      <span className="font-medium text-slate-400">{label}</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);

  // Inline name edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Merge mode
  const [mergeMode, setMergeMode] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [scanningDupes, setScanningDupes] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({}); // groupKey → vendorId
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<string | null>(null); // groupKey to confirm

  async function load() {
    setLoading(true);
    try {
      const data = await getVendors();
      setVendors(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Focus input when edit mode starts
  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  function startEdit(e: React.MouseEvent, vendor: Vendor) {
    e.stopPropagation();
    setEditingId(vendor.id);
    setEditName(vendor.vendor_name);
    setDeletingId(null);
  }

  async function commitEdit(vendor: Vendor) {
    const name = editName.trim();
    if (!name || name === vendor.vendor_name) {
      setEditingId(null);
      return;
    }
    setSavingName(true);
    try {
      await updateVendorName(vendor.id, name);
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, vendor_name: name } : v));
      if (selected?.id === vendor.id) setSelected(s => s ? { ...s, vendor_name: name } : s);
    } finally {
      setSavingName(false);
      setEditingId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function startDelete(e: React.MouseEvent, vendorId: string) {
    e.stopPropagation();
    setDeletingId(vendorId);
    setEditingId(null);
  }

  async function confirmDelete(vendorId: string) {
    setDeleting(true);
    try {
      await deleteVendor(vendorId);
      setVendors(prev => prev.filter(v => v.id !== vendorId));
      if (selected?.id === vendorId) setSelected(null);
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  async function scanForDuplicates() {
    setScanningDupes(true);
    try {
      const groups = await findDuplicateVendors();
      setDuplicateGroups(groups);
      // Auto-select the vendor with most invoices as primary in each group
      const targets: Record<string, string> = {};
      for (const g of groups) {
        const best = [...g.vendors].sort((a, b) => (b.invoice_count || 0) - (a.invoice_count || 0))[0];
        targets[g.key] = best.id;
      }
      setMergeTargets(targets);
      setMergeMode(true);
    } finally {
      setScanningDupes(false);
    }
  }

  function exitMergeMode() {
    setMergeMode(false);
    setDuplicateGroups([]);
    setMergeTargets({});
    setMergeConfirm(null);
    setMergingGroup(null);
  }

  async function executeMerge(group: DuplicateGroup) {
    const targetId = mergeTargets[group.key];
    if (!targetId) return;
    const sourceIds = group.vendors.filter(v => v.id !== targetId).map(v => v.id);
    setMergingGroup(group.key);
    try {
      await mergeVendors(targetId, sourceIds);
      setDuplicateGroups(prev => prev.filter(g => g.key !== group.key));
      setMergeConfirm(null);
      await load();
    } finally {
      setMergingGroup(null);
    }
  }

  const filtered = vendors.filter(v =>
    v.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
    (v.gstin || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.vendor_code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendor Registry</h1>
          <p className="text-slate-500 mt-1">
            Automatically built from processed invoices · {vendors.length} vendors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={mergeMode ? exitMergeMode : scanForDuplicates}
            disabled={scanningDupes}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              mergeMode
                ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                : 'text-amber-700 border-amber-200 hover:bg-amber-50'
            }`}
          >
            <GitMerge size={14} className={scanningDupes ? 'animate-spin' : ''} />
            {mergeMode ? 'Exit Merge Mode' : scanningDupes ? 'Scanning…' : 'Find Duplicates'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, GSTIN, or vendor code..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Merge Mode UI */}
      {mergeMode && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <GitMerge size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              Merge Mode — {duplicateGroups.length} duplicate group{duplicateGroups.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-slate-700">No duplicates found</p>
              <p className="text-sm text-slate-400 mt-1">All vendors have unique GSTINs, PANs, and names</p>
            </div>
          ) : (
            <div className="space-y-6">
              {duplicateGroups.map(group => {
                const targetId = mergeTargets[group.key];
                const targetVendor = group.vendors.find(v => v.id === targetId);
                const sourceVendors = group.vendors.filter(v => v.id !== targetId);
                const totalSourceInvoices = sourceVendors.reduce((s, v) => s + (v.invoice_count || 0), 0);
                const isMerging = mergingGroup === group.key;
                const isConfirming = mergeConfirm === group.key;

                return (
                  <div key={group.key} className="bg-white border border-slate-200 rounded-xl p-5">
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          group.matchType === 'gstin' ? 'bg-red-100 text-red-700' :
                          group.matchType === 'pan' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {group.matchType.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-slate-600">{group.key}</span>
                      </div>

                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            Merge {totalSourceInvoices} invoice{totalSourceInvoices !== 1 ? 's' : ''} into {targetVendor?.vendor_name}?
                          </span>
                          <button
                            onClick={() => executeMerge(group)}
                            disabled={isMerging}
                            className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                          >
                            {isMerging ? 'Merging…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setMergeConfirm(null)}
                            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMergeConfirm(group.key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                        >
                          <GitMerge size={12} />
                          Merge Group
                        </button>
                      )}
                    </div>

                    {/* Vendor cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.vendors.map(v => {
                        const isTarget = v.id === targetId;
                        return (
                          <div
                            key={v.id}
                            onClick={() => setMergeTargets(prev => ({ ...prev, [group.key]: v.id }))}
                            className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              isTarget
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {isTarget && (
                              <span className="absolute -top-2 left-3 px-2 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full uppercase">
                                Keep
                              </span>
                            )}
                            {!isTarget && (
                              <span className="absolute -top-2 left-3 px-2 py-0.5 text-[10px] font-bold bg-slate-400 text-white rounded-full uppercase">
                                Merge into primary
                              </span>
                            )}
                            <p className="font-semibold text-sm text-slate-900 mt-1 truncate">{v.vendor_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{v.vendor_code}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-slate-500">{v.invoice_count || 0} invoices</span>
                              <span className="text-xs font-semibold text-slate-700">{formatCurrency(v.total_amount || 0)}</span>
                            </div>
                            {v.gstin && (
                              <p className="text-[10px] text-slate-400 mt-1.5 font-mono">{v.gstin}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Merge summary */}
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <ChevronRight size={12} />
                      <span>
                        Will keep <strong className="text-emerald-700">{targetVendor?.vendor_name}</strong>
                        {totalSourceInvoices > 0 && <>, reassign {totalSourceInvoices} invoice{totalSourceInvoices !== 1 ? 's' : ''}</>}
                        , and delete {sourceVendors.length} duplicate{sourceVendors.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Normal vendor grid (hidden in merge mode) */}
      {!mergeMode && (loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <Users size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {search ? 'No vendors match your search' : 'No vendors yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Vendors are auto-created when you process invoices
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(vendor => (
            <div
              key={vendor.id}
              onClick={() => {
                if (editingId === vendor.id || deletingId === vendor.id) return;
                setSelected(selected?.id === vendor.id ? null : vendor);
              }}
              className={`group text-left bg-white rounded-xl border p-5 hover:shadow-md transition-all cursor-pointer ${
                selected?.id === vendor.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
              }`}
            >
              {/* Vendor header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-indigo-600" />
                </div>

                {/* Name — editable */}
                <div className="flex-1 min-w-0">
                  {editingId === vendor.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        ref={editInputRef}
                        value={editName}
                        title="Vendor name"
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(vendor);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="flex-1 text-sm font-semibold border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => commitEdit(vendor)}
                        disabled={savingName}
                        className="text-indigo-600 hover:text-indigo-800 p-0.5"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-slate-900 truncate">{vendor.vendor_name}</p>
                      <button
                        type="button"
                        onClick={e => startEdit(e, vendor)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity flex-shrink-0"
                        title="Edit vendor name"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{vendor.vendor_code}</p>
                </div>

                {/* Amount + delete */}
                <div className="text-right flex-shrink-0">
                  {deletingId === vendor.id ? (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-red-600 font-medium">Delete?</span>
                      <button
                        type="button"
                        onClick={() => confirmDelete(vendor.id)}
                        disabled={deleting}
                        className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        {deleting ? '…' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setDeletingId(null); }}
                        className="text-xs px-2 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-600"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-end">
                      {vendor.invoice_count === 0 && (
                        <button
                          type="button"
                          onClick={e => startDelete(e, vendor.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                          title="Delete vendor (no invoices)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(vendor.total_amount || 0)}</p>
                        <p className="text-xs text-slate-400">{vendor.invoice_count || 0} invoices</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1.5">
                <InfoChip label="GSTIN" value={vendor.gstin} />
                <InfoChip label="PAN" value={vendor.vendor_pan} />
                <InfoChip label="State" value={vendor.place_of_supply} />
                <InfoChip label="Bank" value={vendor.bank_name} />
              </div>

              {/* Expanded details */}
              {selected?.id === vendor.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  {vendor.vendor_address && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Address</p>
                      <p className="text-sm text-slate-700">{vendor.vendor_address}</p>
                    </div>
                  )}
                  {vendor.vendor_contact_email && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Contact / Email</p>
                      <p className="text-sm text-slate-700">{vendor.vendor_contact_email}</p>
                    </div>
                  )}
                  {(vendor.beneficiary_name || vendor.account_number || vendor.ifsc_code || vendor.bank_branch || vendor.swift_code) && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <CreditCard size={12} /> Bank Details
                      </p>
                      <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
                        {vendor.beneficiary_name && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">Account Name</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.beneficiary_name}</span>
                          </div>
                        )}
                        {vendor.bank_name && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">Bank</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.bank_name}</span>
                          </div>
                        )}
                        {vendor.bank_branch && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">Branch</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.bank_branch}</span>
                          </div>
                        )}
                        {vendor.account_number && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">Account No.</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.account_number}</span>
                          </div>
                        )}
                        {vendor.ifsc_code && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">IFSC</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.ifsc_code}</span>
                          </div>
                        )}
                        {vendor.swift_code && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 text-xs">SWIFT</span>
                            <span className="font-medium text-slate-700 text-xs">{vendor.swift_code}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Hash size={11} /> Added {new Date(vendor.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
