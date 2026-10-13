import { renderFormattedDate, DateFormatMode } from '../../utils/dateFormatter';
import { useAuth } from '../../context/AuthContext';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TableOrder, OrderStatus, TableOrderItem, ServiceRequest, RestaurantTable } from '../../types/rbac';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { rbacService } from '../../services/rbac.service';
import { determineItemStation } from '../../utils/menuUtils';
import { usePrinter } from '../../contexts/PrinterContext';
import {
  BellRing,
  BellOff,
  ChefHat, 
  Wine, 
  Bell, 
  Clock, 
  Flame, 
  CheckCircle2, 
  CheckCheck, 
  AlertCircle, 
  Search, 
  Filter, 
  Layers, 
  Building2, 
  UtensilsCrossed, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Check, 
  Sparkles,
  MapPin,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Trash2,
  Database,
  Receipt,
  Banknote,
  QrCode,
  CreditCard,
  Hand,
  Copy,
  Printer
} from 'lucide-react';
import { Button } from '../ui/Button';

export type KDSViewMode = 'KITCHEN' | 'BAR' | 'WAITER';

interface KitchenDisplaySystemProps {
  businessId: string;
  businessName?: string;
  currentUserRole?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
  defaultStation?: KDSViewMode;
}

export const KitchenDisplaySystem: React.FC<KitchenDisplaySystemProps> = ({
  businessId,
  businessName,
  currentUserRole,
  isViewOnly = false,
  onRequestRoleSignIn,
  defaultStation = 'KITCHEN',
}) => {
  const { dispatchPrint, kdsPrintMode } = usePrinter();
  const { user } = useAuth();
  const billingFormat: DateFormatMode = (user?.business?.date_format_billing as DateFormatMode) || 'ENGLISH';
  const [activeStation, setActiveStation] = useState<KDSViewMode>(defaultStation);
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const currentStaffId = rbacService.getCurrentStaffSession()?.id;
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'READY' | 'SERVED'>('ACTIVE');
  const [lastPingedOrder, setLastPingedOrder] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const prevBillPingsRef = useRef<number>(0);

  const canDeliver = !isViewOnly;




  // Real-time clock ticker for station full screen display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to Escape key and fullscreenchange to sync full screen exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        exitFullScreen();
      }
    };
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullScreen) {
        // User exited native browser fullscreen via browser controls
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isFullScreen]);

  const openFullScreen = (station?: KDSViewMode) => {
    if (station) {
      setActiveStation(station);
    }
    setIsFullScreen(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {
      // Ignored if in restricted iframe; CSS fixed overlay handles fullscreen perfectly
    }
  };

  const exitFullScreen = () => {
    setIsFullScreen(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {
      // Ignored
    }
  };

  // Play auditory chime when order transitions or new order arrives
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  };

  // Special distinct 2-tone Service / Waiter chime for bill pings
  const playBillChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain1.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.25);

      setTimeout(() => {
        try {
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1318.51, audioCtx.currentTime); // E6
          gain2.gain.setValueAtTime(0.25, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start();
          osc2.stop(audioCtx.currentTime + 0.35);
        } catch {}
      }, 150);
    } catch (e) {}
  };

  // Real-time Firestore onSnapshot subscription to live table orders & service requests
  useEffect(() => {
    if (!businessId) return;

    setLoading(true);
    let unsubTables: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    let unsubRequests: (() => void) | null = null;

    try {
      // 0. Tables Listener (for Waiter assignment)
      const tablesColRef = collection(db, 'businesses', businessId, 'tables');
      const unsubTables = onSnapshot(tablesColRef, (snapshot) => {
        const liveTables: RestaurantTable[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          liveTables.push({
            id: docSnap.id,
            ...d
          } as RestaurantTable);
        });
        setTables(liveTables);
      });

      // 1. Table Orders Listener
      const ordersColRef = collection(db, 'businesses', businessId, 'table_orders');
      unsubOrders = onSnapshot(ordersColRef, (snapshot) => {
        const liveOrders: TableOrder[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'AWAITING_PAYMENT') return; // Hide unverified pay-first orders from KDS
          liveOrders.push({
            id: docSnap.id,
            order_number: d.order_number,
            business_id: d.business_id || businessId,
            table_id: d.table_id || 'table-general',
            table_number: d.table_number || 'Table',
            floor: d.floor ?? null,
            building: d.building ?? null,
            items: (d.items || []).map((it: any) => ({
              ...it,
              station: it.station || determineItemStation(it),
            })),
            subtotal: d.subtotal || 0,
            tax_amount: d.tax_amount || 0,
            total_amount: d.total_amount || 0,
            currency: d.currency || 'Rs.',
            customer_name: d.customer_name || 'Guest',
            customer_phone: d.customer_phone || '',
            order_notes: d.order_notes || '',
            status: d.status || 'RECEIVED',
            ready_at: d.ready_at ? new Date(d.ready_at) : null,
            served_at: d.served_at ? new Date(d.served_at) : null,
            bill_requested: Boolean(d.bill_requested),
            bill_requested_at: d.bill_requested_at ? new Date(d.bill_requested_at) : null,
            payment_method: d.payment_method || null,
            promo_code: d.promo_code || null,
            promo_discount: d.promo_discount || 0,
            taxes: d.taxes || [],
            created_at: d.created_at ? new Date(d.created_at) : new Date(),
            updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
          });
        });

        // Trigger KOT printing for freshly placed orders (if KdsPrintMode dictates printing)
        if (kdsPrintMode !== 'DISPLAY_ONLY') {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data();
              const createdAt = d.created_at?.toDate ? d.created_at.toDate().getTime() : (d.created_at ? new Date(d.created_at).getTime() : 0);
              const now = Date.now();
              // Only trigger print if the order was created in the last 15 seconds
              if (now - createdAt < 15000) {
                dispatchPrint('KOT', {
                  id: change.doc.id,
                  ...d
                });
              }
            }
          });
        }

        // Sort: newest first
        liveOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setOrders(liveOrders);
        setLoading(false);
      }, (err) => {
        console.warn('Live KDS listener note:', err.message);
        loadFallbackOrders();
      });

      // 2. Service Requests & Waiter Bill Pings Listener
      const srvColRef = collection(db, 'businesses', businessId, 'service_requests');
      unsubRequests = onSnapshot(srvColRef, (snapshot) => {
        const liveReqs: ServiceRequest[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          liveReqs.push({
            id: docSnap.id,
            type: d.type || 'BILL_REQUEST',
            business_id: d.business_id || businessId,
            order_id: d.order_id,
            order_number: d.order_number,
            table_id: d.table_id || '',
            table_number: String(d.table_number || 'Table'),
            payment_method: d.payment_method,
            total_amount: Number(d.total_amount) || 0,
            currency: d.currency || 'Rs.',
            status: d.status || 'PENDING',
            created_at: d.created_at || new Date().toISOString(),
            notes: d.notes,
          });
        });
        liveReqs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setServiceRequests(liveReqs);

        // Ping sound is handled by the unifiedBillRequests useEffect which respects waiter assignments
        prevBillPingsRef.current = liveReqs.filter((r) => r.status === 'PENDING' && r.type === 'BILL_REQUEST').length;
      }, (err) => {
        console.warn('Live service_requests note:', err.message);
      });

      return () => {
        if (unsubTables) unsubTables();
      if (unsubOrders) unsubOrders();
        if (unsubRequests) unsubRequests();
      };
    } catch (err) {
      console.warn('Live KDS setup note:', err);
      loadFallbackOrders();
    }
  }, [businessId]);

  // Acknowledge a pending bill request / waiter ping
  const handleAcknowledgeBillRequest = async (requestId: string, orderId?: string) => {
    try {
      try {
        await updateDoc(doc(db, 'businesses', businessId, 'service_requests', requestId), {
          status: 'ATTENDED',
          attended_at: new Date().toISOString(),
        });
      } catch {}

      if (orderId) {
        try {
          await updateDoc(doc(db, 'businesses', businessId, 'table_orders', orderId), {
            bill_acknowledged: true,
            updated_at: new Date().toISOString(),
          });
        } catch {}
      }
    } catch (err) {
      console.error('Error acknowledging bill request:', err);
    }
  };



  const loadFallbackOrders = async () => {
    try {
      setLoading(true);
      const res = await rbacService.getTableOrdersApi();
      setOrders(res.map((o) => ({
        ...o,
        items: o.items.map((it) => ({
          ...it,
          station: it.station || determineItemStation(it),
        })),
      })));
    } catch (e) {
      console.error('Fallback orders failed:', e);
    } finally {
      setLoading(false);
    }
  };

  // Status Change Handler
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }

    setActionInProgress(orderId);
    try {
      await rbacService.updateTableOrderStatusApi(orderId, newStatus, businessId);
      playChime();
      if (newStatus === 'READY') {
        setLastPingedOrder(orderId);
        setTimeout(() => setLastPingedOrder(null), 6000);
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Granular Item-Level Preparation Status Handler (Kitchen & Bar stations)
  const handleUpdateItemStatus = async (
    orderId: string,
    itemKeyOrIdOrIndex: { itemKey?: string; itemId?: string; index?: number },
    newStatus: OrderStatus
  ) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }

    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    let fullOrderIndex = -1;
    if (itemKeyOrIdOrIndex.itemKey) {
      fullOrderIndex = order.items.findIndex((it) => it.item_key === itemKeyOrIdOrIndex.itemKey);
    }
    if (fullOrderIndex === -1 && itemKeyOrIdOrIndex.itemId) {
      fullOrderIndex = order.items.findIndex((it) => it.item_id === itemKeyOrIdOrIndex.itemId);
    }
    if (fullOrderIndex === -1 && typeof itemKeyOrIdOrIndex.index === 'number') {
      fullOrderIndex = itemKeyOrIdOrIndex.index;
    }

    if (fullOrderIndex === -1) return;

    const actionKey = `${orderId}-item-${fullOrderIndex}`;
    setActionInProgress(actionKey);

    try {
      const now = new Date();
      const updatedItems = order.items.map((it, idx) => {
        if (idx === fullOrderIndex) {
          return {
            ...it,
            status: newStatus,
            ready_at: newStatus === 'READY' ? now.toISOString() : it.ready_at,
            served_at: newStatus === 'SERVED' ? now.toISOString() : it.served_at,
          };
        }
        return it;
      });

      const allServed = updatedItems.length > 0 && updatedItems.every((it) => it.status === 'SERVED');
      const allReadyOrServed = updatedItems.length > 0 && updatedItems.every((it) => it.status === 'READY' || it.status === 'SERVED');
      const anyReady = updatedItems.some((it) => it.status === 'READY');
      const anyPreparing = updatedItems.some((it) => it.status === 'PREPARING');

      let nextOrderStatus: OrderStatus = order.status;
      if (allServed) {
        nextOrderStatus = 'SERVED';
      } else if (allReadyOrServed) {
        nextOrderStatus = 'READY';
      } else if (anyReady || anyPreparing) {
        nextOrderStatus = 'PREPARING';
      }

      try {
        const orderDocRef = doc(db, 'businesses', businessId, 'table_orders', orderId);
        await updateDoc(orderDocRef, {
          items: updatedItems,
          status: nextOrderStatus,
          ready_at: nextOrderStatus === 'READY' && !order.ready_at ? now.toISOString() : (order.ready_at || null),
          served_at: nextOrderStatus === 'SERVED' && !order.served_at ? now.toISOString() : (order.served_at || null),
          updated_at: now.toISOString(),
        });
      } catch (directErr) {
        // Fallback to server API
        await rbacService.updateTableOrderItemStatusApi(
          orderId,
          { index: fullOrderIndex, itemKey: itemKeyOrIdOrIndex.itemKey, itemId: itemKeyOrIdOrIndex.itemId },
          newStatus,
          businessId
        );
      }

      playChime();
      if (newStatus === 'READY') {
        setLastPingedOrder(orderId);
        setTimeout(() => setLastPingedOrder(null), 5000);
      }
    } catch (err: any) {
      alert(`Failed to update item status: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Mark all relevant station items in an order ready at once
  const handleMarkAllStationItemsReady = async (order: TableOrder) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }

    setActionInProgress(order.id);
    try {
      const now = new Date();
      const stationItemKeys = new Set(
        order.items
          .filter((it) => {
            const st = it.station || determineItemStation(it);
            if (activeStation === 'KITCHEN') return st === 'KITCHEN';
            if (activeStation === 'BAR') return st === 'BAR';
            return true;
          })
          .map((it, idx) => it.item_key || `${it.item_id}_${idx}`)
      );

      const updatedItems = order.items.map((it, idx) => {
        const key = it.item_key || `${it.item_id}_${idx}`;
        if (stationItemKeys.has(key) && it.status !== 'SERVED') {
          return {
            ...it,
            status: 'READY' as OrderStatus,
            ready_at: it.ready_at || now.toISOString(),
          };
        }
        return it;
      });

      const allReadyOrServed = updatedItems.every((it) => it.status === 'READY' || it.status === 'SERVED');
      const nextOrderStatus: OrderStatus = allReadyOrServed ? 'READY' : 'PREPARING';

      try {
        const orderDocRef = doc(db, 'businesses', businessId, 'table_orders', order.id);
        await updateDoc(orderDocRef, {
          items: updatedItems,
          status: nextOrderStatus,
          ready_at: nextOrderStatus === 'READY' ? now.toISOString() : (order.ready_at || null),
          updated_at: now.toISOString(),
        });
      } catch (directErr) {
        await rbacService.updateTableOrderStatusApi(order.id, nextOrderStatus, businessId);
      }

      playChime();
      setLastPingedOrder(order.id);
      setTimeout(() => setLastPingedOrder(null), 5000);
    } catch (err: any) {
      alert(`Failed to mark all items ready: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Batch start or complete items for repeated dishes across unstarted queues
  const handleBatchUpdateItemStatus = async (
    targetItems: Array<{ orderId: string; itemIndex: number; itemKey?: string; itemId: string }>,
    newStatus: OrderStatus
  ) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }

    try {
      const now = new Date();
      // Group target items by orderId
      const byOrder = new Map<string, Array<{ itemIndex: number; itemKey?: string; itemId: string }>>();
      for (const t of targetItems) {
        if (!byOrder.has(t.orderId)) byOrder.set(t.orderId, []);
        byOrder.get(t.orderId)!.push(t);
      }

      for (const [orderId, itemsToUpdate] of byOrder.entries()) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) continue;

        const updatedItems = order.items.map((it, idx) => {
          const match = itemsToUpdate.find((u) => {
            if (u.itemKey && it.item_key) return u.itemKey === it.item_key;
            return u.itemIndex === idx;
          });
          if (match) {
            return {
              ...it,
              status: newStatus,
              ready_at: newStatus === 'READY' ? now.toISOString() : it.ready_at,
              served_at: newStatus === 'SERVED' ? now.toISOString() : it.served_at,
            };
          }
          return it;
        });

        const allServed = updatedItems.length > 0 && updatedItems.every((it) => it.status === 'SERVED');
        const allReadyOrServed = updatedItems.length > 0 && updatedItems.every((it) => it.status === 'READY' || it.status === 'SERVED');
        const anyReady = updatedItems.some((it) => it.status === 'READY');
        const anyPreparing = updatedItems.some((it) => it.status === 'PREPARING');

        let nextOrderStatus: OrderStatus = order.status;
        if (allServed) nextOrderStatus = 'SERVED';
        else if (allReadyOrServed) nextOrderStatus = 'READY';
        else if (anyReady || anyPreparing) nextOrderStatus = 'PREPARING';

        try {
          const orderDocRef = doc(db, 'businesses', businessId, 'table_orders', orderId);
          await updateDoc(orderDocRef, {
            items: updatedItems,
            status: nextOrderStatus,
            ready_at: nextOrderStatus === 'READY' && !order.ready_at ? now.toISOString() : (order.ready_at || null),
            served_at: nextOrderStatus === 'SERVED' && !order.served_at ? now.toISOString() : (order.served_at || null),
            updated_at: now.toISOString(),
          });
        } catch (directErr) {
          for (const itemTarget of itemsToUpdate) {
            await rbacService.updateTableOrderItemStatusApi(
              orderId,
              { index: itemTarget.itemIndex, itemKey: itemTarget.itemKey, itemId: itemTarget.itemId },
              newStatus,
              businessId
            );
          }
        }
      }

      playChime();
      if (newStatus === 'READY') {
        const firstOrderId = targetItems[0]?.orderId;
        if (firstOrderId) {
          setLastPingedOrder(firstOrderId);
          setTimeout(() => setLastPingedOrder(null), 5000);
        }
      }
    } catch (err: any) {
      alert(`Failed to batch update items: ${err.message}`);
    }
  };

  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const handlePurgeCompletedOrders = async () => {
    try {
      setIsPurging(true);
      const res = await rbacService.purgeCompletedOrdersApi(businessId);
      setCleanupMessage(`Removed ${res.deletedCount} completed tickets from database.`);
      setTimeout(() => setCleanupMessage(null), 4000);
      loadFallbackOrders();
    } catch (err: any) {
      console.warn('Purge completed orders note:', err.message);
    } finally {
      setIsPurging(false);
    }
  };

  // FIFO Station Queue Timestamp Calculator:
  // - Finds active unserved items (status !== 'SERVED' && status !== 'CANCELLED') for this station.
  // - If unserved items exist, returns the minimum timestamp of those unserved items.
  // - If all dishes are served, returns the completion/update time.
  // Ensures:
  // 1. First order placed remains in the front of the queue until all its items are served.
  // 2. If a table has its dishes served and orders another dish later (Round 2),
  //    its queue timestamp becomes the new dish's timestamp, moving it to the end of the queue
  //    behind other tables whose dishes are still unserved.
  const getStationOrderQueueTime = (order: TableOrder, stationItems?: TableOrderItem[]): number => {
    const items = stationItems && stationItems.length > 0 ? stationItems : (order.items || []);
    const unservedItems = items.filter((it) => {
      if (it.status === 'CANCELLED') return false;
      if (it.status === 'SERVED') return false;
      if (it.status === 'COMPLETED') return false;
      // If the station is Kitchen/Bar, they don't care about READY items for sorting active queue
      if ((activeStation === 'KITCHEN' || activeStation === 'BAR') && it.status === 'READY') {
        return false;
      }
      return true;
    });

    if (unservedItems.length > 0) {
      const timestamps = unservedItems.map((it) => {
        if (it.ordered_at) {
          const t = new Date(it.ordered_at).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        if (order.created_at) {
          const t = new Date(order.created_at).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        return Date.now();
      });
      return Math.min(...timestamps);
    }

    const fallback = order.served_at || order.updated_at || order.created_at;
    const t = fallback ? new Date(fallback).getTime() : NaN;
    return !isNaN(t) && t > 0 ? t : Date.now();
  };

  // Filter orders according to station view
  const stationOrders = useMemo(() => {
    if (kdsPrintMode === 'PRINT_ONLY' && (activeStation === 'KITCHEN' || activeStation === 'BAR')) return [];
    const filteredList = orders.map((order) => {
      // For Kitchen station: filter items to food items (station !== 'BAR')
      // For Bar station: filter items to beverages (station === 'BAR')
      // For Waiter station: show all items since waiter serves everything
      // In all stations, CANCELLED items must never appear as active dishes to prepare or serve!
      const filteredItems = order.items.filter((item) => {
        if (item.status === 'CANCELLED') return false;
        const itemStation = item.station || determineItemStation(item);
        if (activeStation === 'KITCHEN') {
          return itemStation === 'KITCHEN';
        }
        if (activeStation === 'BAR') {
          return itemStation === 'BAR';
        }
        return true; // WAITER sees all
      });

      return {
        ...order,
        stationItems: filteredItems,
      };
    }).filter((order) => {
      // Cancelled orders must never appear in active prep or pickup stations
      if (order.status === 'CANCELLED') return false;

      // Must have at least 1 item relevant to this station
      if (order.stationItems.length === 0) return false;

      // Filter by table assignment if user is a waiter
      if (activeStation === 'WAITER' && currentStaffId) {
        const table = tables.find((t) => t.id === order.table_id);
        if (table && table.assigned_waiter_ids && table.assigned_waiter_ids.length > 0) {
          if (!table.assigned_waiter_ids.includes(currentStaffId)) {
            return false;
          }
        }
      }

      // Status filtering per view mode:
      if (activeStation === 'WAITER') {
        // Waiter is interested in tickets that have ready items or are actively being prepared
        if (statusFilter === 'ACTIVE') {
          return order.status === 'READY' || order.status === 'PREPARING' || order.status === 'RECEIVED';
        }
        if (statusFilter === 'READY') {
          return order.status === 'READY' || order.items.some((it) => it.status === 'READY');
        }
        if (statusFilter === 'SERVED') {
          return order.status === 'SERVED' || order.status === 'COMPLETED';
        }
        return true;
      }

      // Kitchen & Bar stations:
      if (statusFilter === 'ACTIVE') {
        // Show ticket if it has items not yet prepared/served/cancelled, or overall order is active
        const hasUnreadyItems = order.stationItems.some(
          (it) => it.status !== 'READY' && it.status !== 'SERVED' && it.status !== 'CANCELLED'
        );
        return hasUnreadyItems || order.status === 'RECEIVED' || order.status === 'PREPARING';
      }
      if (statusFilter === 'READY') {
        return order.status === 'READY' || order.stationItems.some((it) => it.status === 'READY');
      }
      if (statusFilter === 'SERVED') {
        return order.status === 'SERVED' || order.status === 'COMPLETED';
      }
      return true;
    }).filter((order) => {
      if (!searchFilter.trim()) return true;
      const query = searchFilter.toLowerCase();
      const matchTable = (order.table_number || '').toLowerCase().includes(query);
      const matchGuest = (order.customer_name || '').toLowerCase().includes(query);
      const matchItem = order.stationItems.some((it) => it.name.toLowerCase().includes(query));
      return matchTable || matchGuest || matchItem;
    });

    if (statusFilter === 'SERVED') {
      filteredList.sort((a, b) => {
        const timeA = a.served_at ? new Date(a.served_at).getTime() : new Date(a.updated_at || a.created_at).getTime();
        const timeB = b.served_at ? new Date(b.served_at).getTime() : new Date(b.updated_at || b.created_at).getTime();
        return timeB - timeA;
      });
    } else {
      // FIFO Queue Ordering:
      // Orders are sorted by the timestamp of their earliest active unserved dish for this station.
      // - The table who ordered first stays at the beginning until all its items are served.
      // - If a table has all items served and later adds another dish (Round 2) before the final bill,
      //   only the new unserved dish is considered, moving this table to the end of the queue behind
      //   tables with earlier unserved dishes.
      filteredList.sort((a, b) => {
        const timeA = getStationOrderQueueTime(a, a.stationItems);
        const timeB = getStationOrderQueueTime(b, b.stationItems);
        return timeA - timeB;
      });
    }

    return filteredList;
  }, [orders, activeStation, statusFilter, searchFilter]);

  // Active Table Calls ("Call Waiter") for Waiter Station Queue
  const pendingTableCalls = useMemo(() => {
    return tables
      .filter((t) => {
        if (!t.waiter_ping?.active) return false;
        // If waiter station, only show if assigned to current staff OR unassigned (available to claim)
        if (activeStation === 'WAITER' && currentStaffId) {
          if (t.assigned_waiter_ids && t.assigned_waiter_ids.length > 0) {
            return t.assigned_waiter_ids.includes(currentStaffId);
          }
          return true;
        }
        return true;
      })
      .map((t) => {
        const matchingOrder = orders.find(
          (o) => (o.table_id === t.id || String(o.table_number) === String(t.table_number)) &&
                 o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
        );
        return {
          table: t,
          matchingOrder,
        };
      });
  }, [tables, orders, activeStation, currentStaffId]);

  const handleAcknowledgeTableCall = async (tableId: string) => {
    try {
      setActionInProgress(tableId);
      const tableRef = doc(db, 'businesses', businessId, 'tables', tableId);
      await updateDoc(tableRef, {
        'waiter_ping.active': false,
      });
    } catch (err: any) {
      alert(`Could not acknowledge table call: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Unified Bill Requests combining both service_requests and orders with bill_requested: true
  const unifiedBillRequests = useMemo(() => {
    const list: Array<{
      id: string;
      order_id?: string;
      table_id: string;
      table_number: string;
      floor?: string | null;
      building?: string | null;
      customer_name?: string;
      customer_phone?: string;
      payment_method?: string;
      total_amount: number;
      currency: string;
      status: string;
      created_at: string | Date;
      notes?: string;
      targetOrder?: TableOrder;
    }> = [];

    const seenOrderIds = new Set<string>();

    // 1. Process explicit service requests
    serviceRequests
      .filter((r) => r.status === 'PENDING' && r.type === 'BILL_REQUEST')
      .forEach((r) => {
        // Match associated order if any
        const targetOrder = orders.find(
          (o) =>
            o.id === r.order_id ||
            (o.table_number && String(o.table_number) === String(r.table_number)) ||
            (r.table_id && o.table_id === r.table_id)
        );

        // If the linked order is already settled, completed, or cancelled, do NOT display the bill requested card!
        if (targetOrder) {
          const isSettled =
            targetOrder.status === 'COMPLETED' ||
            targetOrder.status === 'CANCELLED' ||
            Boolean((targetOrder as any).settled) ||
            (targetOrder as any).payment_status === 'PAID';
          if (isSettled) {
            return;
          }
        }

        if (r.order_id) seenOrderIds.add(r.order_id);
        if (targetOrder?.id) seenOrderIds.add(targetOrder.id);

        list.push({
          id: r.id,
          order_id: r.order_id || targetOrder?.id,
          table_id: r.table_id || targetOrder?.table_id || '',
          table_number: String(r.table_number || targetOrder?.table_number || 'Table'),
          floor: r.floor || targetOrder?.floor || null,
          building: r.building || targetOrder?.building || null,
          customer_name: r.customer_name || targetOrder?.customer_name || 'Dine-In Guest',
          customer_phone: r.customer_phone || targetOrder?.customer_phone || '',
          payment_method: r.payment_method || targetOrder?.payment_method || 'CASH',
          total_amount: r.total_amount || targetOrder?.total_amount || 0,
          currency: r.currency || targetOrder?.currency || 'Rs.',
          status: r.status,
          created_at: r.created_at,
          notes: r.notes || targetOrder?.order_notes,
          targetOrder,
        });
      });

    // 2. Process table_orders that have bill_requested: true and are not completed/cancelled/settled
    orders
      .filter(
        (o) =>
          o.bill_requested &&
          o.status !== 'COMPLETED' &&
          o.status !== 'CANCELLED' &&
          !Boolean((o as any).settled) &&
          (o as any).payment_status !== 'PAID'
      )
      .forEach((o) => {
        if (seenOrderIds.has(o.id)) return;
        seenOrderIds.add(o.id);

        list.push({
          id: `bill-${o.id}`,
          order_id: o.id,
          table_id: o.table_id,
          table_number: String(o.table_number || 'Table'),
          floor: o.floor || null,
          building: o.building || null,
          customer_name: o.customer_name || 'Dine-In Guest',
          customer_phone: o.customer_phone || '',
          payment_method: o.payment_method || 'CASH',
          total_amount: o.total_amount || 0,
          currency: o.currency || 'Rs.',
          status: 'PENDING',
          created_at: o.bill_requested_at || o.updated_at || o.created_at,
          notes: o.order_notes,
          targetOrder: o,
        });
      });

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Filter by table assignment if user is a waiter
    if (activeStation === 'WAITER' && currentStaffId) {
      return list.filter((req) => {
        const table = tables.find((t) => t.id === req.table_id);
        if (table && table.assigned_waiter_ids && table.assigned_waiter_ids.length > 0) {
          return table.assigned_waiter_ids.includes(currentStaffId);
        }
        return true;
      });
    }

    return list;
  }, [serviceRequests, orders, activeStation, currentStaffId, tables]);

  // Station Stats
  const stationCounts = useMemo(() => {
    const kitchenActive = orders.filter((o) => 
      o.status !== 'CANCELLED' && o.status !== 'COMPLETED' &&
      o.items.some((it) => it.status !== 'CANCELLED' && (it.station || determineItemStation(it)) === 'KITCHEN') &&
      (o.status === 'RECEIVED' || o.status === 'PREPARING')
    ).length;

    const barActive = orders.filter((o) => 
      o.status !== 'CANCELLED' && o.status !== 'COMPLETED' &&
      o.items.some((it) => it.status !== 'CANCELLED' && (it.station || determineItemStation(it)) === 'BAR') &&
      (o.status === 'RECEIVED' || o.status === 'PREPARING')
    ).length;

    let waiterReady = orders.filter((o) => o.status === 'READY');
    
    // Filter by table assignment if user is a waiter
    if (activeStation === 'WAITER' && currentStaffId) {
      waiterReady = waiterReady.filter((o) => {
        const table = tables.find((t) => t.id === o.table_id);
        if (table && table.assigned_waiter_ids && table.assigned_waiter_ids.length > 0) {
          return table.assigned_waiter_ids.includes(currentStaffId);
        }
        return true; // if unassigned, anyone can see it
      });
    }

    const pendingBillRequests = unifiedBillRequests.length;

    return { kitchenActive, barActive, waiterReady: waiterReady.length, pendingBillRequests, pendingTableCalls: pendingTableCalls.length };
  }, [orders, unifiedBillRequests, pendingTableCalls, activeStation, currentStaffId, tables]);

  // Audio alert chime whenever new bill or payment settlement requests arrive
  const prevWaiterReadyCountRef = useRef<number>(0);
  const prevUnifiedBillCountRef = useRef<number>(0);
  const prevTableCallsCountRef = useRef<number>(0);
  const isFirstRenderBillRef = useRef<boolean>(true);

  useEffect(() => {
    if (isFirstRenderBillRef.current) {
      prevWaiterReadyCountRef.current = stationCounts?.waiterReady || 0;
      isFirstRenderBillRef.current = false;
      prevUnifiedBillCountRef.current = unifiedBillRequests.length;
    prevTableCallsCountRef.current = pendingTableCalls.length;
      return;
    }
    // Chime bill requests ONLY on the WAITER station, never on Kitchen
    if (activeStation === 'WAITER') {
      if (unifiedBillRequests.length > prevUnifiedBillCountRef.current || pendingTableCalls.length > prevTableCallsCountRef.current) {
        playBillChime();
      }
      if (stationCounts.waiterReady > prevWaiterReadyCountRef.current) {
        playChime();
      }
    }
    prevUnifiedBillCountRef.current = unifiedBillRequests.length;
    prevWaiterReadyCountRef.current = stationCounts.waiterReady;
  }, [unifiedBillRequests.length, pendingTableCalls.length, stationCounts.waiterReady, activeStation]);

  // Repeated Items Batch Queue for Kitchen & Bar Stations:
  // If one customer orders an item (Queue 1) and has NOT started being prepared (status !== 'PREPARING' && status !== 'READY' && status !== 'SERVED'),
  // and another customer orders the same dish in Queue 2 (also not started),
  // they appear grouped together in the Batch Prep Queue at the bottom so the cook can prepare them together.
  // Once an item in Queue 1 begins preparation or is ready/served, it is excluded.
  const batchPrepRepeatedGroups = useMemo(() => {
    if (kdsPrintMode === 'PRINT_ONLY') return [];
    // Only relevant for Kitchen and Bar prep stations
    if (activeStation !== 'KITCHEN' && activeStation !== 'BAR') {
      return [];
    }

    // Active uncompleted orders
    const activeOrders = orders.filter(
      (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'SERVED'
    );

    // Map: standardizedItemName -> list of unstarted instances across different tickets
    const dishMap = new Map<
      string,
      {
        dishName: string;
        station: string;
        ordersList: Array<{
          orderId: string;
          orderIndex: number;
          ticketId: string;
          tableNumber: string;
          orderCreatedAt: string | Date;
          itemIndex: number;
          itemKey?: string;
          itemId: string;
          quantity: number;
          specialInstructions?: string;
          status: OrderStatus;
        }>;
      }
    >();

    // Sort orders chronologically by earliest unserved item queue time (Queue 1 is older, Queue 2 is newer)
    const sortedOrders = [...activeOrders].sort(
      (a, b) => getStationOrderQueueTime(a) - getStationOrderQueueTime(b)
    );

    sortedOrders.forEach((order, orderIdx) => {
      order.items.forEach((item, itemIdx) => {
        const itemStation = item.station || determineItemStation(item);
        if (activeStation === 'KITCHEN' && itemStation === 'BAR') return;
        if (activeStation === 'BAR' && itemStation !== 'BAR') return;

        // An item qualifies for batch cooking as long as it has NOT been completed or ready
        // (strictly not READY, not SERVED, not COMPLETED, not CANCELLED).
        // If the cook clicks "Start Batch", the card stays visible while PREPARING until dishes are ready and "All Ready" is clicked.
        const isNotFinished =
          item.status !== 'READY' &&
          item.status !== 'SERVED' &&
          item.status !== 'COMPLETED' &&
          item.status !== 'CANCELLED';

        if (!isNotFinished) return;

        const displayName = item.variant_name ? `${item.name.trim()} [${item.variant_name}]` : item.name.trim();
        const normalizedName = displayName.toLowerCase();

        if (!dishMap.has(normalizedName)) {
          dishMap.set(normalizedName, {
            dishName: displayName,
            station: itemStation,
            ordersList: [],
          });
        }

        dishMap.get(normalizedName)!.ordersList.push({
          orderId: order.id,
          orderIndex: orderIdx + 1,
          ticketId: order.id.slice(-5).toUpperCase(),
          tableNumber: String(order.table_number || 'Takeaway'),
          orderCreatedAt: order.created_at,
          itemIndex: itemIdx,
          itemKey: item.item_key,
          itemId: item.item_id,
          quantity: item.quantity || 1,
          specialInstructions: item.special_instructions,
          status: item.status || 'RECEIVED',
        });
      });
    });

    // We only show dishes that appear in AT LEAST 2 different active order tickets!
    const repeated = Array.from(dishMap.values())
      .filter((group) => {
        const distinctOrderIds = new Set(group.ordersList.map((x) => x.orderId));
        return distinctOrderIds.size >= 2;
      })
      .map((group) => {
        const totalQuantity = group.ordersList.reduce((sum, x) => sum + x.quantity, 0);
        const preparingCount = group.ordersList.filter((x) => x.status === 'PREPARING').length;
        const allPreparing = group.ordersList.every((x) => x.status === 'PREPARING');
        const isBatchStarted = group.ordersList.some((x) => x.status === 'PREPARING');
        return {
          ...group,
          totalQuantity,
          distinctOrderCount: new Set(group.ordersList.map((x) => x.orderId)).size,
          preparingCount,
          allPreparing,
          isBatchStarted,
        };
      });

    return repeated;
  }, [orders, activeStation]);

  // Elapsed Time Calculator
  const getElapsedMinutes = (dateVal: string | Date) => {
    const created = new Date(dateVal).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - created) / 60000));
  };

  // Reusable Station Orders Grid Renderer
  const renderOrdersList = (isFullScreenMode: boolean) => {
    const pendingBillRequests = unifiedBillRequests;

    return (
      <div className="space-y-5">
        {/* Note: Kitchen Station is focused strictly on cooking; no waiter alerts or bill requests are displayed here */}

        
        {/* WAITER & SERVICE STATION: ACTIVE TABLE ASSISTANCE & CALL WAITER QUEUE */}
        {activeStation === 'WAITER' && pendingTableCalls.length > 0 && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
              isFullScreenMode
                ? 'bg-rose-950/40 border-rose-500/60 text-rose-100'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-rose-500 text-white rounded-xl shadow-xs animate-bounce shrink-0">
                  <BellRing className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-black text-sm sm:text-base flex items-center gap-2">
                    <span>Active Table Calls ({pendingTableCalls.length})</span>
                    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                      Assistance Requested
                    </span>
                  </h4>
                  <p className="text-xs opacity-85">
                    Customer scanned their table QR and clicked "Call Waiter". Attend to the table and click "Acknowledge" to clear the queue card.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={playBillChime}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-rose-400/80 hover:bg-rose-400/20 transition cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Ping Alert Sound"
              >
                <Volume2 className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">Sound</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {pendingTableCalls.map(({ table, matchingOrder }) => {
                const callTime = table.waiter_ping?.timestamp ? new Date(table.waiter_ping.timestamp) : new Date();
                const elapsed = getElapsedMinutes(callTime);
                const isLate = elapsed >= 5;
                const isProcessing = actionInProgress === table.id;

                return (
                  <div
                    key={`table-call-${table.id}`}
                    id={`kds-table-call-${table.id}`}
                    className={`rounded-3xl border shadow-md overflow-hidden flex flex-col justify-between transition-all ${
                      isFullScreenMode
                        ? 'bg-zinc-900 border-rose-500 ring-2 ring-rose-500/30'
                        : 'bg-white border-rose-300 ring-2 ring-rose-400/30'
                    }`}
                  >
                    {/* Header */}
                    <div
                      className={`p-4 sm:p-5 border-b ${
                        isFullScreenMode
                          ? 'bg-rose-950/60 border-rose-900/60 text-white'
                          : 'bg-rose-50/80 border-rose-200 text-rose-950'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-black ${isFullScreenMode ? 'text-white' : 'text-zinc-900'}`}>
                              Table #{table.table_number}
                            </span>
                            {(table.floor || table.building) && (
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                                  isFullScreenMode
                                    ? 'text-rose-300 bg-rose-900/40 border-rose-700'
                                    : 'text-rose-800 bg-rose-100 border-rose-300'
                                }`}
                              >
                                {[table.floor, table.building].filter(Boolean).join(' • ')}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${isFullScreenMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                            <span className={`font-semibold ${isFullScreenMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                              {matchingOrder?.customer_name || 'Dine-In Guest'}
                            </span>
                            {matchingOrder?.order_number && (
                              <>
                                <span className="text-zinc-400">•</span>
                                <span className="font-mono text-[11px] text-zinc-400">Ref: {matchingOrder.order_number}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Timer & Call Badge */}
                        <div className="text-right space-y-1">
                          <div
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold font-mono ${
                              isLate
                                ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                                : isFullScreenMode
                                ? 'bg-rose-900/50 text-rose-300 border border-rose-700'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5 text-rose-500" />
                            <span>{elapsed}m ago</span>
                          </div>

                          <div className="text-[11px] font-extrabold uppercase">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500 text-white shadow-xs font-black animate-pulse">
                              <BellRing className="w-3 h-3" />
                              <span>Calling Waiter</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 sm:p-5 space-y-3 flex-1">
                      <div className={`p-3.5 rounded-2xl border text-xs ${
                        isFullScreenMode
                          ? 'bg-zinc-950/80 border-rose-500/40 text-zinc-200'
                          : 'bg-rose-50/50 border-rose-200 text-zinc-800'
                      }`}>
                        <div className="flex items-center gap-2 font-bold text-rose-600 mb-1">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Guest called for waiter service</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          Table #{table.table_number} needs staff assistance. Click below once attended to clear this card from the queue.
                        </p>
                        {table.waiter_ping?.timestamp && (
                          <div className="mt-2 text-[10px] font-mono text-zinc-400">
                            Call Time: {renderFormattedDate(table.waiter_ping.timestamp, billingFormat)}
                          </div>
                        )}
                      </div>

                      {matchingOrder && matchingOrder.items && matchingOrder.items.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                            <span>Dishes on Table</span>
                            <span>{matchingOrder.items.length} items</span>
                          </div>
                          <div className="text-xs text-zinc-600 font-medium truncate">
                            {matchingOrder.items.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer / Action Button */}
                    <div className={`p-4 border-t ${
                      isFullScreenMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}>
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={isProcessing}
                        onClick={() => handleAcknowledgeTableCall(table.id)}
                        leftIcon={<BellOff className="w-4 h-4" />}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black text-xs py-2.5 shadow-sm active:scale-95 transition"
                      >
                        {isProcessing ? 'Acknowledging...' : 'Acknowledge & Clear Call'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WAITER & SERVICE STATION: FULL-SIZED BILL REQUEST CARDS (IDENTICAL IN SHAPE & FORM TO PICKUP CARDS) */}
        {activeStation === 'WAITER' && pendingBillRequests.length > 0 && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
              isFullScreenMode
                ? 'bg-amber-950/40 border-amber-500/60 text-amber-100'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-amber-500 text-zinc-950 rounded-xl shadow-xs animate-bounce shrink-0">
                  <Receipt className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-black text-sm sm:text-base flex items-center gap-2">
                    <span>Active Guest Bill & Settlement Requests ({pendingBillRequests.length})</span>
                    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950">
                      Waiter Action Required
                    </span>
                  </h4>
                  <p className="text-xs opacity-85">
                    Deliver the bill folio to the table and click "Folio Delivered". The cashier settles the bill in Finance & POS.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={playBillChime}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-amber-400/80 hover:bg-amber-400/20 transition cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Ping Alert Sound"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Sound</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {pendingBillRequests.map((req) => {
                const targetOrder = req.targetOrder || orders.find(
                  (o) => o.id === req.order_id || (o.table_number && String(o.table_number) === String(req.table_number) && o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
                );
                const elapsed = getElapsedMinutes(req.created_at);
                const isLate = elapsed >= 10;
                const isProcessing = actionInProgress === req.id || (targetOrder && actionInProgress === targetOrder.id);

                return (
                  <div
                    key={`bill-request-${req.id}`}
                    id={`kds-bill-card-${req.id}`}
                    className={`rounded-3xl border shadow-xs overflow-hidden flex flex-col justify-between transition-all ${
                      isFullScreenMode
                        ? 'bg-zinc-900 border-amber-500 ring-2 ring-amber-500/30 shadow-lg'
                        : 'bg-white border-amber-300 ring-2 ring-amber-400/30 shadow-md'
                    }`}
                  >
                    {/* Bill Request Card Header */}
                    <div
                      className={`p-4 sm:p-5 border-b ${
                        isFullScreenMode
                          ? 'bg-amber-950/60 border-amber-900/60 text-white'
                          : 'bg-amber-50/80 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-black ${isFullScreenMode ? 'text-white' : 'text-zinc-900'}`}>
                              Table #{req.table_number}
                            </span>
                            {(req.floor || req.building || targetOrder?.floor || targetOrder?.building) && (
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                                  isFullScreenMode
                                    ? 'text-amber-300 bg-amber-900/40 border-amber-700'
                                    : 'text-amber-800 bg-amber-100 border-amber-300'
                                }`}
                              >
                                {[req.floor || targetOrder?.floor, req.building || targetOrder?.building].filter(Boolean).join(' • ')}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${isFullScreenMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                            <span className={`font-semibold ${isFullScreenMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                              {req.customer_name || targetOrder?.customer_name || 'Dine-In Guest'}
                            </span>
                            <span className="text-zinc-400">•</span>
                            <span className="font-mono text-[11px] text-zinc-400">Ref: {targetOrder?.order_number || (req as any).order_number || req.id.slice(0, 8)}</span>
                          </div>
                        </div>

                        {/* Timer & Bill Status Badge */}
                        <div className="text-right space-y-1">
                          <div
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold font-mono ${
                              isLate
                                ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                                : isFullScreenMode
                                ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span>{elapsed}m ago</span>
                          </div>

                          <div className="text-[11px] font-extrabold uppercase">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950 shadow-xs font-black">
                              <Receipt className="w-3 h-3" />
                              <span>Bill Requested</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bill Request Card Body */}
                    <div className="p-4 sm:p-5 space-y-3.5 flex-1">
                      {/* Grand Total & Payment Mode Box */}
                      <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                        isFullScreenMode
                          ? 'bg-zinc-950/80 border-amber-500/40 text-zinc-100'
                          : 'bg-amber-50/70 border-amber-200 text-amber-950'
                      }`}>
                        <div>
                          <span className="text-[10px] uppercase font-extrabold tracking-wider opacity-70 block">
                            Total Payable
                          </span>
                          <span className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                            {req.currency || targetOrder?.currency || 'Rs.'} {(req.total_amount || targetOrder?.total_amount || 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-extrabold tracking-wider opacity-70 block">
                            Payment Mode
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-black uppercase px-2.5 py-1 rounded-xl bg-amber-500 text-zinc-950 shadow-2xs">
                            {req.payment_method === 'card' ? <CreditCard className="w-3.5 h-3.5" /> :
                             req.payment_method === 'qr' || req.payment_method === 'upi' ? <QrCode className="w-3.5 h-3.5" /> :
                             <Banknote className="w-3.5 h-3.5" />}
                            <span>{((req.payment_method || targetOrder?.payment_method || 'CASH') === 'upi' ? 'QR' : (req.payment_method || targetOrder?.payment_method || 'CASH')).toUpperCase()}</span>
                          </span>
                        </div>
                      </div>

                      {/* Items on Table Bill */}
                      {targetOrder && targetOrder.items && targetOrder.items.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-70 flex items-center justify-between">
                            <span>Dishes on Table ({targetOrder.items.length})</span>
                            <span className="font-mono">{targetOrder.currency} {targetOrder.subtotal?.toLocaleString() || targetOrder.total_amount.toLocaleString()}</span>
                          </div>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {targetOrder.items.map((item, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                                  isFullScreenMode
                                    ? 'bg-zinc-800/60 border-zinc-700/60 text-zinc-200'
                                    : 'bg-zinc-50 border-zinc-200/80 text-zinc-800'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono font-black text-amber-500 shrink-0">{item.quantity}x</span>
                                  <span className="font-semibold truncate">{item.name}</span>
                                </div>
                                <span className="font-mono text-xs font-bold shrink-0 opacity-80">
                                  {targetOrder.currency} {(item.price * item.quantity).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                          isFullScreenMode ? 'bg-zinc-800/40 border-zinc-800 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-500'
                        }`}>
                          <span>Guest requested bill folio folder at Table #{req.table_number}. Please bring bill check and cash folio / terminal.</span>
                        </div>
                      )}

                      {req.notes && (
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-600 dark:text-amber-300">
                          <strong>Note:</strong> {req.notes}
                        </div>
                      )}
                    </div>

                    {/* Bill Request Card Footer Actions (Folio Delivered) */}
                    <div
                      className={`p-4 sm:p-5 border-t space-y-2 ${
                        isFullScreenMode ? 'bg-zinc-850 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeBillRequest(req.id, req.order_id || targetOrder?.id)}
                          className={`flex-1 py-2 px-3 rounded-xl border font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            isFullScreenMode
                              ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300'
                              : 'border-zinc-300 hover:bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 text-amber-500" />
                          <span>Folio Delivered</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => playBillChime()}
                          className={`p-2 rounded-xl border transition cursor-pointer ${
                            isFullScreenMode
                              ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-400'
                              : 'border-zinc-300 hover:bg-zinc-100 text-zinc-600'
                          }`}
                          title="Ping Sound"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading && orders.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`rounded-3xl border p-6 h-72 animate-pulse space-y-4 ${
                  isFullScreenMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div className={`h-6 rounded-md w-1/2 ${isFullScreenMode ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
                <div className={`h-4 rounded-md w-3/4 ${isFullScreenMode ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
                <div className={`h-24 rounded-xl ${isFullScreenMode ? 'bg-zinc-800/60' : 'bg-zinc-100'}`} />
              </div>
            ))}
          </div>
        )}

        {!loading && stationOrders.length === 0 && (activeStation !== 'WAITER' || (pendingBillRequests.length === 0 && pendingTableCalls.length === 0)) && (
          <div
            className={`rounded-3xl border p-12 text-center space-y-3 ${
              isFullScreenMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
            }`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
                isFullScreenMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-400'
              }`}
            >
              {activeStation === 'BAR' ? (
                <Wine className="w-7 h-7" />
              ) : activeStation === 'WAITER' ? (
                <Bell className="w-7 h-7" />
              ) : (
                <ChefHat className="w-7 h-7" />
              )}
            </div>
            <h3 className={`text-base font-bold ${isFullScreenMode ? 'text-white' : 'text-zinc-900'}`}>
              No {activeStation === 'BAR' ? 'bar & beverage' : activeStation === 'WAITER' ? 'waiter service' : 'kitchen'} orders in this queue
            </h3>
            <p className={`text-xs max-w-sm mx-auto ${isFullScreenMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {activeStation === 'BAR'
                ? 'When customers order drinks, mocktails or beverages, they appear instantly in this dedicated bar station.'
                : activeStation === 'WAITER'
                ? 'When dishes are prepared by the kitchen or bar, ping notifications appear here for delivery.'
                : 'New customer food orders will appear here in real-time as guests place them from their tables.'}
            </p>
            {statusFilter !== 'ACTIVE' && (
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className="text-xs text-amber-500 font-bold hover:underline cursor-pointer"
              >
                Switch to Active Queue
              </button>
            )}
          </div>
        )}

        {stationOrders.length > 0 && (
          <div className="space-y-4">
            {activeStation === 'WAITER' && pendingBillRequests.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <Bell className="w-4 h-4 text-blue-500" />
                <h4 className={`text-sm font-black uppercase tracking-wider ${
                  isFullScreenMode ? 'text-zinc-300' : 'text-zinc-700'
                }`}>
                  Dishes Ready for Pickup & Delivery ({stationOrders.length})
                </h4>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {stationOrders.map((order) => {
          const queueTimeMs = getStationOrderQueueTime(order, order.stationItems);
          const elapsed = Math.max(0, Math.floor((currentTime.getTime() - queueTimeMs) / 60000));
          const isLate = elapsed >= 20;
          const isWarning = elapsed >= 12;
          const isProcessing = actionInProgress === order.id;

          const hasServedStationItems = order.stationItems.some((it) => it.status === 'SERVED');
          const hasUnservedStationItems = order.stationItems.some((it) => it.status !== 'SERVED' && it.status !== 'CANCELLED');
          const isAdditionalRound = hasServedStationItems && hasUnservedStationItems;

          return (
            <div
              key={order.id}
              id={`kds-card-${order.id}`}
              className={`rounded-3xl border shadow-xs overflow-hidden flex flex-col justify-between transition-all ${
                order.bill_requested
                  ? isFullScreenMode
                    ? 'bg-zinc-900 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                    : 'bg-white border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                  : isFullScreenMode
                  ? order.status === 'READY'
                    ? 'bg-zinc-900 border-blue-500/80 ring-2 ring-blue-500/20 shadow-md'
                    : isLate
                    ? 'bg-zinc-900 border-rose-500/80 ring-1 ring-rose-500/30'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  : order.status === 'READY'
                  ? 'bg-white border-blue-300 ring-2 ring-blue-400/20 shadow-md'
                  : isLate
                  ? 'bg-white border-rose-300 ring-1 ring-rose-300'
                  : 'bg-white border-zinc-200'
              }`}
            >
              {/* Order Header Card */}
              <div
                className={`p-4 sm:p-5 border-b ${
                  isFullScreenMode
                    ? order.status === 'READY'
                      ? 'bg-blue-950/70 border-blue-900/60 text-white'
                      : order.status === 'PREPARING'
                      ? 'bg-amber-950/60 border-amber-900/60 text-white'
                      : 'bg-zinc-850 border-zinc-800 text-white'
                    : order.status === 'READY'
                    ? 'bg-blue-50/70 border-blue-200'
                    : order.status === 'PREPARING'
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-zinc-50/80 border-zinc-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-black ${isFullScreenMode ? 'text-white' : 'text-zinc-900'}`}>
                        Order #{order.order_number || order.id.slice(0, 8)}
                      </span>
                      {isAdditionalRound && (
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                            isFullScreenMode
                              ? 'text-amber-300 bg-amber-950/80 border-amber-800'
                              : 'text-amber-800 bg-amber-100 border-amber-300'
                          }`}
                        >
                          Round 2 (Add-on)
                        </span>
                      )}
                      {(order.floor || order.building) && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                            isFullScreenMode
                              ? 'text-zinc-300 bg-zinc-800 border-zinc-700'
                              : 'text-zinc-500 bg-white border-zinc-200'
                          }`}
                        >
                          {[order.floor, order.building].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 flex items-center gap-1.5 ${isFullScreenMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      <span className={`font-semibold ${isFullScreenMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                        {order.customer_name || 'Guest'}
                      </span>
                      <span className="text-zinc-500">•</span>
                      <span className="font-mono text-[11px] text-zinc-400">Table #{order.table_number}</span>
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 kds-order-timestamp ${isFullScreenMode ? 'text-amber-300/80' : 'text-zinc-500'}`}>
                      {renderFormattedDate(order.created_at, billingFormat)}
                    </div>
                  </div>

                  {/* Timer & Status Pill */}
                  <div className="text-right space-y-1 flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => dispatchPrint('KOT', { ...order, date_format_billing: billingFormat })}
                        title="Print Kitchen Ticket"
                        className={`p-1.5 rounded-lg border flex items-center justify-center ${isFullScreenMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700' : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'} transition`}
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <div
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold font-mono ${
                        isLate
                          ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                          : isWarning
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : isFullScreenMode
                          ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                          : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsed}m ago</span>
                    </div>
                    </div>

                    <div className="text-[11px] font-extrabold uppercase">
                      {order.status === 'RECEIVED' && (
                        <span className="text-amber-300 bg-amber-950/80 border border-amber-800/80 px-2 py-0.5 rounded-md">
                          Received
                        </span>
                      )}
                      {order.status === 'PREPARING' && (
                        <span className="text-amber-200 bg-amber-900/90 border border-amber-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400 animate-pulse" /> Preparing
                        </span>
                      )}
                      {order.status === 'READY' && (
                        <span className="text-blue-200 bg-blue-900/90 border border-blue-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Bell className="w-3 h-3 text-blue-400 animate-bounce" /> Prepared!
                        </span>
                      )}
                      {order.status === 'SERVED' && (
                        <span className="text-emerald-300 bg-emerald-950/90 border border-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <CheckCheck className="w-3 h-3 text-emerald-400" /> Served
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* General order notes */}
                {order.order_notes && (
                  <div
                    className={`mt-3 p-2 rounded-xl text-xs font-medium flex items-start gap-1.5 border ${
                      isFullScreenMode
                        ? 'bg-amber-950/80 text-amber-200 border-amber-800/70'
                        : 'bg-amber-100/80 text-amber-950 border-amber-200'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Note: "{order.order_notes}"</span>
                  </div>
                )}

                {/* Guest Requested Bill Alert */}
                {order.bill_requested && (
                  <div className="mt-3 p-2.5 bg-amber-500/20 border-2 border-amber-500/80 rounded-xl flex items-center justify-between text-xs animate-pulse">
                    <div className="flex items-center gap-2 font-black text-amber-950 dark:text-amber-200">
                      <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>GUEST REQUESTED BILL ({(order.payment_method || 'CASH').toUpperCase()})</span>
                    </div>
                    <span className="font-mono font-black text-amber-950 dark:text-amber-100">
                      {order.currency} {order.total_amount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Items List for this station */}
              <div className="p-4 sm:p-5 space-y-3 flex-1">
                <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${
                  isFullScreenMode ? 'text-zinc-500' : 'text-zinc-400'
                }`}>
                  <span>
                    {activeStation === 'BAR'
                      ? 'Drinks in this order'
                      : activeStation === 'KITCHEN'
                      ? 'Dishes in this order'
                      : 'All Order Items'}
                  </span>
                  <span>{order.stationItems.length} items</span>
                </div>

                <div className={`space-y-2.5 divide-y ${isFullScreenMode ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
                  {order.stationItems.map((item, idx) => {
                    const isItemReady = item.status === 'READY';
                    const isItemServed = item.status === 'SERVED';
                    const isItemCooking = item.status === 'PREPARING';
                    const isThisItemBusy = actionInProgress === `${order.id}-item-${idx}` || actionInProgress === order.id;

                    return (
                      <div key={idx} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2.5 text-xs">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`w-6 h-6 rounded-lg font-black flex items-center justify-center text-xs shrink-0 ${
                                isFullScreenMode
                                  ? 'bg-zinc-800 text-amber-400 border border-zinc-700'
                                  : 'bg-zinc-900 text-white'
                              }`}
                            >
                              {item.quantity}x
                            </span>
                            <span className={`font-extrabold text-sm ${isFullScreenMode ? 'text-zinc-100' : 'text-zinc-900'}`}>
                              {item.name}
                            </span>
                            {item.variant_name && (
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                [{item.variant_name}]
                              </span>
                            )}

                            {/* Station Badge if in Waiter view */}
                            {activeStation === 'WAITER' && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border flex items-center gap-1 ${
                                  item.station === 'BAR'
                                    ? isFullScreenMode ? 'bg-purple-950 text-purple-300 border-purple-800' : 'bg-purple-50 text-purple-700 border-purple-200'
                                    : isFullScreenMode ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {item.station === 'BAR' ? <Wine className="w-2.5 h-2.5" /> : <ChefHat className="w-2.5 h-2.5" />}
                                {item.station === 'BAR' ? 'Bar' : 'Kitchen'}
                              </span>
                            )}

                            {/* Live Status Tag */}
                            {isItemReady && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 shadow-xs ${
                                  isFullScreenMode
                                    ? 'bg-blue-950 text-blue-300 border-blue-700'
                                    : 'bg-blue-50 text-blue-800 border-blue-300'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3 text-blue-500" />
                                Ready to Serve!
                              </span>
                            )}

                            {isItemServed && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                                  isFullScreenMode
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                <CheckCheck className="w-3 h-3 text-emerald-500" />
                                Served
                              </span>
                            )}

                            {isItemCooking && !isItemReady && !isItemServed && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                                  isFullScreenMode
                                    ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                <Flame className="w-3 h-3 text-amber-500" />
                                Cooking
                              </span>
                            )}
                          </div>

                          {item.special_instructions && (
                            <div className={`text-[11px] font-semibold italic pl-8 ${
                              isFullScreenMode ? 'text-amber-300/90' : 'text-amber-800'
                            }`}>
                              ↳ "{item.special_instructions}"
                            </div>
                          )}
                        </div>

                        {/* Station Action Button per Item */}
                        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                          {(activeStation === 'KITCHEN' || activeStation === 'BAR') && (
                            <>
                              {!isItemReady && !isItemServed ? (
                                <button
                                  type="button"
                                  id={`btn-item-ready-${order.id}-${idx}`}
                                  disabled={isThisItemBusy}
                                  onClick={() => handleUpdateItemStatus(order.id, { itemKey: item.item_key, itemId: item.item_id, index: idx }, 'READY')}
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 cursor-pointer shadow-xs ${
                                    isFullScreenMode
                                      ? 'bg-zinc-800 hover:bg-blue-600 text-zinc-200 hover:text-white border-zinc-700 hover:border-blue-500'
                                      : 'bg-white hover:bg-blue-600 text-zinc-800 hover:text-white border-zinc-300 hover:border-blue-600'
                                  }`}
                                  title="Mark this specific dish/beverage prepared and ready"
                                >
                                  {item.station === 'BAR' || activeStation === 'BAR' ? (
                                    <Wine className="w-3 h-3 text-purple-400" />
                                  ) : (
                                    <ChefHat className="w-3 h-3 text-blue-500" />
                                  )}
                                  <span>Ready</span>
                                </button>
                              ) : isItemReady ? (
                                <button
                                  type="button"
                                  disabled={isThisItemBusy}
                                  onClick={() => handleUpdateItemStatus(order.id, { itemKey: item.item_key, itemId: item.item_id, index: idx }, 'PREPARING')}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition cursor-pointer ${
                                    isFullScreenMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                                  }`}
                                  title="Mark as cooking (undo ready)"
                                >
                                  Undo
                                </button>
                              ) : null}
                            </>
                          )}

                          {activeStation === 'WAITER' && isItemReady && !isItemServed && (
                            <button
                              type="button"
                              id={`btn-item-serve-${order.id}-${idx}`}
                              disabled={isThisItemBusy}
                              onClick={() => canDeliver ? handleUpdateItemStatus(order.id, { itemKey: item.item_key, itemId: item.item_id, index: idx }, 'SERVED') : onRequestRoleSignIn?.()}
                              className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1 cursor-pointer transition"
                              title="Mark this item delivered to table"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Serve</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Station Action Buttons Footer */}
              <div
                className={`p-4 sm:p-5 border-t space-y-2.5 ${
                  isFullScreenMode ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-100'
                }`}
              >
                {/* For Kitchen / Bar Cook View */}
                {(activeStation === 'KITCHEN' || activeStation === 'BAR') && (
                  <div className="space-y-2">
                    {order.stationItems.some((it) => it.status !== 'READY' && it.status !== 'SERVED') ? (
                      <div className="flex items-center gap-2">
                        {order.status === 'RECEIVED' && (
                          <Button
                            id={`btn-start-prep-${order.id}`}
                            variant="primary"
                            size="md"
                            disabled={isProcessing}
                            onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                            leftIcon={<Flame className="w-4 h-4 text-amber-200" />}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                          >
                            {isProcessing ? 'Updating...' : 'Start Cooking Station Items'}
                          </Button>
                        )}

                        <Button
                          id={`btn-mark-all-station-ready-${order.id}`}
                          variant="primary"
                          size="md"
                          disabled={isProcessing}
                          onClick={() => handleMarkAllStationItemsReady(order)}
                          leftIcon={activeStation === 'BAR' ? <Wine className="w-4 h-4" /> : <ChefHat className="w-4 h-4" />}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                        >
                          {isProcessing ? 'Updating...' : `All ${activeStation === 'BAR' ? 'Drinks' : 'Dishes'} Ready (Ping Waiter)`}
                        </Button>
                      </div>
                    ) : order.stationItems.every((it) => it.status === 'SERVED') ? (
                      <div
                        className={`w-full p-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${
                          isFullScreenMode
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <CheckCheck className="w-4 h-4 text-emerald-400" />
                        All {activeStation === 'BAR' ? 'Drinks' : 'Dishes'} Delivered to Table #{order.table_number}
                      </div>
                    ) : (
                      <div
                        className={`w-full flex items-center justify-center p-2.5 rounded-xl text-xs font-bold border ${
                          isFullScreenMode
                            ? 'bg-blue-950/90 text-blue-200 border-blue-800'
                            : 'bg-blue-100 text-blue-900 border-blue-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-400" />
                          All {activeStation === 'BAR' ? 'Drinks' : 'Dishes'} Prepared & Waiter Notified
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* For Waiter View */}
                {activeStation === 'WAITER' && (
                  <div className="space-y-2">
                    {order.status === 'READY' || order.items.every((it) => it.status === 'READY' || it.status === 'SERVED') ? (
                      <Button
                        id={`btn-waiter-deliver-${order.id}`}
                        variant="primary"
                        size="md"
                        disabled={isProcessing}
                        onClick={() => handleUpdateStatus(order.id, 'SERVED')}
                        leftIcon={<CheckCheck className="w-4 h-4" />}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 shadow-md cursor-pointer"
                      >
                        {isProcessing ? 'Updating...' : `Deliver All to Table #${order.table_number}`}
                      </Button>
                    ) : order.status === 'SERVED' ? (
                      <div
                        className={`w-full p-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${
                          isFullScreenMode
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <CheckCheck className="w-4 h-4 text-emerald-400" />
                        Delivered & Served
                      </div>
                    ) : (
                      <div
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold ${
                          isFullScreenMode
                            ? 'bg-amber-950/60 border-amber-800/80 text-amber-200'
                            : 'bg-amber-50 rounded-xl border border-amber-200 text-amber-900'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                          {order.items.some((it) => it.status === 'READY')
                            ? 'Some dishes ready for pickup!'
                            : order.status === 'PREPARING'
                            ? 'Kitchen is preparing...'
                            : 'Received in queue'}
                        </span>
                        <span className="text-[11px] text-amber-400 font-mono">
                          {order.items.filter((it) => it.status === 'READY').length} Ready
                        </span>
                      </div>
                    )}


                  </div>
                )}
              </div>
            </div>
          );
        })}
            </div>
          </div>
        )}

        {/* BOTTOM SECTION: REPEATED ITEMS BATCH PREP QUEUE */}
        {activeStation !== 'WAITER' && batchPrepRepeatedGroups.length > 0 && (
          <div
            id="kds-batch-prep-queue"
            className={`mt-8 pt-6 border-t-2 rounded-3xl p-5 sm:p-6 transition-all shadow-md animate-in fade-in duration-300 ${
              isFullScreenMode
                ? 'bg-zinc-900/90 border-amber-500/50 text-zinc-100 ring-1 ring-amber-500/30'
                : 'bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-white border-amber-300 text-zinc-900 shadow-sm'
            }`}
          >
            {/* Batch Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {batchPrepRepeatedGroups.map((group) => {
                const targets = group.ordersList.map((x) => ({
                  orderId: x.orderId,
                  itemIndex: x.itemIndex,
                  itemKey: x.itemKey,
                  itemId: x.itemId,
                }));

                return (
                  <div
                    key={`batch-dish-${group.dishName}`}
                    id={`kds-batch-card-${group.dishName.replace(/\s+/g, '-').toLowerCase()}`}
                    className={`rounded-2xl border p-4 flex flex-col justify-between transition hover:shadow-md ${
                      group.isBatchStarted
                        ? isFullScreenMode
                          ? 'bg-amber-950/40 border-amber-500/80 text-zinc-100 shadow-md ring-1 ring-amber-500/50'
                          : 'bg-amber-50/70 border-amber-400 text-zinc-900 shadow-md ring-1 ring-amber-400/50'
                        : isFullScreenMode
                        ? 'bg-zinc-950/80 border-zinc-700 text-zinc-100 hover:border-amber-500/70'
                        : 'bg-white border-amber-200 text-zinc-900 hover:border-amber-400'
                    }`}
                  >
                    <div>
                      {/* Top Row: Dish Name & Total Quantity Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm sm:text-base font-black flex items-center gap-2 flex-wrap">
                            <span>{group.dishName}</span>
                            {group.isBatchStarted && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                                <Flame className="w-3 h-3 animate-pulse" />
                                <span>Cooking in Batch</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-zinc-400">
                            Across {group.distinctOrderCount} tickets • {group.isBatchStarted ? 'Card stays open until All Ready' : 'Unstarted batch'}
                          </span>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="px-3 py-1 rounded-xl bg-amber-500 text-zinc-950 font-black text-sm shadow-xs flex items-center gap-1">
                            <span>Total ×{group.totalQuantity}</span>
                          </span>
                        </div>
                      </div>

                      {/* Queues Breakdown */}
                      <div className="mt-3 space-y-1.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 block">
                          Waiting in Ticket Queues:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {group.ordersList.map((inst, i) => (
                            <span
                              key={`${inst.orderId}-${inst.itemIndex}`}
                              className={`text-xs px-2.5 py-1 rounded-lg border font-mono font-bold flex items-center gap-1.5 ${
                                inst.status === 'PREPARING'
                                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-500 font-extrabold'
                                  : isFullScreenMode
                                  ? 'bg-zinc-800/80 border-zinc-700 text-amber-300'
                                  : 'bg-amber-50 border-amber-200 text-amber-950'
                              }`}
                              title={`Order #${inst.ticketId} - Table ${inst.tableNumber} (${inst.status})`}
                            >
                              <span className="opacity-75">#{inst.orderIndex} (T#{inst.tableNumber})</span>
                              <span className="font-black text-amber-600 dark:text-amber-400">×{inst.quantity}</span>
                              {inst.status === 'PREPARING' && <Flame className="w-3 h-3 text-amber-500 animate-pulse" />}
                              {inst.specialInstructions && <span className="text-[10px] italic text-zinc-400">"{inst.specialInstructions}"</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Batch Actions */}
                    <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                      <Button
                        id={`btn-batch-start-${group.dishName.replace(/\s+/g, '-').toLowerCase()}`}
                        variant="primary"
                        size="sm"
                        onClick={() => handleBatchUpdateItemStatus(targets, 'PREPARING')}
                        leftIcon={<Flame className="w-3.5 h-3.5 text-zinc-950" />}
                        className={`flex-1 font-black text-xs py-2 shadow-xs cursor-pointer ${
                          group.isBatchStarted
                            ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 ring-1 ring-amber-500/50'
                            : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                        }`}
                      >
                        {group.isBatchStarted ? `Cooking Batch (×${group.totalQuantity})` : `Start Batch (×${group.totalQuantity})`}
                      </Button>

                      <Button
                        id={`btn-batch-ready-${group.dishName.replace(/\s+/g, '-').toLowerCase()}`}
                        variant="outline"
                        size="sm"
                        onClick={() => handleBatchUpdateItemStatus(targets, 'READY')}
                        leftIcon={<Check className="w-3.5 h-3.5 text-emerald-600" />}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold text-xs py-2 cursor-pointer"
                        title="Mark all orders for this dish as ready and complete this batch card"
                      >
                        All Ready
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // FULL SCREEN VIEWPORT TAKEOVER
  if (isFullScreen) {
    return (
      <div
        id="kds-fullscreen-overlay"
        className="fixed inset-0 z-50 bg-zinc-950 text-zinc-100 flex flex-col h-screen w-screen overflow-hidden select-none"
      >
        {/* Full Screen Top Navigation & Control Bar */}
        <header className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Station Title & Switcher */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs ${
                  activeStation === 'KITCHEN'
                    ? 'bg-amber-500 text-white'
                    : activeStation === 'BAR'
                    ? 'bg-purple-600 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {activeStation === 'KITCHEN' ? (
                  <ChefHat className="w-5 h-5" />
                ) : activeStation === 'BAR' ? (
                  <Wine className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-base font-black text-white flex items-center gap-2">
                  <span>
                    {activeStation === 'KITCHEN'
                      ? 'Kitchen Station'
                      : activeStation === 'BAR'
                      ? 'Bar & Beverage Station'
                      : 'Waiter & Service Station'}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-amber-400 border border-zinc-700">
                    Full Screen
                  </span>
                </div>
                <div className="text-xs text-zinc-400">
                  {activeStation === 'KITCHEN'
                    ? 'Dishes & Cook Queue'
                    : activeStation === 'BAR'
                    ? 'Drinks, Cocktails & Shakes'
                    : 'Ready-to-Serve Dish Pickup & Delivery'}
                </div>
              </div>
            </div>

            {/* Quick station tabs within Full Screen */}
            <div className="hidden lg:flex items-center bg-zinc-800/80 p-1 rounded-xl border border-zinc-700/60 gap-1 text-xs font-bold">
              {defaultStation !== 'WAITER' && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveStation('KITCHEN')}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                      activeStation === 'KITCHEN'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>Kitchen</span>
                    {stationCounts.kitchenActive > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-zinc-950/60 font-black">
                        {stationCounts.kitchenActive}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveStation('BAR')}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                      activeStation === 'BAR'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5" />
                    <span>Bar & Beverage</span>
                    {stationCounts.barActive > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-zinc-950/60 font-black">
                        {stationCounts.barActive}
                      </span>
                    )}
                  </button>
                </>
              )}

              {defaultStation === 'WAITER' && (
                <button
                  type="button"
                  onClick={() => setActiveStation('WAITER')}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                    activeStation === 'WAITER'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Waiter & Service</span>
                  {stationCounts.pendingBillRequests > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-400 text-zinc-950 font-black animate-bounce flex items-center gap-0.5" title="Guest Bill Requests">
                      <Receipt className="w-2.5 h-2.5" />
                      {stationCounts.pendingBillRequests}
                    </span>
                  )}
                  {stationCounts.pendingTableCalls > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500 text-white font-black animate-pulse flex items-center gap-0.5" title="Guest Calling Waiter">
                      <BellRing className="w-2.5 h-2.5" />
                      {stationCounts.pendingTableCalls} Call{stationCounts.pendingTableCalls > 1 ? 's' : ''}
                    </span>
                  )}
                  {stationCounts.waiterReady > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-zinc-950/60 font-black animate-pulse">
                      {stationCounts.waiterReady}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Center: Live Digital Clock & Business */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-400 font-mono text-sm font-black tracking-wider shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>
            {businessName && (
              <span className="text-xs font-semibold text-zinc-400 hidden xl:inline">
                {businessName}
              </span>
            )}
          </div>

          {/* Right: Audio, Refresh & Small Exit Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                soundEnabled
                  ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
              title={soundEnabled ? 'Chime sound enabled' : 'Chime sound muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
              <span className="hidden sm:inline">{soundEnabled ? 'Sound' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={loadFallbackOrders}
              className="p-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Refresh tickets"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            {/* Small Exit Full Screen Button */}
            <button
              id="btn-exit-fullscreen"
              type="button"
              onClick={exitFullScreen}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Exit Full Screen (or press Esc)"
            >
              <Minimize2 className="w-4 h-4 text-zinc-300" />
              <span>Exit Full Screen</span>
              <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-400 font-mono">
                Esc
              </kbd>
            </button>
          </div>
        </header>

        {/* Sub-header Filter & Search Bar */}
        <div className="bg-zinc-900/90 border-b border-zinc-800 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search table, customer or dish..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white shadow-xs whitespace-nowrap flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Active Queue
            </span>
          </div>
        </div>

        {/* Fullscreen Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {lastPingedOrder && (
            <div className="p-3 bg-blue-950/80 border border-blue-700 rounded-2xl flex items-center justify-between gap-3 text-blue-200 animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-blue-400 animate-bounce shrink-0" />
                <div className="text-xs font-bold">Dish Prepared Notification Ping Sent to Waiters!</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStation('WAITER')}
                className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 cursor-pointer whitespace-nowrap"
              >
                View Waiter Queue →
              </button>
            </div>
          )}

          {renderOrdersList(true)}
        </div>
      </div>
    );
  }

  // STANDARD VIEW
  return (
    <div id="kitchen-display-system" className="space-y-6">
      {/* Top Station Switcher Banner */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                Live Fulfillment Network
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live Sync
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 mt-1">
              Station Display System (KDS & Bar)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Separated station queues for Kitchen dishes, Bar drinks, and Waiter ready-to-serve notifications.
            </p>
          </div>

          {/* Quick controls: Full Screen, Sound & Reload */}
          <div className="flex items-center gap-2">
            <button
              id="btn-open-fullscreen-top"
              type="button"
              onClick={() => openFullScreen(activeStation)}
              className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title={`Open ${activeStation === 'KITCHEN' ? 'Kitchen Station' : activeStation === 'BAR' ? 'Bar & Beverage Station' : 'Waiter & Service Station'} in Full Screen`}
            >
              <Maximize2 className="w-4 h-4 text-amber-600" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>

            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                soundEnabled
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-500'
              }`}
              title={soundEnabled ? 'Chime sound enabled' : 'Chime sound muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-600" /> : <VolumeX className="w-4 h-4 text-zinc-400" />}
              <span className="hidden sm:inline">{soundEnabled ? 'Chime On' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={handlePurgeCompletedOrders}
              disabled={isPurging}
              className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Clear served/completed table tickets from Firebase"
            >
              <Trash2 className={`w-4 h-4 text-zinc-500 ${isPurging ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isPurging ? 'Clearing...' : 'Clear Completed'}</span>
            </button>

            <button
              type="button"
              onClick={loadFallbackOrders}
              className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {cleanupMessage && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {cleanupMessage}
            </span>
            <button
              type="button"
              onClick={() => setCleanupMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Station Navigation Tabs with Small Full-Screen Option on Each */}
        <div className={`grid grid-cols-1 ${defaultStation === 'WAITER' ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-3 mt-6 pt-6 border-t border-zinc-100`}>
          {defaultStation !== 'WAITER' && (
            <>
              {/* 1. Kitchen Station */}
              <div
                id="station-tab-kitchen"
                onClick={() => setActiveStation('KITCHEN')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  activeStation === 'KITCHEN'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold ${
                      activeStation === 'KITCHEN' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    <ChefHat className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Kitchen Station</div>
                    <div className={`text-xs ${activeStation === 'KITCHEN' ? 'text-amber-100' : 'text-zinc-500'}`}>
                      Main Dishes & Cook Queue
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {stationCounts.kitchenActive > 0 && (
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black shadow-xs ${
                        activeStation === 'KITCHEN' ? 'bg-white text-zinc-950' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {stationCounts.kitchenActive} Active
                    </span>
                  )}
                  {/* Small Full Screen Button for Kitchen Station */}
                  <button
                    id="btn-fullscreen-kitchen"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFullScreen('KITCHEN');
                    }}
                    className={`p-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                      activeStation === 'KITCHEN'
                        ? 'bg-white/20 hover:bg-white/30 text-white border-white/40'
                        : 'bg-white hover:bg-amber-50 text-amber-900 border-amber-200 shadow-2xs'
                    }`}
                    title="Open Kitchen Station in Full Screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden md:inline">Full Screen</span>
                  </button>
                </div>
              </div>

              {/* 2. Bar & Beverage Station */}
              <div
                id="station-tab-bar"
                onClick={() => setActiveStation('BAR')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  activeStation === 'BAR'
                    ? 'bg-purple-700 text-white border-purple-800 shadow-md ring-2 ring-purple-400/40'
                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold ${
                      activeStation === 'BAR' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    <Wine className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Bar & Beverage Station</div>
                    <div className={`text-xs ${activeStation === 'BAR' ? 'text-purple-100' : 'text-zinc-500'}`}>
                      Drinks, Cocktails & Shakes
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {stationCounts.barActive > 0 && (
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black shadow-xs ${
                        activeStation === 'BAR' ? 'bg-white text-purple-950' : 'bg-purple-600 text-white'
                      }`}
                    >
                      {stationCounts.barActive} Active
                    </span>
                  )}
                  {/* Small Full Screen Button for Bar & Beverage Station */}
                  <button
                    id="btn-fullscreen-bar"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFullScreen('BAR');
                    }}
                    className={`p-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                      activeStation === 'BAR'
                        ? 'bg-white/20 hover:bg-white/30 text-white border-white/40'
                        : 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200 shadow-2xs'
                    }`}
                    title="Open Bar & Beverage Station in Full Screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden md:inline">Full Screen</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 3. Waiter & Service Station */}
          {defaultStation === 'WAITER' && (
            <div
              id="station-tab-waiter"
              onClick={() => setActiveStation('WAITER')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                activeStation === 'WAITER'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400/40'
                  : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold ${
                    activeStation === 'WAITER' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-black">Waiter & Service Station</div>
                  <div className={`text-xs ${activeStation === 'WAITER' ? 'text-blue-100' : 'text-zinc-500'}`}>
                    Prepared Dishes & Delivery
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {stationCounts.pendingBillRequests > 0 && (
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-black shadow-xs bg-amber-400 text-amber-950 border border-amber-500 animate-bounce flex items-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    {stationCounts.pendingBillRequests} Bill Req!
                  </span>
                )}
                {stationCounts.waiterReady > 0 && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-black shadow-xs animate-pulse ${
                      activeStation === 'WAITER' ? 'bg-white text-blue-900' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {stationCounts.waiterReady} Ready!
                  </span>
                )}
                {/* Small Full Screen Button for Waiter & Service Station */}
                <button
                  id="btn-fullscreen-waiter"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFullScreen('WAITER');
                  }}
                  className={`p-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                    activeStation === 'WAITER'
                      ? 'bg-white/20 hover:bg-white/30 text-white border-white/40'
                      : 'bg-white hover:bg-blue-50 text-blue-900 border-blue-200 shadow-2xs'
                  }`}
                  title="Open Waiter & Service Station in Full Screen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden md:inline">Full Screen</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ping Notification Toast when Cook marks Ready */}
      {lastPingedOrder && (
        <div className="p-4 bg-blue-50 border-2 border-blue-400 rounded-2xl flex items-center justify-between gap-3 text-blue-900 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center animate-bounce">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black">Dish Prepared Notification Ping Sent to Waiters!</div>
              <div className="text-xs text-blue-700">Order is now live in the Waiter View ready for delivery.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveStation('WAITER')}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 cursor-pointer whitespace-nowrap"
          >
            Open Waiter View →
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search table, customer or dish..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
          />
        </div>

        {/* Active Queue Badge and Small Full Screen Button */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white shadow-xs whitespace-nowrap flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Active Queue
          </span>

          <button
            id="btn-fullscreen-filter-bar"
            type="button"
            onClick={() => openFullScreen(activeStation)}
            className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs ml-1 shrink-0"
            title="Open active station in Full Screen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden md:inline">Full Screen</span>
          </button>
        </div>
      </div>

      {/* Orders Grid in Standard Mode */}
      {renderOrdersList(false)}
    </div>
  );
};





