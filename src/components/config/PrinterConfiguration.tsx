import React, { useState } from 'react';
import {
  Printer,
  Wifi,
  Usb,
  Bluetooth,
  Monitor,
  Plus,
  Trash2,
  TestTube,
  Check,
  Save,
  X,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit3,
  UtensilsCrossed,
  Receipt,
  Wine,
  Layers,
  HelpCircle,
  Radio,
  Sliders,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { usePrinter } from '../../contexts/PrinterContext';
import { PrinterConfig, PrinterRole, ConnectionType } from '../../types/printer.types';

export const PrinterConfiguration: React.FC = () => {
  const {
    printers,
    kdsPrintMode,
    savePrinter,
    deletePrinter,
    setKdsPrintMode,
    testPrinter,
    probeNetworkPrinter,
    isWebUsbSupported,
    isWebBluetoothSupported,
    pairUsbDevice,
    pairBluetoothDevice,
    activeDriver,
    isConnected,
  } = usePrinter();

  // State for adding/editing a printer
  const [isEditing, setIsEditing] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Partial<PrinterConfig> | null>(null);

  // Testing & diagnostic state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [pingStatus, setPingStatus] = useState<{
    loading: boolean;
    success?: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Active guide tab toggle
  const [showGuide, setShowGuide] = useState(false);

  // Modal ping state
  const [modalPingStatus, setModalPingStatus] = useState<{
    loading: boolean;
    success?: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const startEdit = (printer?: PrinterConfig) => {
    setModalPingStatus(null);
    setTestResult(null);
    if (printer) {
      setEditingPrinter({ ...printer });
    } else {
      setEditingPrinter({
        id: `prn_${Date.now()}`,
        name: printers.length === 0 ? 'Main Cashier Receipt' : `Station Printer ${printers.length + 1}`,
        role: printers.length === 0 ? 'BILL' : 'KOT',
        connectionType: 'SYSTEM',
        targetAddress: 'Default',
        paperWidth: '80mm',
        port: 9100,
        feedLines: 3,
        autoCut: true,
        openCashDrawer: printers.length === 0,
        enabled: true,
        autoPrintKds: true,
      });
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editingPrinter && editingPrinter.id && editingPrinter.name) {
      const configToSave: PrinterConfig = {
        id: editingPrinter.id,
        name: editingPrinter.name.trim(),
        role: editingPrinter.role || 'KOT',
        connectionType: editingPrinter.connectionType || 'SYSTEM',
        targetAddress: editingPrinter.targetAddress?.trim() || 'Default',
        paperWidth: editingPrinter.paperWidth || '80mm',
        port: Number(editingPrinter.port) || 9100,
        feedLines: Number(editingPrinter.feedLines) ?? 3,
        autoCut: editingPrinter.autoCut ?? true,
        openCashDrawer: editingPrinter.openCashDrawer ?? (editingPrinter.role === 'BILL'),
        enabled: editingPrinter.enabled ?? true,
        autoPrintKds: editingPrinter.autoPrintKds ?? true,
        usbVendorId: editingPrinter.usbVendorId,
        usbProductId: editingPrinter.usbProductId,
        bluetoothDeviceId: editingPrinter.bluetoothDeviceId,
      };

      savePrinter(configToSave);
      setIsEditing(false);
      setEditingPrinter(null);
      setModalPingStatus(null);
    }
  };

  const handleTestPrint = async (printer: PrinterConfig) => {
    setTestingId(printer.id);
    setTestResult(null);
    try {
      await testPrinter(printer);
      setTestResult({
        id: printer.id,
        success: true,
        message: `Test pattern sent successfully to ${printer.name}!`,
      });
    } catch (err: any) {
      setTestResult({
        id: printer.id,
        success: false,
        message: err.message || 'Test print failed. Verify power & connection.',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleTestModalPrint = async () => {
    if (!editingPrinter) return;
    setTestingId('modal_test');
    setTestResult(null);
    try {
      const tempConfig = editingPrinter as PrinterConfig;
      await testPrinter(tempConfig);
      setTestResult({
        id: 'modal_test',
        success: true,
        message: 'Test pattern sent successfully!',
      });
    } catch (err: any) {
      setTestResult({
        id: 'modal_test',
        success: false,
        message: err.message || 'Test print failed.',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handlePingModalIp = async () => {
    const host = editingPrinter?.targetAddress;
    const port = editingPrinter?.port || 9100;
    if (!host || host === 'Default') {
      setModalPingStatus({ loading: false, success: false, error: 'Please enter a valid IP address.' });
      return;
    }
    setModalPingStatus({ loading: true });
    try {
      const res = await probeNetworkPrinter(host, port);
      if (res.success && res.reachable) {
        setModalPingStatus({ loading: false, success: true, latencyMs: res.latencyMs });
      } else {
        const errorText = typeof res.error === 'object' && res.error !== null
          ? (res.error as any).message || (res.error as any).code || 'Could not connect'
          : String(res.error || `Could not connect to ${host}:${port}`);
        setModalPingStatus({
          loading: false,
          success: false,
          error: errorText,
        });
      }
    } catch (err: any) {
      setModalPingStatus({ loading: false, success: false, error: err.message || 'Network ping error' });
    }
  };

  const handlePairUsb = async () => {
    try {
      const dev = await pairUsbDevice();
      if (dev && editingPrinter) {
        setEditingPrinter({
          ...editingPrinter,
          connectionType: 'USB',
          targetAddress: dev.productName || 'USB Thermal Printer',
          usbVendorId: dev.vendorId,
          usbProductId: dev.productId,
          name: editingPrinter.name === 'New Printer' ? (dev.productName || 'USB Printer') : editingPrinter.name,
        });
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        alert(`USB Pairing Notice: ${err.message}`);
      }
    }
  };

  const handlePairBluetooth = async () => {
    try {
      const dev = await pairBluetoothDevice();
      if (dev && editingPrinter) {
        setEditingPrinter({
          ...editingPrinter,
          connectionType: 'BLUETOOTH',
          targetAddress: dev.name || 'Bluetooth Printer',
          bluetoothDeviceId: dev.id,
          name: editingPrinter.name === 'New Printer' ? (dev.name || 'Bluetooth Printer') : editingPrinter.name,
        });
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        alert(`Bluetooth Pairing Notice: ${err.message}`);
      }
    }
  };

  const pingLanCard = async (printer: PrinterConfig) => {
    if (!printer.targetAddress) return;
    setPingStatus({ loading: true });
    try {
      const res = await probeNetworkPrinter(printer.targetAddress, printer.port || 9100);
      if (res.success && res.reachable) {
        setPingStatus({ loading: false, success: true, latencyMs: res.latencyMs });
      } else {
        const errorText = typeof res.error === 'object' && res.error !== null
          ? (res.error as any).message || (res.error as any).code || 'Unreachable'
          : String(res.error || 'Unreachable');
        setPingStatus({ loading: false, success: false, error: errorText });
      }
    } catch (err: any) {
      setPingStatus({ loading: false, success: false, error: err.message || 'Error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* CARD 1: HARDWARE & PRINT ROUTING                                          */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600 shrink-0" />
                Hardware & Print Routing
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Configure physical receipt printers and map them to specific tasks (KOT, Cashier, Bar, or Combined KOT/BOT).
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition cursor-pointer"
                title="Compatibility guide"
              >
                <HelpCircle className="w-4 h-4 text-zinc-500" />
                <span>Any Printer Guide</span>
              </button>
              <button
                type="button"
                onClick={() => startEdit()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition shadow-xs cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Printer
              </button>
            </div>
          </div>

          {/* Quick Hardware Capability Strip */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-4 border-t border-zinc-100">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Monitor className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-zinc-900 truncate">System Spooler</div>
                <div className="text-[10px] text-zinc-500 truncate font-medium">Universal • Any Printer</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Wifi className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-zinc-900 truncate">Network / LAN</div>
                <div className="text-[10px] text-zinc-500 truncate font-medium">TCP:9100 Socket Stream</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Usb className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-zinc-900 truncate flex items-center gap-1">
                  WebUSB Direct
                  {isWebUsbSupported && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </div>
                <div className="text-[10px] text-zinc-500 truncate font-medium">
                  {isWebUsbSupported ? 'Chrome / Edge Native' : 'Requires Chrome/Edge'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-800 flex items-center justify-center shrink-0">
                <Bluetooth className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-zinc-900 truncate flex items-center gap-1">
                  WebBluetooth
                  {isWebBluetoothSupported && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </div>
                <div className="text-[10px] text-zinc-500 truncate font-medium">
                  {isWebBluetoothSupported ? 'BLE Wireless Ready' : 'BLE Available'}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable "Any Printer" Guide Banner */}
          {showGuide && (
            <div className="mt-4 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between font-bold text-indigo-900">
                <span className="flex items-center gap-1.5 text-sm">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  How to Connect Any Printer to ServeFlow
                </span>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="text-indigo-600 hover:text-indigo-800 font-bold"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                <div className="p-2.5 rounded-xl bg-white border border-indigo-100">
                  <span className="font-bold text-indigo-900 block mb-1">🖨️ Any Standard / Desktop Printer:</span>
                  Choose <strong>"System Default (Browser Spooler)"</strong>. Compatible with any HP, Canon, Brother, Epson, USB desktop printer, Wi-Fi printer, or PDF virtual printer.
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-indigo-100">
                  <span className="font-bold text-indigo-900 block mb-1">⚡ Direct Thermal POS Hardware:</span>
                  Choose <strong>WebUSB</strong> (cable), <strong>WebBluetooth</strong> (wireless BLE belt printer), or <strong>Network/LAN</strong> (Ethernet/Wi-Fi port 9100). Streams instant raw ESC/POS binary buffers.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Feedback Banner */}
        {testResult && (
          <div
            className={`px-6 py-3 border-b text-xs font-bold flex items-center justify-between ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="text-xs hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Printers List Container */}
        <div className="p-6">
          {printers.length === 0 ? (
            /* Empty state matching the reference mockup */
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                <Printer className="w-7 h-7" />
              </div>
              <p className="text-sm font-medium text-zinc-500 max-w-md mx-auto">
                No printers configured. System defaults will be used for all print tasks.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => startEdit()}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Your First Printer
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {printers.map((p) => {
                const isTestingThis = testingId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col lg:flex-row lg:items-center justify-between p-5 rounded-2xl border transition bg-white gap-4 ${
                      p.enabled
                        ? 'border-zinc-200 hover:border-indigo-300 hover:shadow-xs'
                        : 'border-zinc-200/60 bg-zinc-50/50 opacity-75'
                    }`}
                  >
                    {/* Left: Device Icon & Core Profile Details */}
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                          !p.enabled
                            ? 'bg-zinc-100 text-zinc-400'
                            : p.connectionType === 'NETWORK'
                            ? 'bg-blue-50 text-blue-600'
                            : p.connectionType === 'USB'
                            ? 'bg-amber-50 text-amber-600'
                            : p.connectionType === 'BLUETOOTH'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {p.connectionType === 'NETWORK' ? (
                          <Wifi className="w-6 h-6" />
                        ) : p.connectionType === 'USB' ? (
                          <Usb className="w-6 h-6" />
                        ) : p.connectionType === 'BLUETOOTH' ? (
                          <Bluetooth className="w-6 h-6" />
                        ) : (
                          <Monitor className="w-6 h-6" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className={`text-base font-bold ${p.enabled ? 'text-zinc-900' : 'text-zinc-500'}`}>
                            {p.name}
                          </h4>

                          {/* Task Role Badge */}
                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                              p.role === 'BILL'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : p.role === 'BAR'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : p.role === 'BOTH'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {p.role === 'BILL' && <Receipt className="w-3 h-3" />}
                            {p.role === 'BAR' && <Wine className="w-3 h-3" />}
                            {p.role === 'KOT' && <UtensilsCrossed className="w-3 h-3" />}
                            {p.role === 'BOTH' && <Layers className="w-3 h-3" />}
                            {p.role === 'BILL' ? 'Cashier Receipt' : p.role === 'BAR' ? 'Bar Ticket' : p.role === 'BOTH' ? 'Both (KOT/BOT)' : 'Kitchen KOT'}
                          </span>

                          {/* Connection Badge */}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                            {p.connectionType === 'SYSTEM'
                              ? 'System Spooler (Any Printer)'
                              : p.connectionType === 'NETWORK'
                              ? `LAN IP : ${p.port || 9100}`
                              : p.connectionType === 'USB'
                              ? 'WebUSB Direct'
                              : 'WebBluetooth Direct'}
                          </span>

                          {/* Active Status Indicator */}
                          {isTestingThis ? (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Testing
                            </span>
                          ) : !p.enabled ? (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                              Disconnected
                            </span>
                          ) : p.connectionType === 'SYSTEM' ? (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Connected
                            </span>
                          ) : p.connectionType === 'USB' ? (
                            activeDriver === 'usb' && isConnected ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Connected
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {p.usbVendorId ? 'Paired (Ready)' : 'Standby'}
                              </span>
                            )
                          ) : p.connectionType === 'BLUETOOTH' ? (
                            activeDriver === 'bluetooth' && isConnected ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Connected
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {p.bluetoothDeviceId ? 'Paired (Ready)' : 'Standby'}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              Connected (TCP)
                            </span>
                          )}
                        </div>

                        {/* Specs & Address subtitle */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span className="font-medium text-zinc-700">
                            Target: <span className="font-mono font-semibold">{p.targetAddress || 'Default'}</span>
                          </span>
                          <span>•</span>
                          <span>{p.paperWidth || '80mm'} Thermal</span>
                          <span>•</span>
                          <span>{p.autoCut !== false ? 'Auto-Cut ON' : 'Manual Tear'}</span>
                          {p.role === 'BILL' && (
                            <>
                              <span>•</span>
                              <span>{p.openCashDrawer ? 'Drawer Kick ON' : 'Drawer Kick OFF'}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Operational Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                      {/* LAN Ping verification button */}
                      {p.connectionType === 'NETWORK' && (
                        <button
                          type="button"
                          onClick={() => pingLanCard(p)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition cursor-pointer"
                          title="Ping printer IP address"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>Ping IP</span>
                        </button>
                      )}

                      {/* Test Print button */}
                      <button
                        type="button"
                        onClick={() => handleTestPrint(p)}
                        disabled={isTestingThis}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer disabled:opacity-60"
                        title="Send Diagnostic Pattern"
                      >
                        {isTestingThis ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                            <span>Printing...</span>
                          </>
                        ) : (
                          <>
                            <TestTube className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Test Print</span>
                          </>
                        )}
                      </button>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Edit</span>
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove printer profile "${p.name}"?`)) {
                            deletePrinter(p.id);
                          }
                        }}
                        className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CARD 2: KITCHEN DISPATCH POLICY                                           */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
        <div className="p-6">
          <h3 className="text-base font-bold text-zinc-900 mb-1">Kitchen Dispatch Policy</h3>
          <p className="text-xs text-zinc-500 mb-6">
            Choose how orders should be sent to the kitchen by default. This controls the balance between physical KOT prints and digital KDS displays.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Display Only */}
            <button
              type="button"
              onClick={() => setKdsPrintMode('DISPLAY_ONLY')}
              className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition cursor-pointer relative ${
                kdsPrintMode === 'DISPLAY_ONLY'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 shadow-xs'
                  : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50 text-zinc-700'
              }`}
            >
              <Monitor
                className={`w-7 h-7 mb-2.5 ${kdsPrintMode === 'DISPLAY_ONLY' ? 'text-indigo-600' : 'text-zinc-400'}`}
              />
              <span className="font-bold text-sm text-zinc-900">Display Only</span>
              <span className="text-[11px] text-zinc-500 text-center mt-1">Direct to KDS screen. No paper.</span>
              {kdsPrintMode === 'DISPLAY_ONLY' && (
                <div className="mt-3">
                  <Check className="w-5 h-5 text-indigo-600" />
                </div>
              )}
            </button>

            {/* 2. Both Print & Display */}
            <button
              type="button"
              onClick={() => setKdsPrintMode('BOTH')}
              className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition cursor-pointer relative ${
                kdsPrintMode === 'BOTH'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 shadow-xs'
                  : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50 text-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1 mb-2.5">
                <Printer className={`w-7 h-7 ${kdsPrintMode === 'BOTH' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                <Monitor className={`w-7 h-7 ${kdsPrintMode === 'BOTH' ? 'text-indigo-600' : 'text-zinc-400'}`} />
              </div>
              <span className="font-bold text-sm text-zinc-900">Both Print & Display</span>
              <span className="text-[11px] text-zinc-500 text-center mt-1">Paper KOT and screen dispatch.</span>
              {kdsPrintMode === 'BOTH' && (
                <div className="mt-3">
                  <Check className="w-5 h-5 text-indigo-600" />
                </div>
              )}
            </button>

            {/* 3. Print Only */}
            <button
              type="button"
              onClick={() => setKdsPrintMode('PRINT_ONLY')}
              className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition cursor-pointer relative ${
                kdsPrintMode === 'PRINT_ONLY'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 shadow-xs'
                  : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50 text-zinc-700'
              }`}
            >
              <Printer
                className={`w-7 h-7 mb-2.5 ${kdsPrintMode === 'PRINT_ONLY' ? 'text-indigo-600' : 'text-zinc-400'}`}
              />
              <span className="font-bold text-sm text-zinc-900">Print Only</span>
              <span className="text-[11px] text-zinc-500 text-center mt-1">Legacy paper KOT routing.</span>
              {kdsPrintMode === 'PRINT_ONLY' && (
                <div className="mt-3">
                  <Check className="w-5 h-5 text-indigo-600" />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT PRINTER PROFILE                                         */}
      {/* ========================================================================= */}
      {isEditing && editingPrinter && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-zinc-200 max-h-[92vh] overflow-y-auto space-y-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    {editingPrinter?.name?.startsWith('Station Printer') || editingPrinter?.name === 'Main Cashier Receipt'
                      ? 'Add New Printer Profile'
                      : `Edit Printer Profile: ${editingPrinter?.name}`}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Configure connection protocols, print routing roles, and thermal ESC/POS settings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditingPrinter(null);
                }}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="space-y-6">
              {/* SECTION 1: IDENTITY & ROLE */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  1. Profile Name & Assigned Task Role
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-600 mb-1">Printer Profile Name</label>
                    <input
                      type="text"
                      value={editingPrinter.name || ''}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. Main Kitchen KOT, Combined KOT/BOT, Cashier POS"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-600 mb-1">Task Routing Role</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingPrinter({ ...editingPrinter, role: 'KOT' })}
                        className={`px-2 py-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          editingPrinter.role === 'KOT'
                            ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-500/30'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        🍳 Kitchen (KOT)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPrinter({
                            ...editingPrinter,
                            role: 'BILL',
                            openCashDrawer: true,
                          })
                        }
                        className={`px-2 py-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          editingPrinter.role === 'BILL'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/30'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        🧾 Cashier Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPrinter({ ...editingPrinter, role: 'BAR' })}
                        className={`px-2 py-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          editingPrinter.role === 'BAR'
                            ? 'bg-purple-50 text-purple-800 border-purple-300 ring-2 ring-purple-500/30'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        🍸 Bar Ticket
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPrinter({ ...editingPrinter, role: 'BOTH' })}
                        className={`px-2 py-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          editingPrinter.role === 'BOTH'
                            ? 'bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-500/30'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        🍳🍸 Both (KOT/BOT)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: CONNECTION PROTOCOL (HOW IT CONNECTS) */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  2. Connection Type (Connect Any Printer)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* System Spooler */}
                  <div
                    onClick={() =>
                      setEditingPrinter({
                        ...editingPrinter,
                        connectionType: 'SYSTEM',
                        targetAddress: 'Default',
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                      editingPrinter.connectionType === 'SYSTEM'
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Monitor className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-xs text-zinc-900">System Default (Universal)</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 ml-auto">
                        Any Printer
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Universal browser print. Uses browser print window (or silent printing when Chrome is run with <code className="font-mono text-zinc-700 bg-zinc-100 px-1 py-0.5 rounded">--kiosk-printing</code>).
                    </p>
                  </div>

                  {/* Network / LAN */}
                  <div
                    onClick={() =>
                      setEditingPrinter({
                        ...editingPrinter,
                        connectionType: 'NETWORK',
                        targetAddress: editingPrinter.targetAddress === 'Default' ? '192.168.1.100' : editingPrinter.targetAddress,
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                      editingPrinter.connectionType === 'NETWORK'
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Wifi className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-xs text-zinc-900">Network / LAN IP</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 ml-auto">
                        TCP:9100
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Direct raw ESC/POS over TCP port 9100. Silent background printing with zero browser popups.
                    </p>
                  </div>

                  {/* WebUSB Direct */}
                  <div
                    onClick={() =>
                      setEditingPrinter({
                        ...editingPrinter,
                        connectionType: 'USB',
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                      editingPrinter.connectionType === 'USB'
                        ? 'border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Usb className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-xs text-zinc-900">USB Direct (WebUSB)</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 ml-auto">
                        Silent Auto-Print
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Direct hardware USB streaming. 100% silent automatic printing directly to thermal printer (no browser popups). Recommended for Xprinter.
                    </p>
                  </div>

                  {/* WebBluetooth */}
                  <div
                    onClick={() =>
                      setEditingPrinter({
                        ...editingPrinter,
                        connectionType: 'BLUETOOTH',
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 transition cursor-pointer ${
                      editingPrinter.connectionType === 'BLUETOOTH'
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Bluetooth className="w-4 h-4 text-violet-600" />
                      <span className="font-bold text-xs text-zinc-900">Bluetooth Direct</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 ml-auto">
                        Wireless BLE
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Direct wireless GATT connection for portable mobile belt printers & tablet POS stations.
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: PROTOCOL-SPECIFIC CONFIGURATION */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                {editingPrinter.connectionType === 'NETWORK' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800">LAN Thermal Printer Target</span>
                      <span className="text-[10px] text-zinc-500">Raw JetDirect TCP Port 9100</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Printer IP Address</label>
                        <input
                          type="text"
                          value={editingPrinter.targetAddress || ''}
                          onChange={(e) => setEditingPrinter({ ...editingPrinter, targetAddress: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-mono font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="e.g. 192.168.1.100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Socket Port</label>
                        <input
                          type="number"
                          value={editingPrinter.port || 9100}
                          onChange={(e) => setEditingPrinter({ ...editingPrinter, port: Number(e.target.value) || 9100 })}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-mono font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* Quick ping IP verification */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handlePingModalIp}
                        disabled={modalPingStatus?.loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 transition cursor-pointer"
                      >
                        {modalPingStatus?.loading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                            <span>Pinging {editingPrinter.targetAddress}...</span>
                          </>
                        ) : (
                          <>
                            <Radio className="w-3.5 h-3.5 text-blue-600" />
                            <span>Ping & Test IP Reachability</span>
                          </>
                        )}
                      </button>

                      {modalPingStatus && !modalPingStatus.loading && (
                        <div
                          className={`text-xs font-bold flex items-center gap-1 ${
                            modalPingStatus.success ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {modalPingStatus.success ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Reachable ({modalPingStatus.latencyMs}ms)</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-rose-600" />
                              <span>{typeof modalPingStatus.error === 'string' ? modalPingStatus.error : (modalPingStatus.error as any)?.message || 'Unreachable'}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {editingPrinter.connectionType === 'USB' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800">Direct USB Hardware Device</span>
                      <span className="text-[10px] text-zinc-500">Chrome/Edge WebUSB API</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={handlePairUsb}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer shrink-0"
                      >
                        <Usb className="w-4 h-4" />
                        <span>Pair USB Thermal Printer</span>
                      </button>
                      <div className="text-xs text-zinc-600 min-w-0">
                        {editingPrinter.usbVendorId ? (
                          <div className="font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            Paired: VID: 0x{editingPrinter.usbVendorId.toString(16)} | PID: 0x{editingPrinter.usbProductId?.toString(16)} ({editingPrinter.targetAddress})
                          </div>
                        ) : (
                          <span>Click button to select your USB thermal receipt printer (e.g. Xprinter, POS-58, POS-80).</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {editingPrinter.connectionType === 'BLUETOOTH' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800">Wireless Bluetooth Device</span>
                      <span className="text-[10px] text-zinc-500">BLE GATT Printing Service</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={handlePairBluetooth}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer shrink-0"
                      >
                        <Bluetooth className="w-4 h-4" />
                        <span>Scan & Pair Bluetooth Device</span>
                      </button>
                      <div className="text-xs text-zinc-600 min-w-0">
                        {editingPrinter.bluetoothDeviceId ? (
                          <div className="font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            Paired BLE: {editingPrinter.targetAddress || 'Thermal BLE Device'}
                          </div>
                        ) : (
                          <span>Click button to pair wireless Bluetooth receipt printer or belt printer.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {editingPrinter.connectionType === 'SYSTEM' && (
                  <div className="text-xs text-zinc-600 space-y-2">
                    <div className="font-bold text-zinc-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Universal Print Spooler Active
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Routes print jobs through your operating system driver dialog.
                    </p>
                    <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 leading-snug flex items-start gap-2">
                      <span className="font-bold shrink-0">💡 Silent Printing:</span>
                      <span>
                        To print automatically <strong>without any browser popup on screen</strong>, select <strong>"USB Direct (WebUSB)"</strong> above, or launch your Chrome shortcut with the <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-300">--kiosk-printing</code> flag.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4: HARDWARE & FORMATTING OPTIONS */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  3. Thermal Formatting & Hardware Options
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Paper Width */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-600 mb-1">Paper Roll Width</label>
                    <select
                      value={editingPrinter.paperWidth || '80mm'}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, paperWidth: e.target.value as '80mm' | '58mm' })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="80mm">80mm Thermal (Standard POS - 48 cols)</option>
                      <option value="58mm">58mm Compact (Mobile Belt - 32 cols)</option>
                    </select>
                  </div>

                  {/* Feed Lines */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-600 mb-1">Paper Feed Lines Before Cut</label>
                    <select
                      value={editingPrinter.feedLines ?? 3}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, feedLines: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="1">1 Line</option>
                      <option value="2">2 Lines</option>
                      <option value="3">3 Lines (Default)</option>
                      <option value="4">4 Lines</option>
                      <option value="5">5 Lines</option>
                      <option value="6">6 Lines</option>
                    </select>
                  </div>

                  {/* Auto-cut Toggle */}
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-zinc-200 bg-zinc-50/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPrinter.autoCut ?? true}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, autoCut: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-zinc-800 block">Auto-Cut Paper</span>
                      <span className="text-[10px] text-zinc-500 block">Trigger partial blade cut after printing</span>
                    </div>
                  </label>

                  {/* Cash Drawer Kick Toggle */}
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-zinc-200 bg-zinc-50/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPrinter.openCashDrawer ?? (editingPrinter.role === 'BILL')}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, openCashDrawer: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-zinc-800 block">Kick Cash Drawer</span>
                      <span className="text-[10px] text-zinc-500 block">Send drawer pulse on receipt finish</span>
                    </div>
                  </label>
                </div>

                {/* Profile Enabled Toggle */}
                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPrinter.enabled ?? true}
                      onChange={(e) => setEditingPrinter({ ...editingPrinter, enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-zinc-800">Printer Profile Active & Enabled</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestModalPrint}
                disabled={testingId === 'modal_test'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer w-full sm:w-auto justify-center"
              >
                {testingId === 'modal_test' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Printing Test Slip...</span>
                  </>
                ) : (
                  <>
                    <TestTube className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Test Print Current Settings</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditingPrinter(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Printer Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
