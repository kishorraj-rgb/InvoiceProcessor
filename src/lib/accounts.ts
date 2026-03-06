// ── Billing Accounts ─────────────────────────────────────────────────────────

export interface BillingAccount {
  email: string;
  label?: string;
}

const STORAGE_KEY = 'ip-billing-accounts';

const DEFAULT_ACCOUNTS: BillingAccount[] = [
  { email: 'etpt.creates@gmail.com', label: 'ETPT Creates' },
];

export function getBillingAccounts(): BillingAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BillingAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return structuredClone(DEFAULT_ACCOUNTS);
}

export function saveBillingAccounts(accounts: BillingAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new Event('ip-accounts-updated'));
  } catch {}
}
