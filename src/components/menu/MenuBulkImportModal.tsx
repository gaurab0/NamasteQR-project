import React, { useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Percent,
  Check,
  Layers,
  ArrowRight,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MenuBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  onSuccess: () => void;
}

interface ParsedOption {
  name: string;
  price: number;
  calculatedPrice: number;
  erp_item_code?: string;
  description?: string;
  food_type?: 'veg' | 'non-veg' | 'none';
  station?: 'KITCHEN' | 'BAR' | 'BOTH';
}

interface ParsedItem {
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
}

export const MenuBulkImportModal: React.FC<MenuBulkImportModalProps> = ({
  isOpen,
  onClose,
  businessId,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [pricingMode, setPricingMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [taxRate, setTaxRate] = useState<number>(13);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    parseFile(uploadedFile, pricingMode, taxRate);
  };

  const cleanCategoryName = (str: string) => {
    const trimmed = str.trim();
    if (!trimmed) return 'General';
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
      return trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return trimmed;
  };

  const parseFile = (fileToParse: File, mode: 'inclusive' | 'exclusive', rate: number) => {
    setParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        const raw2D: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if ((!raw2D || raw2D.length === 0) && (!rawJson || rawJson.length === 0)) {
          setError('The uploaded sheet is empty or has invalid formatting.');
          setParsing(false);
          return;
        }

        const multiplier = mode === 'exclusive' ? 1 + (Number(rate) || 0) / 100 : 1;

        // Auto-detect header row index
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(raw2D.length, 10); r++) {
          const row = raw2D[r];
          if (!Array.isArray(row)) continue;
          const cells = row.map(c => String(c || '').toLowerCase().trim());
          const hasItemName = cells.some(c => /item\s*name/i.test(c));
          const hasCategory = cells.some(c => /category/i.test(c));
          if (hasItemName || hasCategory) {
            headerRowIdx = r;
            break;
          }
        }

        const parsedRows: any[] = headerRowIdx >= 0
          ? XLSX.utils.sheet_to_json(ws, { range: headerRowIdx, defval: '' })
          : rawJson;

        const findVal = (rowObj: any, patterns: RegExp[]): string => {
          for (const pat of patterns) {
            const key = Object.keys(rowObj).find(k => pat.test(k.trim()));
            if (key && rowObj[key] !== undefined && String(rowObj[key]).trim() !== '') {
              return String(rowObj[key]).trim();
            }
          }
          return '';
        };

        interface RawExtractedRow {
          itemName: string;
          price: number;
          category: string;
          subCategory: string;
          itemCode: string;
          description: string;
          foodType: 'veg' | 'non-veg' | 'none';
          station: 'KITCHEN' | 'BAR' | 'BOTH';
        }

        const extractedRows: RawExtractedRow[] = [];

        for (const row of parsedRows) {
          const itemName = findVal(row, [/item\s*name/i, /^name$/i, /^dish/i, /^product/i]);
          const priceStr = findVal(row, [/sales\s*price/i, /without\s*vat/i, /^price$/i, /^rate$/i, /^amount$/i]);
          const category = findVal(row, [/^(main\s*)?category$/i, /^group$/i, /^class$/i]) || 'General';
          const subCategory = findVal(row, [/sub\s*category/i, /^sub$/i]);
          const itemCode = findVal(row, [/item\s*code/i, /^code$/i, /^sku$/i, /^id$/i]);
          const description = findVal(row, [/descriptio?n/i, /^desc$/i, /^details$/i]);
          const vegNonVeg = findVal(row, [/veg/i, /dietary/i, /food\s*type/i]);
          const orderRoute = findVal(row, [/order\s*route/i, /^route$/i, /^station$/i]);

          const cleanName = itemName.trim();
          if (!cleanName || /^(subtotal|total|date|page\s*\d|s\.?n\.?)$/i.test(cleanName)) continue;

          const rawPrice = parseFloat(priceStr.replace(/[^\d.-]/g, '')) || 0;
          if (rawPrice <= 0) continue;

          const cleanCat = cleanCategoryName(category);
          const cleanSubCat = subCategory.trim();
          const cleanCode = itemCode.trim();
          const cleanDesc = description.trim();

          // Veg / Non-veg mapping
          let fType: 'veg' | 'non-veg' | 'none' = 'none';
          const lowerVeg = vegNonVeg.toLowerCase();
          if (lowerVeg === 'veg' || lowerVeg === 'vegetarian') {
            fType = 'veg';
          } else if (lowerVeg.includes('non') || lowerVeg.includes('meat') || lowerVeg.includes('chicken') || lowerVeg.includes('fish') || lowerVeg.includes('mutton') || lowerVeg.includes('buff') || lowerVeg.includes('pork')) {
            fType = 'non-veg';
          }

          // Order Route mapping
          let st: 'KITCHEN' | 'BAR' | 'BOTH' = 'KITCHEN';
          const upperRoute = orderRoute.toUpperCase();
          if (upperRoute.includes('BOTH')) {
            st = 'BOTH';
          } else if (upperRoute.includes('BAR')) {
            st = 'BAR';
          } else if (upperRoute.includes('KITCHEN')) {
            st = 'KITCHEN';
          } else {
            // Heuristic fallback
            const catLow = cleanCat.toLowerCase();
            const nameLow = cleanName.toLowerCase();
            if (
              catLow.includes('beverage') || catLow.includes('drink') || catLow.includes('bar') ||
              nameLow.includes('coffee') || nameLow.includes('tea') || nameLow.includes('coke') ||
              nameLow.includes('beer') || nameLow.includes('wine') || nameLow.includes('juice') ||
              nameLow.includes('lassi')
            ) {
              st = 'BAR';
            }
          }

          extractedRows.push({
            itemName: cleanName,
            price: rawPrice,
            category: cleanCat,
            subCategory: cleanSubCat,
            itemCode: cleanCode,
            description: cleanDesc,
            foodType: fType,
            station: st,
          });
        }

        if (extractedRows.length === 0) {
          setError('Could not detect valid menu items with names and prices in this spreadsheet.');
          setParsing(false);
          return;
        }

        // Two-Pass Grouping Algorithm
        // Group by Category + ':::' + SubCategory
        const groups = new Map<string, RawExtractedRow[]>();
        for (const row of extractedRows) {
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
            // Multi-tier options dish
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

            const allVeg = options.every(o => o.food_type === 'veg');
            const allNonVeg = options.every(o => o.food_type === 'non-veg');
            const dishFoodType = allVeg ? 'veg' : (allNonVeg ? 'non-veg' : 'none');

            const allBar = options.every(o => o.station === 'BAR');
            const allKitchen = options.every(o => o.station === 'KITCHEN');
            const dishStation = allBar ? 'BAR' : (allKitchen ? 'KITCHEN' : 'BOTH');

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
              is_packageable: true,
            });
          } else {
            // Single-row dish
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
              is_packageable: true,
            });
          }
        });

        setParsedItems(items);
      } catch (err: any) {
        console.error('File parsing error:', err);
        setError('Failed to parse file: ' + (err.message || 'Invalid format'));
      } finally {
        setParsing(false);
      }
    };

    reader.readAsBinaryString(fileToParse);
  };

  const handlePricingModeChange = (newMode: 'inclusive' | 'exclusive') => {
    setPricingMode(newMode);
    if (file) {
      parseFile(file, newMode, taxRate);
    }
  };

  const handleTaxRateChange = (newRate: number) => {
    setTaxRate(newRate);
    if (file) {
      parseFile(file, pricingMode, newRate);
    }
  };

  const handleDownloadTemplate = () => {
    const wsData = [
      ['Item Name', 'Sales Price without vat price', 'Category', 'SubCategory', 'Item Code', 'Description', 'Veg/Non-Veg', 'Order Route'],
      ['Americano (Double)', 166.00, 'Coffee', 'Americano', 'AB-12', 'Double Tasty Americano', 'Veg', 'Kitchen'],
      ['Americano(Double) packing', 172.57, 'Coffee', 'Americano', 'AB-13', 'Double Tasty Americano(Packing)', 'Non-veg', 'Bar'],
      ['Americano(Packing)', 159.29, 'Coffee', 'Americano', 'AB-14', 'Tasty Americano', 'None', 'Both'],
      ['Appy(200ml)', 26.55, 'Beverages', 'Juice', 'AB-15', '', 'None', 'Bar'],
      ['Banana Lassi', 132.74, 'Beverages', 'Lassi', 'AB-16', 'Indian Style Lassi', 'Veg', 'Bar'],
      ['Banana Lassi (Packing)', 141.59, 'Beverages', 'Lassi', '', 'Indian Style Lassi Packing', 'Veg', 'Bar'],
      ['Beijing Chicken W.Rice(PACK)', 318.58, 'Special', 'Chinese', '', '', 'Non-veg', 'Kitchen'],
      ['Black Coffee', 70.80, 'Coffee', 'Black Coffee', '', '', 'Veg', 'Bar'],
      ['Black Coffee (packing)', 79.65, 'Coffee', 'Black Coffee', '', '', 'Veg', 'Bar'],
      ['Black Tea', 30.97, 'Hot Drinks', 'Tea', '', '', 'Veg', 'Bar'],
      ['Black Tea (packing)', 39.82, 'Hot Drinks', 'Tea', '', '', 'Veg', 'Bar'],
      ['Cafe Latte(Beans)', 199.12, 'Coffee', 'Latte', '', '', 'Veg', 'Bar'],
      ['Cafe Latte(packing)', 207.96, 'Coffee', 'Latte', '', '', 'Veg', 'Bar'],
      ['Coke', 53.10, 'Beverages', 'Soft Drinks', '', '', 'None', 'Bar'],
      ['Coke (packing)', 61.95, 'Beverages', 'Soft Drinks', '', '', 'None', 'Bar'],
      ['coke(1ltr)', 265.49, 'Beverages', 'Soft Drinks', '', '', 'None', 'Bar'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Menu Template');
    XLSX.writeFile(wb, 'serveflow_menu_standard_template.xlsx');
  };

  const handleExecuteImport = async () => {
    if (parsedItems.length === 0) return;

    try {
      setImporting(true);
      setError(null);

      const payload = {
        items: parsedItems.map(it => ({
          erp_item_code: it.erp_item_code,
          name: it.name,
          category: it.category,
          subCategory: it.subCategory,
          price: it.price,
          station: it.station,
          description: it.description,
          food_type: it.food_type,
          has_variants: it.has_variants,
          variant_group_name: it.variant_group_name,
          variants: it.variants,
          is_packageable: it.is_packageable !== false,
        })),
        mode: importMode,
        pricingMode,
        taxRate,
      };

      const res = await fetch(`/api/menus/bulk-import?businessId=${businessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessResult(json.message || `Successfully processed ${parsedItems.length} dishes.`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setError(json.error?.message || json.message || 'Import failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit import.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Import Menu (Excel / CSV)</h3>
              <p className="text-xs text-zinc-500">Standard 8-column format with automatic multi-tier option grouping</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="text-xs text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 font-bold px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1.5 transition cursor-pointer"
              title="Download sample excel sheet with required 8 columns"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sample Template</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successResult}</span>
            </div>
          )}

          {/* File Upload Area */}
          <div className="border-2 border-dashed border-zinc-200 hover:border-purple-300 rounded-2xl p-6 text-center bg-zinc-50/50 hover:bg-purple-50/20 transition group">
            <input
              type="file"
              id="menu-file-input"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label htmlFor="menu-file-input" className="cursor-pointer block space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-white border border-zinc-200 shadow-2xs flex items-center justify-center mx-auto text-zinc-400 group-hover:text-purple-600 group-hover:scale-105 transition">
                {parsing ? <RefreshCw className="w-6 h-6 animate-spin text-purple-600" /> : <Upload className="w-6 h-6" />}
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-800">
                  {fileName ? fileName : 'Click to select or drag & drop Excel / CSV spreadsheet'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Supports standard 8 columns: Item Name, Sales Price without vat price, Category, SubCategory, Item Code, Description, Veg/Non-Veg, Order Route
                </p>
              </div>
            </label>
          </div>

          {/* Configuration Settings */}
          {parsedItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option 1: Tax / Pricing Mode */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">Pricing Mode:</span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">Recommended: As-Is</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      checked={pricingMode === 'inclusive'}
                      onChange={() => handlePricingModeChange('inclusive')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Direct Menu Price (As Listed in Sheet)</span>
                      <span className="text-[11px] text-zinc-500">Imports the exact prices from the spreadsheet directly into the menu.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      checked={pricingMode === 'exclusive'}
                      onChange={() => handlePricingModeChange('exclusive')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Tax-Exclusive (+{taxRate}% VAT Added)</span>
                      <span className="text-[11px] text-zinc-500">Calculates customer gross menu price by adding VAT rate to sheet price.</span>
                    </div>
                  </label>
                </div>

                {pricingMode === 'exclusive' && (
                  <div className="flex items-center gap-2 pt-1 border-t border-zinc-200/60">
                    <span className="text-zinc-600 font-medium">Applied VAT Rate:</span>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => handleTaxRateChange(Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-zinc-300 rounded-lg text-center font-bold bg-white"
                    />
                    <span className="text-zinc-400 font-bold">%</span>
                  </div>
                )}
              </div>

              {/* Option 2: Action Mode */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3">
                <span className="font-bold text-zinc-800 block">Import Action:</span>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Merge & Update (Recommended)</span>
                      <span className="text-[11px] text-zinc-500">Updates prices, ERP codes, and options. <strong>Preserves existing dish photos & descriptions!</strong></span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Replace Entire Menu</span>
                      <span className="text-[11px] text-rose-600">Deletes current dishes & previous categories, re-populating fresh from file.</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-800 text-sm">Preview Parsed Items ({parsedItems.length} dishes):</span>
                <span className="text-[11px] text-zinc-500">
                  {parsedItems.filter(p => p.has_variants).length} with multi-tier options • {parsedItems.filter(p => !p.has_variants).length} single dishes
                </span>
              </div>

              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-zinc-200">
                <div className="bg-zinc-100 text-zinc-600 text-[10px] uppercase font-bold tracking-wider px-3.5 py-2.5 grid grid-cols-12 gap-2">
                  <div className="col-span-4">Dish Name</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-2">Base Price</div>
                  <div className="col-span-2">Route</div>
                  <div className="col-span-2 text-right">Structure</div>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 bg-white">
                  {parsedItems.map((it, idx) => (
                    <div key={idx} className="p-3 text-xs hover:bg-zinc-50/50 space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4 font-bold text-zinc-900 flex items-center gap-1.5">
                          <span>{it.name}</span>
                          {it.erp_item_code && (
                            <span className="font-mono text-[10px] text-purple-700 bg-purple-50 px-1 py-0.2 rounded font-semibold">
                              {it.erp_item_code}
                            </span>
                          )}
                        </div>
                        <div className="col-span-2 text-zinc-600 font-medium truncate">{it.category}</div>
                        <div className="col-span-2 font-mono font-bold text-zinc-900">
                          Rs. {it.calculatedPrice.toFixed(2)}
                        </div>
                        <div className="col-span-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            it.station === 'BAR' ? 'bg-purple-100 text-purple-800' :
                            it.station === 'BOTH' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {it.station}
                          </span>
                        </div>
                        <div className="col-span-2 text-right">
                          {it.has_variants ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              {it.variants?.length || 0} Options
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600">
                              Single
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sub-row displaying options if dish has multi-tier variants */}
                      {it.has_variants && Array.isArray(it.variants) && (
                        <div className="pl-3 pt-1 border-t border-dashed border-zinc-100 flex flex-wrap gap-1.5">
                          {it.variants.map((v, vIdx) => (
                            <div key={vIdx} className="bg-amber-50/70 border border-amber-200/70 rounded-md px-2 py-0.5 text-[11px] flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-800">{v.name}</span>
                              <span className="font-mono font-bold text-amber-950">Rs. {v.calculatedPrice.toFixed(2)}</span>
                              {v.erp_item_code && (
                                <span className="font-mono text-[9px] text-purple-700 bg-white px-1 rounded border border-purple-200">
                                  {v.erp_item_code}
                                </span>
                              )}
                              <span className="text-[9px] font-bold px-1 rounded bg-white text-zinc-600 border border-zinc-200">
                                {v.station || it.station}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={parsedItems.length === 0 || importing}
            onClick={handleExecuteImport}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {importing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Importing Menu...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Import & Sync Menu ({parsedItems.length} dishes)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
