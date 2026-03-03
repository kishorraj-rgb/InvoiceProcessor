// ── Invoice Category Taxonomy ─────────────────────────────────────────────────

export interface CategoryTaxonomy {
  [category: string]: string[];
}

export const DEFAULT_TAXONOMY: CategoryTaxonomy = {
  'Cloud & Infrastructure Services': ['Data Center / Hosting'],
  'Consulting / Professional Services': ['Engineering Services', 'Recruitment Services'],
  'Content Production': [
    'Animation / Creative Services',
    'Applets',
    'Director',
    'Post Production',
    'Production',
    'Sound Production',
    'Talent',
  ],
  'IT Assets & Equipment': ['Hardware'],
  'Localization Services': ['Dubbing', 'Salary / Freelancer', 'Translation'],
  'SaaS Subscription': [
    '11Labs', 'Adobe', 'AnyDesk', 'ChatGPT', 'Claude', 'Cursor',
    'Figma', 'HeyGen', 'Kling AI', 'Maestra', 'SetApp', 'ShutterStock',
    'VocalRemover', 'Wan',
  ],
  'Studio / Production Services': ['Production'],
  'Travel & Field Operations': ['Travel'],
  'Workspace & Facilities': ['Office Rent / Co-working'],
};

const STORAGE_KEY = 'ip-category-taxonomy';

export function getTaxonomy(): CategoryTaxonomy {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CategoryTaxonomy;
  } catch {}
  return structuredClone(DEFAULT_TAXONOMY);
}

export function saveTaxonomy(taxonomy: CategoryTaxonomy): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(taxonomy));
    window.dispatchEvent(new Event('ip-taxonomy-updated'));
  } catch {}
}

// ── Stable colour palette ─────────────────────────────────────────────────────
// Colours are assigned by index in the category list for consistency.

const PILL_STYLES = [
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-orange-100 text-orange-700 border-orange-200',
];

const DOT_STYLES = [
  'bg-indigo-400', 'bg-violet-400', 'bg-rose-400', 'bg-cyan-400',
  'bg-amber-400', 'bg-blue-400', 'bg-purple-400', 'bg-sky-400',
  'bg-teal-400', 'bg-emerald-400', 'bg-pink-400', 'bg-orange-400',
];

function colorIndex(category: string, allCategories: string[]): number {
  const i = allCategories.indexOf(category);
  return (i >= 0 ? i : 0) % PILL_STYLES.length;
}

export function categoryPillStyle(category: string, allCategories: string[]): string {
  return PILL_STYLES[colorIndex(category, allCategories)];
}

export function categoryDotStyle(category: string, allCategories: string[]): string {
  return DOT_STYLES[colorIndex(category, allCategories)];
}
