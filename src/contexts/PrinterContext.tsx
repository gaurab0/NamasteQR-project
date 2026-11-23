import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  PrinterConfig,
  KdsPrintMode,
  PrinterRole,
  DriverType,
  ReceiptData,
  PrinterSettings,
  PrinterProfile,
  DocumentRole,
} from '../types/printer.types';
import { printService } from '../services/print.service';
import { useAuth } from '../context/AuthContext';
import { rbacService } from '../services/rbac.service';
import { socketService } from '../services/socket.service';
import { determineItemStation } from '../utils/menuUtils';
import { normalizePrinterSettings, resolvePrinter, splitOrderByStation } from '../services/printer-routing';

interface PrinterContextValue {
  // Existing state & methods
  printers: PrinterConfig[];
  printerAssignments: PrinterSettings['assignments'];
  setPrinterAssignment: (role: DocumentRole | 'defaultPrinterId', printerId: string | null) => void;
  kdsPrintMode: KdsPrintMode;
  savePrinter: (config: PrinterConfig) => void;
  deletePrinter: (id: string) => void;
  setKdsPrintMode: (mode: KdsPrintMode) => void;
  testPrinter: (config: PrinterConfig) => Promise<boolean>;
  dispatchPrint: (role: PrinterRole, data: any, overridePrinterId?: string, bypassDuplicateGuard?: boolean) => Promise<boolean>;

  // Thermal hardware state & drivers
  activeDriver: DriverType | null;
  activePrinter: PrinterConfig | null;
  isConnected: boolean;
  isPrinting: boolean;
  error: string | null;
  clearError: () => void;
  selectDriver: (type: DriverType) => Promise<void>;
  connect: (config?: Partial<PrinterConfig>) => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendRaw: (data: Uint8Array, config?: PrinterConfig) => Promise<void>;
  printReceipt: (receiptData: ReceiptData | any, config?: PrinterConfig) => Promise<boolean>;
  probeNetworkPrinter: (host: string, port?: number) => Promise<{ success: boolean; reachable?: boolean; error?: string; latencyMs?: number }>;
  isWebUsbSupported: boolean;
  isWebBluetoothSupported: boolean;
  pairUsbDevice: () => Promise<{ vendorId: number; productId: number; productName?: string; manufacturerName?: string }>;
  pairBluetoothDevice: () => Promise<{ id: string; name?: string }>;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

export const PrinterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [printerAssignments, setPrinterAssignments] = useState<PrinterSettings['assignments']>({
    KOT: null, BOT: null, BILL: null, defaultPrinterId: null,
  });
  const settingsRef = useRef<PrinterSettings>({ schemaVersion: 2, printers: [], assignments: { KOT: null, BOT: null, BILL: null, defaultPrinterId: null } });
  const [kdsPrintMode, setKdsPrintModeState] = useState<KdsPrintMode>('DISPLAY_ONLY');

  // Hardware states
  const [activeDriver, setActiveDriver] = useState<DriverType | null>('browser');
  const [activePrinter, setActivePrinter] = useState<PrinterConfig | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true); // browser default is ready
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const recentBothPrintsRef = useRef<Map<string, number>>(new Map());
  const autoPrintedOrderRoundsRef = useRef<Set<string>>(new Set());

  const { user } = useAuth();
  const businessId = user?.business?.id;

  // Sync kdsPrintMode from user profile when available
  useEffect(() => {
    if (user?.business?.kds_print_mode) {
      setKdsPrintModeState(user.business.kds_print_mode as KdsPrintMode);
      try {
        localStorage.setItem('serveflow_kds_mode', user.business.kds_print_mode);
      } catch {}
    }
  }, [user?.business?.kds_print_mode]);

  // Subscribe to real-time business profile updates
  useEffect(() => {
    if (!businessId) return;
    const unsub = socketService.subscribeToBusinessProfile((biz) => {
      if (biz && (biz.id === businessId || !biz.id) && biz.kds_print_mode) {
        setKdsPrintModeState(biz.kds_print_mode as KdsPrintMode);
        try {
          localStorage.setItem('serveflow_kds_mode', biz.kds_print_mode);
        } catch {}
      }
    });
    return () => unsub();
  }, [businessId]);

  // Load configuration from local storage on mount
  useEffect(() => {
    try {
      const storedPrinters = localStorage.getItem('serveflow_printers');
      const backupKey = 'serveflow_printers_legacy_backup';
      if (storedPrinters && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, storedPrinters);
      const normalized = normalizePrinterSettings(storedPrinters ? JSON.parse(storedPrinters) : null);
      settingsRef.current = normalized;
      setPrinterAssignments(normalized.assignments);
      const legacyView = normalized.printers.map((profile) => profileToConfig({
        ...profile,
        status: profile.connection === 'USB' || (profile.connection === 'BLUETOOTH' && bluetoothRestoreAvailable())
          ? undefined
          : profile.connection === 'BLUETOOTH' ? 'disconnected' : profile.status,
      }, normalized.assignments));
      setPrinters(legacyView);
      if (legacyView.length > 0) {
        setActivePrinter(legacyView[0]);
        const mappedDriver = mapConnectionToDriver(legacyView[0].connectionType);
        setActiveDriver(mappedDriver);
        setIsConnected(mappedDriver === 'browser');
      }
      const storedMode = localStorage.getItem('serveflow_kds_mode');
      if (storedMode) {
        setKdsPrintModeState(storedMode as KdsPrintMode);
      } else if (legacyView.some((p) => p.enabled && (p.role === 'KOT' || p.role === 'BAR' || p.role === 'BOTH'))) {
        setKdsPrintModeState('BOTH');
      }
      if (storedPrinters) {
        localStorage.setItem('serveflow_printers', JSON.stringify(normalized));
      }
    } catch (e) {
      console.warn('Failed to parse printer config from local storage', e);
    }
  }, []);

  const saveToStorage = (newPrinters: PrinterConfig[], newMode: KdsPrintMode, assignments = printerAssignments) => {
    try {
      const normalized = normalizePrinterSettings({ schemaVersion: 2, printers: newPrinters.map(configToProfile), assignments });
      settingsRef.current = normalized;
      localStorage.setItem('serveflow_printers', JSON.stringify(normalized));
      localStorage.setItem('serveflow_kds_mode', newMode);
    } catch (e) {
      console.error('Failed to save printer configuration to localStorage:', e);
    }
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const selectDriver = useCallback(async (type: DriverType): Promise<void> => {
    setActiveDriver(type);
    setError(null);
    const driver = printService.getDriver(type);
    setIsConnected(driver.isConnected);
  }, []);

  const connect = useCallback(async (config?: Partial<PrinterConfig>): Promise<boolean> => {
    setError(null);
    const targetType = config?.connectionType 
      ? mapConnectionToDriver(config.connectionType) 
      : activeDriver || 'browser';

    try {
      const driver = printService.getDriver(targetType);
      await driver.connect(config);
      setIsConnected(driver.isConnected);
      setActiveDriver(targetType);
      return true;
    } catch (err: any) {
      const msg = err.message || 'Connection failed';
      console.warn(`[PrinterContext] Connection error:`, msg);
      // If user cancelled browser dialog, don't show fatal alert
      if (!msg.includes('cancelled')) {
        setError(msg);
      }
      setIsConnected(false);
      return false;
    }
  }, [activeDriver]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      if (activeDriver) {
        const driver = printService.getDriver(activeDriver);
        await driver.disconnect();
      }
    } catch (e) {
      console.warn('[PrinterContext] Disconnect error:', e);
    } finally {
      setIsConnected(activeDriver === 'browser');
    }
  }, [activeDriver]);

  const sendRaw = useCallback(async (data: Uint8Array, config?: PrinterConfig): Promise<void> => {
    setIsPrinting(true);
    setError(null);
    try {
      const driverType = config ? mapConnectionToDriver(config.connectionType) : activeDriver || 'browser';
      const driver = printService.getDriver(driverType);
      await driver.sendRaw(data);
    } catch (err: any) {
      const msg = err.message || 'Error transmitting raw print data';
      setError(msg);
      throw err;
    } finally {
      setIsPrinting(false);
    }
  }, [activeDriver]);

  const printReceipt = useCallback(async (receiptData: ReceiptData | any, config?: PrinterConfig): Promise<boolean> => {
    setIsPrinting(true);
    setError(null);
    try {
      let targetConfig = config;
      if (!targetConfig) {
        // Check if activePrinter matches activeDriver
        if (activePrinter && mapConnectionToDriver(activePrinter.connectionType) === (activeDriver || 'browser')) {
          targetConfig = activePrinter;
        } else {
          // Check if any configured printer matches activeDriver
          const matching = printers.find(
            (p) => p.enabled && mapConnectionToDriver(p.connectionType) === (activeDriver || 'browser')
          );
          if (matching) {
            targetConfig = matching;
          } else if (activeDriver && activeDriver !== 'browser') {
            // Ephemeral hardware config for activeDriver
            targetConfig = {
              id: `ephemeral_${activeDriver}`,
              name: activeDriver === 'usb' ? 'USB Thermal Printer' : activeDriver === 'bluetooth' ? 'Bluetooth Thermal Printer' : 'Network LAN Printer',
              role: 'BILL',
              connectionType: activeDriver === 'usb' ? 'USB' : activeDriver === 'bluetooth' ? 'BLUETOOTH' : 'NETWORK',
              targetAddress: activePrinter?.targetAddress || (activeDriver === 'lan' ? '127.0.0.1' : 'Default'),
              paperWidth: activePrinter?.paperWidth || '80mm',
              enabled: true,
              autoPrintKds: true,
              port: activePrinter?.port || 9100,
              feedLines: activePrinter?.feedLines ?? 3,
              autoCut: activePrinter?.autoCut ?? true,
              openCashDrawer: activePrinter?.openCashDrawer ?? true,
            };
          } else {
            targetConfig = printers.find((p) => p.role === 'BILL' && p.enabled) || undefined;
          }
        }
      }

      const role: PrinterRole = targetConfig?.role || 'BILL';
      const success = await printService.printTask(role, receiptData, targetConfig);
      return success;
    } catch (err: any) {
      const msg = err.message || 'Failed to print receipt';
      setError(msg);
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, [activeDriver, activePrinter, printers]);

  const testPrinter = useCallback(async (config: PrinterConfig): Promise<boolean> => {
    setIsPrinting(true);
    setError(null);
    try {
      const result = await printService.testPrinter(config);
      if (!result) throw new Error('Printer test did not complete successfully. Retry the connection.');
      setPrinters((previous) => {
        const next = previous.map((printer) => printer.id === config.id ? { ...printer, status: 'connected' as const } : printer);
        saveToStorage(next, kdsPrintMode);
        return next;
      });
      return result;
    } catch (err: any) {
      const msg = err.message || 'Test print failed';
      setError(msg);
      setPrinters((previous) => {
        const next = previous.map((printer) => printer.id === config.id ? { ...printer, status: 'disconnected' as const } : printer);
        saveToStorage(next, kdsPrintMode);
        return next;
      });
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, [kdsPrintMode, printerAssignments]);

  const savePrinter = useCallback((config: PrinterConfig) => {
    setPrinters((prev) => {
      const existingIdx = prev.findIndex((p) => p.id === config.id);
      const isNew = existingIdx < 0;
      const newPrinters = [...prev];
      if (existingIdx >= 0) {
        newPrinters[existingIdx] = config;
      } else {
        newPrinters.push(config);
      }
      const assignments = { ...printerAssignments };
      const role = config.role === 'BAR' ? 'BOT' : config.role;
      if (isNew && (role === 'KOT' || role === 'BOT' || role === 'BILL')) assignments[role] = config.id;
      if (!assignments.defaultPrinterId) assignments.defaultPrinterId = config.id;
      if (!config.enabled) {
        const cleared = (['KOT', 'BOT', 'BILL', 'defaultPrinterId'] as const)
          .filter((key) => assignments[key] === config.id);
        for (const key of cleared) assignments[key] = null;
        if (cleared.length) printService.showToast(`${config.name} disabled. Unassigned: ${cleared.map((entry) => entry === 'defaultPrinterId' ? 'Default' : entry).join(', ')}.`, true);
      }
      setPrinterAssignments(assignments);
      let nextMode = kdsPrintMode;
      if (nextMode === 'DISPLAY_ONLY' && (config.role === 'KOT' || config.role === 'BAR' || config.role === 'BOTH') && config.enabled !== false) {
        nextMode = 'BOTH';
        setKdsPrintModeState('BOTH');
      }
      saveToStorage(newPrinters, nextMode, assignments);
      return newPrinters;
    });

    setActivePrinter(config);
    setActiveDriver(mapConnectionToDriver(config.connectionType));
  }, [kdsPrintMode, printerAssignments]);

  const deletePrinter = useCallback((id: string) => {
    setPrinters((prev) => {
      const newPrinters = prev.filter((p) => p.id !== id);
      const assignments = { ...printerAssignments };
      const cleared = (['KOT', 'BOT', 'BILL', 'defaultPrinterId'] as const)
        .filter((key) => assignments[key] === id);
      for (const key of cleared) assignments[key] = null;
      setPrinterAssignments(assignments);
      saveToStorage(newPrinters, kdsPrintMode, assignments);
      if (cleared.length) printService.showToast(`Printer removed. Unassigned: ${cleared.map((role) => role === 'defaultPrinterId' ? 'Default' : role).join(', ')}.`, true);
      return newPrinters;
    });
  }, [kdsPrintMode, printerAssignments]);

  const setPrinterAssignment = useCallback((role: DocumentRole | 'defaultPrinterId', printerId: string | null) => {
    const assignments = { ...printerAssignments, [role]: printerId };
    setPrinterAssignments(assignments);
    saveToStorage(printers, kdsPrintMode, assignments);
  }, [printerAssignments, printers, kdsPrintMode]);

  const setKdsPrintMode = useCallback((mode: KdsPrintMode) => {
    setKdsPrintModeState(mode);
    saveToStorage(printers, mode);
    if (businessId) {
      rbacService.updateBusinessProfileApi({ kds_print_mode: mode }, businessId).catch((err) => {
        console.warn('[PrinterContext] Failed to persist kds_print_mode to backend:', err);
      });
    }
  }, [printers, businessId, printerAssignments]);

  const dispatchPrint = useCallback(async (role: PrinterRole, data: any, overridePrinterId?: string, bypassDuplicateGuard = false): Promise<boolean> => {
    setIsPrinting(true);
    try {
      const documentRole: DocumentRole = role === 'BAR' ? 'BOT' : role === 'BOTH' ? 'KOT' : role;
      const resolution = resolvePrinter({ schemaVersion: 2, printers: printers.map(configToProfile), assignments: printerAssignments }, documentRole, overridePrinterId);
      if ('error' in resolution) {
        const targetId = overridePrinterId || printerAssignments[documentRole] || printerAssignments.defaultPrinterId;
        const target = printers.find((printer) => printer.id === targetId);
        const retry = target?.enabled ? async () => {
          const retryData = documentRole === 'KOT' || documentRole === 'BOT'
            ? (documentRole === 'KOT' ? splitOrderByStation(data).KOT : splitOrderByStation(data).BOT) || data
            : data;
          const printed = await printService.printTask(documentRole === 'BOT' ? 'BAR' : documentRole, retryData, target, true);
          setPrinters((previous) => {
            const next = previous.map((printer) => printer.id === target.id
              ? { ...printer, status: printed ? 'connected' as const : 'disconnected' as const }
              : printer);
            saveToStorage(next, kdsPrintMode, printerAssignments);
            return next;
          });
          return printed;
        } : undefined;
        printService.showToast(`${resolution.error} Choose another printer or reconnect it.`, true, retry);
        return false;
      }
      const chosen = resolution.printer;
      const config = profileToConfig(chosen, printerAssignments, documentRole);
      const splitOrder = documentRole === 'KOT' || documentRole === 'BOT' ? splitOrderByStation(data) : null;
      if (documentRole === 'KOT' && splitOrder?.unclassifiedItems.length) {
        printService.showToast(`Unclassified items routed to KOT: ${splitOrder.unclassifiedItems.join(', ')}`, true);
      }
      const stationOrder = splitOrder ? (documentRole === 'KOT' ? splitOrder.KOT : splitOrder.BOT) : null;
      if (splitOrder && !stationOrder) {
        printService.showToast(`No ${documentRole === 'KOT' ? 'kitchen' : 'bar'} items to print for this order.`);
        return false;
      }
      const payload = stationOrder || data;
      const where = resolution.reason === 'browser-fallback' ? 'System Print Dialog (fallback)' : `${chosen.name} (${chosen.connection}${chosen.address.lan ? ` ${chosen.address.lan.host}` : ''})`;
      printService.showToast(`${documentRole} → ${where} • ${resolution.reason}`);
      const printed = await printService.printTask(documentRole === 'BOT' ? 'BAR' : documentRole, payload, config, bypassDuplicateGuard);
      setPrinters((previous) => {
        const next = previous.map((printer) => printer.id === chosen.id
          ? { ...printer, status: printed ? 'connected' as const : 'disconnected' as const }
          : printer);
        saveToStorage(next, kdsPrintMode, printerAssignments);
        return next;
      });
      return printed;
    } catch (err: any) {
      console.error(`[dispatchPrint] Error printing ${role}:`, err);
      printService.showToast(`Print failed: ${err.message || 'Printer unavailable'}. Retry or choose another printer.`, true);
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, [printers, printerAssignments]);

  // App-Wide Background Auto-Print: Listen for incoming orders across POS, KDS, and tables
  useEffect(() => {
    if (!businessId) return;

    // Strictly disable background auto-printing on customer-facing pages (table ordering, menu preview)
    const isCustomerFacingRoute = typeof window !== 'undefined' && (
      window.location.pathname.startsWith('/table') ||
      window.location.pathname.startsWith('/menu') ||
      window.location.pathname.includes('/customer')
    );
    if (isCustomerFacingRoute) return;

    socketService.joinBusiness(businessId);

    const unsubOrder = socketService.subscribeToOrders(async (order: any) => {
      if (!order || !order.id) return;
      if (order.print_agent_managed) return;
      if (order.status === 'CANCELLED' || order.status === 'COMPLETED' || order.settled) return;

      const currentMode = kdsPrintMode || (user?.business?.kds_print_mode as KdsPrintMode);
      if (currentMode === 'DISPLAY_ONLY') return;

      // Check if this device has any enabled printers that can print KOT, BAR, or BOTH
      const hasEligiblePrinter = printers.some((printer) => printer.enabled && printer.autoPrintKds !== false && (
        printerAssignments.KOT === printer.id || printerAssignments.BOT === printer.id ||
        printerAssignments.defaultPrinterId === printer.id ||
        printer.role === 'KOT' || printer.role === 'BAR' || printer.role === 'BOTH'
      ));
      if (!hasEligiblePrinter) return;

      const orderRound = order.round_number || 1;
      const printKey = `${order.id}_round_${orderRound}`;

      if (autoPrintedOrderRoundsRef.current.has(printKey)) return;

      // Ignore orders created > 10 minutes ago to avoid printing stale orders on page reload
      const createdAt = order.created_at ? new Date(order.created_at).getTime() : 0;
      if (createdAt && Date.now() - createdAt > 10 * 60 * 1000) {
        autoPrintedOrderRoundsRef.current.add(printKey);
        return;
      }

      autoPrintedOrderRoundsRef.current.add(printKey);

      // Prune if set gets large
      if (autoPrintedOrderRoundsRef.current.size > 200) {
        const arr = Array.from(autoPrintedOrderRoundsRef.current);
        autoPrintedOrderRoundsRef.current = new Set(arr.slice(arr.length - 100));
      }

      const rawItems = order.items || [];
      const hasKitchenItems = rawItems.some((it: any) => {
        const st = (it.station || determineItemStation(it) || '').toUpperCase();
        return st !== 'BAR';
      });
      const hasBarItems = rawItems.some((it: any) => {
        const st = (it.station || determineItemStation(it) || '').toUpperCase();
        return st === 'BAR' || st === 'BOTH';
      });

      if (hasKitchenItems) {
        await dispatchPrint('KOT', order);
      }
      if (hasBarItems) {
        await dispatchPrint('BAR', order);
      }
    });

    return () => unsubOrder();
  }, [businessId, kdsPrintMode, user?.business?.kds_print_mode, printers, printerAssignments, dispatchPrint]);

  const probeNetworkPrinter = useCallback(async (host: string, port: number = 9100) => {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token'))
        : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/print/test-connection', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ host, port, timeout: 3500 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = typeof data.error === 'object' && data.error !== null
          ? data.error.message || data.error.code || 'Connection test failed'
          : (data.error || `HTTP ${res.status}: Connection test failed`);
        return { success: false, reachable: false, error: errMsg };
      }
      const finalError = typeof data.error === 'object' && data.error !== null
        ? data.error.message || data.error.code
        : data.error;
      return { ...data, error: finalError };
    } catch (err: any) {
      return { success: false, reachable: false, error: err.message || 'Network error' };
    }
  }, []);

  const pairUsbDevice = useCallback(async () => {
    return await printService.requestUsbDevice();
  }, []);

  const pairBluetoothDevice = useCallback(async () => {
    return await printService.requestBluetoothDevice();
  }, []);

  const isWebUsbSupported = typeof navigator !== 'undefined' && 'usb' in navigator;
  const isWebBluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return (
    <PrinterContext.Provider
      value={{
        printers,
        printerAssignments,
        setPrinterAssignment,
        kdsPrintMode,
        savePrinter,
        deletePrinter,
        setKdsPrintMode,
        testPrinter,
        dispatchPrint,
        activeDriver,
        activePrinter,
        isConnected,
        isPrinting,
        error,
        clearError,
        selectDriver,
        connect,
        disconnect,
        sendRaw,
        printReceipt,
        probeNetworkPrinter,
        isWebUsbSupported,
        isWebBluetoothSupported,
        pairUsbDevice,
        pairBluetoothDevice,
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

function mapConnectionToDriver(conn: string): DriverType {
  const c = String(conn).toUpperCase();
  if (c === 'USB') return 'usb';
  if (c === 'BLUETOOTH') return 'bluetooth';
  if (c === 'NETWORK' || c === 'LAN') return 'lan';
  return 'browser';
}

function profileToConfig(profile: PrinterProfile, assignments?: PrinterSettings['assignments'], roleOverride?: DocumentRole): PrinterConfig {
  const role: PrinterRole = roleOverride === 'BOT' ? 'BAR' : roleOverride ||
    (assignments?.BILL === profile.id ? 'BILL' : assignments?.BOT === profile.id ? 'BAR' : assignments?.KOT === profile.id ? 'KOT' : 'KOT');
  const connectionType = profile.connection === 'LAN' ? 'NETWORK'
    : profile.connection === 'BROWSER' ? 'SYSTEM' : profile.connection;
  return {
    ...profile,
    role,
    connectionType,
    targetAddress: profile.address.lan?.host || profile.address.bluetooth?.deviceName || profile.name,
    port: profile.address.lan?.port || profile.port || 9100,
    paperWidth: profile.paperWidthMm === 58 ? '58mm' : profile.paperWidth || '80mm',
    usbVendorId: profile.address.usb?.vendorId ?? profile.usbVendorId,
    usbProductId: profile.address.usb?.productId ?? profile.usbProductId,
    bluetoothDeviceId: profile.address.bluetooth?.deviceId || profile.bluetoothDeviceId,
  };
}

function configToProfile(config: PrinterConfig): PrinterProfile {
  const connection = config.connectionType === 'NETWORK' ? 'LAN'
    : config.connectionType === 'SYSTEM' ? 'BROWSER' : config.connectionType;
  return {
    ...config,
    connection,
    address: {
      ...(config.usbVendorId !== undefined && config.usbProductId !== undefined
        ? { usb: { vendorId: config.usbVendorId, productId: config.usbProductId } } : {}),
      ...(config.bluetoothDeviceId ? { bluetooth: { deviceId: config.bluetoothDeviceId, deviceName: config.targetAddress } } : {}),
      ...(connection === 'LAN' && config.targetAddress && config.targetAddress !== 'Default'
        ? { lan: { host: config.targetAddress, port: config.port || 9100 } } : {}),
    },
    paperWidthMm: config.paperWidth === '58mm' ? 58 : 80,
  };
}

function bluetoothRestoreAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const bluetooth = (navigator as Navigator & { bluetooth?: { getDevices?: () => Promise<unknown[]> } }).bluetooth;
  return typeof bluetooth?.getDevices === 'function';
}

/**
 * Custom hook for thermal printer management with unified driver architecture
 */
export const useThermalPrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error('useThermalPrinter must be used within a PrinterProvider');
  }
  return context;
};

/**
 * Standard hook for general printer and KDS dispatch management
 */
export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};
