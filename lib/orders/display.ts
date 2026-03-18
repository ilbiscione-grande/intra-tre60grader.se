export function formatOrderNumber(orderId: string) {
  const normalized = orderId.replace(/-/g, '').toUpperCase();
  return `ORD-${normalized.slice(0, 8)}`;
}
