import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, ChevronRight, BarChart3 } from 'lucide-react';
import { getInvoices } from '../lib/supabase';
import { getTaxonomy, categoryDotStyle, categoryPillStyle } from '../lib/categories';
import type { Invoice } from '../types';

function formatCurrency(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatCurrencyShort(n: number) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function Categories() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [taxonomy, setTaxonomy] = useState(getTaxonomy);

  useEffect(() => {
    function onUpdate() { setTaxonomy(getTaxonomy()); }
    window.addEventListener('ip-taxonomy-updated', onUpdate);
    return () => window.removeEventListener('ip-taxonomy-updated', onUpdate);
  }, []);

  useEffect(() => {
    getInvoices()
      .then(data => { setInvoices(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const allCategories = Object.keys(taxonomy);

  const categoryStats = useMemo(() => {
    const map: Record<string, { count: number; spend: number; subcategories: Set<string> }> = {};
    for (const inv of invoices) {
      const cat = inv.category || 'Uncategorized';
      if (!map[cat]) map[cat] = { count: 0, spend: 0, subcategories: new Set() };
      map[cat].count++;
      map[cat].spend += inv.total_amount || 0;
      if (inv.subcategory) map[cat].subcategories.add(inv.subcategory);
    }
    return Object.entries(map)
      .map(([name, s]) => ({
        name,
        count: s.count,
        spend: s.spend,
        subcategories: Array.from(s.subcategories).sort(),
        subcategoryCount: s.subcategories.size,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [invoices]);

  const maxSpend = Math.max(...categoryStats.map(c => c.spend), 1);
  const totalSpend = categoryStats.reduce((s, c) => s + c.spend, 0);

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm">Loading categories…</div>;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Tag size={22} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Categories</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Spend across {categoryStats.length} categories · {invoices.length} invoices total
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{formatCurrencyShort(totalSpend)}</p>
          <p className="text-xs text-slate-400">Total Spend</p>
        </div>
      </div>

      {categoryStats.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-24 text-center">
          <BarChart3 size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">No categorized invoices yet</p>
          <p className="text-slate-300 text-xs mt-1">
            Assign categories to invoices in the Invoice Tracker or during upload
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categoryStats.map(cat => {
            const pct = Math.round((cat.spend / maxSpend) * 100);
            const pillStyle = categoryPillStyle(cat.name, allCategories);
            const dotStyle = categoryDotStyle(cat.name, allCategories);

            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => navigate(`/categories/${encodeURIComponent(cat.name)}`)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer"
              >
                {/* Name row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotStyle}`} />
                    <h3 className="font-semibold text-slate-800 text-sm truncate">{cat.name}</h3>
                  </div>
                  <ChevronRight
                    size={15}
                    className="text-slate-300 group-hover:text-indigo-400 shrink-0 ml-2 transition-colors"
                  />
                </div>

                {/* Spend */}
                <p className="text-2xl font-bold text-slate-900 mb-1">{formatCurrency(cat.spend)}</p>

                {/* Meta */}
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                  <span>{cat.count} invoice{cat.count !== 1 ? 's' : ''}</span>
                  {cat.subcategoryCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {cat.subcategoryCount} sub-categor{cat.subcategoryCount !== 1 ? 'ies' : 'y'}
                      </span>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full transition-all ${dotStyle}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Subcategory pills */}
                {cat.subcategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cat.subcategories.slice(0, 3).map(sub => (
                      <span
                        key={sub}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${pillStyle}`}
                      >
                        {sub}
                      </span>
                    ))}
                    {cat.subcategories.length > 3 && (
                      <span className="text-[10px] text-slate-400 px-2 py-0.5">
                        +{cat.subcategories.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
