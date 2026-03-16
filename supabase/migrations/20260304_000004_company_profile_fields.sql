-- Add extended billing profile fields to companies.

alter table public.companies
  add column if not exists org_no text,
  add column if not exists billing_email text,
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists bankgiro text,
  add column if not exists plusgiro text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists invoice_prefix text;
