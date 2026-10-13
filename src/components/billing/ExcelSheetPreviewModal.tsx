import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Search, 
  Table as TableIcon, 
  CheckCircle2, 
  FileSpreadsheet,
  AlertCircle,
  GripVertical,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { ExcelSheetData, exportSheetsToExcel } from '../../utils/excelExport';

interface ExcelSheetPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSheets: ExcelSheetData[];
  businessName?: string;
  filenamePrefix?: string;
}

export const ExcelSheetPreviewModal: React.FC<ExcelSheetPreviewModalProps> = ({
  isOpen,
  onClose,
  initialSheets,
  businessName = 'Business',
  filenamePrefix = 'Sales_Register',
}) => {
  // Deep clone initial sheets so edits are isolated
  const [sheets, setSheets] = useState<ExcelSheetData[]>(() => 
    JSON.parse(JSON.stringify(initialSheets))
  );
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [cellEditValue, setCellEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  // Sync if initialSheets changes and user hasn't edited yet
  React.useEffect(() => {
    if (isOpen) {
      setSheets(JSON.parse(JSON.stringify(initialSheets)));
      setActiveSheetIndex(0);
      setSelectedCell(null);
      setSelectedRowIndices(new Set());
      setEditingCell(null);
      setSearchQuery('');
    }
  }, [isOpen, initialSheets]);

  if (!isOpen) return null;

  const currentSheet = sheets[activeSheetIndex] || sheets[0];

  // Helper to get Excel column letter (0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA)
  const getColLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    setSelectedCell({ row: rowIndex, col: colIndex });
  };

  const handleCellDoubleClick = (rowIndex: number, colIndex: number) => {
    setEditingCell({ row: rowIndex, col: colIndex });
    const val = currentSheet.rows[rowIndex]?.[colIndex];
    setCellEditValue(val !== undefined && val !== null ? String(val) : '');
  };

  const commitCellEdit = () => {
    if (!editingCell) return;
    const { row, col } = editingCell;

    setSheets((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const targetSheet = updated[activeSheetIndex];
      if (targetSheet && targetSheet.rows[row]) {
        // Try parsing number if numeric
        const trimmed = cellEditValue.trim();
        const num = Number(trimmed);
        targetSheet.rows[row][col] = !isNaN(num) && trimmed !== '' && !isNaN(Number(trimmed))
          ? num
          : cellEditValue;
      }
      return updated;
    });

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitCellEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleAddRow = () => {
    setSheets((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const targetSheet = updated[activeSheetIndex];
      if (targetSheet) {
        const emptyRow = new Array(targetSheet.headers.length).fill('');
        emptyRow[0] = targetSheet.rows.length + 1; // S.N. or row #
        targetSheet.rows.push(emptyRow);
      }
      return updated;
    });
  };

    const handleDeleteSelectedRows = () => {
    if (selectedRowIndices.size === 0) return;
    if (!window.confirm(`Delete ${selectedRowIndices.size} selected rows?`)) return;

    setSheets((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const targetSheet = updated[activeSheetIndex];
      if (targetSheet && targetSheet.rows.length > 0) {
        // Remove from highest to lowest index to avoid shifting issues
        const indicesToDelete = Array.from(selectedRowIndices).sort((a, b) => b - a);
        indicesToDelete.forEach((idx) => {
          targetSheet.rows.splice(idx, 1);
        });
        
        // Re-index S.N.
        targetSheet.rows.forEach((row: any[], i: number) => {
          row[0] = i + 1;
        });
      }
      return updated;
    });
    setSelectedRowIndices(new Set());
    setSelectedCell(null);
    setEditingCell(null);
  };

  const handleDeleteSelectedRow = () => {
    if (selectedRowIndices.size > 0) {
      if (window.confirm(`Delete ${selectedRowIndices.size} selected row(s)?`)) {
        setSheets((prev) => {
          const updated = JSON.parse(JSON.stringify(prev));
          const targetSheet = updated[activeSheetIndex];
          if (targetSheet && targetSheet.rows) {
            targetSheet.rows = targetSheet.rows.filter((_: any, idx: number) => !selectedRowIndices.has(idx));
          }
          return updated;
        });
        setSelectedRowIndices(new Set());
        setSelectedCell(null);
        setEditingCell(null);
      }
    } else if (selectedCell) {
      setSheets((prev) => {
        const updated = JSON.parse(JSON.stringify(prev));
        const targetSheet = updated[activeSheetIndex];
        if (targetSheet && targetSheet.rows.length > 0) {
          targetSheet.rows.splice(selectedCell.row, 1);
        }
        return updated;
      });
      setSelectedCell(null);
      setEditingCell(null);
    }
  };

  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);

  const handleMoveRow = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setSheets((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const targetSheet = updated[activeSheetIndex];
      if (!targetSheet || !targetSheet.rows) return updated;

      if (toIndex < 0 || toIndex >= targetSheet.rows.length) return updated;

      const [movedRow] = targetSheet.rows.splice(fromIndex, 1);
      targetSheet.rows.splice(toIndex, 0, movedRow);
      return updated;
    });

    if (selectedCell && selectedCell.row === fromIndex) {
      setSelectedCell({ ...selectedCell, row: toIndex });
    }
  };

  const handleDragStart = (e: React.DragEvent, rowIndex: number) => {
    setDraggedRowIndex(rowIndex);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(rowIndex));
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent, rowIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRowIndex !== rowIndex) {
      setDragOverRowIndex(rowIndex);
    }
  };

  const handleDragLeave = () => {
    setDragOverRowIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverRowIndex(null);
    if (draggedRowIndex !== null && draggedRowIndex !== targetIndex) {
      handleMoveRow(draggedRowIndex, targetIndex);
    }
    setDraggedRowIndex(null);
  };

  const handleMoveSelectedUp = () => {
    if (!selectedCell || selectedCell.row <= 0) return;
    handleMoveRow(selectedCell.row, selectedCell.row - 1);
  };

  const handleMoveSelectedDown = () => {
    if (!selectedCell) return;
    const maxRow = currentSheet.rows.length - 1;
    if (selectedCell.row >= maxRow) return;
    handleMoveRow(selectedCell.row, selectedCell.row + 1);
  };

  const handleResetToOriginal = () => {
    if (window.confirm('Reset all spreadsheet sheets back to their original calculated values?')) {
      setSheets(JSON.parse(JSON.stringify(initialSheets)));
      setSelectedCell(null);
      setEditingCell(null);
    }
  };

  const handleDownloadExcel = () => {
    try {
      setIsExporting(true);
      exportSheetsToExcel(sheets, filenamePrefix, businessName);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 4000);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Filter rows based on search
    const filteredRows = useMemo(() => {
    if (!currentSheet) return [];
    
    let dateColIdx = -1;
    currentSheet.headers.forEach((h: any, i: number) => {
      const headerStr = String(h).toLowerCase();
      if (headerStr.includes('date') && !headerStr.includes('update')) {
        dateColIdx = i;
      }
    });

    return currentSheet.rows
      .map((row: any, originalIndex: number) => ({ row, originalIndex }))
      .filter(({ row, originalIndex }: { row: any; originalIndex: number }) => {
        if (dateColIdx !== -1 && (startDate || endDate)) {
          const rowDateStr = String(row[dateColIdx] || '');
          if (rowDateStr) {
            const rowDate = new Date(rowDateStr);
            if (!isNaN(rowDate.getTime())) {
              if (startDate && rowDate < new Date(startDate)) return false;
              if (endDate) {
                const endD = new Date(endDate);
                endD.setHours(23, 59, 59, 999);
                if (rowDate > endD) return false;
              }
            }
          }
        }
        if (!searchQuery) return true;
        const lowerQ = searchQuery.toLowerCase();
        return row.some((cell: any) => String(cell || '').toLowerCase().includes(lowerQ));
      });
  }, [currentSheet, searchQuery, startDate, endDate]);

  const selectedCellValue = selectedCell 
    ? currentSheet.rows[selectedCell.row]?.[selectedCell.col] 
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Excel Title Bar */}
        <div className="bg-[#107C41] text-white px-4 py-2.5 flex items-center justify-between shadow-sm select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-800/60 flex items-center justify-center font-bold text-base shadow-inner border border-emerald-400/30">
              <FileSpreadsheet className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-wide">
                  {businessName.replace(/[^a-zA-Z0-9_-]/g, '_')}_{filenamePrefix}_{new Date().toISOString().split('T')[0]}.xlsx
                </span>
                <span className="text-[10px] bg-emerald-700/80 uppercase px-2 py-0.5 rounded font-mono tracking-wider text-emerald-100 border border-emerald-500/40">
                  Live Interactive Excel Editor
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80">
                Preview exact spreadsheet layout. Click or double-click any cell to edit before downloading.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadExcel}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-semibold rounded shadow transition-colors active:scale-95 disabled:opacity-75"
              title="Download the workbook as .xlsx with all your custom edits"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Generating .xlsx...' : 'Download .xlsx'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-emerald-100 hover:text-white hover:bg-emerald-700/60 rounded-lg transition-colors"
              title="Close editor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Excel Ribbon & Action Controls */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left tools: Add row, Delete row, Reset */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-medium border border-slate-300 rounded shadow-xs transition-colors"
              title="Add a new row to current sheet"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add Row</span>
            </button>

            <button
              onClick={handleDeleteSelectedRow}
              disabled={!selectedCell && selectedRowIndices.size === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 font-medium border border-slate-300 hover:border-red-200 rounded shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete the selected row(s)"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Delete Row(s)</span>
            </button>

            <div className="h-4 w-px bg-slate-300 mx-1" />

            {/* Reorder Buttons */}
            <button
              onClick={handleMoveSelectedUp}
              disabled={!selectedCell || selectedCell.row <= 0}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-medium border border-slate-300 rounded shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move selected row up (or drag row number handle)"
            >
              <ArrowUp className="w-3.5 h-3.5 text-slate-600" />
              <span>Move Up</span>
            </button>

            <button
              onClick={handleMoveSelectedDown}
              disabled={!selectedCell || selectedCell.row >= currentSheet.rows.length - 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-medium border border-slate-300 rounded shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move selected row down (or drag row number handle)"
            >
              <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
              <span>Move Down</span>
            </button>

            <div className="h-4 w-px bg-slate-300 mx-1" />

            <button
              onClick={handleResetToOriginal}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-800 font-medium border border-slate-300 rounded shadow-xs transition-colors"
              title="Revert all cells to original records"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset to Original</span>
            </button>
          </div>

          {/* Right tools: Search & Date filters */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-xs">
              <span className="text-slate-500 font-medium whitespace-nowrap">From:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="outline-none bg-transparent text-slate-700"
              />
              <span className="text-slate-500 font-medium whitespace-nowrap ml-1">To:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="outline-none bg-transparent text-slate-700"
              />
              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(''); setEndDate(''); }} className="ml-1 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search cell values..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Excel Formula & Cell Coordinate Bar */}
        <div className="bg-white border-b border-slate-200 px-3 py-1 flex items-center gap-2 text-xs font-mono select-none">
          <div className="w-16 px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-center rounded text-[11px]">
            {selectedCell 
              ? `${getColLetter(selectedCell.col)}${selectedCell.row + 1}` 
              : '--'}
          </div>
          <span className="text-slate-400 font-bold">fx</span>
          <div className="flex-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-700 truncate font-sans text-xs">
            {selectedCellValue !== undefined && selectedCellValue !== null ? String(selectedCellValue) : '(No cell selected)'}
          </div>
        </div>

        {/* Toast alert on download */}
        {showSuccessToast && (
          <div className="bg-emerald-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium animate-in slide-in-from-top duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>Workbook exported with your customizations! File downloaded successfully.</span>
            </div>
            <button onClick={() => setShowSuccessToast(false)}>
              <X className="w-4 h-4 text-emerald-100 hover:text-white" />
            </button>
          </div>
        )}

        {/* Spreadsheet Data Grid */}
        <div className="flex-1 overflow-auto bg-slate-100 relative">
          <table className="border-collapse bg-white text-xs w-full min-w-max border-b border-slate-300 select-text">
            {/* Column Headers (A, B, C...) */}
                          <thead>
                <tr className="bg-zinc-100">
                  <th className="px-3 py-2 border-b border-r border-zinc-300 text-left w-10 text-center sticky top-0 bg-zinc-200 z-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-zinc-300 w-3.5 h-3.5"
                      checked={filteredRows.length > 0 && selectedRowIndices.size === filteredRows.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRowIndices(new Set(filteredRows.map(r => r.originalIndex)));
                        } else {
                          setSelectedRowIndices(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-2 py-1 border-b border-r border-zinc-300 w-12 text-center text-[10px] font-bold text-zinc-500 bg-zinc-100 sticky top-0 z-10">
                    #
                  </th>
                  {currentSheet?.headers.map((h, i) => (
                    <th 
                      key={i} 
                      className="px-3 py-2 border-b border-r border-zinc-300 text-left text-xs font-bold text-zinc-700 bg-zinc-100 sticky top-0 z-10 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

            {/* Grid Data Rows */}
            <tbody>
              {filteredRows.map((rowItem, rowIdx) => {
                const { row, originalIndex } = rowItem;
                const isSelectedRow = selectedCell?.row === rowIdx;
                const isDragOver = dragOverRowIndex === rowIdx;
                const isBeingDragged = draggedRowIndex === rowIdx;

                return (
                  <tr
                    key={`row-${rowIdx}`}
                    onDragOver={(e) => handleDragOver(e, rowIdx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, rowIdx)}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelectedRow ? 'bg-emerald-50/30' : ''
                    } ${isDragOver ? 'border-t-2 border-t-emerald-600 bg-emerald-50/60' : ''} ${
                      isBeingDragged ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="px-3 py-1 border-b border-r border-zinc-300 text-center bg-white">
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-300 w-3.5 h-3.5"
                        checked={selectedRowIndices.has(originalIndex)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedRowIndices);
                          if (e.target.checked) {
                            newSelected.add(originalIndex);
                          } else {
                            newSelected.delete(originalIndex);
                          }
                          setSelectedRowIndices(newSelected);
                        }}
                      />
                    </td>
                    {/* Row Index & Drag Handle (1, 2, 3...) */}
                    <td
                      draggable
                      onDragStart={(e) => handleDragStart(e, rowIdx)}
                      className="w-14 px-1 py-1 border-r border-b border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono text-[10px] text-center select-none sticky left-0 z-10 cursor-grab active:cursor-grabbing"
                      title="Click and drag to reorder row, or use Move Up/Down buttons"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <GripVertical className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{rowIdx + 1}</span>
                      </div>
                    </td>

                    {/* Row Cells */}
                    {currentSheet.headers.map((_, colIdx) => {
                      const isCellSelected = selectedCell?.row === rowIdx && selectedCell?.col === colIdx;
                      const isCellEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
                      const value = row[colIdx];

                      return (
                        <td
                          key={`cell-${rowIdx}-${colIdx}`}
                          onClick={() => handleCellClick(rowIdx, colIdx)}
                          onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                          className={`px-3 py-1 border-r border-b border-slate-200 text-slate-700 relative cursor-pointer truncate max-w-xs ${
                            isCellSelected ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-white' : ''
                          }`}
                          title="Double click to edit cell value"
                        >
                          {isCellEditing ? (
                            <input
                              type="text"
                              autoFocus
                              value={cellEditValue}
                              onChange={(e) => setCellEditValue(e.target.value)}
                              onBlur={commitCellEdit}
                              onKeyDown={handleKeyDown}
                              className="absolute inset-0 w-full h-full px-2 py-0 border-2 border-emerald-600 bg-white text-xs text-slate-900 outline-none z-20"
                            />
                          ) : (
                            <span>{value !== undefined && value !== null ? String(value) : ''}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={currentSheet.headers.length + 2}
                    className="py-12 text-center text-slate-400 font-medium"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6 text-slate-300" />
                      <span>No matching records found in this sheet.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Excel Bottom Sheet Tabs Bar */}
        <div className="bg-slate-100 border-t border-slate-300 px-3 py-1 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-1 overflow-x-auto">
            {sheets.map((sheet, index) => {
              const isActive = index === activeSheetIndex;
              return (
                <button
                  key={sheet.sheetName}
                  onClick={() => {
                    setActiveSheetIndex(index);
                    setSelectedCell(null);
                    setEditingCell(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-t border-t-2 font-medium text-xs transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-emerald-800 border-emerald-600 font-semibold shadow-xs -mb-[1px] z-10'
                      : 'bg-slate-200 text-slate-600 border-transparent hover:bg-slate-300 hover:text-slate-800'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{sheet.sheetName}</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-full border border-slate-200">
                    {sheet.rows.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-3">
            <span>Rows: {currentSheet.rows.length}</span>
            <span>Columns: {currentSheet.headers.length}</span>
          </div>
        </div>

      </div>
    </div>
  );
};
