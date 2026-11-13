import { useEffect, useMemo, useState } from 'react';
import { BusinessOperatingHours, OperationalDayRecord } from '../types/auth';
import { getActiveRevenueWindow, RevenueDayWindow } from '../utils/revenueWindow';
import { evaluateStoreStatusDetailed, StoreStatusResult } from '../utils/operationalDay';
import { socketService } from '../services/socket.service';

export interface SyncedOperationsState {
  opsConfig: BusinessOperatingHours | null;
  currentDay: OperationalDayRecord | null;
  revenueWindow: RevenueDayWindow;
  storeStatus: StoreStatusResult;
}

/**
 * Keeps Dashboard, Cashier, Analytics, and QR Menu synchronized on the exact same
 * configured dailyResetTime boundary, store open/closed state, and live Socket updates.
 */
export function useSyncedOperationsState(
  businessId?: string | null,
  initialConfig?: BusinessOperatingHours | null,
  initialDay?: OperationalDayRecord | null
): SyncedOperationsState {
  const [opsConfig, setOpsConfig] = useState<BusinessOperatingHours | null>(initialConfig || null);
  const [currentDay, setCurrentDay] = useState<OperationalDayRecord | null>(initialDay || null);
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  useEffect(() => {
    setOpsConfig(initialConfig || null);
  }, [
    initialConfig?.enabled,
    initialConfig?.openTime,
    initialConfig?.closeTime,
    initialConfig?.autoDateAdvance,
    initialConfig?.dailyResetTime,
    initialConfig?.timezoneOffsetMinutes,
  ]);

  useEffect(() => {
    setCurrentDay(initialDay || null);
  }, [initialDay?.id, initialDay?.status, initialDay?.businessDate, initialDay?.updatedAt]);

  useEffect(() => {
    if (!businessId) return;
    socketService.joinBusiness(businessId);

    const unsubCfg = socketService.subscribeToOperationsConfig((cfg) => {
      if (cfg) {
        setOpsConfig(cfg);
        setClockTick(Date.now());
      }
    });
    const unsubDay = socketService.subscribeToOperationalDay((day) => {
      if (day) {
        setCurrentDay(day);
        setClockTick(Date.now());
      }
    });
    const unsubBiz = socketService.subscribeToBusinessProfile((biz) => {
      if (!biz || (biz.id && biz.id !== businessId)) return;
      if (biz.operations_config !== undefined) setOpsConfig(biz.operations_config || null);
      if (biz.current_operational_day !== undefined) setCurrentDay(biz.current_operational_day || null);
      setClockTick(Date.now());
    });

    return () => {
      unsubCfg();
      unsubDay();
      unsubBiz();
    };
  }, [businessId]);

  const revenueWindow = useMemo(
    () => getActiveRevenueWindow(opsConfig, new Date(clockTick)),
    [opsConfig, clockTick]
  );

  // Exact rollover timer firing at dailyResetTime + wake-up refresh
  useEffect(() => {
    const delayMs = Math.min(Math.max(100, revenueWindow.nextResetInMs + 50), 2_147_483_000);
    const rolloverTimer = setTimeout(() => {
      setClockTick(Date.now());
    }, delayMs);

    const handleWakeUp = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setClockTick(Date.now());
    };

    window.addEventListener('focus', handleWakeUp);
    document.addEventListener('visibilitychange', handleWakeUp);

    return () => {
      clearTimeout(rolloverTimer);
      window.removeEventListener('focus', handleWakeUp);
      document.removeEventListener('visibilitychange', handleWakeUp);
    };
  }, [revenueWindow.endMs]);

  // Lightweight 30s tick when auto open/close hours are enabled
  useEffect(() => {
    if (!opsConfig?.enabled) return;
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, [opsConfig?.enabled]);

  const storeStatus = useMemo(
    () => evaluateStoreStatusDetailed(opsConfig, currentDay, new Date(clockTick)),
    [opsConfig, currentDay, clockTick]
  );

  return { opsConfig, currentDay, revenueWindow, storeStatus };
}
