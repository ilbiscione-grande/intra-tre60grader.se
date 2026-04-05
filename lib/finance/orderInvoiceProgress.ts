export type OrderInvoiceProgressStatus = 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced';

export function resolveOrderInvoiceProgress(orderTotal: number, invoicedTotal: number) {
  const normalizedOrderTotal = Number.isFinite(orderTotal) ? Math.max(orderTotal, 0) : 0;
  const normalizedInvoicedTotal = Number.isFinite(invoicedTotal) ? Math.max(invoicedTotal, 0) : 0;
  const remaining = Math.max(normalizedOrderTotal - normalizedInvoicedTotal, 0);

  let status: OrderInvoiceProgressStatus = 'not_invoiced';
  if (normalizedInvoicedTotal > 0.005 && remaining <= 0.005 && normalizedOrderTotal > 0) {
    status = 'fully_invoiced';
  } else if (normalizedInvoicedTotal > 0.005) {
    status = 'partially_invoiced';
  }

  return {
    status,
    orderTotal: normalizedOrderTotal,
    invoicedTotal: Math.min(normalizedInvoicedTotal, normalizedOrderTotal || normalizedInvoicedTotal),
    remaining
  };
}

export function getOrderInvoiceProgressLabel(status: OrderInvoiceProgressStatus) {
  if (status === 'fully_invoiced') return 'Slutfakturerad';
  if (status === 'partially_invoiced') return 'Delfakturerad';
  return 'Ej fakturerad';
}

export function getOrderInvoiceProgressTone(status: OrderInvoiceProgressStatus) {
  if (status === 'fully_invoiced') return 'emerald';
  if (status === 'partially_invoiced') return 'amber';
  return 'blue';
}
