// ── Billing Accounts ─────────────────────────────────────────────────────────

export interface BillingAccount {
  email: string;
  label?: string;
}

const STORAGE_KEY = 'ip-billing-accounts';

export function getBillingAccounts(): BillingAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BillingAccount[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveBillingAccounts(accounts: BillingAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new Event('ip-accounts-updated'));
  } catch {}
}
