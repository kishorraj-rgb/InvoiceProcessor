import type { ExtractedInvoiceData } from '../types';

// ── Recipient master (your company) ──────────────────────────────────────────
export const RECIPIENT_MASTER = {
  legal_name: 'Classroots Learning Innovations Private Limited',
  gstin: '29AANCC1915G1ZL',
  state: 'Karnataka',
  state_code: '29',
} as const;

// ── Indian GST state code lookup ──────────────────────────────────────────────
const STATE_NAME_TO_CODE: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'haryana': '06',
  'delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'chhattisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  'maharashtra': '27',
  'andhra pradesh': '37',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33',
  'pondicherry': '34',
  'puducherry': '34',
  'andaman and nicobar': '35',
  'telangana': '36',
  'ladakh': '38',
};

// ── Types ─────────────────────────────────────────────────────────────────────
export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type Severity = 'CRITICAL' | 'WARNING' | 'INFO';
export type GSTTypeExpected = 'CGST_SGST' | 'IGST' | 'UNKNOWN';
export type GSTTypeFound = 'CGST_SGST' | 'IGST' | 'MIXED' | 'NONE' | 'UNKNOWN';

export interface ComplianceCheck {
  id: string;
  category: string;
  field: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  evidence_path: string;
}

export interface KeyRisk {
  severity: Severity;
  issue: string;
  why_it_matters: string;
  fix: string;
}

export interface ComplianceReport {
  overall_score: number;
  severity_summary: { CRITICAL: number; WARNING: number; INFO: number };
  gst_tax_type_expected: GSTTypeExpected;
  gst_tax_type_found: GSTTypeFound;
  checks: ComplianceCheck[];
  key_risks: KeyRisk[];
  notes_for_accounts_team: string[];
  suggested_followups_to_vendor: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function present(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function getStateCodeFromGSTIN(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.substring(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

function getStateCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  // Handle "29 - Karnataka" or "29-Karnataka" format
  const codeMatch = name.match(/^(\d{2})\s*[-–]/);
  if (codeMatch) return codeMatch[1];
  return STATE_NAME_TO_CODE[name.toLowerCase().trim()] ?? null;
}

// ── Risk detail lookup ────────────────────────────────────────────────────────
const RISK_DETAILS: Record<string, { why: string; fix: string }> = {
  A1: {
    why: 'A valid GST invoice must identify the supplier by legal name.',
    fix: 'Request a corrected invoice from the vendor with their full legal entity name.',
  },
  A2: {
    why: 'Supplier GSTIN is mandatory on any GST invoice; without it ITC cannot be claimed.',
    fix: 'Ask vendor to share their GSTIN and provide a corrected invoice.',
  },
  A3: {
    why: 'PAN is required for TDS compliance and Form 26AS reconciliation.',
    fix: 'Obtain vendor PAN and update the vendor master record.',
  },
  A4: {
    why: 'Supplier address is a mandatory field on a GST tax invoice per Rule 46 of CGST Rules.',
    fix: 'Request invoice reissue with the complete registered address.',
  },
  A5: {
    why: 'Without supplier state, CGST/SGST vs IGST applicability cannot be verified.',
    fix: 'Validate supplier GSTIN on the GST portal (gst.gov.in).',
  },
  A6: {
    why: 'Invalid GSTIN format may indicate OCR error, typo, or fraudulent document.',
    fix: 'Verify the GSTIN on the GST portal before booking.',
  },
  B1: {
    why: 'Invoice number is mandatory under Sec 31 of CGST Act; missing it makes the document invalid.',
    fix: 'Request a corrected invoice with a proper sequential invoice number.',
  },
  B2: {
    why: 'Invoice date is mandatory for ITC eligibility and determines the GSTR filing period.',
    fix: 'Request corrected invoice with the actual date of supply.',
  },
  B3: {
    why: 'Document type (Tax Invoice / Credit Note / Proforma) affects accounting treatment and GST returns.',
    fix: 'Identify document type from context and update manually.',
  },
  B4: {
    why: 'Place of supply is mandatory to determine the correct tax type (IGST vs CGST+SGST) under IGST Act.',
    fix: 'Obtain from vendor or infer from delivery/service location.',
  },
  C1: {
    why: 'Recipient name must appear on the invoice for ITC eligibility under GST rules.',
    fix: "Request corrected invoice with buyer's legal name.",
  },
  C2: {
    why: "Recipient GSTIN is required to link the invoice to the buyer's GSTR-2A for ITC.",
    fix: `Request corrected invoice with our GSTIN: ${RECIPIENT_MASTER.gstin}`,
  },
  C3: {
    why: 'GSTIN mismatch means this invoice cannot be matched in GSTR-2A — ITC is unclaimable.',
    fix: `Request revised invoice with correct GSTIN: ${RECIPIENT_MASTER.gstin}`,
  },
  C4: {
    why: 'State code in GSTIN must match registered state; mismatch suggests typo or fraud.',
    fix: 'Verify GSTIN with vendor and request corrected invoice.',
  },
  D1: {
    why: 'Without line items, the invoice lacks proof of supply — ITC is jeopardised.',
    fix: 'Request an itemised invoice from the vendor.',
  },
  D2: {
    why: 'HSN/SAC codes are mandatory for GSTR-1 filing and goods/service classification.',
    fix: 'Ask vendor to add HSN/SAC codes to every line item.',
  },
  D3: {
    why: 'Taxable value per line is required to verify GST computation and for audit.',
    fix: 'Request itemised invoice or compute from rate × quantity.',
  },
  D4: {
    why: 'Per-line GST amounts are needed for GSTR-2A reconciliation and audit.',
    fix: 'Request invoice with per-line CGST/SGST/IGST breakdown.',
  },
  E1: {
    why: 'Grand total is required for payment processing and journal entry.',
    fix: 'Compute from subtotal + tax and confirm with vendor.',
  },
  E2: {
    why: 'Subtotal inconsistency may indicate missing line items or calculation error.',
    fix: 'Reconcile line items; request revised invoice if discrepancy is significant.',
  },
  E3: {
    why: 'Tax total components must reconcile for correct ITC booking.',
    fix: 'Verify CGST/SGST/IGST figures with vendor.',
  },
  E4: {
    why: 'Grand total arithmetic must be correct for payment and audit reconciliation.',
    fix: 'Manually verify; request revised invoice if the discrepancy is material.',
  },
  H1: {
    why: 'TDS must be correctly calculated for compliance with Income Tax Act.',
    fix: 'Compute TDS manually and record in payment voucher.',
  },
  H2: {
    why: 'Without PAN, TDS must be deducted at 20% (Sec 206AA) instead of the applicable rate.',
    fix: 'Obtain vendor PAN before processing payment.',
  },
  T1: {
    why: 'Wrong GST type means tax has gone to the wrong government — ITC cannot be utilised.',
    fix: 'Contact vendor to issue a revised invoice with the correct GST type.',
  },
  T2: {
    why: 'Mixed CGST/SGST and IGST on the same invoice is not valid under GST rules.',
    fix: 'Request a corrected invoice with only CGST+SGST or only IGST.',
  },
};

// ── Main compliance check function ────────────────────────────────────────────
export function runComplianceCheck(invoice: ExtractedInvoiceData): ComplianceReport {
  const checks: ComplianceCheck[] = [];

  function add(
    id: string,
    category: string,
    field: string,
    status: CheckStatus,
    severity: Severity,
    message: string,
    evidencePath: string,
  ) {
    checks.push({ id, category, field, status, severity, message, evidence_path: evidencePath });
  }

  const gstCharged =
    (invoice.tax_amount ?? 0) > 0 ||
    (invoice.cgst_amount ?? 0) > 0 ||
    (invoice.sgst_amount ?? 0) > 0 ||
    (invoice.igst_amount ?? 0) > 0;

  const supplierStateCode = getStateCodeFromGSTIN(invoice.vendor_gstin);

  // ── A) Supplier Details ────────────────────────────────────────────────────
  add(
    'A1', 'Supplier Details', 'legal_name',
    present(invoice.vendor_name) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.vendor_name)
      ? `Supplier name: "${invoice.vendor_name}"`
      : 'Supplier legal name is missing — mandatory for a valid GST invoice.',
    'vendor_name',
  );

  add(
    'A2', 'Supplier Details', 'gstin',
    present(invoice.vendor_gstin) ? 'PASS' : (gstCharged ? 'FAIL' : 'UNKNOWN'), 'CRITICAL',
    present(invoice.vendor_gstin)
      ? `Supplier GSTIN: ${invoice.vendor_gstin}`
      : gstCharged
        ? 'Supplier GSTIN is missing even though GST is charged — ITC claim will be invalid.'
        : 'Supplier GSTIN not found. If GST is charged, this is mandatory.',
    'vendor_gstin',
  );

  if (present(invoice.vendor_gstin)) {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
    const valid = gstinRegex.test((invoice.vendor_gstin ?? '').trim().toUpperCase());
    add(
      'A6', 'Supplier Details', 'gstin_format',
      valid ? 'PASS' : 'FAIL', 'WARNING',
      valid
        ? 'Supplier GSTIN format is valid (15-char).'
        : `Supplier GSTIN "${invoice.vendor_gstin}" does not match the expected 15-char format.`,
      'vendor_gstin',
    );
  }

  add(
    'A3', 'Supplier Details', 'pan',
    present(invoice.vendor_pan) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.vendor_pan)
      ? `Supplier PAN: ${invoice.vendor_pan}`
      : 'Supplier PAN is missing — required for TDS compliance and higher-value transactions.',
    'vendor_pan',
  );

  add(
    'A4', 'Supplier Details', 'address',
    present(invoice.vendor_address) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.vendor_address)
      ? 'Supplier address is present.'
      : 'Supplier address is missing — required on a valid GST invoice.',
    'vendor_address',
  );

  add(
    'A5', 'Supplier Details', 'state_derivable',
    supplierStateCode ? 'PASS' : 'FAIL', 'WARNING',
    supplierStateCode
      ? `Supplier state code derived from GSTIN: ${supplierStateCode}`
      : 'Cannot determine supplier state (GSTIN missing/invalid) — IGST vs CGST/SGST cannot be validated.',
    'vendor_gstin',
  );

  // ── B) Invoice Identity & Dates ────────────────────────────────────────────
  add(
    'B1', 'Invoice Identity & Dates', 'invoice_number',
    present(invoice.invoice_number) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.invoice_number)
      ? `Invoice number: ${invoice.invoice_number}`
      : 'Invoice number is missing — mandatory for a valid GST invoice.',
    'invoice_number',
  );

  add(
    'B2', 'Invoice Identity & Dates', 'invoice_date',
    present(invoice.invoice_date) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.invoice_date)
      ? `Invoice date: ${invoice.invoice_date}`
      : 'Invoice date is missing — mandatory for GST compliance and ITC filing timelines.',
    'invoice_date',
  );

  add(
    'B3', 'Invoice Identity & Dates', 'document_type',
    present(invoice.document_type) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.document_type)
      ? `Document type: ${invoice.document_type}`
      : 'Document type not identified (Tax Invoice / Proforma / Credit Note etc.) — verify manually.',
    'document_type',
  );

  add(
    'B4', 'Invoice Identity & Dates', 'place_of_supply',
    present(invoice.place_of_supply) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.place_of_supply)
      ? `Place of supply: ${invoice.place_of_supply}`
      : 'Place of supply is missing — mandatory; determines CGST/SGST vs IGST applicability.',
    'place_of_supply',
  );

  add(
    'B5', 'Invoice Identity & Dates', 'due_date',
    present(invoice.due_date) ? 'PASS' : 'FAIL', 'INFO',
    present(invoice.due_date)
      ? `Due date: ${invoice.due_date}`
      : 'Due date not specified — payment tracking will be manual.',
    'due_date',
  );

  // ── C) Recipient Details ───────────────────────────────────────────────────
  add(
    'C1', 'Recipient Details', 'legal_name',
    present(invoice.buyer_name) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.buyer_name)
      ? `Recipient on invoice: "${invoice.buyer_name}"`
      : 'Recipient (Bill-To) name is missing — ITC eligibility at risk.',
    'buyer_name',
  );

  add(
    'C2', 'Recipient Details', 'gstin',
    present(invoice.buyer_gstin) ? 'PASS' : 'FAIL', 'CRITICAL',
    present(invoice.buyer_gstin)
      ? `Recipient GSTIN on invoice: ${invoice.buyer_gstin}`
      : `Recipient GSTIN is missing — ITC cannot be claimed. Our GSTIN: ${RECIPIENT_MASTER.gstin}`,
    'buyer_gstin',
  );

  if (present(invoice.buyer_gstin)) {
    const invoiceGSTIN = (invoice.buyer_gstin ?? '').trim().toUpperCase();
    const masterGSTIN = RECIPIENT_MASTER.gstin.toUpperCase();
    const matches = invoiceGSTIN === masterGSTIN;
    add(
      'C3', 'Recipient Details', 'gstin_matches_master',
      matches ? 'PASS' : 'FAIL', 'CRITICAL',
      matches
        ? `Recipient GSTIN matches our master record (${masterGSTIN}).`
        : `Recipient GSTIN on invoice (${invoiceGSTIN}) does NOT match our GSTIN (${masterGSTIN}) — ITC cannot be claimed.`,
      'buyer_gstin',
    );

    const recipientStateFromGSTIN = getStateCodeFromGSTIN(invoice.buyer_gstin);
    if (recipientStateFromGSTIN) {
      const stateOk = recipientStateFromGSTIN === RECIPIENT_MASTER.state_code;
      add(
        'C4', 'Recipient Details', 'gstin_state_consistent',
        stateOk ? 'PASS' : 'FAIL', 'CRITICAL',
        stateOk
          ? `Recipient GSTIN state code (${recipientStateFromGSTIN}) matches Karnataka (29).`
          : `Recipient GSTIN state code "${recipientStateFromGSTIN}" does not match expected "29" (Karnataka) — possible GSTIN error.`,
        'buyer_gstin',
      );
    }
  }

  add(
    'C5', 'Recipient Details', 'address',
    present(invoice.buyer_address) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.buyer_address)
      ? 'Recipient address is present.'
      : 'Recipient address missing from invoice.',
    'buyer_address',
  );

  // ── D) Line Items & Tax Details ────────────────────────────────────────────
  const lineItems = invoice.line_items ?? [];

  add(
    'D1', 'Line Items & Tax Details', 'line_items_present',
    lineItems.length > 0 ? 'PASS' : 'FAIL', 'CRITICAL',
    lineItems.length > 0
      ? `${lineItems.length} line item(s) found.`
      : 'No line items found — service/goods description is required for a valid invoice.',
    'line_items',
  );

  if (lineItems.length > 0) {
    const missingHSN = lineItems.filter(li => !present(li.hsn_sac_code)).length;
    add(
      'D2', 'Line Items & Tax Details', 'hsn_sac_code',
      missingHSN === 0 ? 'PASS' : 'FAIL', 'CRITICAL',
      missingHSN === 0
        ? 'All line items have HSN/SAC codes.'
        : `${missingHSN} of ${lineItems.length} line item(s) missing HSN/SAC code — mandatory for GST invoices.`,
      'line_items[*].hsn_sac_code',
    );

    const missingBasic = lineItems.filter(li => li.basic_amount == null).length;
    add(
      'D3', 'Line Items & Tax Details', 'taxable_value',
      missingBasic === 0 ? 'PASS' : 'FAIL', 'CRITICAL',
      missingBasic === 0
        ? 'All line items have taxable values (basic amount).'
        : `${missingBasic} line item(s) missing taxable value (basic amount).`,
      'line_items[*].basic_amount',
    );

    if (gstCharged) {
      const missingGST = lineItems.filter(
        li => li.cgst_amount == null && li.sgst_amount == null && li.igst_amount == null,
      ).length;
      add(
        'D4', 'Line Items & Tax Details', 'line_item_gst_amounts',
        missingGST === 0 ? 'PASS' : 'FAIL', 'CRITICAL',
        missingGST === 0
          ? 'GST amounts present on all line items.'
          : `${missingGST} line item(s) missing GST breakdown (CGST/SGST/IGST amounts).`,
        'line_items[*].cgst_amount',
      );
    }
  }

  // ── E) Totals & Calculations ───────────────────────────────────────────────
  add(
    'E1', 'Totals & Calculations', 'grand_total',
    invoice.total_amount != null ? 'PASS' : 'FAIL', 'CRITICAL',
    invoice.total_amount != null
      ? `Grand total: ₹${invoice.total_amount.toLocaleString('en-IN')}`
      : 'Grand total (payable amount) is missing.',
    'total_amount',
  );

  if (lineItems.length > 0 && invoice.subtotal != null) {
    const sumBasic = lineItems.reduce((s, li) => s + (li.basic_amount ?? 0), 0);
    const diff = Math.abs(sumBasic - invoice.subtotal);
    add(
      'E2', 'Totals & Calculations', 'subtotal_consistency',
      diff <= 1 ? 'PASS' : 'FAIL', 'WARNING',
      diff <= 1
        ? `Subtotal ₹${invoice.subtotal} is consistent with line items sum ₹${sumBasic.toFixed(2)}.`
        : `Subtotal mismatch: invoice shows ₹${invoice.subtotal}, line items sum to ₹${sumBasic.toFixed(2)} (diff ₹${diff.toFixed(2)}).`,
      'subtotal',
    );
  }

  const totalCGST = invoice.cgst_amount ?? 0;
  const totalSGST = invoice.sgst_amount ?? 0;
  const totalIGST = invoice.igst_amount ?? 0;
  const computedTax = totalCGST + totalSGST + totalIGST;

  if (invoice.tax_amount != null && computedTax > 0) {
    const diff = Math.abs(computedTax - invoice.tax_amount);
    add(
      'E3', 'Totals & Calculations', 'tax_total_consistency',
      diff <= 1 ? 'PASS' : 'FAIL', 'WARNING',
      diff <= 1
        ? `Tax total ₹${invoice.tax_amount} consistent with CGST+SGST+IGST = ₹${computedTax.toFixed(2)}.`
        : `Tax total mismatch: CGST+SGST+IGST = ₹${computedTax.toFixed(2)}, invoice shows ₹${invoice.tax_amount} (diff ₹${diff.toFixed(2)}).`,
      'tax_amount',
    );
  }

  if (invoice.subtotal != null && invoice.total_amount != null && computedTax > 0) {
    const expected = invoice.subtotal + computedTax + (invoice.round_off ?? 0);
    const diff = Math.abs(expected - invoice.total_amount);
    add(
      'E4', 'Totals & Calculations', 'grand_total_arithmetic',
      diff <= 1 ? 'PASS' : 'FAIL', 'WARNING',
      diff <= 1
        ? 'Grand total arithmetic is consistent (subtotal + tax + round-off).'
        : `Grand total arithmetic mismatch: expected ₹${expected.toFixed(2)}, invoice shows ₹${invoice.total_amount} (diff ₹${diff.toFixed(2)}).`,
      'total_amount',
    );
  }

  add(
    'E5', 'Totals & Calculations', 'amount_in_words',
    present(invoice.amount_in_words) ? 'PASS' : 'FAIL', 'INFO',
    present(invoice.amount_in_words)
      ? `Amount in words: "${invoice.amount_in_words}"`
      : 'Amount in words not found — good-to-have for audit trail.',
    'amount_in_words',
  );

  // ── F) Payment Details ────────────────────────────────────────────────────
  add(
    'F1', 'Payment Details', 'bank_account_number',
    present(invoice.account_number) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.account_number)
      ? `Bank account: ${invoice.account_number}`
      : 'Bank account number missing — required for payment processing.',
    'account_number',
  );

  add(
    'F2', 'Payment Details', 'ifsc',
    present(invoice.ifsc_code) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.ifsc_code)
      ? `IFSC: ${invoice.ifsc_code}`
      : 'IFSC code missing — required for bank transfer.',
    'ifsc_code',
  );

  add(
    'F3', 'Payment Details', 'bank_name',
    present(invoice.bank_name) ? 'PASS' : 'FAIL', 'WARNING',
    present(invoice.bank_name)
      ? `Bank: ${invoice.bank_name}`
      : 'Bank name missing.',
    'bank_name',
  );

  add(
    'F4', 'Payment Details', 'payment_terms',
    present(invoice.payment_terms) ? 'PASS' : 'FAIL', 'INFO',
    present(invoice.payment_terms)
      ? `Payment terms: "${invoice.payment_terms}"`
      : 'Payment terms not specified.',
    'payment_terms',
  );

  // ── G) Signatures ─────────────────────────────────────────────────────────
  add(
    'G1', 'Signatures & Declarations', 'authorized_signatory',
    'UNKNOWN', 'WARNING',
    'Authorized signatory presence cannot be auto-verified — check original document.',
    'signatures',
  );

  // ── H) TDS ────────────────────────────────────────────────────────────────
  const tdsRate = invoice.tds_rate ?? 0;
  if (tdsRate > 0) {
    add(
      'H1', 'TDS Support', 'tds_amount',
      invoice.tds_amount != null ? 'PASS' : 'FAIL', 'WARNING',
      invoice.tds_amount != null
        ? `TDS @ ${tdsRate}% = ₹${invoice.tds_amount} found.`
        : `TDS rate ${tdsRate}% indicated but TDS amount not extracted — compute manually.`,
      'tds_amount',
    );

    add(
      'H2', 'TDS Support', 'pan_for_tds',
      present(invoice.vendor_pan) ? 'PASS' : 'FAIL', 'CRITICAL',
      present(invoice.vendor_pan)
        ? `PAN available for TDS deduction: ${invoice.vendor_pan}`
        : 'Supplier PAN is missing but TDS applies — must deduct at 20% (Sec 206AA) without PAN.',
      'vendor_pan',
    );
  }

  // ── GST Type Determination ─────────────────────────────────────────────────
  const recipientStateCode = RECIPIENT_MASTER.state_code;
  let gstTypeExpected: GSTTypeExpected = 'UNKNOWN';

  if (supplierStateCode) {
    gstTypeExpected = supplierStateCode === recipientStateCode ? 'CGST_SGST' : 'IGST';
  } else if (present(invoice.place_of_supply)) {
    // Try to determine from place of supply
    const posCode = getStateCodeFromName(invoice.place_of_supply);
    if (posCode) {
      gstTypeExpected = posCode === recipientStateCode ? 'CGST_SGST' : 'IGST';
    }
  }

  const hasCGST = (invoice.cgst_amount ?? 0) > 0;
  const hasSGST = (invoice.sgst_amount ?? 0) > 0;
  const hasIGST = (invoice.igst_amount ?? 0) > 0;

  let gstTypeFound: GSTTypeFound = 'UNKNOWN';
  if (!gstCharged) {
    gstTypeFound = 'NONE';
  } else if (hasCGST && hasSGST && !hasIGST) {
    gstTypeFound = 'CGST_SGST';
  } else if (hasIGST && !hasCGST && !hasSGST) {
    gstTypeFound = 'IGST';
  } else if ((hasCGST || hasSGST) && hasIGST) {
    gstTypeFound = 'MIXED';
  }

  if (gstTypeExpected !== 'UNKNOWN' && gstTypeFound !== 'UNKNOWN' && gstTypeFound !== 'NONE') {
    const match = gstTypeExpected === gstTypeFound;
    add(
      'T1', 'Totals & Calculations', 'gst_tax_type',
      match ? 'PASS' : 'FAIL', 'CRITICAL',
      match
        ? `GST type ${gstTypeFound} matches expectation (supplier state ${supplierStateCode} vs recipient ${recipientStateCode}).`
        : `GST type mismatch: expected ${gstTypeExpected} (supplier state ${supplierStateCode ?? '?'} → recipient ${recipientStateCode}) but found ${gstTypeFound} — wrong tax split invalidates ITC.`,
      'cgst_amount / igst_amount',
    );
  }

  if (gstTypeFound === 'MIXED') {
    add(
      'T2', 'Totals & Calculations', 'gst_mixed',
      'FAIL', 'CRITICAL',
      'Both CGST/SGST and IGST are present on the same invoice — this is not valid under GST rules.',
      'cgst_amount / igst_amount',
    );
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  const criticalFails = checks.filter(c => c.status === 'FAIL' && c.severity === 'CRITICAL').length;
  const warningFails = checks.filter(c => c.status === 'FAIL' && c.severity === 'WARNING').length;
  const infoFails = checks.filter(c => c.status === 'FAIL' && c.severity === 'INFO').length;
  const overall_score = Math.max(0, 100 - criticalFails * 10 - warningFails * 4 - infoFails * 1);

  // ── Key Risks (top 5 failures, CRITICAL first) ────────────────────────────
  const severityOrder: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const topFailures = checks
    .filter(c => c.status === 'FAIL')
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5);

  const key_risks: KeyRisk[] = topFailures.map(c => ({
    severity: c.severity,
    issue: c.message,
    why_it_matters: RISK_DETAILS[c.id]?.why ?? 'Important for GST and audit compliance.',
    fix: RISK_DETAILS[c.id]?.fix ?? 'Review with vendor and correct if needed.',
  }));

  // ── Notes for accounts team ────────────────────────────────────────────────
  const notes_for_accounts_team: string[] = [];
  const allFailedIds = new Set(checks.filter(c => c.status === 'FAIL').map(c => c.id));

  if (criticalFails > 0) {
    notes_for_accounts_team.push(
      `${criticalFails} CRITICAL issue(s) found — review carefully before processing payment or claiming ITC.`,
    );
  }
  if (allFailedIds.has('C3')) {
    notes_for_accounts_team.push(
      `Recipient GSTIN on invoice does not match our GSTIN (${RECIPIENT_MASTER.gstin}) — do NOT book for ITC until a corrected invoice is received.`,
    );
  }
  if (allFailedIds.has('T1') || allFailedIds.has('T2')) {
    notes_for_accounts_team.push(
      'GST tax split (CGST/SGST vs IGST) appears incorrect — verify with vendor before making journal entries.',
    );
  }
  if (allFailedIds.has('H2')) {
    notes_for_accounts_team.push(
      'Supplier PAN is missing but TDS applies — deduct TDS at 20% per Sec 206AA until PAN is obtained and updated.',
    );
  }
  if (allFailedIds.has('E2') || allFailedIds.has('E3') || allFailedIds.has('E4')) {
    notes_for_accounts_team.push(
      'Arithmetic inconsistency detected in invoice totals — verify all figures manually before making payment.',
    );
  }
  if (allFailedIds.has('A2') && gstCharged) {
    notes_for_accounts_team.push(
      'Supplier GSTIN is missing on a GST invoice — ITC is at risk; book to suspense until resolved.',
    );
  }
  if (allFailedIds.has('F1') || allFailedIds.has('F2')) {
    notes_for_accounts_team.push(
      'Bank details are incomplete — obtain from vendor before initiating NEFT/RTGS transfer.',
    );
  }
  if (gstTypeFound === 'MIXED') {
    notes_for_accounts_team.push(
      'Invoice shows both CGST/SGST and IGST — flag for vendor correction before filing GSTR-2B.',
    );
  }

  // ── Suggested followups to vendor ─────────────────────────────────────────
  const suggested_followups_to_vendor: string[] = [];

  if (allFailedIds.has('C3') && present(invoice.buyer_gstin)) {
    suggested_followups_to_vendor.push(
      `The GSTIN on this invoice (${invoice.buyer_gstin}) does not match our registered GSTIN. Could you please issue a revised invoice with our correct GSTIN: ${RECIPIENT_MASTER.gstin}?`,
    );
  } else if (allFailedIds.has('C2')) {
    suggested_followups_to_vendor.push(
      `Our GSTIN is missing from the invoice. Could you please reissue it with our GSTIN: ${RECIPIENT_MASTER.gstin}?`,
    );
  }
  if (allFailedIds.has('A2')) {
    suggested_followups_to_vendor.push(
      'Could you please share your GSTIN number? It is required for our GST compliance records and ITC processing.',
    );
  }
  if (allFailedIds.has('A3') || allFailedIds.has('H2')) {
    suggested_followups_to_vendor.push(
      'Could you please provide your PAN number (format: ABCDE1234F)? This is required for TDS compliance under the Income Tax Act.',
    );
  }
  if (allFailedIds.has('D2')) {
    suggested_followups_to_vendor.push(
      'Could you please include the HSN/SAC code for each line item? This is mandatory for our GST return filing.',
    );
  }
  if (allFailedIds.has('T1')) {
    const expectedType =
      gstTypeExpected === 'CGST_SGST'
        ? 'CGST + SGST (intra-state supply to Karnataka)'
        : 'IGST (inter-state supply)';
    suggested_followups_to_vendor.push(
      `The GST split on this invoice appears incorrect — we believe ${expectedType} should apply. Could you verify and reissue if needed?`,
    );
  }
  if (allFailedIds.has('F1') || allFailedIds.has('F2')) {
    suggested_followups_to_vendor.push(
      'Could you please share your bank account number and IFSC code so we can process your payment?',
    );
  }
  if (allFailedIds.has('B1')) {
    suggested_followups_to_vendor.push(
      'The invoice number appears to be missing on the document. Could you confirm it or reissue with a valid invoice number?',
    );
  }
  if (allFailedIds.has('E4')) {
    suggested_followups_to_vendor.push(
      'We noticed a discrepancy in the invoice totals. Could you please review and reissue a corrected invoice?',
    );
  }

  return {
    overall_score,
    severity_summary: { CRITICAL: criticalFails, WARNING: warningFails, INFO: infoFails },
    gst_tax_type_expected: gstTypeExpected,
    gst_tax_type_found: gstTypeFound,
    checks,
    key_risks,
    notes_for_accounts_team,
    suggested_followups_to_vendor,
  };
}
