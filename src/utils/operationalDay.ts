import { BusinessOperatingHours, OperationalDayRecord } from '../types/auth';
import {
  getActiveRevenueWindow,
  getVenueOffsetMinutes,
  parseTimeMinutes,
  toVenueWallClock,
} from './revenueWindow';

export interface StoreStatusResult {
  isOpen: boolean;
  code?: 'DAY_CLOSED' | 'OUTSIDE_HOURS';
  reason?: string;
}

/**
 * Detailed store open/closed check shared by frontend views and backend order guards.
 * Respects venue timezone offset so browser and cloud servers agree.
 */
export function evaluateStoreStatusDetailed(
  config?: BusinessOperatingHours | null,
  currentRecord?: OperationalDayRecord | null,
  now: Date = new Date()
): StoreStatusResult {
  if (config?.enabled) {
    const offsetMinutes = getVenueOffsetMinutes(config, now);
    const wallNow = toVenueWallClock(now, offsetMinutes);
    const currentMinutes = wallNow.getUTCHours() * 60 + wallNow.getUTCMinutes();
    const openMinutes = parseTimeMinutes(config.openTime, 0);
    const closeMinutes = parseTimeMinutes(config.closeTime, 23 * 60 + 59);

    const isWithinHours =
      closeMinutes >= openMinutes
        ? currentMinutes >= openMinutes && currentMinutes <= closeMinutes
        : currentMinutes >= openMinutes || currentMinutes <= closeMinutes;

    if (!isWithinHours) {
      return {
        isOpen: false,
        code: 'OUTSIDE_HOURS',
        reason: `Store is outside operating hours (${config.openTime} - ${config.closeTime}).`,
      };
    }
    return { isOpen: true };
  }

  if (!currentRecord) {
    return { isOpen: true };
  }

  if (currentRecord.status === 'OPEN' || currentRecord.status === 'REOPENED') {
    return { isOpen: true };
  }

  return {
    isOpen: false,
    code: 'DAY_CLOSED',
    reason: 'The business day has been closed. Start or reopen the operational day before accepting new orders.',
  };
}

/**
 * Returns true if the store is currently OPEN based on auto-schedule and current status.
 */
export function evaluateStoreStatus(
  config?: BusinessOperatingHours | null,
  currentRecord?: OperationalDayRecord | null,
  now: Date = new Date()
): boolean {
  return evaluateStoreStatusDetailed(config, currentRecord, now).isOpen;
}

/**
 * Gets the effective business date based on auto-advance setting, daily reset time, and current record.
 */
export function getEffectiveBusinessDate(
  config?: BusinessOperatingHours | null,
  currentRecord?: OperationalDayRecord | null,
  now: Date = new Date()
): string {
  const windowDate = getActiveRevenueWindow(config, now).businessDate;

  if (currentRecord && currentRecord.businessDate) {
    if (config?.autoDateAdvance === false) {
      return currentRecord.businessDate;
    }
    if (currentRecord.status !== 'CLOSED') {
      return currentRecord.businessDate;
    }
  }

  return windowDate;
}
