import {
  DocumentRole,
  PrinterAssignments,
  PrinterConfig,
  PrinterProfile,
  PrinterSettings,
} from '../types/printer.types';
import { determineItemStation } from '../utils/menuUtils';

export type PrinterResolutionReason = 'override' | 'role' | 'default' | 'browser-fallback';

export type PrinterResolution =
  | { printer: PrinterProfile; reason: PrinterResolutionReason }
  | { error: string };

export interface SplitOrderResult {
  KOT: Record<string, unknown> | null;
  BOT: Record<string, unknown> | null;
  unclassifiedItems: string[];
}

const emptyAssignments = (): PrinterAssignments => ({
  KOT: null,
  BOT: null,
  BILL: null,
  defaultPrinterId: null,
});

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizePrinterSettings(raw: unknown): PrinterSettings {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = raw as Partial<PrinterSettings>;
    if (value.schemaVersion === 2 && Array.isArray(value.printers)) {
      const printers = value.printers.filter(isPrinterProfile);
      const ids = new Set(printers.filter((printer) => printer.enabled).map((printer) => printer.id));
      const incoming = value.assignments || emptyAssignments();
      const validId = (id: unknown): string | null => typeof id === 'string' && ids.has(id) ? id : null;
      return {
        schemaVersion: 2,
        printers,
        assignments: {
          KOT: validId(incoming.KOT),
          BOT: validId(incoming.BOT),
          BILL: validId(incoming.BILL),
          defaultPrinterId: validId(incoming.defaultPrinterId),
        },
      };
    }
  }

  const legacy = Array.isArray(raw) ? raw : [];
  const printers: PrinterProfile[] = [];
  const assignments = emptyAssignments();
  for (const entry of legacy) {
    if (!entry || typeof entry !== 'object') continue;
    const old = entry as Partial<PrinterConfig>;
    if (typeof old.name !== 'string') continue;
    const connection = legacyConnection(old.connectionType);
    const id = typeof old.id === 'string' && old.id ? old.id : makeId();
    const printer: PrinterProfile = {
      id,
      name: old.name,
      connection,
      address: {
        ...(old.usbVendorId !== undefined && old.usbProductId !== undefined
          ? { usb: { vendorId: old.usbVendorId, productId: old.usbProductId } }
          : {}),
        ...(old.bluetoothDeviceId ? { bluetooth: { deviceId: old.bluetoothDeviceId, deviceName: old.targetAddress } } : {}),
        ...(connection === 'LAN' && old.targetAddress && old.targetAddress !== 'Default'
          ? { lan: { host: old.targetAddress, port: old.port || 9100 } }
          : {}),
      },
      paperWidthMm: old.paperWidth === '58mm' ? 58 : 80,
      paperWidth: old.paperWidth || '80mm',
      enabled: old.enabled !== false,
      autoPrintKds: old.autoPrintKds !== false,
      port: old.port || 9100,
      feedLines: old.feedLines ?? 3,
      autoCut: old.autoCut ?? true,
      openCashDrawer: old.openCashDrawer ?? false,
      usbVendorId: old.usbVendorId,
      usbProductId: old.usbProductId,
      bluetoothDeviceId: old.bluetoothDeviceId,
      lastConnected: old.lastConnected,
      status: old.status,
    };
    printers.push(printer);
    const role = old.role === 'BAR' ? 'BOT' : old.role;
    if (role === 'KOT' || role === 'BOT' || role === 'BILL') {
      if (!assignments[role]) assignments[role] = id;
    }
  }
  const first = printers.find((printer) => printer.enabled) || printers[0];
  if (first) {
    assignments.defaultPrinterId = first.id;
    if (!assignments.BILL) assignments.BILL = first.id;
  }
  return { schemaVersion: 2, printers, assignments };
}

function isPrinterProfile(value: unknown): value is PrinterProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<PrinterProfile>;
  return typeof profile.id === 'string' && typeof profile.name === 'string' &&
    ['USB', 'BLUETOOTH', 'LAN', 'BROWSER'].includes(String(profile.connection)) &&
    typeof profile.enabled === 'boolean' && !!profile.address && typeof profile.address === 'object';
}

function legacyConnection(value: unknown): PrinterProfile['connection'] {
  if (value === 'USB' || value === 'BLUETOOTH') return value;
  if (value === 'NETWORK') return 'LAN';
  return 'BROWSER';
}

export function resolvePrinter(
  settings: PrinterSettings,
  role: DocumentRole,
  overridePrinterId?: string,
): PrinterResolution {
  let printer: PrinterProfile | undefined;
  let reason: PrinterResolutionReason;
  if (overridePrinterId) {
    printer = settings.printers.find((entry) => entry.id === overridePrinterId);
    reason = 'override';
    if (!printer) return { error: 'The selected override printer no longer exists.' };
  } else if (settings.assignments[role]) {
    printer = settings.printers.find((entry) => entry.id === settings.assignments[role]);
    reason = 'role';
  } else if (settings.assignments.defaultPrinterId) {
    printer = settings.printers.find((entry) => entry.id === settings.assignments.defaultPrinterId);
    reason = 'default';
  } else {
    printer = {
      id: 'browser-fallback', name: 'System Print Dialog', connection: 'BROWSER', address: {},
      paperWidthMm: 80, paperWidth: '80mm', enabled: true, autoPrintKds: false,
    };
    reason = 'browser-fallback';
  }
  if (!printer) return { error: `No printer is assigned to ${role}, and the default printer is unavailable.` };
  if (!printer.enabled) return { error: `${printer.name} is disabled. Enable it or choose another printer.` };
  if (printer.status === 'disconnected' || printer.status === 'error') {
    return { error: `${printer.name} is disconnected. Reconnect it or choose another printer.` };
  }
  return { printer, reason };
}

export function splitOrderByStation(order: Record<string, unknown>): SplitOrderResult {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const kitchen: unknown[] = [];
  const bar: unknown[] = [];
  const unclassifiedItems: string[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (String(item.status || '').toUpperCase() === 'CANCELLED') continue;
    const explicit = String(item.station || '').toUpperCase();
    const station = explicit === 'BAR' || explicit === 'KITCHEN' || explicit === 'BOTH'
      ? explicit
      : determineItemStation(item as Parameters<typeof determineItemStation>[0]);
    if (!explicit && station === 'KITCHEN' && !item.category && !Array.isArray(item.additional_categories)) {
      unclassifiedItems.push(String(item.name || 'Unnamed item'));
    }
    if (station === 'KITCHEN' || station === 'BOTH') kitchen.push(item);
    if (station === 'BAR' || station === 'BOTH') bar.push(item);
  }
  return {
    KOT: kitchen.length ? { ...order, items: kitchen } : null,
    BOT: bar.length ? { ...order, items: bar } : null,
    unclassifiedItems,
  };
}
