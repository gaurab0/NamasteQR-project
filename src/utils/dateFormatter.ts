export type DateFormatMode = 'BOTH' | 'ENGLISH' | 'LOCAL' | 'NEPALI';

export interface LocalizedDateParts {
  time12: string;
  standardDate: string;
  localTime12: string;
  localDate: string;
  timezoneLabel: string;
  standardFull: string;
  localFull: string;
}

/**
 * Returns the client device's detected IANA timezone (e.g. 'Asia/Kathmandu', 'America/New_York').
 */
export const detectBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kathmandu';
  } catch {
    return 'Asia/Kathmandu';
  }
};

/**
 * Popular IANA timezone list for selection.
 */
export const COMMON_TIMEZONES = [
  { value: 'Asia/Kathmandu', label: 'Kathmandu, Nepal (NPT / GMT+5:45)' },
  { value: 'Asia/Kolkata', label: 'India, Sri Lanka (IST / GMT+5:30)' },
  { value: 'Asia/Dubai', label: 'Dubai, UAE (GST / GMT+4:00)' },
  { value: 'Asia/Bangkok', label: 'Bangkok, Hanoi, Jakarta (ICT / GMT+7:00)' },
  { value: 'Asia/Singapore', label: 'Singapore, Malaysia (SGT / GMT+8:00)' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Japan (JST / GMT+9:00)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT / GMT+8:00)' },
  { value: 'Asia/Qatar', label: 'Doha, Qatar (AST / GMT+3:00)' },
  { value: 'Asia/Riyadh', label: 'Riyadh, Saudi Arabia (AST / GMT+3:00)' },
  { value: 'Europe/London', label: 'London, UK (GMT / BST)' },
  { value: 'Europe/Paris', label: 'Paris, Berlin, Rome (CET / CEST)' },
  { value: 'America/New_York', label: 'New York, US Eastern (EST / EDT)' },
  { value: 'America/Chicago', label: 'Chicago, US Central (CST / CDT)' },
  { value: 'America/Denver', label: 'Denver, US Mountain (MST / MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles, US Pacific (PST / PDT)' },
  { value: 'Australia/Sydney', label: 'Sydney, Australia (AEST / AEDT)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

/**
 * Formats a date using native Intl.DateTimeFormat in a specified timezone.
 */
export const formatLocalizedDate = (
  date: Date,
  timezone?: string,
  mode: DateFormatMode = 'ENGLISH'
): LocalizedDateParts => {
  const targetTz = timezone || detectBrowserTimezone();

  // Standard date & time in local execution environment
  const time12 = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const standardDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Time in configured target venue timezone
  let localTime12 = time12;
  let localDate = standardDate;
  let timezoneAbbr = '';

  try {
    localTime12 = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: targetTz,
    }).format(date);

    localDate = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: targetTz,
    }).format(date);

    // Get short timezone name / offset
    const tzParts = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTz,
      timeZoneName: 'short',
    }).formatToParts(date);
    const tzNamePart = tzParts.find((p) => p.type === 'timeZoneName');
    timezoneAbbr = tzNamePart ? tzNamePart.value : targetTz.split('/').pop() || targetTz;
  } catch (err) {
    console.warn(`Could not format date for timezone ${targetTz}:`, err);
    timezoneAbbr = targetTz.split('/').pop() || targetTz;
  }

  const timezoneLabel = timezoneAbbr ? `(${timezoneAbbr})` : '';
  const standardFull = `${standardDate}, ${time12}`;
  const localFull = `${localDate}, ${localTime12} ${timezoneLabel}`.trim();

  return {
    time12,
    standardDate,
    localTime12,
    localDate,
    timezoneLabel,
    standardFull,
    localFull,
  };
};

/**
 * Backward-compatible helper for DateTimeDisplay & legacy callers.
 */
export const formatDualDate = (
  date: Date,
  mode: DateFormatMode = 'ENGLISH',
  timezone?: string
) => {
  const parts = formatLocalizedDate(date, timezone, mode);
  return {
    time12: parts.localTime12,
    englishDate: parts.standardDate,
    nepaliDate: `${parts.localDate} ${parts.timezoneLabel}`.trim(),
    english: parts.standardDate,
    nepali: `${parts.localDate} ${parts.timezoneLabel}`.trim(),
    englishFull: parts.standardFull,
    nepaliFull: parts.localFull,
  };
};

export const renderFormattedDate = (
  date: Date | string,
  mode: DateFormatMode = 'ENGLISH',
  separator: string = ' | ',
  timezone?: string
): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(parsedDate.getTime())) return '';

  const parts = formatLocalizedDate(parsedDate, timezone, mode);

  if (mode === 'NEPALI' || mode === 'LOCAL') {
    return `${parts.localDate}, ${parts.localTime12} ${parts.timezoneLabel}`.trim();
  }
  if (mode === 'ENGLISH') {
    return `${parts.standardDate}, ${parts.localTime12}`;
  }
  // BOTH: Standard date + Local time + Timezone badge
  return `${parts.localTime12}${separator}${parts.standardDate}${separator}${parts.timezoneLabel}`.trim();
};
