export type ValidationSeverity = 'error' | 'warning';

export type ImportIssueCode =
  | 'EMPTY_SHEET'
  | 'MISSING_HEADER'
  | 'DUPLICATE_HEADER'
  | 'FORMULA_ERROR'
  | 'EMPTY_CELL'
  | 'SUMMARY_ROW'
  | 'DUPLICATE_ITEM_NAME'
  | 'INVALID_PRICE'
  | 'DUPLICATE_ITEM_CODE'
  | 'INVALID_FOOD_TYPE'
  | 'INVALID_ORDER_ROUTE'
  | 'SUBCATEGORY_CATEGORY_CONFLICT'
  | 'WHITESPACE_ISSUE'
  | 'TYPO_HINT'
  | 'PRICE_PRECISION'
  | 'DB_CROSS_COLLISION'
  | 'DB_CASING_MISMATCH'
  | 'DB_MERGE_TARGET_COLLISION';

export interface ImportIssue {
  id: string;
  rowNumber: number; // 1-based Excel sheet row (0 = file/sheet level)
  severity: ValidationSeverity;
  column: string;
  itemName?: string;
  cellValue: string;
  code: ImportIssueCode;
  message: string;
  suggestion: string;
}

export interface ExistingMenuRef {
  id: string;
  name: string;
  erp_item_code?: string | null;
  category: string;
  variants?: Array<{ erp_item_code?: string | null }> | null;
}

export interface ParsedOption {
  name: string;
  price: number;
  calculatedPrice: number;
  erp_item_code?: string;
  description?: string;
  food_type?: 'veg' | 'non-veg' | 'none';
  station?: 'KITCHEN' | 'BAR' | 'BOTH';
}

export interface ParsedItem {
  erp_item_code?: string;
  name: string;
  category: string;
  subCategory?: string;
  price: number;
  calculatedPrice: number;
  station: 'KITCHEN' | 'BAR' | 'BOTH';
  description?: string;
  food_type?: 'veg' | 'non-veg' | 'none';
  has_variants: boolean;
  variant_group_name?: string;
  variants?: ParsedOption[];
  is_packageable?: boolean;
  packaging_type?: 'packageable' | 'dine_in_only' | 'na';
  sourceRowNumbers?: number[];
}

export interface RawValidatedRow {
  rowNumber: number;
  itemName: string;
  price: number;
  category: string;
  subCategory: string;
  itemCode: string;
  description: string;
  foodType: 'veg' | 'non-veg' | 'none';
  station: 'KITCHEN' | 'BAR' | 'BOTH';
  packagingType?: 'packageable' | 'dine_in_only' | 'na';
}

export interface ValidationSummary {
  totalDataRows: number;
  validRowCount: number;
  validDishCount: number;
  errorCount: number;
  warningCount: number;
  mergeUpdateCount: number;
  mergeCreateCount: number;
}

export interface MenuImportValidationResult {
  items: ParsedItem[];
  rawRows: RawValidatedRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: ValidationSummary;
}

export interface ValidateMatrixOptions {
  pricingMode?: 'inclusive' | 'exclusive';
  taxRate?: number;
  importMode?: 'merge' | 'replace';
  existingItems?: ExistingMenuRef[];
}

type CanonicalColumnKey =
  | 'itemName'
  | 'price'
  | 'category'
  | 'subCategory'
  | 'itemCode'
  | 'description'
  | 'vegNonVeg'
  | 'orderRoute'
  | 'packaging';

const COLUMN_DEFS: Array<{
  key: CanonicalColumnKey;
  label: string;
  mandatoryCell: boolean;
  patterns: RegExp[];
}> = [
  {
    key: 'itemName',
    label: 'Item Name',
    mandatoryCell: true,
    patterns: [/^(item\s*name|dish\s*name|product\s*name|name)$/i],
  },
  {
    key: 'price',
    label: 'Sales Price without vat price',
    mandatoryCell: true,
    patterns: [
      /sales\s*price(\s*without\s*vat(\s*price)?)?/i,
      /without\s*vat(\s*price)?/i,
      /^(base\s*price|price|rate|amount)$/i,
    ],
  },
  {
    key: 'category',
    label: 'Category',
    mandatoryCell: true,
    patterns: [/^(main\s*)?(category|group|class)$/i],
  },
  {
    key: 'subCategory',
    label: 'SubCategory',
    mandatoryCell: true,
    patterns: [/^sub[\s\-_]*category$/i, /^sub$/i],
  },
  {
    key: 'itemCode',
    label: 'Item Code',
    mandatoryCell: false,
    patterns: [/^(item\s*code|erp(\s*item)?\s*code|sku|code)$/i],
  },
  {
    key: 'description',
    label: 'Description',
    mandatoryCell: false,
    patterns: [/^(descript(?:ion|ioin|oin|n)|desc|details)$/i],
  },
  {
    key: 'vegNonVeg',
    label: 'Veg/Non-Veg',
    mandatoryCell: true,
    patterns: [/^(veg\s*\/?\s*non[\s\-]*veg|dietary(\s*type)?|food\s*type)$/i],
  },
  {
    key: 'orderRoute',
    label: 'Order Route',
    mandatoryCell: true,
    patterns: [/^(order\s*route|route|station|kot\s*\/?\s*bot)$/i],
  },
  {
    key: 'packaging',
    label: 'Takeaway Packaging',
    mandatoryCell: false,
    patterns: [
      /^(takeaway\s*)?packaging(\s*type)?$/i,
      /^packageable$/i,
      /^packageable\s*\/?\s*dine[\s\-]*in(\s*only)?(\s*\/?\s*n\/?a)?$/i,
      /^packing$/i,
    ],
  },
];

const FORMULA_ERROR_REGEX = /^#(REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA|ERROR!)$/i;
const SUMMARY_ROW_REGEX = /^(sub\s*-?\s*total|grand\s*total|total|date|page\s*\d+(\s*of\s*\d+)?|s\.?\s*n\.?)\s*:?$/i;

export function normalizeImportText(val: unknown): string {
  return String(val ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeImportKey(val: unknown): string {
  return normalizeImportText(val).toLowerCase();
}

export function cleanCategoryName(str: string): string {
  const trimmed = normalizeImportText(str);
  if (!trimmed) return 'General';
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return trimmed;
}

function isRowEmpty(row: unknown): boolean {
  if (!Array.isArray(row)) return true;
  return row.every((c) => String(c ?? '').trim() === '');
}

function matchHeaderCell(rawCell: unknown): CanonicalColumnKey | null {
  const text = normalizeImportText(rawCell);
  if (!text) return null;
  for (const def of COLUMN_DEFS) {
    if (def.patterns.some((pat) => pat.test(text))) {
      return def.key;
    }
  }
  return null;
}

function parseStrictPrice(rawCell: unknown): {
  valid: boolean;
  price?: number;
  hasExtraPrecision?: boolean;
  isOutlier?: boolean;
  errorMsg?: string;
} {
  if (typeof rawCell === 'number') {
    if (!Number.isFinite(rawCell)) {
      return { valid: false, errorMsg: `Invalid numeric price "${rawCell}".` };
    }
    if (rawCell <= 0) {
      return { valid: false, errorMsg: `Price must be greater than 0 (found ${rawCell}).` };
    }
    const rounded = Math.round(rawCell * 100) / 100;
    if (rounded <= 0) {
      return { valid: false, errorMsg: `Price ${rawCell} rounds to 0.00; minimum valid price is 0.01.` };
    }
    return {
      valid: true,
      price: rounded,
      hasExtraPrecision: Math.abs(rawCell * 100 - Math.round(rawCell * 100)) > 1e-6,
      isOutlier: rawCell > 100000,
    };
  }

  const trimmed = String(rawCell ?? '').trim();
  // Strip currency prefix (Rs., NPR, NRs, $, ₹) from the start only
  const withoutCurrency = trimmed.replace(/^(?:npr\.?|nrs\.?|rs\.?|[$₹रू])\s*/i, '').trim();

  if (withoutCurrency.startsWith('-')) {
    return { valid: false, errorMsg: `Price cannot be negative (found "${trimmed}").` };
  }

  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.\d+)?$/.test(withoutCurrency)) {
    return {
      valid: false,
      errorMsg: `Invalid non-numeric price "${trimmed}". Expected a positive number (e.g. 166.00 or Rs. 1,250.50).`,
    };
  }

  const cleanNumeric = withoutCurrency.replace(/,/g, '');
  const parsed = Number(cleanNumeric);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, errorMsg: `Price must be greater than 0 (found "${trimmed}").` };
  }

  const rounded = Math.round(parsed * 100) / 100;
  if (rounded <= 0) {
    return { valid: false, errorMsg: `Price "${trimmed}" rounds to 0.00; minimum valid price is 0.01.` };
  }

  const decimals = (cleanNumeric.split('.')[1] || '').length;
  return {
    valid: true,
    price: rounded,
    hasExtraPrecision: decimals > 2,
    isOutlier: parsed > 100000,
  };
}

function parseFoodType(rawText: string): 'veg' | 'non-veg' | 'none' | null {
  const norm = normalizeImportKey(rawText);
  if (norm === 'veg' || norm === 'vegetarian') return 'veg';
  if (
    norm === 'non-veg' ||
    norm === 'non veg' ||
    norm === 'nonveg' ||
    norm === 'non-vegetarian' ||
    norm === 'non vegetarian'
  ) {
    return 'non-veg';
  }
  if (norm === 'none' || norm === 'n/a') return 'none';
  return null;
}

function parseOrderRoute(rawText: string): 'KITCHEN' | 'BAR' | 'BOTH' | null {
  const norm = normalizeImportKey(rawText);
  if (norm === 'kitchen' || norm === 'kot') return 'KITCHEN';
  if (norm === 'bar' || norm === 'bot') return 'BAR';
  if (
    norm === 'both' ||
    norm === 'kitchen & bar' ||
    norm === 'kitchen/bar' ||
    norm === 'kitchen and bar' ||
    norm === 'bar & kitchen' ||
    norm === 'bar/kitchen' ||
    norm === 'kot/bot' ||
    norm === 'kot & bot'
  ) {
    return 'BOTH';
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function isLikelyTypoPair(a: string, b: string): boolean {
  if (a === b) return false;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 5) return false;
  const dist = levenshtein(a, b);
  if (dist === 1) {
    // Avoid flagging distinct English words differing only in their initial letter (e.g. Mocktail vs Cocktail)
    if (a.length === b.length && a[0] !== b[0] && a.slice(1) === b.slice(1)) return false;
    return true;
  }
  if (dist === 2 && minLen >= 7) {
    return true;
  }
  return false;
}

function createIssueFactory() {
  let seq = 0;
  return (
    severity: ValidationSeverity,
    rowNumber: number,
    column: string,
    code: ImportIssueCode,
    cellValue: string,
    message: string,
    suggestion: string,
    itemName?: string
  ): ImportIssue => {
    seq += 1;
    return {
      id: `${code}_${rowNumber}_${seq}`,
      rowNumber,
      severity,
      column,
      itemName,
      cellValue,
      code,
      message,
      suggestion,
    };
  };
}

export function groupValidatedRows(
  rows: RawValidatedRow[],
  pricingMode: 'inclusive' | 'exclusive' = 'inclusive',
  taxRate = 13
): ParsedItem[] {
  const multiplier = pricingMode === 'exclusive' ? 1 + (Number(taxRate) || 0) / 100 : 1;
  const groups = new Map<string, RawValidatedRow[]>();

  for (const row of rows) {
    const groupKey = row.subCategory
      ? `${row.category.toLowerCase()}:::${row.subCategory.toLowerCase()}`
      : `${row.category.toLowerCase()}:::item:::${row.itemName.toLowerCase()}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(row);
  }

  const items: ParsedItem[] = [];

  groups.forEach((rowList) => {
    if (rowList.length > 1) {
      const subCatName = rowList[0].subCategory || rowList[0].itemName;
      const category = rowList[0].category;
      const basePrice = rowList[0].price;
      const calcBasePrice = Math.round(basePrice * multiplier * 100) / 100;

      const options: ParsedOption[] = rowList.map((r) => ({
        name: r.itemName,
        price: r.price,
        calculatedPrice: Math.round(r.price * multiplier * 100) / 100,
        erp_item_code: r.itemCode || undefined,
        description: r.description || undefined,
        food_type: r.foodType,
        station: r.station,
      }));

      const allVeg = options.every((o) => o.food_type === 'veg');
      const allNonVeg = options.every((o) => o.food_type === 'non-veg');
      const dishFoodType = allVeg ? 'veg' : allNonVeg ? 'non-veg' : 'none';

      const allBar = options.every((o) => o.station === 'BAR');
      const allKitchen = options.every((o) => o.station === 'KITCHEN');
      const dishStation = allBar ? 'BAR' : allKitchen ? 'KITCHEN' : 'BOTH';

      items.push({
        name: subCatName,
        category,
        subCategory: subCatName,
        price: basePrice,
        calculatedPrice: calcBasePrice,
        station: dishStation,
        description: rowList[0].description || undefined,
        food_type: dishFoodType,
        erp_item_code: rowList[0].itemCode || undefined,
        has_variants: true,
        variant_group_name: 'Options',
        variants: options,
        is_packageable: rowList[0].packagingType === 'packageable' || rowList[0].packagingType === undefined,
        packaging_type: rowList[0].packagingType || 'packageable',
        sourceRowNumbers: rowList.map((r) => r.rowNumber),
      });
    } else {
      const single = rowList[0];
      const calcPrice = Math.round(single.price * multiplier * 100) / 100;

      items.push({
        name: single.itemName,
        category: single.category,
        subCategory: single.subCategory || undefined,
        price: single.price,
        calculatedPrice: calcPrice,
        station: single.station,
        description: single.description || undefined,
        food_type: single.foodType,
        erp_item_code: single.itemCode || undefined,
        has_variants: false,
        is_packageable: single.packagingType === 'packageable' || single.packagingType === undefined,
        packaging_type: single.packagingType || 'packageable',
        sourceRowNumbers: [single.rowNumber],
      });
    }
  });

  return items;
}

export function validateDbMergeConflicts(
  parsedItems: ParsedItem[],
  rawRows: RawValidatedRow[],
  existingItems: ExistingMenuRef[] = [],
  importMode: 'merge' | 'replace' = 'merge'
): {
  errors: ImportIssue[];
  warnings: ImportIssue[];
  mergeUpdateCount: number;
  mergeCreateCount: number;
} {
  if (importMode !== 'merge') {
    return {
      errors: [],
      warnings: [],
      mergeUpdateCount: 0,
      mergeCreateCount: parsedItems.length,
    };
  }

  const makeIssue = createIssueFactory();
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const dbByCode = new Map<string, ExistingMenuRef>();
  const dbByName = new Map<string, ExistingMenuRef>();

  for (const dbItem of existingItems) {
    const codeKey = normalizeImportKey(dbItem.erp_item_code);
    if (codeKey && !dbByCode.has(codeKey)) {
      dbByCode.set(codeKey, dbItem);
    }
    const nameKey = normalizeImportKey(dbItem.name);
    if (nameKey && !dbByName.has(nameKey)) {
      dbByName.set(nameKey, dbItem);
    }
  }
  for (const dbItem of existingItems) {
    if (Array.isArray(dbItem.variants)) {
      for (const v of dbItem.variants) {
        const vCodeKey = normalizeImportKey(v?.erp_item_code);
        if (vCodeKey && !dbByCode.has(vCodeKey)) {
          dbByCode.set(vCodeKey, dbItem);
        }
      }
    }
  }

  const resolvedTargets = new Map<string, { dishName: string; rowNumber: number }>();
  const flaggedCrossCollisionRows = new Set<number>();
  let mergeUpdateCount = 0;
  let mergeCreateCount = 0;

  for (const dish of parsedItems) {
    const rowNumber = dish.sourceRowNumbers?.[0] || 0;
    const codeKey = normalizeImportKey(dish.erp_item_code);
    const nameKey = normalizeImportKey(dish.name);

    const matchedByCode = codeKey ? dbByCode.get(codeKey) : undefined;
    const matchedByName = nameKey ? dbByName.get(nameKey) : undefined;

    if (matchedByCode && matchedByName && matchedByCode.id !== matchedByName.id) {
      flaggedCrossCollisionRows.add(rowNumber);
      errors.push(
        makeIssue(
          'error',
          rowNumber,
          'Item Code / Item Name',
          'DB_CROSS_COLLISION',
          `${dish.erp_item_code} / ${dish.name}`,
          `Merge conflict: Item Code "${dish.erp_item_code}" matches existing DB dish "${matchedByCode.name}", while name "${dish.name}" matches a different DB dish "${matchedByName.name}".`,
          'Align the Item Code and Item Name to reference the same database item, or switch to Replace Entire Menu mode.',
          dish.name
        )
      );
      continue;
    }

    const resolvedTarget = matchedByCode || matchedByName;
    let hasOptionCodeConflict = false;
    if (Array.isArray(dish.variants) && dish.variants.length > 0) {
      dish.variants.forEach((opt, idx) => {
        const optCodeKey = normalizeImportKey(opt?.erp_item_code);
        if (!optCodeKey) return;
        const optMatched = dbByCode.get(optCodeKey);
        if (!optMatched) return;
        if (!resolvedTarget || optMatched.id !== resolvedTarget.id) {
          hasOptionCodeConflict = true;
          const optRow = dish.sourceRowNumbers?.[idx] || rowNumber;
          flaggedCrossCollisionRows.add(optRow);
          errors.push(
            makeIssue(
              'error',
              optRow,
              'Item Code / SubCategory',
              'DB_CROSS_COLLISION',
              `${opt.erp_item_code} / ${dish.name}`,
              resolvedTarget
                ? `Merge conflict: Option "${opt.name}" (Item Code "${opt.erp_item_code}") matches DB dish "${optMatched.name}", conflicting with "${resolvedTarget.name}" for dish "${dish.name}".`
                : `Merge conflict: Option "${opt.name}" uses Item Code "${opt.erp_item_code}" already owned by DB dish "${optMatched.name}", while dish "${dish.name}" does not match "${optMatched.name}".`,
              'Align the conflicting Item Code/Name or switch to Replace Entire Menu mode.',
              opt.name
            )
          );
        }
      });
    }
    if (hasOptionCodeConflict) continue;

    if (resolvedTarget) {
      const prev = resolvedTargets.get(resolvedTarget.id);
      if (prev) {
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Item Code / Item Name',
            'DB_MERGE_TARGET_COLLISION',
            dish.erp_item_code || dish.name,
            `Merge conflict: Dish "${dish.name}" resolves to existing DB item "${resolvedTarget.name}", which is already targeted by "${prev.dishName}"${prev.rowNumber ? ` (Row ${prev.rowNumber})` : ''}.`,
            'Ensure each consolidated dish maps to a distinct database record in Merge mode.',
            dish.name
          )
        );
      } else {
        resolvedTargets.set(resolvedTarget.id, { dishName: dish.name, rowNumber });
        mergeUpdateCount += 1;

        if (
          matchedByName &&
          dish.name.trim() !== matchedByName.name.trim() &&
          normalizeImportKey(dish.name) === normalizeImportKey(matchedByName.name)
        ) {
          warnings.push(
            makeIssue(
              'warning',
              rowNumber,
              'Item Name / SubCategory',
              'DB_CASING_MISMATCH',
              dish.name,
              `Casing difference: Sheet dish "${dish.name}" matches existing DB item "${matchedByName.name}".`,
              'Merge mode will update the existing database item price/options while preserving its existing name.',
              dish.name
            )
          );
        }
      }
    } else {
      mergeCreateCount += 1;
    }
  }

  // Also check individual raw rows (e.g. an option row whose SKU matches DB Dish A while its name matches DB Dish B)
  for (const row of rawRows) {
    if (flaggedCrossCollisionRows.has(row.rowNumber)) continue;
    const codeKey = normalizeImportKey(row.itemCode);
    const nameKey = normalizeImportKey(row.itemName);
    const matchedByCode = codeKey ? dbByCode.get(codeKey) : undefined;
    const matchedByName = nameKey ? dbByName.get(nameKey) : undefined;

    if (matchedByCode && matchedByName && matchedByCode.id !== matchedByName.id) {
      errors.push(
        makeIssue(
          'error',
          row.rowNumber,
          'Item Code / Item Name',
          'DB_CROSS_COLLISION',
          `${row.itemCode} / ${row.itemName}`,
          `Row ${row.rowNumber}: Item Code "${row.itemCode}" matches DB item "${matchedByCode.name}" while Item Name "${row.itemName}" matches a different DB item "${matchedByName.name}".`,
          'Fix the conflicting Item Code or Item Name before merging.',
          row.itemName
        )
      );
    }
  }

  return { errors, warnings, mergeUpdateCount, mergeCreateCount };
}

export function extractAndValidateMenuMatrix(
  raw2D: any[][],
  options: ValidateMatrixOptions = {}
): MenuImportValidationResult {
  const {
    pricingMode = 'inclusive',
    taxRate = 13,
    importMode = 'merge',
    existingItems = [],
  } = options;

  const makeIssue = createIssueFactory();
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  if (!Array.isArray(raw2D) || raw2D.every((r) => isRowEmpty(r))) {
    errors.push(
      makeIssue(
        'error',
        1,
        'Sheet',
        'EMPTY_SHEET',
        '',
        'The uploaded spreadsheet is empty or contains no populated cells.',
        'Download the Sample Template, populate menu rows, and upload again.'
      )
    );
    return {
      items: [],
      rawRows: [],
      errors,
      warnings,
      summary: {
        totalDataRows: 0,
        validRowCount: 0,
        validDishCount: 0,
        errorCount: errors.length,
        warningCount: 0,
        mergeUpdateCount: 0,
        mergeCreateCount: 0,
      },
    };
  }

  // Auto-detect header row in top 10 rows
  let headerRowIdx = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(raw2D.length, 10); r++) {
    const row = raw2D[r];
    if (!Array.isArray(row)) continue;
    const matchedKeys = new Set<CanonicalColumnKey>();
    for (const cell of row) {
      const k = matchHeaderCell(cell);
      if (k) matchedKeys.add(k);
    }
    const hasCoreColumn =
      matchedKeys.has('itemName') ||
      matchedKeys.has('price') ||
      matchedKeys.has('category') ||
      matchedKeys.has('subCategory');
    if (matchedKeys.size >= 2 || (matchedKeys.size === 1 && hasCoreColumn)) {
      if (matchedKeys.size > bestScore) {
        bestScore = matchedKeys.size;
        headerRowIdx = r;
      }
    }
  }

  if (headerRowIdx === -1) {
    errors.push(
      makeIssue(
        'error',
        1,
        'Header Row',
        'MISSING_HEADER',
        '',
        'Could not detect the 8 standard menu column headers in the first 10 rows.',
        'Include headers: Item Name, Sales Price without vat price, Category, SubCategory, Item Code, Description, Veg/Non-Veg, Order Route.'
      )
    );
    return {
      items: [],
      rawRows: [],
      errors,
      warnings,
      summary: {
        totalDataRows: 0,
        validRowCount: 0,
        validDishCount: 0,
        errorCount: errors.length,
        warningCount: 0,
        mergeUpdateCount: 0,
        mergeCreateCount: 0,
      },
    };
  }

  const headerRow = raw2D[headerRowIdx] || [];
  const headerRowNumber = headerRowIdx + 1;
  const colMap: Record<CanonicalColumnKey, number> = {
    itemName: -1,
    price: -1,
    category: -1,
    subCategory: -1,
    itemCode: -1,
    description: -1,
    vegNonVeg: -1,
    orderRoute: -1,
  };
  const labelByColIndex = new Map<number, string>();

  headerRow.forEach((rawHeaderCell: unknown, colIdx: number) => {
    const cellText = normalizeImportText(rawHeaderCell);
    if (cellText && FORMULA_ERROR_REGEX.test(cellText)) {
      labelByColIndex.set(colIdx, `Column ${colIdx + 1}`);
      errors.push(
        makeIssue(
          'error',
          headerRowNumber,
          `Column ${colIdx + 1}`,
          'FORMULA_ERROR',
          cellText,
          `Row ${headerRowNumber}: Excel formula error "${cellText}" in header row.`,
          'Replace the errored header cell with the required column title.'
        )
      );
      return;
    }
    const matched = matchHeaderCell(rawHeaderCell);
    if (matched) {
      const def = COLUMN_DEFS.find((d) => d.key === matched)!;
      labelByColIndex.set(colIdx, def.label);
      if (colMap[matched] !== -1) {
        errors.push(
          makeIssue(
            'error',
            headerRowNumber,
            def.label,
            'DUPLICATE_HEADER',
            cellText,
            `Duplicate column header "${cellText}" maps to "${def.label}" (already present in column ${colMap[matched] + 1}).`,
            `Remove or rename the duplicate "${cellText}" column.`
          )
        );
      } else {
        colMap[matched] = colIdx;
      }
    } else if (cellText) {
      labelByColIndex.set(colIdx, cellText);
    }
  });

  for (const def of COLUMN_DEFS) {
    if (colMap[def.key] === -1) {
      errors.push(
        makeIssue(
          'error',
          headerRowNumber,
          def.label,
          'MISSING_HEADER',
          '',
          `Missing required column header "${def.label}".`,
          `Add the "${def.label}" column header to Row ${headerRowNumber}.`
        )
      );
    }
  }

  const hasMissingRequiredHeader = COLUMN_DEFS.some((d) => colMap[d.key] === -1);

  let totalDataRows = 0;
  const validRows: RawValidatedRow[] = [];

  const seenItemNames = new Map<string, { rowNumber: number; originalName: string }>();
  const seenItemCodes = new Map<string, { rowNumber: number; originalCode: string }>();
  const subCatToCategory = new Map<
    string,
    { categoryKey: string; categoryDisplay: string; rowNumber: number }
  >();

  // Track category/subcategory values for typo hints
  const categoryStats = new Map<string, { display: string; rows: number[] }>();
  const subCategoryStatsByCat = new Map<
    string,
    Map<string, { display: string; rows: number[] }>
  >();

  for (let r = headerRowIdx + 1; r < raw2D.length; r++) {
    const row = raw2D[r];
    if (isRowEmpty(row)) continue;

    totalDataRows += 1;
    const rowNumber = r + 1;
    let rowHasError = false;

    const rawItemName = colMap.itemName >= 0 ? String(row[colMap.itemName] ?? '') : '';
    const cleanNameContext = normalizeImportText(rawItemName);
    const contextItemName =
      cleanNameContext && !FORMULA_ERROR_REGEX.test(cleanNameContext)
        ? cleanNameContext
        : undefined;

    // 1. Check Excel formula errors across all cells in this row first
    const formulaErrorCols = new Set<number>();
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] ?? '').trim();
      if (FORMULA_ERROR_REGEX.test(cellStr)) {
        formulaErrorCols.add(c);
        rowHasError = true;
        const colLabel = labelByColIndex.get(c) || `Column ${c + 1}`;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            colLabel,
            'FORMULA_ERROR',
            cellStr,
            `Row ${rowNumber}: Excel formula error "${cellStr}" in "${colLabel}".`,
            'Fix the spreadsheet formula or replace it with a valid literal value.',
            contextItemName
          )
        );
      }
    }

    // 2. Check summary/footer noise rows (e.g. Subtotal, Total, Grand Total, S.N., Page 1)
    if (
      colMap.itemName >= 0 &&
      !formulaErrorCols.has(colMap.itemName) &&
      cleanNameContext &&
      SUMMARY_ROW_REGEX.test(cleanNameContext)
    ) {
      errors.push(
        makeIssue(
          'error',
          rowNumber,
          'Item Name',
          'SUMMARY_ROW',
          rawItemName.trim(),
          `Row ${rowNumber}: Summary/footer row "${cleanNameContext}" cannot be imported as a menu item.`,
          'Remove summary, total, or page-footer rows from the spreadsheet.',
          cleanNameContext
        )
      );
      continue;
    }

    // 3. Check empty mandatory/optional cells + whitespace warnings
    const rawValues: Record<CanonicalColumnKey, unknown> = {
      itemName: colMap.itemName >= 0 ? row[colMap.itemName] : undefined,
      price: colMap.price >= 0 ? row[colMap.price] : undefined,
      category: colMap.category >= 0 ? row[colMap.category] : undefined,
      subCategory: colMap.subCategory >= 0 ? row[colMap.subCategory] : undefined,
      itemCode: colMap.itemCode >= 0 ? row[colMap.itemCode] : undefined,
      description: colMap.description >= 0 ? row[colMap.description] : undefined,
      vegNonVeg: colMap.vegNonVeg >= 0 ? row[colMap.vegNonVeg] : undefined,
      orderRoute: colMap.orderRoute >= 0 ? row[colMap.orderRoute] : undefined,
    };

    for (const def of COLUMN_DEFS) {
      const colIdx = colMap[def.key];
      if (colIdx < 0 || formulaErrorCols.has(colIdx)) continue;

      const rawCell = rawValues[def.key];
      const strVal = String(rawCell ?? '');
      const trimmedVal = strVal.trim();

      if (trimmedVal === '') {
        if (def.mandatoryCell) {
          rowHasError = true;
          errors.push(
            makeIssue(
              'error',
              rowNumber,
              def.label,
              'EMPTY_CELL',
              '',
              `Row ${rowNumber}: Mandatory column "${def.label}" is empty.`,
              `Enter a valid "${def.label}" value on Row ${rowNumber}.`,
              contextItemName
            )
          );
        } else {
          warnings.push(
            makeIssue(
              'warning',
              rowNumber,
              def.label,
              'EMPTY_CELL',
              '',
              `Row ${rowNumber}: Optional column "${def.label}" is blank.`,
              def.key === 'itemCode'
                ? 'Adding a unique Item Code / SKU enables reliable matching in future Merge imports.'
                : 'Add a customer-facing description for richer menu presentation.',
              contextItemName
            )
          );
        }
      } else if (typeof rawCell === 'string') {
        const hasLeadingTrailing = strVal !== trimmedVal;
        const hasDoubleSpaces = /\s{2,}/.test(trimmedVal);
        if (hasLeadingTrailing || hasDoubleSpaces) {
          warnings.push(
            makeIssue(
              'warning',
              rowNumber,
              def.label,
              'WHITESPACE_ISSUE',
              strVal,
              `Row ${rowNumber}: "${def.label}" contains leading/trailing or repeated spaces ("${strVal}").`,
              'Extra whitespace will be automatically trimmed and collapsed during import.',
              contextItemName
            )
          );
        }
      }
    }

    // 4. Case-insensitive duplicate Item Name
    if (colMap.itemName >= 0 && !formulaErrorCols.has(colMap.itemName) && cleanNameContext) {
      const nameKey = cleanNameContext.toLowerCase();
      const prev = seenItemNames.get(nameKey);
      if (prev) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Item Name',
            'DUPLICATE_ITEM_NAME',
            cleanNameContext,
            `Row ${rowNumber}: Duplicate Item Name "${cleanNameContext}" conflicts with Row ${prev.rowNumber} ("${prev.originalName}").`,
            'Rename or remove one of the duplicate rows so every Item Name is unique (case-insensitive).',
            cleanNameContext
          )
        );
      } else {
        seenItemNames.set(nameKey, { rowNumber, originalName: cleanNameContext });
      }
    }

    // 5. Price validation
    let parsedPrice = 0;
    if (
      colMap.price >= 0 &&
      !formulaErrorCols.has(colMap.price) &&
      String(rawValues.price ?? '').trim() !== ''
    ) {
      const priceRes = parseStrictPrice(rawValues.price);
      if (!priceRes.valid || priceRes.price === undefined) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Sales Price without vat price',
            'INVALID_PRICE',
            String(rawValues.price ?? '').trim(),
            `Row ${rowNumber}: ${priceRes.errorMsg}`,
            'Enter a positive numeric price greater than 0 (e.g. 166.00).',
            contextItemName
          )
        );
      } else {
        parsedPrice = priceRes.price;
        if (priceRes.hasExtraPrecision) {
          warnings.push(
            makeIssue(
              'warning',
              rowNumber,
              'Sales Price without vat price',
              'PRICE_PRECISION',
              String(rawValues.price ?? '').trim(),
              `Row ${rowNumber}: Price "${String(rawValues.price).trim()}" has more than 2 decimal places and will be rounded to ${parsedPrice.toFixed(2)}.`,
              'Round spreadsheet prices to 2 decimal places for exact parity.',
              contextItemName
            )
          );
        }
        if (priceRes.isOutlier) {
          warnings.push(
            makeIssue(
              'warning',
              rowNumber,
              'Sales Price without vat price',
              'PRICE_PRECISION',
              String(rawValues.price ?? '').trim(),
              `Row ${rowNumber}: Unusually high price (${parsedPrice.toFixed(2)}) detected.`,
              'Verify this price is not a misplaced Item Code or typo.',
              contextItemName
            )
          );
        }
      }
    }

    // Packaging Type parsing (optional column, defaults to 'packageable')
    let parsedPackaging: 'packageable' | 'dine_in_only' | 'na' = 'packageable';
    if (colMap.packaging >= 0 && !formulaErrorCols.has(colMap.packaging)) {
      const rawPkg = normalizeImportText(rawValues.packaging).toLowerCase();
      if (rawPkg) {
        if (/^(dine[\s\-]*in(\s*only)?|no|false)$/i.test(rawPkg)) {
          parsedPackaging = 'dine_in_only';
        } else if (/^(n\/?a|none|exempt|not[\s\-_]*applicable)$/i.test(rawPkg)) {
          parsedPackaging = 'na';
        } else if (/^(packageable|pack|pkg|yes|true)$/i.test(rawPkg)) {
          parsedPackaging = 'packageable';
        }
      }
    }

    // 6. Duplicate Item Code (SKU)
    const cleanCode =
      colMap.itemCode >= 0 && !formulaErrorCols.has(colMap.itemCode)
        ? normalizeImportText(rawValues.itemCode)
        : '';
    if (cleanCode) {
      const codeKey = cleanCode.toLowerCase();
      const prevCode = seenItemCodes.get(codeKey);
      if (prevCode) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Item Code',
            'DUPLICATE_ITEM_CODE',
            cleanCode,
            `Row ${rowNumber}: Duplicate Item Code "${cleanCode}" conflicts with Row ${prevCode.rowNumber} ("${prevCode.originalCode}").`,
            'Assign a unique SKU/Item Code to every row.',
            contextItemName
          )
        );
      } else {
        seenItemCodes.set(codeKey, { rowNumber, originalCode: cleanCode });
      }
    }

    // 7. Veg/Non-Veg validation
    let parsedFood: 'veg' | 'non-veg' | 'none' = 'none';
    const rawFoodStr =
      colMap.vegNonVeg >= 0 && !formulaErrorCols.has(colMap.vegNonVeg)
        ? String(rawValues.vegNonVeg ?? '').trim()
        : '';
    if (rawFoodStr !== '') {
      const ft = parseFoodType(rawFoodStr);
      if (!ft) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Veg/Non-Veg',
            'INVALID_FOOD_TYPE',
            rawFoodStr,
            `Row ${rowNumber}: Unrecognized Veg/Non-Veg value "${rawFoodStr}".`,
            'Use one of: Veg, Vegetarian, Non-Veg, Non-Vegetarian, None, or N/A.',
            contextItemName
          )
        );
      } else {
        parsedFood = ft;
      }
    }

    // 8. Order Route validation
    let parsedStation: 'KITCHEN' | 'BAR' | 'BOTH' = 'KITCHEN';
    const rawRouteStr =
      colMap.orderRoute >= 0 && !formulaErrorCols.has(colMap.orderRoute)
        ? String(rawValues.orderRoute ?? '').trim()
        : '';
    if (rawRouteStr !== '') {
      const st = parseOrderRoute(rawRouteStr);
      if (!st) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Order Route',
            'INVALID_ORDER_ROUTE',
            rawRouteStr,
            `Row ${rowNumber}: Unrecognized Order Route "${rawRouteStr}".`,
            'Use one of: Kitchen (KOT), Bar (BOT), or Both (Kitchen & Bar).',
            contextItemName
          )
        );
      } else {
        parsedStation = st;
      }
    }

    // 9. Category & SubCategory conflict + typo stats
    const rawCatClean =
      colMap.category >= 0 && !formulaErrorCols.has(colMap.category)
        ? normalizeImportText(rawValues.category)
        : '';
    const cleanCat = rawCatClean ? cleanCategoryName(rawCatClean) : '';
    const cleanSubCat =
      colMap.subCategory >= 0 && !formulaErrorCols.has(colMap.subCategory)
        ? normalizeImportText(rawValues.subCategory)
        : '';

    if (cleanCat) {
      const catKey = cleanCat.toLowerCase();
      const catEntry = categoryStats.get(catKey) || { display: cleanCat, rows: [] };
      catEntry.rows.push(rowNumber);
      categoryStats.set(catKey, catEntry);
    }

    if (cleanCat && cleanSubCat) {
      const catKey = cleanCat.toLowerCase();
      const subKey = cleanSubCat.toLowerCase();

      const existingMapping = subCatToCategory.get(subKey);
      if (existingMapping && existingMapping.categoryKey !== catKey) {
        rowHasError = true;
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'SubCategory',
            'SUBCATEGORY_CATEGORY_CONFLICT',
            cleanSubCat,
            `Row ${rowNumber}: SubCategory "${cleanSubCat}" is under Category "${cleanCat}", conflicting with Category "${existingMapping.categoryDisplay}" on Row ${existingMapping.rowNumber}.`,
            'Keep each SubCategory under a single consistent Category so multi-tier options group cleanly.',
            contextItemName
          )
        );
      } else if (!existingMapping) {
        subCatToCategory.set(subKey, {
          categoryKey: catKey,
          categoryDisplay: cleanCat,
          rowNumber,
        });
      }

      if (!subCategoryStatsByCat.has(catKey)) {
        subCategoryStatsByCat.set(catKey, new Map());
      }
      const subMap = subCategoryStatsByCat.get(catKey)!;
      const subEntry = subMap.get(subKey) || { display: cleanSubCat, rows: [] };
      subEntry.rows.push(rowNumber);
      subMap.set(subKey, subEntry);
    }

    // Only include structurally valid rows (when all required headers exist) in grouping
    if (!hasMissingRequiredHeader && !rowHasError && cleanNameContext && parsedPrice > 0 && cleanCat && cleanSubCat) {
      validRows.push({
        rowNumber,
        itemName: cleanNameContext,
        price: parsedPrice,
        category: cleanCat,
        subCategory: cleanSubCat,
        itemCode: cleanCode,
        description:
          colMap.description >= 0 && !formulaErrorCols.has(colMap.description)
            ? normalizeImportText(rawValues.description)
            : '',
        foodType: parsedFood,
        station: parsedStation,
        packagingType: parsedPackaging,
      });
    }
  }

  if (totalDataRows === 0) {
    errors.push(
      makeIssue(
        'error',
        headerRowNumber,
        'Sheet',
        'EMPTY_SHEET',
        '',
        'The spreadsheet contains headers but 0 data rows.',
        'Add at least one populated menu row below the header row.'
      )
    );
  }

  // 10. Typo hints across Category and SubCategory values
  const emitTypoHints = (
    statsMap: Map<string, { display: string; rows: number[] }>,
    columnLabel: string
  ) => {
    const entries = Array.from(statsMap.entries());
    const flaggedKeys = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [kA, infoA] = entries[i];
        const [kB, infoB] = entries[j];
        if (!isLikelyTypoPair(kA, kB)) continue;

        // Flag whichever spelling appears less frequently (or later if tied)
        const target =
          infoA.rows.length < infoB.rows.length
            ? { key: kA, info: infoA, match: infoB }
            : { key: kB, info: infoB, match: infoA };

        if (flaggedKeys.has(target.key)) continue;
        flaggedKeys.add(target.key);

        for (const rNum of target.info.rows) {
          warnings.push(
            makeIssue(
              'warning',
              rNum,
              columnLabel,
              'TYPO_HINT',
              target.info.display,
              `Row ${rNum}: "${target.info.display}" looks like a near-duplicate spelling of "${target.match.display}" (Row ${target.match.rows[0]}).`,
              `If these belong together, standardize spelling to "${target.match.display}" so items group cleanly.`
            )
          );
        }
      }
    }
  };

  emitTypoHints(categoryStats, 'Category');
  subCategoryStatsByCat.forEach((subMap) => {
    emitTypoHints(subMap, 'SubCategory');
  });

  // 11. Group valid rows into multi-tier dishes and check DB merge conflicts
  const groupedItems = groupValidatedRows(validRows, pricingMode, taxRate);
  const dbCheck = validateDbMergeConflicts(groupedItems, validRows, existingItems, importMode);
  errors.push(...dbCheck.errors);
  warnings.push(...dbCheck.warnings);

  const sortIssues = (a: ImportIssue, b: ImportIssue) => a.rowNumber - b.rowNumber;
  errors.sort(sortIssues);
  warnings.sort(sortIssues);

  return {
    items: groupedItems,
    rawRows: validRows,
    errors,
    warnings,
    summary: {
      totalDataRows,
      validRowCount: validRows.length,
      validDishCount: groupedItems.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      mergeUpdateCount: dbCheck.mergeUpdateCount,
      mergeCreateCount: dbCheck.mergeCreateCount,
    },
  };
}

export const STANDARD_MENU_TEMPLATE_ROWS: (string | number)[][] = [
  ['Item Name', 'Sales Price without vat price', 'Category', 'SubCategory', 'Item Code', 'Description', 'Veg/Non-Veg', 'Order Route'],
  ['Americano (Double)', 166.00, 'Coffee', 'Americano', 'AB-12', 'Double Tasty Americano', 'Veg', 'Kitchen'],
  ['Americano(Double) packing', 172.57, 'Coffee', 'Americano', 'AB-13', 'Double Tasty Americano (Packing)', 'Veg', 'Bar'],
  ['Americano(Packing)', 159.29, 'Coffee', 'Americano', 'AB-14', 'Tasty Americano (Packing)', 'None', 'Both'],
  ['Appy(200ml)', 26.55, 'Beverages', 'Juice', 'AB-15', 'Chilled Apple Juice 200ml', 'Veg', 'Bar'],
  ['Banana Lassi', 132.74, 'Beverages', 'Lassi', 'AB-16', 'Indian Style Lassi', 'Veg', 'Bar'],
  ['Banana Lassi (Packing)', 141.59, 'Beverages', 'Lassi', 'AB-17', 'Indian Style Lassi Packing', 'Veg', 'Bar'],
  ['Beijing Chicken W.Rice(PACK)', 318.58, 'Special', 'Chinese', 'AB-18', 'Stir-fried chicken with rice', 'Non-Veg', 'Kitchen'],
  ['Black Coffee', 70.80, 'Coffee', 'Black Coffee', 'AB-19', 'Freshly brewed black coffee', 'Veg', 'Bar'],
  ['Black Coffee (packing)', 79.65, 'Coffee', 'Black Coffee', 'AB-20', 'Freshly brewed black coffee (packing)', 'Veg', 'Bar'],
  ['Black Tea', 30.97, 'Hot Drinks', 'Tea', 'AB-21', 'Classic black tea', 'Veg', 'Bar'],
  ['Black Tea (packing)', 39.82, 'Hot Drinks', 'Tea', 'AB-22', 'Classic black tea (packing)', 'Veg', 'Bar'],
  ['Cafe Latte(Beans)', 199.12, 'Coffee', 'Latte', 'AB-23', 'Espresso with steamed milk', 'Veg', 'Bar'],
  ['Cafe Latte(packing)', 207.96, 'Coffee', 'Latte', 'AB-24', 'Espresso with steamed milk (packing)', 'Veg', 'Bar'],
  ['Coke', 53.10, 'Beverages', 'Soft Drinks', 'AB-25', 'Chilled Coca-Cola bottle', 'None', 'Bar'],
  ['Coke (packing)', 61.95, 'Beverages', 'Soft Drinks', 'AB-26', 'Chilled Coca-Cola (packing)', 'None', 'Bar'],
  ['Coke (1 Ltr)', 265.49, 'Beverages', 'Soft Drinks', 'AB-27', '1 Litre Coca-Cola bottle', 'None', 'Bar'],
];

/**
 * Fallback validator for direct API callers sending pre-grouped `items` without `rawRows`.
 */
export function validateGroupedPayload(
  items: any[],
  existingItems: ExistingMenuRef[] = [],
  importMode: 'merge' | 'replace' = 'merge'
): {
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: ValidationSummary;
} {
  const makeIssue = createIssueFactory();
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const seenNames = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  const normalizedItems: ParsedItem[] = [];

  items.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    const rawName = normalizeImportText(raw?.name || raw?.['Item Name'] || raw?.ProductName || '');
    const rawCode = normalizeImportText(raw?.erp_item_code ?? raw?.code ?? '');
    const rawPrice = Number(raw?.price ?? raw?.rate ?? raw?.Rate ?? raw?.BasePrice ?? 0);

    if (!rawName) {
      errors.push(
        makeIssue(
          'error',
          rowNumber,
          'Item Name',
          'EMPTY_CELL',
          '',
          `Item #${rowNumber}: Item name is required.`,
          'Provide a non-empty dish name.'
        )
      );
    } else {
      const key = rawName.toLowerCase();
      if (seenNames.has(key)) {
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Item Name',
            'DUPLICATE_ITEM_NAME',
            rawName,
            `Item #${rowNumber}: Duplicate dish name "${rawName}" conflicts with item #${seenNames.get(key)}.`,
            'Use unique dish names (case-insensitive).',
            rawName
          )
        );
      } else {
        seenNames.set(key, rowNumber);
      }
    }

    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      errors.push(
        makeIssue(
          'error',
          rowNumber,
          'Price',
          'INVALID_PRICE',
          String(raw?.price ?? ''),
          `Item #${rowNumber} ("${rawName || 'Unnamed'}"): Price must be greater than 0.`,
          'Provide a valid positive price.',
          rawName || undefined
        )
      );
    }

    if (rawCode) {
      const codeKey = rawCode.toLowerCase();
      if (seenCodes.has(codeKey)) {
        errors.push(
          makeIssue(
            'error',
            rowNumber,
            'Item Code',
            'DUPLICATE_ITEM_CODE',
            rawCode,
            `Item #${rowNumber}: Duplicate Item Code "${rawCode}" conflicts with item #${seenCodes.get(codeKey)}.`,
            'Use unique Item Codes.',
            rawName || undefined
          )
        );
      } else {
        seenCodes.set(codeKey, rowNumber);
      }
    }

    if (rawName && Number.isFinite(rawPrice) && rawPrice > 0) {
      normalizedItems.push({
        erp_item_code: rawCode || undefined,
        name: rawName,
        category: normalizeImportText(raw?.category || raw?.Category || 'General') || 'General',
        subCategory: raw?.subCategory ? normalizeImportText(raw.subCategory) : undefined,
        price: rawPrice,
        calculatedPrice: rawPrice,
        station: raw?.station || 'KITCHEN',
        description: raw?.description ? normalizeImportText(raw.description) : undefined,
        food_type: raw?.food_type || 'none',
        has_variants: Boolean(raw?.has_variants),
        variant_group_name: raw?.variant_group_name,
        variants: Array.isArray(raw?.variants) ? raw.variants : undefined,
        is_packageable: raw?.packaging_type ? raw.packaging_type === 'packageable' : raw?.is_packageable !== false,
        packaging_type: raw?.packaging_type || (raw?.is_packageable === false ? 'dine_in_only' : 'packageable'),
        sourceRowNumbers: [rowNumber],
      });
    }
  });

  const dbCheck = validateDbMergeConflicts(normalizedItems, [], existingItems, importMode);
  errors.push(...dbCheck.errors);
  warnings.push(...dbCheck.warnings);

  return {
    errors,
    warnings,
    summary: {
      totalDataRows: items.length,
      validRowCount: normalizedItems.length,
      validDishCount: normalizedItems.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      mergeUpdateCount: dbCheck.mergeUpdateCount,
      mergeCreateCount: dbCheck.mergeCreateCount,
    },
  };
}
