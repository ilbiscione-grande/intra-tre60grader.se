import type { Role } from '@/lib/types';

export const invoiceReadinessStatuses = [
  'not_ready',
  'under_review',
  'ready_for_invoicing',
  'approved_for_invoicing'
] as const;

export type InvoiceReadinessStatus = (typeof invoiceReadinessStatuses)[number];
export type ReadinessChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
};

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

function formatMoneyKr(value: number) {
  return `${value.toFixed(2)} kr`;
}

function formatHours(hours: number) {
  return `${hours.toFixed(1)} h`;
}

export function buildProjectInvoiceReadinessChecklist({
  customerName,
  responsibleLabel,
  assignedMemberCount,
  orderTotal
}: {
  customerName?: string | null;
  responsibleLabel?: string | null;
  assignedMemberCount: number;
  orderTotal: number;
}): ReadinessChecklistItem[] {
  return [
    {
      id: 'customer',
      label: customerName ? 'Kund är kopplad' : 'Kund saknas',
      done: Boolean(customerName),
      detail: customerName ? customerName : 'Välj kund i grundinfo innan överlämning.'
    },
    {
      id: 'responsible',
      label: responsibleLabel ? 'Projektansvarig är satt' : 'Projektansvarig saknas',
      done: Boolean(responsibleLabel),
      detail: responsibleLabel ?? 'Projektet behöver en tydlig ägare.'
    },
    {
      id: 'members',
      label: assignedMemberCount > 0 ? 'Projektmedlemmar finns' : 'Inga projektmedlemmar tilldelade',
      done: assignedMemberCount > 0,
      detail:
        assignedMemberCount > 0
          ? `${assignedMemberCount} tilldelade`
          : 'Lägg till de personer som ska utföra eller följa jobbet.'
    },
    {
      id: 'value',
      label: orderTotal > 0 ? 'Fakturerbart värde finns' : 'Fakturerbart värde saknas',
      done: orderTotal > 0,
      detail: orderTotal > 0 ? `${formatMoneyKr(orderTotal)} på ordern` : 'Lägg orderrader eller bygg underlag från tid.'
    }
  ];
}

export function buildOrderInvoiceReadinessChecklist({
  customerName,
  projectTitle,
  lineCount,
  orderTotal
}: {
  customerName?: string | null;
  projectTitle?: string | null;
  lineCount: number;
  orderTotal: number;
}): ReadinessChecklistItem[] {
  return [
    {
      id: 'customer',
      label: customerName ? 'Kund finns' : 'Kund saknas',
      done: Boolean(customerName),
      detail: customerName ?? 'Ordern behöver ett projekt med kopplad kund.'
    },
    {
      id: 'project',
      label: projectTitle ? 'Projekt är kopplat' : 'Projekt saknas',
      done: Boolean(projectTitle),
      detail: projectTitle ?? 'Ordern behöver vara kopplad till ett tydligt projekt.'
    },
    {
      id: 'lines',
      label: lineCount > 0 ? 'Orderrader finns' : 'Orderrader saknas',
      done: lineCount > 0,
      detail: lineCount > 0 ? `${lineCount} rader registrerade` : 'Lägg till minst en orderrad innan fastställelse eller faktura.'
    },
    {
      id: 'value',
      label: orderTotal > 0 ? 'Ordern har ett positivt värde' : 'Ordervärdet är 0',
      done: orderTotal > 0,
      detail: orderTotal > 0 ? formatMoneyKr(orderTotal) : 'Underlaget behöver ett fakturerbart belopp.'
    }
  ];
}

export function buildProjectOrderInvoiceReadinessChecklist({
  customerName,
  responsibleLabel,
  lineCount,
  latestInvoiceNo
}: {
  customerName?: string | null;
  responsibleLabel?: string | null;
  lineCount: number;
  latestInvoiceNo?: string | null;
}): ReadinessChecklistItem[] {
  return [
    {
      id: 'order-lines',
      label: lineCount > 0 ? 'Orderrader finns' : 'Orderrader saknas',
      done: lineCount > 0,
      detail: lineCount > 0 ? `${lineCount} rader klara för granskning` : 'Lägg till minst en orderrad innan fakturering.'
    },
    {
      id: 'customer',
      label: customerName ? 'Kund finns på projektet' : 'Kund saknas på projektet',
      done: Boolean(customerName),
      detail: customerName ?? 'Ordern behöver ett projekt med kopplad kund.'
    },
    {
      id: 'responsible',
      label: responsibleLabel ? 'Projektansvarig finns' : 'Projektansvarig saknas',
      done: Boolean(responsibleLabel),
      detail: responsibleLabel ?? 'Det bör finnas en tydlig ägare innan överlämning.'
    },
    {
      id: 'invoice',
      label: latestInvoiceNo ? 'Faktura finns redan' : 'Ingen faktura skapad ännu',
      done: !latestInvoiceNo,
      detail: latestInvoiceNo ? `${latestInvoiceNo} finns redan kopplad` : 'Underlaget kan fortfarande fastställas eller faktureras.'
    }
  ];
}

export function buildProjectInvoicingQueueReasons({
  customerName,
  responsibleLabel,
  unorderedBillableHours = 0,
  completedButNotReady = false
}: {
  customerName?: string | null;
  responsibleLabel?: string | null;
  unorderedBillableHours?: number;
  completedButNotReady?: boolean;
}) {
  return [
    !customerName ? 'Kund saknas på projektet' : null,
    !responsibleLabel ? 'Projektansvarig saknas' : null,
    unorderedBillableHours > 0
      ? completedButNotReady
        ? `${formatHours(unorderedBillableHours)} fakturerbar tid väntar på orderunderlag`
        : `${formatHours(unorderedBillableHours)} fakturerbar tid saknar orderkoppling`
      : null,
    completedButNotReady
      ? 'Projektet är klart men inte markerat redo för fakturering'
      : 'Projektet är markerat redo men saknar orderunderlag i kön'
  ].filter((reason): reason is string => Boolean(reason));
}

export function buildOrderInvoicingQueueReasons({
  customerName,
  lineCount,
  orderTotal,
  waitingForApproval
}: {
  customerName?: string | null;
  lineCount: number;
  orderTotal: number;
  waitingForApproval: boolean;
}) {
  return [
    lineCount === 0 ? 'Orderrader saknas' : null,
    orderTotal <= 0 ? 'Ordervärde är 0 kr' : null,
    !customerName ? 'Kund saknas på kopplat projekt' : null,
    waitingForApproval ? 'Väntar på fastställelse från ekonomi' : 'Kan nu omvandlas till faktura'
  ].filter((reason): reason is string => Boolean(reason));
}

export function buildInvoiceFollowupQueueReasons({
  status,
  dueDate,
  todayIso
}: {
  status: string;
  dueDate: string;
  todayIso: string;
}) {
  const overdue = status !== 'paid' && status !== 'void' && dueDate < todayIso;
  const unpaid = status !== 'paid' && status !== 'void';

  return [
    overdue ? `Förfallen sedan ${new Date(dueDate).toLocaleDateString('sv-SE')}` : null,
    !overdue && unpaid ? `Obetald med förfallodatum ${new Date(dueDate).toLocaleDateString('sv-SE')}` : null,
    !overdue && !unpaid ? 'Skickad och väntar på kundens hantering' : null
  ].filter((reason): reason is string => Boolean(reason));
}
