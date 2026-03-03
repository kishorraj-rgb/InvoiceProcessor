import OpenAI from 'openai';
import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedInvoiceData } from '../types';
import type { CategoryTaxonomy } from './categories';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

const client = new OpenAI({
  apiKey: apiKey || '',
  dangerouslyAllowBrowser: true,
});

function buildExtractionPrompt(taxonomy?: CategoryTaxonomy): string {
  const taxonomyBlock = taxonomy && Object.keys(taxonomy).length > 0
    ? `\n\nAvailable invoice categories (choose the best match for "category" and "subcategory"):\n${
        Object.entries(taxonomy)
          .map(([cat, subs]) => `  - ${cat}${subs.length ? ': ' + subs.join(', ') : ''}`)
          .join('\n')
      }\n`
    : '';

  return `You are an expert at extracting structured data from Indian GST invoices for audit and accounting purposes.
Analyze this invoice and extract ALL available information. Return a valid JSON object with EXACTLY these fields:

{
  "vendor_name": "Company/person who issued the invoice",
  "vendor_address": "Full address of the vendor",
  "vendor_gstin": "GST Identification Number of vendor (15-char alphanumeric)",
  "vendor_pan": "PAN number of vendor (10-char alphanumeric, e.g. ABCDE1234F)",
  "vendor_contact_email": "Email or phone contact of vendor if present",
  "place_of_supply": "State/location of supply mentioned on invoice",
  "beneficiary_name": "Bank account holder name for payment",
  "bank_name": "Bank name for payment",
  "bank_branch": "Bank branch name/address",
  "account_number": "Bank account number",
  "ifsc_code": "IFSC code (11-char)",
  "swift_code": "SWIFT/BIC code if present (international payments)",
  "invoice_number": "Invoice/Bill number",
  "invoice_date": "Invoice date in YYYY-MM-DD format",
  "due_date": "Payment due date in YYYY-MM-DD format if present",
  "payment_terms": "Payment terms e.g. Net 30, Immediate, Due on receipt",
  "document_type": "Type of document e.g. Tax Invoice, Proforma Invoice, Credit Note, Debit Note",
  "buyer_name": "Name of buyer/recipient company",
  "buyer_gstin": "GST number of buyer if present",
  "buyer_address": "Full billing address of buyer",
  "line_items": [
    {
      "hsn_sac_code": "HSN or SAC code for this item/service",
      "description": "Item/service description",
      "quantity": 1,
      "unit_price": 0.00,
      "basic_amount": 0.00,
      "cgst_rate": 9,
      "cgst_amount": 0.00,
      "sgst_rate": 9,
      "sgst_amount": 0.00,
      "igst_rate": 0,
      "igst_amount": 0.00,
      "tax_rate": 18,
      "tax_amount": 0.00,
      "total": 0.00
    }
  ],
  "subtotal": 0.00,
  "cgst_rate": 9,
  "cgst_amount": 0.00,
  "sgst_rate": 9,
  "sgst_amount": 0.00,
  "igst_rate": 0,
  "igst_amount": 0.00,
  "tax_amount": 0.00,
  "tds_rate": 0,
  "tds_amount": 0.00,
  "round_off": 0.00,
  "total_amount": 0.00,
  "amount_in_words": "Amount written in words as it appears on invoice",
  "currency": "INR",
  "service_period": "Service period description if mentioned e.g. January 2025",
  "billing_period_from": "Billing period start date in YYYY-MM-DD format",
  "billing_period_to": "Billing period end date in YYYY-MM-DD format",
  "category": "The most appropriate category from the provided taxonomy, or null if none fits",
  "subcategory": "The most appropriate subcategory for the selected category, or null if none fits"
}
${taxonomyBlock}
Rules:
- Use null for fields not found in the invoice
- All monetary values must be numbers (not strings)
- Dates must be in YYYY-MM-DD format
- basic_amount = quantity × unit_price (before any tax)
- For intra-state supply: populate cgst_rate/amount and sgst_rate/amount; set igst to 0
- For inter-state supply: populate igst_rate/amount; set cgst/sgst to 0
- tax_amount = cgst_amount + sgst_amount + igst_amount (total tax)
- For category: analyse the vendor name, line item descriptions, and HSN/SAC codes to pick the best match
- Return ONLY the JSON object, no explanation or markdown`;
}

export async function extractInvoiceData(
  file: File,
  taxonomy?: CategoryTaxonomy,
): Promise<ExtractedInvoiceData> {
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.');
  }

  const mediaType = getMediaType(file);
  let imageBase64List: string[];

  if (mediaType === 'application/pdf') {
    imageBase64List = await pdfToImages(file);
  } else {
    const base64 = await fileToBase64(file);
    imageBase64List = [base64];
  }

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    ...imageBase64List.map(b64 => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'high' as const },
    })),
    { type: 'text' as const, text: buildExtractionPrompt(taxonomy) },
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4.1',
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  });

  const text = response.choices[0]?.message?.content || '';

  try {
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText) as ExtractedInvoiceData;
  } catch {
    console.error('Failed to parse OpenAI response:', text);
    throw new Error('Failed to parse extracted invoice data. Please try again or enter manually.');
  }
}

async function pdfToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  // Process up to 4 pages (covers most invoices)
  for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
  }

  return images;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMediaType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default: return file.type || 'application/octet-stream';
  }
}
