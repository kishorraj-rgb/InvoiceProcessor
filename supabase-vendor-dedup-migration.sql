-- Vendor Deduplication Migration
-- Run this in Supabase SQL Editor to normalize existing GSTINs and add indexes.
-- Safe to run multiple times (idempotent).

-- 1. Normalize existing GSTINs: trim whitespace, uppercase, remove non-alphanumeric
UPDATE vendors
SET gstin = UPPER(REGEXP_REPLACE(TRIM(gstin), '[^A-Za-z0-9]', '', 'g'))
WHERE gstin IS NOT NULL AND gstin != '';

-- 2. Normalize existing PANs
UPDATE vendors
SET vendor_pan = UPPER(REGEXP_REPLACE(TRIM(vendor_pan), '[^A-Za-z0-9]', '', 'g'))
WHERE vendor_pan IS NOT NULL AND vendor_pan != '';

-- 3. Auto-fill vendor_pan from GSTIN where PAN is missing (PAN = GSTIN chars 3-12)
UPDATE vendors
SET vendor_pan = SUBSTRING(gstin FROM 3 FOR 10)
WHERE gstin IS NOT NULL
  AND LENGTH(gstin) = 15
  AND (vendor_pan IS NULL OR vendor_pan = '');

-- 4. Add indexes for faster matching
CREATE INDEX IF NOT EXISTS vendors_gstin_upper_idx ON vendors(UPPER(gstin));
CREATE INDEX IF NOT EXISTS vendors_vendor_pan_upper_idx ON vendors(UPPER(vendor_pan));
