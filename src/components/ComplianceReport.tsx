import { useState } from 'react';
import {
  Shield,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  MessageSquare,
  FileWarning,
  Info,
} from 'lucide-react';
import type { ComplianceReport, Severity, CheckStatus } from '../lib/compliance';

// ── Score colouring ────────────────────────────────────────────────────────────
function scoreTheme(score: number) {
  if (score >= 80)
    return {
      headerBg: 'bg-emerald-50',
      border: 'border-emerald-200',
      ring: 'text-emerald-600',
      badge: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
      label: 'Audit Ready',
    };
  if (score >= 60)
    return {
      headerBg: 'bg-amber-50',
      border: 'border-amber-200',
      ring: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-700 border border-amber-300',
      label: 'Needs Review',
    };
  return {
    headerBg: 'bg-red-50',
    border: 'border-red-200',
    ring: 'text-red-600',
    badge: 'bg-red-100 text-red-700 border border-red-300',
    label: 'Action Required',
  };
}

// ── Severity styling ──────────────────────────────────────────────────────────
const SEV: Record<Severity, { bg: string; border: string; text: string; badge: string; chip: string }> = {
  CRITICAL: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
    chip: 'bg-red-100 text-red-700 border border-red-200',
  },
  WARNING: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    chip: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  INFO: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    chip: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
};

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status, severity }: { status: CheckStatus; severity: Severity }) {
  if (status === 'PASS') return <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />;
  if (status === 'UNKNOWN') return <HelpCircle size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />;
  // FAIL
  if (severity === 'CRITICAL') return <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />;
  if (severity === 'WARNING') return <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />;
  return <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ComplianceReportPanel({ report }: { report: ComplianceReport }) {
  const [expanded, setExpanded] = useState(true);
  const [showPassed, setShowPassed] = useState(false);

  const theme = scoreTheme(report.overall_score);
  const { CRITICAL, WARNING, INFO } = report.severity_summary;

  // Group checks by category
  const categories = Array.from(new Set(report.checks.map(c => c.category)));

  const visibleChecks = showPassed
    ? report.checks
    : report.checks.filter(c => c.status !== 'PASS');

  const taxTypeMatch =
    report.gst_tax_type_expected === 'UNKNOWN' ||
    report.gst_tax_type_found === 'UNKNOWN' ||
    report.gst_tax_type_found === 'NONE' ||
    report.gst_tax_type_expected === report.gst_tax_type_found;

  return (
    <div className={`rounded-xl border ${theme.border} overflow-hidden`}>
      {/* ── Header (always visible) ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 ${theme.headerBg} hover:opacity-95 transition-opacity text-left`}
      >
        <Shield size={15} className={theme.ring} />
        <span className="font-semibold text-slate-800 text-sm">Compliance Check</span>

        {/* Score badge */}
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${theme.badge}`}>
          {report.overall_score}/100 · {theme.label}
        </span>

        {/* Severity chips */}
        <div className="flex items-center gap-1.5 ml-auto">
          {CRITICAL > 0 && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${SEV.CRITICAL.chip}`}>
              {CRITICAL} CRITICAL
            </span>
          )}
          {WARNING > 0 && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${SEV.WARNING.chip}`}>
              {WARNING} WARNING
            </span>
          )}
          {INFO > 0 && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${SEV.INFO.chip}`}>
              {INFO} INFO
            </span>
          )}
          {CRITICAL === 0 && WARNING === 0 && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
              All clear
            </span>
          )}
        </div>

        {expanded
          ? <ChevronUp size={14} className="text-slate-400 ml-1 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 ml-1 flex-shrink-0" />}
      </button>

      {/* ── Body (expandable) ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="bg-white divide-y divide-slate-100">

          {/* Key Risks */}
          {report.key_risks.length > 0 && (
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Key Risks (top {report.key_risks.length})
              </p>
              <div className="space-y-2.5">
                {report.key_risks.map((risk, i) => {
                  const col = SEV[risk.severity as Severity];
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${col.bg} ${col.border}`}>
                      <div className="flex items-start gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${col.badge} flex-shrink-0 mt-0.5`}>
                          {risk.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${col.text} leading-snug`}>{risk.issue}</p>
                          <p className="text-xs text-slate-500 mt-1.5">
                            <span className="font-semibold">Why it matters: </span>
                            {risk.why_it_matters}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            <span className="font-semibold">Fix: </span>
                            {risk.fix}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* GST Type Summary */}
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-slate-50">
            <span className="text-slate-500 font-medium">GST Type Expected:</span>
            <span className="font-semibold text-slate-700">{report.gst_tax_type_expected}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500 font-medium">Found on Invoice:</span>
            <span className={`font-semibold ${taxTypeMatch ? 'text-emerald-600' : 'text-red-600'}`}>
              {report.gst_tax_type_found}
            </span>
            {!taxTypeMatch && <AlertTriangle size={12} className="text-red-500" />}
          </div>

          {/* All Checks */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                All Checks ({report.checks.length})
              </p>
              <button
                type="button"
                onClick={() => setShowPassed(v => !v)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showPassed ? 'Hide passed' : 'Show passed'}
              </button>
            </div>

            {visibleChecks.length === 0 ? (
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                <CheckCircle2 size={13} /> All checks passed — no issues found.
              </p>
            ) : (
              <div className="space-y-4">
                {categories.map(cat => {
                  const catChecks = visibleChecks.filter(c => c.category === cat);
                  if (catChecks.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 pl-0.5">
                        {cat}
                      </p>
                      <div className="space-y-1.5">
                        {catChecks.map(c => (
                          <div key={c.id} className="flex items-start gap-2">
                            <StatusIcon status={c.status} severity={c.severity} />
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-[10px] text-slate-400 mr-1">[{c.id}]</span>
                              <span
                                className={`text-xs ${
                                  c.status === 'PASS'
                                    ? 'text-slate-500'
                                    : c.status === 'UNKNOWN'
                                    ? 'text-slate-400 italic'
                                    : c.severity === 'CRITICAL'
                                    ? 'text-red-700 font-medium'
                                    : c.severity === 'WARNING'
                                    ? 'text-amber-700'
                                    : 'text-blue-700'
                                }`}
                              >
                                {c.message}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes for accounts team */}
          {report.notes_for_accounts_team.length > 0 && (
            <div className="p-4 bg-amber-50">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <FileWarning size={12} className="text-amber-500" />
                Notes for Accounts Team
              </p>
              <ul className="space-y-1.5">
                {report.notes_for_accounts_team.map((note, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                    <span className="text-amber-400 flex-shrink-0 mt-0.5 font-bold">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested followups to vendor */}
          {report.suggested_followups_to_vendor.length > 0 && (
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <MessageSquare size={12} className="text-indigo-400" />
                Suggested Followups to Vendor
              </p>
              <ul className="space-y-2">
                {report.suggested_followups_to_vendor.map((note, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 bg-indigo-50 rounded-lg px-3 py-2.5 border border-indigo-100 italic leading-relaxed"
                  >
                    "{note}"
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
