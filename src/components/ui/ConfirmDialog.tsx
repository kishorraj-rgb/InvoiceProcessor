import { useEffect, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** 'confirm' shows Cancel + Action buttons; 'alert' shows only OK */
  mode?: 'confirm' | 'alert';
  /** Label for the primary action button (default: "Delete" for confirm, "OK" for alert) */
  actionLabel?: string;
  /** Visual variant for the primary action */
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  mode = 'confirm',
  actionLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) actionRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isAlert = mode === 'alert';
  const label = actionLabel ?? (isAlert ? 'OK' : 'Delete');
  const isDanger = variant === 'danger' && !isAlert;
  const Icon = isDanger ? AlertTriangle : Info;
  const iconBg = isDanger ? 'bg-red-100' : 'bg-indigo-100';
  const iconColor = isDanger ? 'text-red-600' : 'text-indigo-600';

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon size={20} className={iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{message}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 shrink-0 -mt-0.5 -mr-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          {!isAlert && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            ref={actionRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDanger
                ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-300'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-300'
            } focus:outline-none`}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
