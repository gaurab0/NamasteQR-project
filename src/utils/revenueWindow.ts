import { BusinessOperatingHours } from '../types/auth';

export interface RevenueDayWindow {
  businessDate: string; // Venue-local YYYY-MM-DD for active trading day
  resetTimeLabel: string; // 'HH:MM'
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  nextResetInMs: number;
}

/**
 * Parse 'HH:MM' into total minutes since midnight [0..1439].
 */
export function parseTimeMinutes(value?: string | null, fallbackMinutes = 0): number {
  if (!value || typeof value !== 'string') return fallbackMinutes;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallbackMinutes;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return fallbackMinutes;
  }
  return h * 60 + m;
}

/**
 * Shift a UTC timestamp into venue wall-clock coordinates using JS getTimezoneOffset()
 * convention (e.g. -345 for UTC+05:45). Read shifted fields with Date.prototype.getUTC*.
 */
export function getVenueOffsetMinutes(
  config?: Pick<BusinessOperatingHours, 'timezoneOffsetMinutes'> | null,
  refDate = new Date()
): number {
  return typeof config?.timezoneOffsetMinutes === 'number' && Number.isFinite(config.timezoneOffsetMinutes)
    ? config.timezoneOffsetMinutes
    : refDate.getTimezoneOffset();
}

export function toVenueWallClock(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() - offsetMinutes * 60_000);
}

export function formatUtcAsYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatVenueDateStr(
  date: Date = new Date(),
  config?: Pick<BusinessOperatingHours, 'timezoneOffsetMinutes'> | null
): string {
  const offset = getVenueOffsetMinutes(config, date);
  return formatUtcAsYYYYMMDD(toVenueWallClock(date, offset));
}

/**
 * Computes the active trading day's [startMs, endMs) UTC bounds and businessDate
 * anchored to `config.dailyResetTime` (default '00:00') in venue local time.
 */
export function getActiveRevenueWindow(
  config?: BusinessOperatingHours | null,
  now: Date = new Date()
): RevenueDayWindow {
  const offsetMinutes = getVenueOffsetMinutes(config, now);
  const resetMinutes = parseTimeMinutes(config?.dailyResetTime, 0);
  const resetHour = Math.floor(resetMinutes / 60);
  const resetMin = resetMinutes % 60;
  const resetTimeLabel = `${String(resetHour).padStart(2, '0')}:${String(resetMin).padStart(2, '0')}`;

  const wallNow = toVenueWallClock(now, offsetMinutes);
  const wallMinutes = wallNow.getUTCHours() * 60 + wallNow.getUTCMinutes();

  const startWall = new Date(
    Date.UTC(wallNow.getUTCFullYear(), wallNow.getUTCMonth(), wallNow.getUTCDate(), resetHour, resetMin, 0, 0)
  );
  if (wallMinutes < resetMinutes) {
    startWall.setUTCDate(startWall.getUTCDate() - 1);
  }

  const endWall = new Date(startWall.getTime());
  endWall.setUTCDate(endWall.getUTCDate() + 1);

  const startMs = startWall.getTime() + offsetMinutes * 60_000;
  const endMs = endWall.getTime() + offsetMinutes * 60_000;

  return {
    businessDate: formatUtcAsYYYYMMDD(startWall),
    resetTimeLabel,
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    nextResetInMs: Math.max(100, endMs - now.getTime()),
  };
}

/**
 * Checks whether a sale belongs inside the active revenue window using created_at
 * (falling back to date_string only when created_at is unavailable).
 */
export function isSaleInRevenueWindow(
  sale: { created_at?: string | Date | null; date_string?: string | null },
  window: RevenueDayWindow
): boolean {
  if (sale.created_at) {
    const t = new Date(sale.created_at).getTime();
    if (!Number.isNaN(t)) {
      return t >= window.startMs && t < window.endMs;
    }
  }
  return sale.date_string === window.businessDate;
}

export function applySaleDeletion<T extends { id: string; date_string?: string | null; created_at?: string | Date | null }>(
  sales: T[],
  payload: { id?: string; dateString?: string; all?: boolean }
): T[] {
  if (!payload) return sales;
  if (payload.all) return [];
  if (payload.id) return sales.filter((s) => s.id !== payload.id);
  if (payload.dateString) {
    return sales.filter((s) => (s.date_string || (s.created_at ? String(s.created_at).split('T')[0] : '')) !== payload.dateString);
  }
  return sales;
}
