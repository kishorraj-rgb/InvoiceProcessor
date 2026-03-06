// ── Admin / Company Document Repository ─────────────────────────────────────
import { supabase } from './supabase';

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

export const EMPTY_COMPANY: CompanyData = {
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

export async function fetchCompanyData(): Promise<{ id: string | null; data: CompanyData }> {
  const { data: rows, error } = await supabase
    .from('company_data')
    .select('*')
    .limit(1);
  if (error) throw error;
  if (rows && rows.length > 0) {
    return { id: rows[0].id, data: { ...EMPTY_COMPANY, ...rows[0].data } };
  }
  return { id: null, data: { ...EMPTY_COMPANY } };
}

export async function saveCompanyData(id: string | null, data: CompanyData): Promise<string> {
  if (id) {
    const { error } = await supabase
      .from('company_data')
      .update({ data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data: row, error } = await supabase
    .from('company_data')
    .insert({ data })
    .select()
    .single();
  if (error) throw error;
  return row.id;
}
