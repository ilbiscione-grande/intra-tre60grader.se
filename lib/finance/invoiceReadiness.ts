import type { Role } from '@/lib/types';

export const invoiceReadinessStatuses = [
  'not_ready',
  'under_review',
  'ready_for_invoicing',
  'approved_for_invoicing'
] as const;

export type InvoiceReadinessStatus = (typeof invoiceReadinessStatuses)[number];

const labelMap: Record<InvoiceReadinessStatus, string> = {
  not_ready: 'Inte redo',
  under_review: 'Under kontroll',
  ready_for_invoicing: 'Redo för fakturering',
  approved_for_invoicing: 'Fastställd för fakturering'
};

const descriptionMap: Record<InvoiceReadinessStatus, string> = {
  not_ready: 'Arbete eller underlag pågår fortfarande.',
  under_review: 'Någon går igenom timmar, rader eller underlag.',
  ready_for_invoicing: 'Underlaget kan lämnas över till ekonomi.',
  approved_for_invoicing: 'Ekonomi eller admin har godkänt underlaget.'
};

const nextStepMap: Record<InvoiceReadinessStatus, string> = {
  not_ready: 'Färdigställ arbete och bygg underlag.',
  under_review: 'Kontrollera timmar, orderrader och avvikelser.',
  ready_for_invoicing: 'Ekonomi kan nu fastställa och skapa faktura.',
  approved_for_invoicing: 'Nästa steg är fakturering eller uppföljning.'
};

const ownerMap: Record<InvoiceReadinessStatus, string> = {
  not_ready: 'Projektteam',
  under_review: 'Projektansvarig',
  ready_for_invoicing: 'Projektansvarig / drift',
  approved_for_invoicing: 'Ekonomi / admin'
};

export function normalizeInvoiceReadinessStatus(value: string | null | undefined): InvoiceReadinessStatus {
  if (value && invoiceReadinessStatuses.includes(value as InvoiceReadinessStatus)) {
    return value as InvoiceReadinessStatus;
  }
  return 'not_ready';
}

export function resolveInvoiceReadinessStatus(
  value: string | null | undefined,
  fallbackStatus?: string | null
): InvoiceReadinessStatus {
  const normalized = normalizeInvoiceReadinessStatus(value);
  if (normalized !== 'not_ready') return normalized;

  if (fallbackStatus === 'invoiced' || fallbackStatus === 'paid') return 'approved_for_invoicing';
  if (fallbackStatus === 'sent') return 'under_review';
  return normalized;
}

export function getInvoiceReadinessLabel(value: string | null | undefined) {
  return labelMap[normalizeInvoiceReadinessStatus(value)];
}

export function getInvoiceReadinessDescription(value: string | null | undefined) {
  return descriptionMap[normalizeInvoiceReadinessStatus(value)];
}

export function getInvoiceReadinessNextStep(value: string | null | undefined) {
  return nextStepMap[normalizeInvoiceReadinessStatus(value)];
}

export function getInvoiceReadinessOwner(value: string | null | undefined) {
  return ownerMap[normalizeInvoiceReadinessStatus(value)];
}

export function getInvoiceReadinessOptions(role: Role, currentValue?: string | null) {
  const current = normalizeInvoiceReadinessStatus(currentValue);
  const allowed = role === 'admin' || role === 'finance'
    ? invoiceReadinessStatuses
    : (invoiceReadinessStatuses.filter((status) => status !== 'approved_for_invoicing') as readonly InvoiceReadinessStatus[]);

  const merged = allowed.includes(current) ? allowed : ([...allowed, current] as InvoiceReadinessStatus[]);
  return merged.map((value) => ({
    value,
    label: labelMap[value]
  }));
}
