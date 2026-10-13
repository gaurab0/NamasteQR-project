import { BusinessOperatingHours, OperationalDayRecord } from '../types/auth';

/**
 * Returns true if the store is currently OPEN based on auto-schedule and current status.
 * If auto-schedule is OFF, falls back to the manual status in currentRecord.
 */
export function evaluateStoreStatus(
  config?: BusinessOperatingHours,
  currentRecord?: OperationalDayRecord | null
): boolean {
  // If no record exists, default to closed
  if (!currentRecord) {
    // Exception: If no config exists, default to OPEN to not break legacy systems
    if (!config) return true;
    return false;
  }

  // If manual status says OPEN or REOPENED, store is open unless auto-schedule overrides
  const isManuallyOpen = currentRecord.status === 'OPEN' || currentRecord.status === 'REOPENED';

  if (!config || !config.enabled) {
    return isManuallyOpen;
  }

  // Auto-schedule is ENABLED. Check current time.
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [openH, openM] = (config.openTime || '00:00').split(':').map(Number);
  const openMinutes = openH * 60 + openM;

  const [closeH, closeM] = (config.closeTime || '23:59').split(':').map(Number);
  const closeMinutes = closeH * 60 + closeM;

  let isWithinHours = false;

  if (closeMinutes >= openMinutes) {
    // Normal day shift (e.g. 09:00 to 22:00)
    isWithinHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  } else {
    // Night shift (e.g. 18:00 to 02:00)
    isWithinHours = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  }

  // If auto-schedule dictates closed, force closed.
  // If auto-schedule dictates open, respect the manual status (e.g. Owner could have closed early).
  // Or, if auto-schedule dictates open, auto-open it. Let's make it strict: auto-schedule overrides everything for "open" window, 
  // but if manually closed during the window, it stays closed? The prompt says: "Manual Day Start/Close/Reopen acts as an explicit override."
  // Wait, if it's within hours but manually closed, we should keep it closed.
  // Actually, for the QR code guard, if it's outside hours it's definitely CLOSED.
  // If it's inside hours, it's OPEN only if the status is not CLOSED.
  if (!isWithinHours) return false;

  return isManuallyOpen;
}

/**
 * Gets the effective business date based on auto-advance setting and current record.
 */
export function getEffectiveBusinessDate(
  config?: BusinessOperatingHours,
  currentRecord?: OperationalDayRecord | null
): string {
  const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' local time

  if (currentRecord && currentRecord.businessDate) {
    if (config?.autoDateAdvance === false) {
      return currentRecord.businessDate; // Manual date locked
    }

    if (currentRecord.status !== 'CLOSED') {
      return currentRecord.businessDate; // Keep the active day's date
    }
  }

  return todayStr;
}
