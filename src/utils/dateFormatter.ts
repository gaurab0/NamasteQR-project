import NepaliDate from 'nepali-datetime';

export type DateFormatMode = 'BOTH' | 'ENGLISH' | 'NEPALI';

const NepaliDateConstructor: any = (NepaliDate as any)?.default || NepaliDate;

export interface DualDateParts {
  time12: string;
  englishDate: string;
  nepaliDate: string;
  english: string;
  nepali: string;
  englishFull: string;
  nepaliFull: string;
}

export const formatDualDate = (date: Date, mode: DateFormatMode = 'ENGLISH'): DualDateParts => {
  // 12-hour time format with AM/PM (e.g. "04:23 PM")
  const time12 = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // English date only (e.g. "Oct 1, 2026")
  const englishDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Nepali date only (e.g. "2083 Aswin 15")
  let nepaliDate = '';
  try {
    const nepaliDateObj = new NepaliDateConstructor(date);
    nepaliDate = nepaliDateObj.format('YYYY MMMM DD');
  } catch (err) {
    console.warn('Failed to format Nepali date:', err);
    nepaliDate = englishDate;
  }

  const englishFull = `${englishDate}, ${time12}`;
  const nepaliFull = `${nepaliDate}, ${time12} (BS)`;

  return {
    time12,
    englishDate,
    nepaliDate,
    english: englishDate,
    nepali: nepaliDate,
    englishFull,
    nepaliFull,
  };
};

export const renderFormattedDate = (
  date: Date | string,
  mode: DateFormatMode = 'ENGLISH',
  separator: string = ' | '
): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(parsedDate.getTime())) return '';

  const { time12, englishDate, nepaliDate, englishFull, nepaliFull } = formatDualDate(parsedDate, mode);

  if (mode === 'NEPALI') {
    return nepaliFull;
  }
  if (mode === 'ENGLISH') {
    return englishFull;
  }
  // When both English & Nepali dates are chosen: keep 12-hour time format ONLY before the dates
  return `${time12}${separator}${englishDate}${separator}${nepaliDate} (BS)`;
};
