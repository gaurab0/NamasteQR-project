import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  PrinterConfig,
  KdsPrintMode,
  PrinterRole,
  DriverType,
  ReceiptData,
} from '../types/printer.types';
import { printService } from '../services/print.service';
import { useAuth } from '../context/AuthContext';
import { rbacService } from '../services/rbac.service';
import { socketService } from '../services/socket.service';

interface PrinterContextValue {
  // Existing state & methods
  printers: PrinterConfig[];
  kdsPrintMode: KdsPrintMode;
  savePrinter: (config: PrinterConfig) => void;
  deletePrinter: (id: string) => void;
  setKdsPrintMode: (mode: KdsPrintMode) => void;
  testPrinter: (config: PrinterConfig) => Promise<boolean>;
  dispatchPrint: (role: PrinterRole, data: any) => Promise<boolean>;

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
  const [kdsPrintMode, setKdsPrintModeState] = useState<KdsPrintMode>('DISPLAY_ONLY');

  // Hardware states
  const [activeDriver, setActiveDriver] = useState<DriverType | null>('browser');
  const [activePrinter, setActivePrinter] = useState<PrinterConfig | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true); // browser default is ready
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      if (storedPrinters) {
        const parsed: PrinterConfig[] = JSON.parse(storedPrinters);
        setPrinters(parsed);
        if (parsed.length > 0) {
          const first = parsed[0];
          setActivePrinter(first);
          const mappedDriver = mapConnectionToDriver(first.connectionType);
          setActiveDriver(mappedDriver);
          setIsConnected(mappedDriver === 'browser');
        }
      }
      const storedMode = localStorage.getItem('serveflow_kds_mode');
      if (storedMode) {
        setKdsPrintModeState(storedMode as KdsPrintMode);
      }
    } catch (e) {
      console.warn('Failed to parse printer config from local storage', e);
    }
  }, []);

  const saveToStorage = (newPrinters: PrinterConfig[], newMode: KdsPrintMode) => {
    try {
      localStorage.setItem('serveflow_printers', JSON.stringify(newPrinters));
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
      return result;
    } catch (err: any) {
      const msg = err.message || 'Test print failed';
      setError(msg);
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, []);

  const savePrinter = useCallback((config: PrinterConfig) => {
    setPrinters((prev) => {
      const existingIdx = prev.findIndex((p) => p.id === config.id);
      const newPrinters = [...prev];
      if (existingIdx >= 0) {
        newPrinters[existingIdx] = config;
      } else {
        newPrinters.push(config);
      }
      saveToStorage(newPrinters, kdsPrintMode);
      return newPrinters;
    });

    setActivePrinter(config);
    setActiveDriver(mapConnectionToDriver(config.connectionType));
  }, [kdsPrintMode]);

  const deletePrinter = useCallback((id: string) => {
    setPrinters((prev) => {
      const newPrinters = prev.filter((p) => p.id !== id);
      saveToStorage(newPrinters, kdsPrintMode);
      return newPrinters;
    });
  }, [kdsPrintMode]);

  const setKdsPrintMode = useCallback((mode: KdsPrintMode) => {
    setKdsPrintModeState(mode);
    saveToStorage(printers, mode);
    if (businessId) {
      rbacService.updateBusinessProfileApi({ kds_print_mode: mode }, businessId).catch((err) => {
        console.warn('[PrinterContext] Failed to persist kds_print_mode to backend:', err);
      });
    }
  }, [printers, businessId]);

  const dispatchPrint = useCallback(async (role: PrinterRole, data: any): Promise<boolean> => {
    const assignedPrinters = printers.filter((p) => p.role === role && p.enabled);
    setIsPrinting(true);
    try {
      if (assignedPrinters.length === 0) {
        return await printService.printTask(role, data, undefined);
      }
      let allSuccess = true;
      for (const printer of assignedPrinters) {
        const success = await printService.printTask(role, data, printer);
        if (!success) allSuccess = false;
      }
      return allSuccess;
    } catch (err: any) {
      console.error(`[dispatchPrint] Error printing ${role}:`, err);
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, [printers]);

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
