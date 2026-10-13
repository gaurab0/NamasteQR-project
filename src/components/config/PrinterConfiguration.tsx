import React, { useState } from 'react';
import { Printer, Wifi, Usb, Bluetooth, Monitor, Plus, Trash2, TestTube, Check, Save } from 'lucide-react';
import { usePrinter } from '../../contexts/PrinterContext';
import { PrinterConfig, PrinterRole, ConnectionType } from '../../types/printer.types';

export const PrinterConfiguration: React.FC = () => {
  const { printers, kdsPrintMode, savePrinter, deletePrinter, setKdsPrintMode, testPrinter } = usePrinter();
  
  // State for adding/editing a printer
  const [isEditing, setIsEditing] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Partial<PrinterConfig> | null>(null);

  const startEdit = (printer?: PrinterConfig) => {
    if (printer) {
      setEditingPrinter(printer);
    } else {
      setEditingPrinter({
        id: `prn_${Date.now()}`,
        name: 'New Printer',
        role: 'KOT',
        connectionType: 'SYSTEM',
        targetAddress: 'Default',
        paperWidth: '80mm',
        enabled: true,
        autoPrintKds: true
      });
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editingPrinter && editingPrinter.id) {
      savePrinter(editingPrinter as PrinterConfig);
      setIsEditing(false);
      setEditingPrinter(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-2xs">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                Hardware & Print Routing
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Configure physical receipt printers and map them to specific tasks (KOT, Cashier, Bar).
              </p>
            </div>
            {!isEditing && (
              <button
                onClick={() => startEdit()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition"
              >
                <Plus className="w-4 h-4" />
                Add Printer
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="p-6 bg-zinc-50 border-b border-zinc-200">
            <h3 className="text-sm font-bold text-zinc-800 mb-4">
              {editingPrinter?.name === 'New Printer' ? 'Add New Printer' : 'Edit Printer Profile'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Printer Name</label>
                <input
                  type="text"
                  value={editingPrinter?.name || ''}
                  onChange={e => setEditingPrinter({...editingPrinter, name: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Kitchen Station 1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Assigned Task Role</label>
                <select
                  value={editingPrinter?.role || 'KOT'}
                  onChange={e => setEditingPrinter({...editingPrinter, role: e.target.value as PrinterRole})}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="KOT">KOT (Kitchen Order Ticket)</option>
                  <option value="BILL">Cashier Bill / Receipt</option>
                  <option value="BAR">Bar / Beverage Ticket</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Connection Type</label>
                <select
                  value={editingPrinter?.connectionType || 'SYSTEM'}
                  onChange={e => setEditingPrinter({...editingPrinter, connectionType: e.target.value as ConnectionType})}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="SYSTEM">System Default (Browser Print)</option>
                  <option value="NETWORK">Network (IP/Port)</option>
                  <option value="USB">USB (ESC/POS)</option>
                  <option value="BLUETOOTH">Web Bluetooth</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Target Address / ID</label>
                <input
                  type="text"
                  value={editingPrinter?.targetAddress || ''}
                  onChange={e => setEditingPrinter({...editingPrinter, targetAddress: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 192.168.1.100 or 'Default'"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Paper Width</label>
                <select
                  value={editingPrinter?.paperWidth || '80mm'}
                  onChange={e => setEditingPrinter({...editingPrinter, paperWidth: e.target.value as '80mm' | '58mm'})}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="80mm">80mm Thermal</option>
                  <option value="58mm">58mm Thermal</option>
                </select>
              </div>
              
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPrinter?.enabled || false}
                    onChange={e => setEditingPrinter({...editingPrinter, enabled: e.target.checked})}
                    className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-zinc-800">Printer Enabled</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 hover:bg-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition"
              >
                <Save className="w-4 h-4" />
                Save Printer Config
              </button>
            </div>
          </div>
        ) : null}

        <div className="p-6">
          {printers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No printers configured. System defaults will be used for all print tasks.
            </div>
          ) : (
            <div className="space-y-4">
              {printers.map(p => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-200 hover:border-indigo-300 hover:shadow-xs transition bg-white">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-400'}`}>
                      {p.connectionType === 'NETWORK' ? <Wifi className="w-5 h-5" /> : 
                       p.connectionType === 'USB' ? <Usb className="w-5 h-5" /> : 
                       p.connectionType === 'BLUETOOTH' ? <Bluetooth className="w-5 h-5" /> : 
                       <Monitor className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`font-bold ${p.enabled ? 'text-zinc-900' : 'text-zinc-500'}`}>{p.name}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                          {p.role}
                        </span>
                        {!p.enabled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {p.connectionType} • {p.targetAddress} • {p.paperWidth}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 sm:mt-0 flex items-center gap-2">
                    <button
                      onClick={() => testPrinter(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                      title="Send Test Ticket"
                    >
                      <TestTube className="w-3.5 h-3.5" />
                      Test Print
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePrinter(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-2xs">
        <div className="p-6">
          <h3 className="text-base font-bold text-zinc-900 mb-1">Kitchen Dispatch Policy</h3>
          <p className="text-xs text-zinc-500 mb-6">
            Choose how orders should be sent to the kitchen by default. This controls the balance between physical KOT prints and digital KDS displays.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setKdsPrintMode('DISPLAY_ONLY')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${
                kdsPrintMode === 'DISPLAY_ONLY' 
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' 
                  : 'border-zinc-200 hover:border-indigo-200 hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <Monitor className={`w-6 h-6 mb-2 ${kdsPrintMode === 'DISPLAY_ONLY' ? 'text-indigo-600' : 'text-zinc-400'}`} />
              <span className="font-bold text-sm">Display Only</span>
              <span className="text-[10px] text-center mt-1 opacity-70">Direct to KDS screen. No paper.</span>
              {kdsPrintMode === 'DISPLAY_ONLY' && <Check className="w-4 h-4 text-indigo-600 mt-2" />}
            </button>

            <button
              onClick={() => setKdsPrintMode('BOTH')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${
                kdsPrintMode === 'BOTH' 
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' 
                  : 'border-zinc-200 hover:border-indigo-200 hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <div className="flex gap-1 mb-2">
                <Printer className={`w-6 h-6 ${kdsPrintMode === 'BOTH' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                <Monitor className={`w-6 h-6 ${kdsPrintMode === 'BOTH' ? 'text-indigo-600' : 'text-zinc-400'}`} />
              </div>
              <span className="font-bold text-sm">Both Print & Display</span>
              <span className="text-[10px] text-center mt-1 opacity-70">Paper KOT and screen dispatch.</span>
              {kdsPrintMode === 'BOTH' && <Check className="w-4 h-4 text-indigo-600 mt-2" />}
            </button>

            <button
              onClick={() => setKdsPrintMode('PRINT_ONLY')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${
                kdsPrintMode === 'PRINT_ONLY' 
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' 
                  : 'border-zinc-200 hover:border-indigo-200 hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <Printer className={`w-6 h-6 mb-2 ${kdsPrintMode === 'PRINT_ONLY' ? 'text-indigo-600' : 'text-zinc-400'}`} />
              <span className="font-bold text-sm">Print Only</span>
              <span className="text-[10px] text-center mt-1 opacity-70">Legacy paper KOT routing.</span>
              {kdsPrintMode === 'PRINT_ONLY' && <Check className="w-4 h-4 text-indigo-600 mt-2" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
