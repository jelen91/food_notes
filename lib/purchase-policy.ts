/** Public product terms. Safe to import in browser code; no billing credentials. */
export const PURCHASE_POLICY_VERSION = '2026-09-12.purchase.v1';
export const ACCESS_MONTHS = 12;
export const REFUND_DAYS = 3;
export const EXPORT_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Preserve time of day and clamp leap-day anniversaries to February's last day. */
export function addCalendarMonths(date: Date, months: number): Date {
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(months)) {
    throw new Error('Invalid purchase date or duration.');
  }
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function purchaseDeadlines(paidAt: Date) {
  const accessUntil = addCalendarMonths(paidAt, ACCESS_MONTHS);
  return {
    accessUntil,
    refundUntil: new Date(paidAt.getTime() + REFUND_DAYS * DAY_MS),
    exportUntil: new Date(accessUntil.getTime() + EXPORT_GRACE_DAYS * DAY_MS),
  };
}
