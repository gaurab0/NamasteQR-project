import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { BusinessOperatingHours, OperationalDayRecord, OperationalStatus } from '../../types/auth';
import { getEffectiveBusinessDate } from '../../utils/operationalDay';
import {
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCcw,
  Save,
  Lock,
  Power,
  Sparkles,
  DollarSign,
  User,
  Info,
  Sun,
  Moon,
  History,
  RefreshCw,
  Check,
  X
} from 'lucide-react';

export const OperationsManagementTab: React.FC = () => {
  const { user } = useAuth();
  const activeBizId = user?.business?.id || user?.id || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [config, setConfig] = useState<BusinessOperatingHours>({
    enabled: false,
    openTime: '09:00',
    closeTime: '23:00',
    autoDateAdvance: true,
  });

  const [currentDay, setCurrentDay] = useState<OperationalDayRecord | null>(null);
  const [history, setHistory] = useState<OperationalDayRecord[]>([]);

  // Manual Overrides & Inputs
  const [manualDate, setManualDate] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [openingFloat, setOpeningFloat] = useState<string>('0');

  // Live real-time clock for professional operations view
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4500);
    return () => clearTimeout(t);
  }, [successMsg]);

  useEffect(() => {
    if (!activeBizId) return;
    fetchData();
  }, [activeBizId]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Get Business Settings
      const bizRef = doc(db, 'businesses', activeBizId);
      const bizSnap = await getDoc(bizRef);
      if (bizSnap.exists()) {
        const data = bizSnap.data();
        if (data.operations_config) {
          setConfig(data.operations_config);
        }
        if (data.current_operational_day) {
          setCurrentDay(data.current_operational_day);
        }
      }

      // Get History
      const histRef = collection(db, 'businesses', activeBizId, 'operational_days');
      const q = query(histRef, orderBy('businessDate', 'desc'), limit(15));
      const histSnap = await getDocs(q);
      const histData = histSnap.docs.map(d => ({ id: d.id, ...d.data() } as OperationalDayRecord));
      setHistory(histData);

    } catch (err: any) {
      setError(err.message || 'Failed to load operations data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setError('');
      const bizRef = doc(db, 'businesses', activeBizId);
      await updateDoc(bizRef, {
        operations_config: config
      });
      setSuccessMsg('Automatic schedule & operational preferences saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDayStart = async () => {
    if (config.enabled) return; // Inoperable when automated
    try {
      setSaving(true);
      setError('');
      const dateToUse = getEffectiveBusinessDate(config, currentDay);
      const newDay: OperationalDayRecord = {
        businessDate: dateToUse,
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        openedBy: user?.id,
        openedByName: user?.name || user?.email || 'Store Staff',
        openingFloat: parseFloat(openingFloat) || 0,
        updatedAt: new Date().toISOString(),
      };

      const dayRef = doc(collection(db, 'businesses', activeBizId, 'operational_days'));
      newDay.id = dayRef.id;

      await setDoc(dayRef, newDay);
      
      const bizRef = doc(db, 'businesses', activeBizId);
      await updateDoc(bizRef, {
        current_operational_day: newDay
      });

      setCurrentDay(newDay);
      setHistory(prev => [newDay, ...prev]);
      setSuccessMsg(`Business Day started successfully for ${dateToUse}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to start business day.');
    } finally {
      setSaving(false);
    }
  };

  const handleDayClose = async () => {
    if (config.enabled) return; // Inoperable when automated
    if (!currentDay || !currentDay.id) return;
    
    if (!window.confirm('Are you sure you want to close the business day? Ensure all tables are settled and bills are closed.')) return;

    try {
      setSaving(true);
      setError('');
      const updatedDay: OperationalDayRecord = {
        ...currentDay,
        status: 'CLOSED',
        closedAt: new Date().toISOString(),
        closedBy: user?.id,
        closedByName: user?.name || user?.email || 'Store Staff',
        updatedAt: new Date().toISOString(),
      };

      const dayRef = doc(db, 'businesses', activeBizId, 'operational_days', currentDay.id);
      await updateDoc(dayRef, updatedDay as any);

      const bizRef = doc(db, 'businesses', activeBizId);
      await updateDoc(bizRef, {
        current_operational_day: updatedDay
      });

      setCurrentDay(updatedDay);
      setHistory(prev => prev.map(h => h.id === currentDay.id ? updatedDay : h));
      setSuccessMsg('Business Day closed successfully. Daily register session finalized.');
    } catch (err: any) {
      setError(err.message || 'Failed to close business day.');
    } finally {
      setSaving(false);
    }
  };

  const handleDayReopen = async () => {
    if (config.enabled) return; // Inoperable when automated
    if (!currentDay || !currentDay.id) return;
    if (!reopenReason.trim()) {
      setError('Please provide a specific reason for reopening the closed day.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const updatedDay: OperationalDayRecord = {
        ...currentDay,
        status: 'REOPENED',
        reopenedAt: new Date().toISOString(),
        reopenedBy: user?.id,
        reopenedByName: user?.name || user?.email || 'Store Staff',
        reopenReason: reopenReason.trim(),
        updatedAt: new Date().toISOString(),
      };

      const dayRef = doc(db, 'businesses', activeBizId, 'operational_days', currentDay.id);
      await updateDoc(dayRef, updatedDay as any);

      const bizRef = doc(db, 'businesses', activeBizId);
      await updateDoc(bizRef, {
        current_operational_day: updatedDay
      });

      setCurrentDay(updatedDay);
      setHistory(prev => prev.map(h => h.id === currentDay.id ? updatedDay : h));
      setReopenReason('');
      setSuccessMsg('Business Day reopened. Emergency register access enabled.');
    } catch (err: any) {
      setError(err.message || 'Failed to reopen business day.');
    } finally {
      setSaving(false);
    }
  };

  const handleManualDateSet = async () => {
    if (!manualDate) return;
    if (!currentDay) {
      setError('Please start a business day first before overriding the date.');
      return;
    }
    
    try {
      setSaving(true);
      setError('');
      const updatedDay = { ...currentDay, businessDate: manualDate, updatedAt: new Date().toISOString() };
      
      const dayRef = doc(db, 'businesses', activeBizId, 'operational_days', currentDay.id!);
      await updateDoc(dayRef, updatedDay as any);

      const bizRef = doc(db, 'businesses', activeBizId);
      await updateDoc(bizRef, {
        current_operational_day: updatedDay
      });

      setCurrentDay(updatedDay);
      setHistory(prev => prev.map(h => h.id === currentDay.id ? updatedDay : h));
      setManualDate('');
      setSuccessMsg(`Business Date manually overridden to ${manualDate}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to override date.');
    } finally {
      setSaving(false);
    }
  };

  // Active status flags
  const isOpen = currentDay?.status === 'OPEN' || currentDay?.status === 'REOPENED';
  const isClosed = !currentDay || currentDay.status === 'CLOSED';
  const effectiveDate = getEffectiveBusinessDate(config, currentDay);

  // Active duration calculation
  const sessionDuration = useMemo(() => {
    if (!currentDay?.openedAt || currentDay.status === 'CLOSED') return null;
    const start = new Date(currentDay.openedAt).getTime();
    const now = currentTime.getTime();
    const diffMs = Math.max(0, now - start);
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m active`;
    }
    return `${minutes}m active`;
  }, [currentDay?.openedAt, currentDay?.status, currentTime]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
        <span className="text-sm font-medium">Loading operational register state...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <span>Business Operation</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage daily trading cycles, automated opening hours, and register audit trails.
          </p>
        </div>

        {/* Real-time system clock & quick refresh */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white flex items-center gap-2.5 shadow-2xs border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold tracking-wide">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[10px] text-slate-400 font-medium border-l border-slate-700 pl-2 hidden sm:inline">
              {currentTime.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh Operations Data"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* NOTIFICATIONS & ALERTS */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-600 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN 2-COLUMN BALANCED GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT COLUMN: CURRENT OPERATIONAL STATUS CARD */}
        <div className={`lg:col-span-7 bg-white rounded-2xl border transition-all flex flex-col justify-between p-5 sm:p-6 shadow-xs ${
          config.enabled 
            ? 'border-indigo-200/80 bg-slate-50/60' 
            : 'border-slate-200'
        }`}>
          <div className="space-y-4">
            {/* Card Header & Status Badge */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Current Operational Status
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live trading state & register ledger controls
                </p>
              </div>

              {/* Status Indicator Chip */}
              <div>
                {config.enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Auto-Scheduled
                  </span>
                ) : isOpen ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Session
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Day Closed
                  </span>
                )}
              </div>
            </div>

            {/* AUTOMATIC TIMINGS LOCK BANNER (Requirement 2) */}
            {config.enabled && (
              <div className="p-3.5 bg-indigo-50/90 border border-indigo-200/90 rounded-xl text-indigo-950 text-xs shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-indigo-950">
                    <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Manual Open & Close Controls Locked</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-200/80 text-indigo-900 text-[10px] font-black uppercase tracking-wider">
                    Auto Mode
                  </span>
                </div>
                <p className="text-indigo-800/90 leading-relaxed text-[11px]">
                  Automatic Timings are currently active ({config.openTime} – {config.closeTime}). Operational status is managed by the automated schedule. Uncheck &ldquo;Enable Automatic Open/Close check&rdquo; to operate manual controls.
                </p>
              </div>
            )}

            {/* HERO STATUS & METRICS MATRIX */}
            <div className={`p-4 sm:p-5 rounded-xl border transition-all ${
              isOpen 
                ? 'bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-teal-50/20 border-emerald-200 text-emerald-950 shadow-2xs' 
                : 'bg-gradient-to-br from-slate-50 via-slate-50/70 to-rose-50/30 border-slate-200 text-slate-800 shadow-2xs'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-black/5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isOpen ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'
                  }`}>
                    {isOpen ? <CheckCircle2 className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider font-extrabold opacity-60 block">Register Status</span>
                    <span className={`text-base font-black ${isOpen ? 'text-emerald-950' : 'text-slate-900'}`}>
                      {currentDay?.status || 'DAY NOT STARTED'}
                    </span>
                  </div>
                </div>

                <div className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-white/80 border border-black/5 text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Ledger Date: {effectiveDate}</span>
                </div>
              </div>

              {/* 4 Structured Metric Boxes */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-white/90 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Trading Date
                  </span>
                  <span className="font-bold text-slate-800 font-mono">
                    {effectiveDate}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white/90 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Session Opened
                  </span>
                  <span className="font-bold text-slate-800 truncate block">
                    {currentDay?.openedAt 
                      ? new Date(currentDay.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      : 'Not Started'}
                  </span>
                  {sessionDuration && (
                    <span className="text-[10px] text-emerald-700 font-semibold block">
                      {sessionDuration}
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-white/90 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Duty Staff / Manager
                  </span>
                  <span className="font-bold text-slate-800 truncate block">
                    {currentDay?.openedByName || user?.name || 'Staff Member'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white/90 border border-black/5 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Starting Float
                  </span>
                  <span className="font-bold text-slate-800 font-mono">
                    Rs. {(currentDay?.openingFloat || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Operational Policy Guidance Notice */}
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-slate-600 text-xs flex items-center gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="leading-relaxed">
                {isOpen 
                  ? 'Active shift session. All POS checkouts, billing, and QR menus are live for this business date.' 
                  : 'Register is currently closed. Billing and order processing are halted until a new day is initiated.'}
              </span>
            </div>
          </div>

          {/* ACTION CONTROLS AREA (Greyed out & Inoperable when config.enabled is true) */}
          <div className={`mt-5 pt-4 border-t border-slate-100 transition-all ${
            config.enabled 
              ? 'opacity-40 pointer-events-none select-none filter grayscale cursor-not-allowed' 
              : ''
          }`}>
            {isOpen ? (
              /* OPEN STATE: REFINED CLOSE DAY CONTROL */
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200/90 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Shift Close & Reconciliation
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Finalizes trading cycle, archives active orders, and secures the register.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDayClose}
                  disabled={config.enabled || saving}
                  className="w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 border border-rose-700/30 text-xs sm:text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Power className="w-4 h-4 text-rose-100" />
                  <span>Close Business Day</span>
                </button>
              </div>
            ) : (
              /* CLOSED STATE: REFINED START DAY & REOPEN CONTROLS */
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200/90 space-y-3.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Open Register for Trading
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Start business operations for {effectiveDate} to begin taking orders.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Opening Drawer Float
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        value={openingFloat}
                        onChange={e => setOpeningFloat(e.target.value)}
                        placeholder="0.00"
                        disabled={config.enabled || saving}
                        className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDayStart}
                    disabled={config.enabled || saving}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-2 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 border border-emerald-700/30 text-xs sm:text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Start Business Day</span>
                  </button>
                </div>

                {/* Emergency Day Reopen (if already closed today) */}
                {currentDay && (
                  <div className="pt-3 border-t border-slate-200/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" /> Emergency Day Reopen
                      </span>
                      <span className="text-[10px] text-slate-400">For unbilled post-close checks</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Reason for reopening register..."
                        value={reopenReason}
                        onChange={e => setReopenReason(e.target.value)}
                        disabled={config.enabled || saving}
                        className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:border-amber-500 outline-none bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleDayReopen}
                        disabled={config.enabled || saving || !reopenReason.trim()}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Reopen Day
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: TIMINGS & DATE OVERRIDES */}
        <div className="lg:col-span-5 flex flex-col gap-6 justify-between">
          
          {/* CARD 1: AUTOMATIC TIMINGS */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" /> Automatic Timings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automate daily register opening & closing based on fixed business hours.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                Scheduler
              </span>
            </div>
            
            {/* Modern Toggle Switch Card */}
            <div 
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                config.enabled 
                  ? 'bg-indigo-50/80 border-indigo-300 shadow-2xs' 
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  config.enabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs block">
                    Enable Automatic Open/Close check
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Locks manual controls and follows set schedule
                  </span>
                </div>
              </div>

              {/* Toggle switch element */}
              <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                config.enabled ? 'bg-indigo-600' : 'bg-slate-300'
              }`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  config.enabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
            </div>

            {/* Operating Hours Inputs */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-500" /> Open Time
                </label>
                <input 
                  type="time" 
                  value={config.openTime}
                  onChange={e => setConfig({ ...config, openTime: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white transition"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" /> Close Time
                </label>
                <input 
                  type="time" 
                  value={config.closeTime}
                  onChange={e => setConfig({ ...config, closeTime: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white transition"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Auto-Schedule</span>
            </button>
          </div>

          {/* CARD 2: MANUAL DATE OVERRIDE */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-600" /> Manual Date Override
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audit controls to advance or lock business trading dates.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                Ledger
              </span>
            </div>
            
            {/* Auto-advance Toggle */}
            <div 
              onClick={() => setConfig({ ...config, autoDateAdvance: !config.autoDateAdvance })}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                config.autoDateAdvance 
                  ? 'bg-amber-50/70 border-amber-300/80 shadow-2xs' 
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <div>
                <span className="font-bold text-slate-900 text-xs block">
                  Auto-advance date on new day
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Automatically rolls date forward when a day starts
                </span>
              </div>
              <div className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                config.autoDateAdvance ? 'bg-amber-600' : 'bg-slate-300'
              }`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  config.autoDateAdvance ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>

            {/* Set Date Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Force Set Specific Date
              </label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none bg-white font-medium"
                />
                <button
                  type="button"
                  onClick={handleManualDateSet}
                  disabled={saving || !manualDate}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Set Date
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* OPERATIONAL HISTORY LOG TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-800 text-sm">Operational History Log</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            {history.length} {history.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">Business Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Opened By</th>
                <th className="px-6 py-3">Opened At</th>
                <th className="px-6 py-3">Closed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map(day => (
                <tr key={day.id} className="hover:bg-slate-50/70 transition">
                  <td className="px-6 py-3.5 font-bold text-slate-900 font-mono">{day.businessDate}</td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      day.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      day.status === 'REOPENED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {day.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-600 font-medium">{day.openedByName || '-'}</td>
                  <td className="px-6 py-3.5 text-slate-600 font-mono">
                    {day.openedAt ? new Date(day.openedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-6 py-3.5 text-slate-600 font-mono">
                    {day.closedAt ? new Date(day.closedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    No operational history records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
