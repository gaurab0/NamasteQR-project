import React, { createContext, useContext, useState, useEffect } from 'react';
import { PrinterConfig, KdsPrintMode, PrinterRole } from '../types/printer.types';
import { printService } from '../services/print.service';

interface PrinterContextValue {
  printers: PrinterConfig[];
  kdsPrintMode: KdsPrintMode;
  savePrinter: (config: PrinterConfig) => void;
  deletePrinter: (id: string) => void;
  setKdsPrintMode: (mode: KdsPrintMode) => void;
  testPrinter: (config: PrinterConfig) => Promise<void>;
  dispatchPrint: (role: PrinterRole, data: any) => Promise<void>;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

export const PrinterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [kdsPrintMode, setKdsPrintMode] = useState<KdsPrintMode>('DISPLAY_ONLY');

  useEffect(() => {
    // Load from local storage on mount
    try {
      const storedPrinters = localStorage.getItem('serveflow_printers');
      if (storedPrinters) {
        setPrinters(JSON.parse(storedPrinters));
      }
      const storedMode = localStorage.getItem('serveflow_kds_mode');
      if (storedMode) {
        setKdsPrintMode(storedMode as KdsPrintMode);
      }
    } catch (e) {
      console.warn('Failed to parse printer config from local storage', e);
    }
  }, []);

  const saveToStorage = (newPrinters: PrinterConfig[], newMode: KdsPrintMode) => {
    localStorage.setItem('serveflow_printers', JSON.stringify(newPrinters));
    localStorage.setItem('serveflow_kds_mode', newMode);
  };

  const savePrinter = (config: PrinterConfig) => {
    setPrinters((prev) => {
      const existingIdx = prev.findIndex(p => p.id === config.id);
      const newPrinters = [...prev];
      if (existingIdx >= 0) {
        newPrinters[existingIdx] = config;
      } else {
        newPrinters.push(config);
      }
      saveToStorage(newPrinters, kdsPrintMode);
      return newPrinters;
    });
  };

  const deletePrinter = (id: string) => {
    setPrinters((prev) => {
      const newPrinters = prev.filter(p => p.id !== id);
      saveToStorage(newPrinters, kdsPrintMode);
      return newPrinters;
    });
  };

  const handleSetKdsMode = (mode: KdsPrintMode) => {
    setKdsPrintMode(mode);
    saveToStorage(printers, mode);
  };

  const testPrinter = async (config: PrinterConfig) => {
    const mockData = {
      id: 'TEST-123',
      table_number: 'TEST',
      waiter_name: 'Admin',
      items: [
        { name: 'Test Print Item', quantity: 1, price: 9.99, notes: 'Printer is working correctly.' }
      ],
      subtotal: 9.99,
      tax: 0.00,
      total_amount: 9.99
    };
    await printService.printTask(config.role, mockData, config);
  };

  const dispatchPrint = async (role: PrinterRole, data: any) => {
    // Find the printer designated for this role
    const assignedPrinter = printers.find(p => p.role === role && p.enabled);
    await printService.printTask(role, data, assignedPrinter);
  };

  return (
    <PrinterContext.Provider
      value={{
        printers,
        kdsPrintMode,
        savePrinter,
        deletePrinter,
        setKdsPrintMode: handleSetKdsMode,
        testPrinter,
        dispatchPrint
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};
