import type { Entitlement } from '../billing';
import { hasAccess } from '../billing';
import type { AnalysisEligibility } from './types';

export const REQUIRED_DAYS = 21;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const ANALYSIS_TIME_ZONE = 'Europe/Prague';

export function pragueDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYSIS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (kind: string) => parts.find((p) => p.type === kind)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function purchaseDate(entitlement: Entitlement | null): Date | null {
  if (entitlement?.status !== 'active' || entitlement.kind !== 'purchase' || !entitlement.paidAt) return null;
  const date = new Date(entitlement.paidAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function eligibleDate(date: string, paidAt: Date, now: Date): boolean {
  return validCalendarDate(date) && date >= pragueDate(paidAt) && date <= pragueDate(now);
}

export function analysisEligibility(entitlement: Entitlement | null, meaningfulDates: string[], now: Date): AnalysisEligibility {
  const paidAt = purchaseDate(entitlement);
  const dates = new Set(paidAt ? meaningfulDates.filter((date) => eligibleDate(date, paidAt, now)) : []);
  const elapsed = paidAt ? Math.max(0, now.getTime() - paidAt.getTime()) : 0;
  return {
    eligible: Boolean(hasAccess(entitlement, now) && paidAt && elapsed >= REQUIRED_DAYS * DAY_MS && dates.size >= REQUIRED_DAYS),
    hasPurchase: Boolean(paidAt), paidAt: paidAt?.toISOString() ?? null,
    availableAt: paidAt ? new Date(paidAt.getTime() + REQUIRED_DAYS * DAY_MS).toISOString() : null,
    elapsedDays: Math.floor(elapsed / DAY_MS), requiredDays: REQUIRED_DAYS,
    recordedDays: dates.size, remainingDays: Math.max(0, REQUIRED_DAYS - dates.size),
    timeZone: ANALYSIS_TIME_ZONE,
  };
}
