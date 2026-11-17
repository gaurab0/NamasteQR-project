/**
 * Currency Number-to-Words Converter for POS Receipts and Tax Invoices.
 *
 * Supports:
 * - South Asian numbering system (Rupees, Lakhs, Crores, Paisa)
 * - Western numbering system (Dollars, Millions, Billions, Cents)
 * - British Pound (Pounds & Pence), Euro (Euros & Cents), etc.
 * - Extensible registry for easily adding any new country or currency.
 */

export interface CurrencyUnitConfig {
  majorSingle: string;
  majorPlural: string;
  minorSingle: string;
  minorPlural: string;
  numberingSystem: 'south-asian' | 'western';
}

export const CURRENCY_REGISTRY: Record<string, CurrencyUnitConfig> = {
  // South Asian Currencies
  NPR: { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },
  RS: { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },
  'RS.': { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },
  NRS: { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },
  INR: { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },
  '₹': { majorSingle: 'Rupee', majorPlural: 'Rupees', minorSingle: 'Paisa', minorPlural: 'Paisa', numberingSystem: 'south-asian' },

  // United States & Dollar Currencies
  USD: { majorSingle: 'Dollar', majorPlural: 'Dollars', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },
  '$': { majorSingle: 'Dollar', majorPlural: 'Dollars', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },
  CAD: { majorSingle: 'Canadian Dollar', majorPlural: 'Canadian Dollars', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },
  AUD: { majorSingle: 'Australian Dollar', majorPlural: 'Australian Dollars', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },

  // European & UK Currencies
  EUR: { majorSingle: 'Euro', majorPlural: 'Euros', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },
  '€': { majorSingle: 'Euro', majorPlural: 'Euros', minorSingle: 'Cent', minorPlural: 'Cents', numberingSystem: 'western' },
  GBP: { majorSingle: 'Pound', majorPlural: 'Pounds', minorSingle: 'Penny', minorPlural: 'Pence', numberingSystem: 'western' },
  '£': { majorSingle: 'Pound', majorPlural: 'Pounds', minorSingle: 'Penny', minorPlural: 'Pence', numberingSystem: 'western' },

  // Middle Eastern Currencies
  AED: { majorSingle: 'Dirham', majorPlural: 'Dirhams', minorSingle: 'Fils', minorPlural: 'Fils', numberingSystem: 'western' },
  SAR: { majorSingle: 'Riyal', majorPlural: 'Riyals', minorSingle: 'Halala', minorPlural: 'Halalas', numberingSystem: 'western' },
};

const DEFAULT_CURRENCY_CONFIG: CurrencyUnitConfig = {
  majorSingle: 'Rupee',
  majorPlural: 'Rupees',
  minorSingle: 'Paisa',
  minorPlural: 'Paisa',
  numberingSystem: 'south-asian',
};

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

/**
 * Converts a number less than 1000 into words
 */
function convertThreeDigitChunk(n: number): string {
  let str = '';
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) {
    str += `${ONES[hundreds]} Hundred`;
    if (remainder > 0) str += ' ';
  }

  if (remainder > 0) {
    if (remainder < 20) {
      str += ONES[remainder];
    } else {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      str += TENS[ten];
      if (one > 0) str += `-${ONES[one]}`;
    }
  }

  return str;
}

/**
 * Converts whole number to words using Western scale (Thousands, Millions, Billions)
 */
function convertWesternScale(n: number): string {
  if (n === 0) return 'Zero';

  const chunks: { value: number; label: string }[] = [
    { value: 1_000_000_000, label: 'Billion' },
    { value: 1_000_000, label: 'Million' },
    { value: 1_000, label: 'Thousand' },
    { value: 1, label: '' },
  ];

  let remaining = n;
  const parts: string[] = [];

  for (const chunk of chunks) {
    if (remaining >= chunk.value) {
      const count = Math.floor(remaining / chunk.value);
      remaining %= chunk.value;
      const chunkWords = convertThreeDigitChunk(count);
      if (chunkWords) {
        parts.push(chunk.label ? `${chunkWords} ${chunk.label}` : chunkWords);
      }
    }
  }

  return parts.join(' ').trim();
}

/**
 * Converts whole number to words using South Asian scale (Hundreds, Thousands, Lakhs, Crores)
 */
function convertSouthAsianScale(n: number): string {
  if (n === 0) return 'Zero';

  let remaining = n;
  const parts: string[] = [];

  // Crores (1,00,00,000)
  if (remaining >= 10_000_000) {
    const crore = Math.floor(remaining / 10_000_000);
    remaining %= 10_000_000;
    parts.push(`${convertSouthAsianScale(crore)} Crore`);
  }

  // Lakhs (1,00,000)
  if (remaining >= 100_000) {
    const lakh = Math.floor(remaining / 100_000);
    remaining %= 100_000;
    parts.push(`${convertThreeDigitChunk(lakh)} Lakh`);
  }

  // Thousands (1,000)
  if (remaining >= 1_000) {
    const thousand = Math.floor(remaining / 1_000);
    remaining %= 1_000;
    parts.push(`${convertThreeDigitChunk(thousand)} Thousand`);
  }

  // Remaining under 1,000
  if (remaining > 0) {
    parts.push(convertThreeDigitChunk(remaining));
  }

  return parts.join(' ').trim();
}

/**
 * Resolves the currency configuration based on business currency code or symbol
 */
export function resolveCurrencyConfig(currencyCodeOrSymbol?: string): CurrencyUnitConfig {
  if (!currencyCodeOrSymbol) return DEFAULT_CURRENCY_CONFIG;
  const normalized = currencyCodeOrSymbol.trim().toUpperCase();
  if (CURRENCY_REGISTRY[normalized]) {
    return CURRENCY_REGISTRY[normalized];
  }
  // Fallback checks
  if (normalized.includes('$') || normalized.includes('USD')) {
    return CURRENCY_REGISTRY.USD;
  }
  if (normalized.includes('RS') || normalized.includes('NPR') || normalized.includes('INR')) {
    return CURRENCY_REGISTRY.NPR;
  }
  if (normalized.includes('EUR') || normalized.includes('€')) {
    return CURRENCY_REGISTRY.EUR;
  }
  if (normalized.includes('GBP') || normalized.includes('£')) {
    return CURRENCY_REGISTRY.GBP;
  }

  // Generic fallback using currency code as major label
  return {
    majorSingle: currencyCodeOrSymbol.trim(),
    majorPlural: currencyCodeOrSymbol.trim(),
    minorSingle: 'Cent',
    minorPlural: 'Cents',
    numberingSystem: 'western',
  };
}

/**
 * Converts a numeric amount to human-readable currency words.
 *
 * Example (South Asian / Rs.):
 *   amountToWords(683.66, 'Rs.')
 *   => "Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only"
 *
 * Example (Western / USD):
 *   amountToWords(683.66, '$')
 *   => "Six Hundred Eighty-Three Dollars and Sixty-Six Cents Only"
 *
 * Example (Whole number):
 *   amountToWords(500, 'Rs.')
 *   => "Five Hundred Rupees Only"
 */
export function amountToWords(
  amount: number | string | null | undefined,
  currencyCodeOrSymbol: string = 'Rs.'
): string {
  const numericAmount = Math.max(0, Number(amount) || 0);
  const cfg = resolveCurrencyConfig(currencyCodeOrSymbol);

  const rounded = Math.round(numericAmount * 100) / 100;
  const wholePart = Math.floor(rounded);
  const fractionalPart = Math.round((rounded - wholePart) * 100);

  const convertWhole = cfg.numberingSystem === 'south-asian' ? convertSouthAsianScale : convertWesternScale;

  // Case 1: Total amount is exactly 0
  if (wholePart === 0 && fractionalPart === 0) {
    return `Zero ${cfg.majorPlural} Only`;
  }

  const parts: string[] = [];

  // Major currency part
  if (wholePart > 0) {
    const wholeWords = convertWhole(wholePart);
    const unitLabel = wholePart === 1 ? cfg.majorSingle : cfg.majorPlural;
    parts.push(`${wholeWords} ${unitLabel}`);
  }

  // Minor currency part (cents / paisa)
  if (fractionalPart > 0) {
    const fracWords = convertThreeDigitChunk(fractionalPart);
    const unitLabel = fractionalPart === 1 ? cfg.minorSingle : cfg.minorPlural;
    if (parts.length > 0) {
      parts.push(`and ${fracWords} ${unitLabel}`);
    } else {
      parts.push(`${fracWords} ${unitLabel}`);
    }
  }

  return `${parts.join(' ')} Only`.trim();
}
