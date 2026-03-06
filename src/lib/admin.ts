// ── Admin / Company Document Repository ─────────────────────────────────────

export interface Signatory {
  name: string;
  designation: string;
  phone: string;
  email: string;
  pan: string;
  aadhaar: string;
  panFileUrl?: string;
  aadhaarFileUrl?: string;
}

export interface CompanyData {
  companyName: string;
  pan: string;
  tan: string;
  cin: string;
  gstin: string;
  dateOfIncorporation: string;
  address: string;
  signatories: Signatory[];
  pocName: string;
  pocPhone: string;
  pocEmail: string;
  // file URLs
  panFileUrl?: string;
  tanFileUrl?: string;
  cinFileUrl?: string;
  gstinFileUrl?: string;
  incorporationFileUrl?: string;
}

const STORAGE_KEY = 'ip-admin-company';

const EMPTY: CompanyData = {
  companyName: '',
  pan: '',
  tan: '',
  cin: '',
  gstin: '',
  dateOfIncorporation: '',
  address: '',
  signatories: [],
  pocName: '',
  pocPhone: '',
  pocEmail: '',
};

export function getCompanyData(): CompanyData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CompanyData;
      if (parsed && typeof parsed === 'object') return { ...EMPTY, ...parsed };
    }
  } catch {}
  return { ...EMPTY };
}

export function saveCompanyData(data: CompanyData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}
