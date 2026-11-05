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
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MenuBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  onSuccess: () => void;
}

interface ParsedItem {
  erp_item_code?: string;
  name: string;
  category: string;
  price: number;
  calculatedPrice: number;
  station: 'KITCHEN' | 'BAR' | 'BOTH';
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
  const [pricingMode, setPricingMode] = useState<'inclusive' | 'exclusive'>('exclusive');
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

  const parseFile = (fileToParse: File, mode: 'inclusive' | 'exclusive', rate: number) => {
    setParsing(true);
    setError(null);

    const cleanCategoryName = (str: string) => {
      const trimmed = str.trim();
      if (!trimmed) return 'General';
      if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
        return trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      return trimmed;
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        
        // Parse raw rows as 2D array and objects
        const raw2D: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if ((!raw2D || raw2D.length === 0) && (!rawJson || rawJson.length === 0)) {
          setError('The uploaded sheet is empty or has invalid formatting.');
          setParsing(false);
          return;
        }

        const multiplier = mode === 'exclusive' ? 1 + (Number(rate) || 0) / 100 : 1;
        const items: ParsedItem[] = [];

        // Check if sheet uses ERP / Accounting Grouped Layout (e.g. "Group: BEVERAGE")
        let isGroupedFormat = false;
        for (const r of raw2D) {
          const joined = (r || []).map(x => String(x || '').trim()).join(' ');
          if (/group\s*:/i.test(joined) || /category\s*:/i.test(joined) || /^group:?$/i.test(String(r?.[0] || '').trim())) {
            isGroupedFormat = true;
            break;
          }
        }

        if (isGroupedFormat) {
          let currentCategory = 'General';
          for (const row of raw2D) {
            if (!Array.isArray(row) || row.length === 0) continue;
            const cells = row.map(c => String(c ?? '').trim());
            const nonEmpties = cells.filter(Boolean);
            const rowText = nonEmpties.join(' ');
            if (!rowText) continue;

            // 1. Group / Category Header row detection
            // Case A: "Group: BAKERY" or "Group: BEVERAGE"
            const groupHeaderMatch = rowText.match(/(?:group|category)\s*:\s*([^\d,;]+)/i);
            if (groupHeaderMatch && groupHeaderMatch[1].trim()) {
              currentCategory = cleanCategoryName(groupHeaderMatch[1]);
              continue;
            }

            // Case B: Cell 0 is "Group:" and adjacent cell is "BAKERY"
            const groupIdx = cells.findIndex(c => /^group:?$/i.test(c.trim()));
            if (groupIdx !== -1) {
              const nextVal = cells.slice(groupIdx + 1).find(c => c && c.trim() && !/^\d+$/.test(c.trim()));
              if (nextVal) {
                currentCategory = cleanCategoryName(nextVal);
                continue;
              }
            }

            // Skip summary rows or table headers
            if (/subtotal|total|date|page\s*\d|particulars|^s\.?n\.?$/i.test(rowText)) continue;

            // 2. Find price (last non-empty numeric cell)
            let price = 0;
            let priceColIdx = -1;
            for (let i = cells.length - 1; i >= 0; i--) {
              const cleanStr = cells[i].replace(/[^\d.-]/g, '');
              const val = parseFloat(cleanStr);
              if (!isNaN(val) && val > 0 && /^[0-9]+(\.[0-9]+)?$/.test(cells[i].trim())) {
                price = val;
                priceColIdx = i;
                break;
              }
            }

            if (price <= 0 || priceColIdx <= 0) continue;

            // 3. Name is column 1 (or between code and price)
            let name = '';
            let code = '';
            if (priceColIdx >= 2) {
              code = cells[0];
              name = cells.slice(1, priceColIdx).filter(Boolean).join(' ');
            } else if (priceColIdx === 1) {
              name = cells[0];
            }

            if (!name || /^[\d\s.-]+$/.test(name)) continue;

            // 4. Station routing
            let station: 'KITCHEN' | 'BAR' | 'BOTH' = 'KITCHEN';
            const lowerCat = currentCategory.toLowerCase();
            const lowerName = name.toLowerCase();
            if (lowerCat.includes('beverage') || lowerCat.includes('drink') || lowerCat.includes('bar') || lowerName.includes('coffee') || lowerName.includes('tea') || lowerName.includes('coke') || lowerName.includes('beer') || lowerName.includes('wine') || lowerName.includes('shake') || lowerName.includes('lassi')) {
              station = 'BAR';
            }

            items.push({
              erp_item_code: code || undefined,
              name,
              category: currentCategory,
              price,
              calculatedPrice: Math.round(price * multiplier * 100) / 100,
              station,
            });
          }
        } else {
          // Standard Column Key Detector
          // Auto-detect header row index (e.g. if row 0 is a title like "7SPICES RESTAURANT MENU LIST")
          let headerRowIdx = 0;
          for (let r = 0; r < Math.min(raw2D.length, 10); r++) {
            const row = raw2D[r];
            if (!Array.isArray(row)) continue;
            const cells = row.map(c => String(c || '').toLowerCase().trim());
            const hasName = cells.some(c => /name|item|dish|product/i.test(c));
            const hasPrice = cells.some(c => /price|rate|amount|cost/i.test(c));
            if (hasName && hasPrice) {
              headerRowIdx = r;
              break;
            }
          }

          const parsedRows: any[] = headerRowIdx > 0
            ? XLSX.utils.sheet_to_json(ws, { range: headerRowIdx, defval: '' })
            : rawJson;

          for (const row of parsedRows) {
            const keys = Object.keys(row);
            
            // Find Name
            const nameKey = keys.find(k => /name|item|dish|product/i.test(k)) || keys[1] || keys[0];
            const name = String(row[nameKey] || '').trim();
            if (!name || /group:|subtotal|total|date/i.test(name)) continue;

            // Find Code / ID
            const codeKey = keys.find(k => /code|id|item_id|sku/i.test(k)) || keys[0];
            let erpCode = row[codeKey] !== undefined ? String(row[codeKey]).trim() : '';
            if (erpCode === name) erpCode = '';

            // Find Price / Rate
            const priceKey = keys.find(k => /rate|price|amount|cost/i.test(k)) || keys[keys.length - 1];
            const rawPrice = Number(row[priceKey]) || 0;
            if (rawPrice <= 0) continue;

            // Find Category / Group
            const catKey = keys.find(k => /group|category|class/i.test(k));
            let category = catKey && row[catKey] ? cleanCategoryName(String(row[catKey])) : 'General';
            if (!category || category === name) category = 'General';

            // Station routing
            let station: 'KITCHEN' | 'BAR' | 'BOTH' = 'KITCHEN';
            const lowerCat = category.toLowerCase();
            const lowerName = name.toLowerCase();
            if (lowerCat.includes('beverage') || lowerCat.includes('drink') || lowerCat.includes('bar') || lowerName.includes('coffee') || lowerName.includes('tea') || lowerName.includes('coke') || lowerName.includes('beer')) {
              station = 'BAR';
            }

            items.push({
              erp_item_code: erpCode || undefined,
              name,
              category,
              price: rawPrice,
              calculatedPrice: Math.round(rawPrice * multiplier * 100) / 100,
              station,
            });
          }
        }

        if (items.length === 0) {
          setError('Could not detect valid menu items with names and prices in this spreadsheet.');
        } else {
          setParsedItems(items);
        }
      } catch (err: any) {
        console.error('File parsing error:', err);
        setError('Failed to parse file: ' + (err.message || 'Invalid format'));
      } finally {
        setParsing(false);
      }
    };

    reader.readAsBinaryString(fileToParse);
  };

  // Re-calculate when pricing mode or tax rate changes
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
          price: it.price,
          station: it.station,
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-zinc-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Import Menu (Excel / CSV)</h3>
              <p className="text-xs text-zinc-500">Bulk upload or sync dish pricing & codes from your spreadsheet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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

          {/* File Upload Zone */}
          {!file ? (
            <label className="border-2 border-dashed border-zinc-300 hover:border-purple-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-zinc-50/50 hover:bg-purple-50/30 transition cursor-pointer group">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className="p-3 rounded-full bg-white shadow-xs group-hover:scale-105 transition border border-zinc-200 text-purple-600">
                <Upload className="w-6 h-6" />
              </span>
              <div className="text-center space-y-1">
                <p className="font-bold text-zinc-800 text-sm">Click to choose or drag & drop an Excel file</p>
                <p className="text-[11px] text-zinc-400">Supports .xlsx, .xls, and .csv with Item Name and Rate columns</p>
              </div>
            </label>
          ) : (
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 bg-zinc-50">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-zinc-900">{fileName}</span>
                <span className="text-zinc-400">({parsedItems.length} items parsed)</span>
              </div>
              <label className="text-purple-600 font-bold hover:underline cursor-pointer">
                Change File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Pricing & Sync Options */}
          {parsedItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option 1: Price Mode */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3">
                <span className="font-bold text-zinc-800 block">Pricing Format in File:</span>
                
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      checked={pricingMode === 'exclusive'}
                      onChange={() => handlePricingModeChange('exclusive')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Tax-Exclusive Base Rates (Pre-Tax)</span>
                      <span className="text-[11px] text-zinc-500">File has pre-tax base rate. Automatically applies +{taxRate}% VAT for customer view.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pricingMode"
                      checked={pricingMode === 'inclusive'}
                      onChange={() => handlePricingModeChange('inclusive')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Tax-Inclusive (Gross Menu Price)</span>
                      <span className="text-[11px] text-zinc-500">Listed rates already include all taxes.</span>
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
                      <span className="text-[11px] text-zinc-500">Updates prices and ERP codes. <strong>Preserves all existing dish photos & descriptions!</strong></span>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-800">Preview Parsed Items ({parsedItems.length}):</span>
                <span className="text-[11px] text-zinc-400">Showing first 8 rows</span>
              </div>

              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left">
                  <thead className="bg-zinc-100 text-zinc-600 text-[10px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Dish Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">File Rate</th>
                      <th className="px-3 py-2">Customer Price</th>
                      <th className="px-3 py-2">Station</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {parsedItems.slice(0, 8).map((it, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/50">
                        <td className="px-3 py-2 font-mono font-bold text-purple-700">{it.erp_item_code || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-900">{it.name}</td>
                        <td className="px-3 py-2 text-zinc-500">{it.category}</td>
                        <td className="px-3 py-2 font-mono text-zinc-600">Rs. {it.price.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-900">Rs. {it.calculatedPrice.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${it.station === 'BAR' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'}`}>
                            {it.station}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            onClick={handleExecuteImport}
            disabled={parsedItems.length === 0 || importing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Commit Import ({parsedItems.length} Dishes)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
