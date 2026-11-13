import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Check,
  Download,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { rbacService } from '../../services/rbac.service';
import {
  extractAndValidateMenuMatrix,
  STANDARD_MENU_TEMPLATE_ROWS,
  type ExistingMenuRef,
  type ImportIssue,
  type ParsedItem,
  type ValidationSummary,
} from '../../utils/menuImportValidator';

interface MenuBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  onSuccess: () => void;
  existingItems?: ExistingMenuRef[];
}

function extractSheetMatrix(ws: XLSX.WorkSheet): any[][] {
  const rowMap = new Map<number, Map<number, any>>();
  let maxRow = -1;

  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr] as XLSX.CellObject | undefined;
    if (!cell || cell.t === 'z') continue;
    if (cell.t !== 'e' && cell.v === undefined && cell.w === undefined) continue;

    const { r, c } = XLSX.utils.decode_cell(addr);
    let val: any = '';
    if (cell.t === 'e') {
      const formatted = XLSX.utils.format_cell(cell);
      val = typeof formatted === 'string' && formatted.startsWith('#') ? formatted : (cell.w || '#ERROR!');
    } else if (cell.t === 'n' || cell.t === 'b') {
      val = cell.v;
    } else {
      val = cell.v !== undefined ? String(cell.v) : (cell.w ?? '');
    }

    if (String(val ?? '').trim() === '') continue;

    if (!rowMap.has(r)) rowMap.set(r, new Map());
    rowMap.get(r)!.set(c, val);
    if (r > maxRow) maxRow = r;
  }

  if (maxRow < 0) return [];

  const matrix: any[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const cols = rowMap.get(r);
    if (!cols) {
      matrix.push([]);
      continue;
    }
    const maxCol = Math.max(...Array.from(cols.keys()));
    const rowArr = new Array(maxCol + 1).fill('');
    cols.forEach((v, c) => {
      rowArr[c] = v;
    });
    matrix.push(rowArr);
  }
  return matrix;
}

export const MenuBulkImportModal: React.FC<MenuBulkImportModalProps> = ({
  isOpen,
  onClose,
  businessId,
  onSuccess,
  existingItems = [],
}) => {
  const [fileName, setFileName] = useState('');
  const [rawMatrix, setRawMatrix] = useState<any[][] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [errors, setErrors] = useState<ImportIssue[]>([]);
  const [warnings, setWarnings] = useState<ImportIssue[]>([]);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [pricingMode, setPricingMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [taxRate, setTaxRate] = useState<number>(13);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [issueSearch, setIssueSearch] = useState('');

  const requestSeqRef = useRef(0);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, []);

  const allIssues = useMemo(() => {
    const combined = [...errors, ...warnings];
    combined.sort((a, b) => {
      if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
      if (a.severity === b.severity) return 0;
      return a.severity === 'error' ? -1 : 1;
    });
    return combined;
  }, [errors, warnings]);

  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();
    return allIssues.filter((issue) => {
      if (issueFilter !== 'all' && issue.severity !== issueFilter) return false;
      if (!q) return true;
      return (
        String(issue.rowNumber).includes(q) ||
        `row ${issue.rowNumber}`.includes(q) ||
        issue.column.toLowerCase().includes(q) ||
        (issue.itemName && issue.itemName.toLowerCase().includes(q)) ||
        issue.cellValue.toLowerCase().includes(q) ||
        issue.message.toLowerCase().includes(q) ||
        issue.suggestion.toLowerCase().includes(q) ||
        issue.code.toLowerCase().includes(q)
      );
    });
  }, [allIssues, issueFilter, issueSearch]);

  if (!isOpen) return null;

  const handleCloseModal = () => {
    requestSeqRef.current += 1;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setFileName('');
    setRawMatrix(null);
    setParsing(false);
    setValidating(false);
    setParsedItems([]);
    setErrors([]);
    setWarnings([]);
    setValidationSummary(null);
    setImporting(false);
    setImportCompleted(false);
    setError(null);
    setSuccessResult(null);
    setIssueFilter('all');
    setIssueSearch('');
    onClose();
  };

  const runValidation = async (
    matrix: any[][],
    pMode: 'inclusive' | 'exclusive',
    tRate: number,
    iMode: 'merge' | 'replace'
  ) => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    const local = extractAndValidateMenuMatrix(matrix, {
      pricingMode: pMode,
      taxRate: tRate,
      importMode: iMode,
      existingItems,
    });

    setParsedItems(local.items);
    setErrors(local.errors);
    setWarnings(local.warnings);
    setValidationSummary(local.summary);
    setImportCompleted(false);
    setSuccessResult(null);
    setError(null);
    setIssueFilter(local.errors.length > 0 ? 'all' : local.warnings.length > 0 ? 'warning' : 'all');

    const seq = ++requestSeqRef.current;
    setValidating(true);
    try {
      const res = await fetch(
        `/api/menus/bulk-import/validate?businessId=${encodeURIComponent(businessId)}`,
        {
          method: 'POST',
          headers: rbacService.getAuthHeaders(undefined, businessId),
          credentials: 'include',
          body: JSON.stringify({
            rawRows: matrix,
            items: local.items,
            mode: iMode,
            pricingMode: pMode,
            taxRate: tRate,
          }),
        }
      );

      if (seq !== requestSeqRef.current) return;

      const json = await res.json();
      if (res.ok && json.success) {
        setErrors(Array.isArray(json.errors) ? json.errors : local.errors);
        setWarnings(Array.isArray(json.warnings) ? json.warnings : local.warnings);
        if (json.summary) setValidationSummary(json.summary);
        if (Array.isArray(json.parsedItems)) setParsedItems(json.parsedItems);
      } else {
        setError(
          json.error?.message ||
            'Live database validation check failed; displaying spreadsheet validation results.'
        );
      }
    } catch {
      if (seq === requestSeqRef.current) {
        setError('Could not reach live database check; displaying spreadsheet validation results.');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setValidating(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    e.target.value = '';
    if (!uploadedFile) return;

    requestSeqRef.current += 1;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setValidating(false);
    setFileName(uploadedFile.name);
    setParsing(true);
    setError(null);
    setSuccessResult(null);
    setImportCompleted(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const wsName = wb.SheetNames[0];
        if (!wsName || !wb.Sheets[wsName]) {
          requestSeqRef.current += 1;
          setValidating(false);
          setRawMatrix([]);
          setParsedItems([]);
          setErrors([
            {
              id: 'EMPTY_SHEET_0',
              rowNumber: 1,
              severity: 'error',
              column: 'Sheet',
              cellValue: '',
              code: 'EMPTY_SHEET',
              message: 'The uploaded workbook contains no readable worksheets.',
              suggestion: 'Upload a valid .xlsx, .xls, or .csv spreadsheet.',
            },
          ]);
          setWarnings([]);
          setValidationSummary(null);
          return;
        }
        const matrix = extractSheetMatrix(wb.Sheets[wsName]);
        setRawMatrix(matrix);
        runValidation(matrix, pricingMode, taxRate, importMode);
      } catch (err: any) {
        requestSeqRef.current += 1;
        setValidating(false);
        setRawMatrix(null);
        setParsedItems([]);
        setErrors([]);
        setWarnings([]);
        setValidationSummary(null);
        setError('Failed to parse file: ' + (err?.message || 'Invalid spreadsheet format'));
      } finally {
        setParsing(false);
      }
    };

    reader.onerror = () => {
      requestSeqRef.current += 1;
      setValidating(false);
      setParsing(false);
      setError('Failed to read the selected file.');
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  const handlePricingModeChange = (newMode: 'inclusive' | 'exclusive') => {
    setPricingMode(newMode);
    if (rawMatrix) {
      runValidation(rawMatrix, newMode, taxRate, importMode);
    }
  };

  const handleTaxRateChange = (newRate: number) => {
    setTaxRate(newRate);
    if (rawMatrix) {
      runValidation(rawMatrix, pricingMode, newRate, importMode);
    }
  };

  const handleImportModeChange = (newMode: 'merge' | 'replace') => {
    setImportMode(newMode);
    if (rawMatrix) {
      runValidation(rawMatrix, pricingMode, taxRate, newMode);
    }
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(STANDARD_MENU_TEMPLATE_ROWS);
    XLSX.utils.book_append_sheet(wb, ws, 'Menu Template');
    XLSX.writeFile(wb, 'serveflow_menu_standard_template.xlsx');
  };

  const handleDownloadErrorReport = () => {
    if (allIssues.length === 0) return;
    const rows = [
      ['Excel Row #', 'Severity', 'Rule Code', 'Column', 'Item Name', 'Found Value', 'Issue Description', 'Suggested Fix'],
      ...allIssues.map((iss) => [
        iss.rowNumber > 0 ? iss.rowNumber : 'Header/Sheet',
        iss.severity.toUpperCase(),
        iss.code,
        iss.column,
        iss.itemName || '',
        iss.cellValue === '' ? '<empty>' : iss.cellValue,
        iss.message,
        iss.suggestion,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 28 }, { wch: 26 }, { wch: 22 }, { wch: 55 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Validation Issues');
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'menu_import';
    XLSX.writeFile(wb, `${base}_validation_report.xlsx`);
  };

  const handleExecuteImport = async () => {
    if (parsedItems.length === 0 || errors.length > 0 || validating || importing) return;

    try {
      setImporting(true);
      setError(null);

      const payload = {
        rawRows: rawMatrix || undefined,
        items: parsedItems.map((it) => ({
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

      const res = await fetch(`/api/menus/bulk-import?businessId=${encodeURIComponent(businessId)}`, {
        method: 'POST',
        headers: rbacService.getAuthHeaders(undefined, businessId),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.status === 422 && json.validation) {
        setErrors(Array.isArray(json.validation.errors) ? json.validation.errors : []);
        setWarnings(Array.isArray(json.validation.warnings) ? json.validation.warnings : []);
        if (json.validation.summary) setValidationSummary(json.validation.summary);
        setIssueFilter('all');
        setError(json.error?.message || 'Import blocked due to spreadsheet validation errors.');
        return;
      }

      if (res.ok && json.success) {
        const effectiveWarnings = Array.isArray(json.validation?.warnings)
          ? json.validation.warnings
          : warnings;
        if (Array.isArray(json.validation?.warnings)) {
          setWarnings(json.validation.warnings);
        }
        if (json.validation?.summary) {
          setValidationSummary(json.validation.summary);
        }
        const msg = json.message || `Successfully processed ${parsedItems.length} dishes.`;
        setSuccessResult(msg);
        setImportCompleted(true);
        onSuccess();
        if (effectiveWarnings.length === 0) {
          if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
          autoCloseTimerRef.current = setTimeout(() => {
            handleCloseModal();
          }, 1500);
        }
      } else {
        setError(json.error?.message || json.message || 'Import failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit import.');
    } finally {
      setImporting(false);
    }
  };

  const hasProcessedSheet = rawMatrix !== null || errors.length > 0 || warnings.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Import Menu (Excel / CSV)</h3>
              <p className="text-xs text-zinc-500">Standard 8-column format with strict irregularity checks &amp; multi-tier option grouping</p>
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
              type="button"
              onClick={handleCloseModal}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Import Complete: {successResult}
                  {warnings.length > 0 ? ` (${warnings.length} warning(s) kept below for your review.)` : ''}
                </span>
              </div>
            </div>
          )}

          {/* File Upload Area */}
          <div className="border-2 border-dashed border-zinc-200 hover:border-purple-300 rounded-2xl p-5 text-center bg-zinc-50/50 hover:bg-purple-50/20 transition group">
            <input
              type="file"
              id="menu-file-input"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label htmlFor="menu-file-input" className="cursor-pointer block space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-white border border-zinc-200 shadow-2xs flex items-center justify-center mx-auto text-zinc-400 group-hover:text-purple-600 group-hover:scale-105 transition">
                {parsing ? <RefreshCw className="w-5 h-5 animate-spin text-purple-600" /> : <Upload className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-800">
                  {fileName ? fileName : 'Click to select or drag & drop Excel / CSV spreadsheet'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Required headers: Item Name, Sales Price without vat price, Category, SubCategory, Item Code, Description, Veg/Non-Veg, Order Route
                </p>
              </div>
            </label>
          </div>

          {/* Same-Page Validation Report Panel */}
          {hasProcessedSheet && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-4 space-y-3.5" data-testid="validation-report-panel">
              {/* Summary KPI Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold border ${
                    errors.length > 0
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Blocking Errors: {errors.length}</span>
                  </span>

                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold border ${
                    warnings.length > 0
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Warnings: {warnings.length}</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-purple-50 text-purple-800 border border-purple-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Valid Consolidated Dishes: {parsedItems.length}</span>
                  </span>

                  {importMode === 'merge' && validationSummary && parsedItems.length > 0 && (
                    <span className="text-[11px] text-zinc-600 font-medium px-2">
                      ({validationSummary.mergeUpdateCount} DB update{validationSummary.mergeUpdateCount === 1 ? '' : 's'} • {validationSummary.mergeCreateCount} new)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {validating && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking database...</span>
                    </span>
                  )}
                  {allIssues.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-rose-600" />
                      <span>Download Error Report (.xlsx)</span>
                    </button>
                  )}
                </div>
              </div>

              {errors.length === 0 && warnings.length === 0 && parsedItems.length > 0 && !validating && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All {validationSummary?.totalDataRows || parsedItems.length} rows passed strict 8-column validation with 0 Errors and 0 Warnings.</span>
                </div>
              )}

              {errors.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-900 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Import is blocked until all <strong>{errors.length}</strong> error(s) below are fixed in your spreadsheet and re-uploaded.
                  </span>
                </div>
              )}

              {/* Filter & Search Bar + Scrollable Issue Table */}
              {allIssues.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-xl p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setIssueFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                          issueFilter === 'all' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        All ({allIssues.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setIssueFilter('error')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                          issueFilter === 'error' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                        }`}
                      >
                        Errors Only ({errors.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setIssueFilter('warning')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                          issueFilter === 'warning' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        Warnings Only ({warnings.length})
                      </button>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={issueSearch}
                        onChange={(e) => setIssueSearch(e.target.value)}
                        placeholder="Filter by row #, item, column..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-zinc-100 text-[10px] uppercase font-bold tracking-wider text-zinc-600 sticky top-0 z-10 border-b border-zinc-200">
                          <tr>
                            <th className="px-3 py-2 w-20">Excel Row</th>
                            <th className="px-3 py-2 w-24">Type</th>
                            <th className="px-3 py-2 w-36">Column</th>
                            <th className="px-3 py-2 w-40">Item / Context</th>
                            <th className="px-3 py-2 w-32">Found Value</th>
                            <th className="px-3 py-2">Issue &amp; Suggested Fix</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 text-[11px]">
                          {filteredIssues.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                                No matching issues for the selected filter.
                              </td>
                            </tr>
                          ) : (
                            filteredIssues.map((iss) => (
                              <tr key={iss.id} className="hover:bg-zinc-50/70 align-top">
                                <td className="px-3 py-2.5 font-mono font-bold text-zinc-800 whitespace-nowrap">
                                  {iss.rowNumber > 0 ? `Row ${iss.rowNumber}` : 'Sheet'}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {iss.severity === 'error' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                      ERROR
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      WARNING
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-zinc-700">{iss.column}</td>
                                <td className="px-3 py-2.5 text-zinc-700 font-medium break-words">
                                  {iss.itemName || <span className="text-zinc-400 italic">—</span>}
                                </td>
                                <td className="px-3 py-2.5 font-mono break-all">
                                  {iss.cellValue === '' ? (
                                    <span className="text-zinc-400 italic">&lt;empty&gt;</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                                      {iss.cellValue}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 space-y-0.5">
                                  <p className="font-semibold text-zinc-900">{iss.message}</p>
                                  <p className="text-zinc-500">{iss.suggestion}</p>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Configuration Settings */}
          {rawMatrix !== null && (
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
                      onChange={() => handleImportModeChange('merge')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Merge &amp; Update (Recommended)</span>
                      <span className="text-[11px] text-zinc-500">Updates prices, ERP codes, and options. <strong>Preserves existing dish photos &amp; descriptions!</strong></span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => handleImportModeChange('replace')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="font-semibold text-zinc-900 block">Replace Entire Menu</span>
                      <span className="text-[11px] text-rose-600">Deletes current dishes &amp; previous categories, re-populating fresh from file.</span>
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
                <span className="font-bold text-zinc-800 text-sm">Preview Valid Consolidated Items ({parsedItems.length} dishes):</span>
                <span className="text-[11px] text-zinc-500">
                  {parsedItems.filter((p) => p.has_variants).length} with multi-tier options • {parsedItems.filter((p) => !p.has_variants).length} single dishes
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
          {importCompleted ? (
            <>
              <span className="text-xs text-emerald-700 font-semibold">
                Menu synced successfully. Review any warnings above or click Done.
              </span>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 font-semibold transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={parsedItems.length === 0 || errors.length > 0 || validating || importing}
                onClick={handleExecuteImport}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing Menu...</span>
                  </>
                ) : errors.length > 0 ? (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>Fix {errors.length} Error(s) to Import</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Import &amp; Sync Menu ({parsedItems.length} dishes)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
