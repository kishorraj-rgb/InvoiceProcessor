import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, Check, RotateCcw } from 'lucide-react';
import {
  getTaxonomy,
  saveTaxonomy,
  DEFAULT_TAXONOMY,
  categoryDotStyle,
  type CategoryTaxonomy,
} from '../lib/categories';

export default function Settings() {
  const [taxonomy, setTaxonomy] = useState<CategoryTaxonomy>(getTaxonomy);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [newSubInput, setNewSubInput] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatValue, setEditCatValue] = useState('');

  const categories = Object.keys(taxonomy);

  useEffect(() => {
    if (!selectedCat && categories.length > 0) {
      setSelectedCat(categories[0]);
    }
  }, []);

  function commit(updated: CategoryTaxonomy) {
    setTaxonomy(updated);
    saveTaxonomy(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addCategory() {
    const name = newCatInput.trim();
    if (!name || taxonomy[name]) return;
    const updated = { ...taxonomy, [name]: [] };
    setNewCatInput('');
    setSelectedCat(name);
    commit(updated);
  }

  function deleteCategory(cat: string) {
    const updated = { ...taxonomy };
    delete updated[cat];
    if (selectedCat === cat) setSelectedCat(Object.keys(updated)[0] ?? null);
    commit(updated);
  }

  function startEditCat(cat: string) {
    setEditingCat(cat);
    setEditCatValue(cat);
  }

  function confirmEditCat(oldName: string) {
    const newName = editCatValue.trim();
    if (!newName || (newName !== oldName && taxonomy[newName])) {
      setEditingCat(null);
      return;
    }
    if (newName === oldName) { setEditingCat(null); return; }
    // Rebuild preserving order
    const updated: CategoryTaxonomy = {};
    for (const k of Object.keys(taxonomy)) {
      updated[k === oldName ? newName : k] = taxonomy[k];
    }
    if (selectedCat === oldName) setSelectedCat(newName);
    setEditingCat(null);
    commit(updated);
  }

  function addSubcategory() {
    if (!selectedCat) return;
    const name = newSubInput.trim();
    if (!name) return;
    const subs = taxonomy[selectedCat] ?? [];
    if (subs.includes(name)) return;
    commit({ ...taxonomy, [selectedCat]: [...subs, name] });
    setNewSubInput('');
  }

  function deleteSubcategory(cat: string, sub: string) {
    commit({ ...taxonomy, [cat]: taxonomy[cat].filter(s => s !== sub) });
  }

  function resetDefaults() {
    const def = structuredClone(DEFAULT_TAXONOMY);
    setSelectedCat(Object.keys(def)[0] ?? null);
    commit(def);
  }

  const subcategories = selectedCat ? (taxonomy[selectedCat] ?? []) : [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <SettingsIcon size={22} className="text-slate-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings</h1>
            <p className="text-slate-400 text-sm mt-0.5">Configure invoice categories and application preferences</p>
          </div>
        </div>
      </div>

      {/* Category Taxonomy */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Category Taxonomy</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Categories and subcategories used for invoice classification — editable anytime
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <Check size={11} /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={resetDefaults}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={12} /> Reset to Defaults
            </button>
          </div>
        </div>

        <div className="flex" style={{ height: '520px' }}>
          {/* Left: Category list */}
          <div className="w-72 border-r border-slate-100 flex flex-col shrink-0">
            <div className="px-3 pt-3 pb-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                Categories ({categories.length})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5">
              {categories.map(cat => (
                <div
                  key={cat}
                  onClick={() => { setSelectedCat(cat); setEditingCat(null); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer group transition-colors ${
                    selectedCat === cat
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${categoryDotStyle(cat, categories)}`} />
                  {editingCat === cat ? (
                    <input
                      autoFocus
                      value={editCatValue}
                      onChange={e => setEditCatValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmEditCat(cat);
                        if (e.key === 'Escape') setEditingCat(null);
                      }}
                      onBlur={() => confirmEditCat(cat)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-xs border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm font-medium truncate"
                      onDoubleClick={e => { e.stopPropagation(); startEditCat(cat); }}
                      title="Double-click to rename"
                    >
                      {cat}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {(taxonomy[cat] ?? []).length}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); deleteCategory(cat); }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    title="Delete category"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No categories yet</p>
              )}
            </div>
            <div className="p-3 border-t border-slate-100">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="New category name…"
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300"
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={!newCatInput.trim()}
                  className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
                  title="Add category"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Subcategory list */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedCat ? (
              <>
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${categoryDotStyle(selectedCat, categories)}`} />
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Subcategories of</p>
                    <p className="font-semibold text-slate-900">{selectedCat}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                  {subcategories.map(sub => (
                    <div key={sub} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 group">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      <span className="flex-1 text-sm text-slate-700">{sub}</span>
                      <button
                        type="button"
                        onClick={() => deleteSubcategory(selectedCat, sub)}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Delete subcategory"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {subcategories.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No subcategories yet — add one below
                    </p>
                  )}
                </div>
                <div className="p-3 border-t border-slate-100">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newSubInput}
                      onChange={e => setNewSubInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addSubcategory()}
                      placeholder={`New subcategory for "${selectedCat}"…`}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300"
                    />
                    <button
                      type="button"
                      onClick={addSubcategory}
                      disabled={!newSubInput.trim()}
                      className="w-8 h-8 flex items-center justify-center bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
                      title="Add subcategory"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Select a category to manage its subcategories
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tip */}
      <p className="text-xs text-slate-400 text-center">
        Tip: Double-click a category name to rename it. Changes take effect immediately across all invoices.
      </p>
    </div>
  );
}
