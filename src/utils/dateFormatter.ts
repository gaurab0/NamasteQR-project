import NepaliDate from 'nepali-datetime';

export type DateFormatMode = 'BOTH' | 'ENGLISH' | 'LOCAL' | 'NEPALI';

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

export const formatDualDate = (
  date: Date,
  _mode: DateFormatMode = 'ENGLISH',
  _timezone?: string
): DualDateParts => {
  // 12-hour time format with AM/PM (e.g. "09:54 AM")
  const time12 = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Standard/English date (e.g. "Nov 14, 2026")
  const englishDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Local calendar date (e.g. "2083 Kartik 28")
  let nepaliDate = '';
  try {
    const nepaliDateObj = new NepaliDateConstructor(date);
    nepaliDate = nepaliDateObj.format('YYYY MMMM DD');
  } catch (err) {
    nepaliDate = englishDate;
  }

  const englishFull = `${englishDate}, ${time12}`;
  // Clean date representation without any "(BS)" suffix
  const nepaliFull = `${nepaliDate}, ${time12}`;

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
  separator: string = ' | ',
  _timezone?: string
): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(parsedDate.getTime())) return '';

  const { time12, englishDate, nepaliDate, englishFull, nepaliFull } = formatDualDate(parsedDate, mode);

  if (mode === 'NEPALI' || mode === 'LOCAL') {
    return nepaliFull;
  }
  if (mode === 'ENGLISH') {
    return englishFull;
  }
  // Both Standard & Local Date: clean without "(BS)" suffix
  return `${time12}${separator}${englishDate}${separator}${nepaliDate}`;
};
