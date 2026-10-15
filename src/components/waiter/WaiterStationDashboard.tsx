import React, { useState, useEffect, useMemo } from 'react';
import { RestaurantTable, AppRole, StaffAccountSession } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import { KitchenDisplaySystem } from '../kds/KitchenDisplaySystem';
import { 
  CheckCircle2, 
  Users, 
  Building2, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  ChevronDown, 
  Lock, 
  Check, 
  Plus, 
  X, 
  XCircle, 
  Search,
  RotateCcw
} from 'lucide-react';

interface WaiterStationDashboardProps {
  businessId: string;
  businessName: string;
  currentUserRole?: AppRole;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
}

export const WaiterStationDashboard: React.FC<WaiterStationDashboardProps> = ({
  businessId,
  businessName,
  currentUserRole,
  isViewOnly = false,
  onRequestRoleSignIn,
}) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Drawer state: collapsed by default to save critical vertical space for KDS
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Live Staff Session state
  const [staffSession, setStaffSession] = useState<StaffAccountSession | null>(() => rbacService.getCurrentStaffSession());

  useEffect(() => {
    const handleSessionChange = () => {
      setStaffSession(rbacService.getCurrentStaffSession());
    };
    window.addEventListener('serveflow:staff-session-changed', handleSessionChange);
    return () => {
      window.removeEventListener('serveflow:staff-session-changed', handleSessionChange);
    };
  }, []);

  const currentStaffId = staffSession?.id || 'UNKNOWN';
  const staffDisplayName = staffSession?.name || (currentStaffId !== 'UNKNOWN' ? currentStaffId : 'Shift Staff');

  // Filters & Search
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'available' | 'others'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!businessId) return;

    setLoading(true);
    rbacService.getTablesApi(businessId)
      .then((data) => {
        setTables(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching tables:", err);
        setErrorMsg("Failed to sync tables. " + err.message);
        setLoading(false);
      });
  }, [businessId]);

  // Socket.io Real-time WebSocket Subscription for instant table updates
  useEffect(() => {
    if (!businessId) return;
    socketService.joinBusiness(businessId);
    const unsub = socketService.subscribeToTables((tableUpdate) => {
      setTables((prev) => {
        const idx = prev.findIndex((t) => t.id === tableUpdate.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...tableUpdate };
          return updated;
        }
        return [...prev, tableUpdate];
      });
    });
    return () => unsub();
  }, [businessId]);

  const buildingList = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => {
      const section = t.building || t.floor;
      if (section && section.trim()) set.add(section.trim());
    });
    return Array.from(set);
  }, [tables]);

  // Table categorization counts
  const claimedByMe = useMemo(() => {
    return tables.filter(t => t.assigned_waiter_ids?.includes(currentStaffId));
  }, [tables, currentStaffId]);

  const claimedByOthers = useMemo(() => {
    return tables.filter(t => t.assigned_waiter_ids && t.assigned_waiter_ids.length > 0 && !t.assigned_waiter_ids.includes(currentStaffId));
  }, [tables, currentStaffId]);

  const availableTables = useMemo(() => {
    return tables.filter(t => !t.assigned_waiter_ids || t.assigned_waiter_ids.length === 0);
  }, [tables]);

  const filteredAndSortedTables = useMemo(() => {
    let result = [...tables];

    // Quick filter
    if (quickFilter === 'mine') {
      result = result.filter(t => t.assigned_waiter_ids?.includes(currentStaffId));
    } else if (quickFilter === 'available') {
      result = result.filter(t => !t.assigned_waiter_ids || t.assigned_waiter_ids.length === 0);
    } else if (quickFilter === 'others') {
      result = result.filter(t => t.assigned_waiter_ids && t.assigned_waiter_ids.length > 0 && !t.assigned_waiter_ids.includes(currentStaffId));
    }

    // Building/Section filter
    if (selectedBuilding !== 'all') {
      if (selectedBuilding === 'none') {
        result = result.filter(t => !t.building && !t.floor);
      } else {
        result = result.filter(t => (t.building === selectedBuilding) || (!t.building && t.floor === selectedBuilding));
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t => 
        String(t.table_number || '').toLowerCase().includes(q) || 
        (t.building && t.building.toLowerCase().includes(q)) ||
        (t.floor && t.floor.toLowerCase().includes(q))
      );
    }

    // Sort order with natural alphanumeric sort
    result.sort((a, b) => {
      const aVal = String(a.table_number || '');
      const bVal = String(b.table_number || '');
      const comp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? comp : -comp;
    });

    return result;
  }, [tables, quickFilter, selectedBuilding, searchQuery, sortOrder, currentStaffId]);

  const handleToggleWaiterAssignment = async (tbl: RestaurantTable) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    
    // Check if table is locked by someone else
    const isAssignedToMe = tbl.assigned_waiter_ids?.includes(currentStaffId);
    const isAssignedToOthers = tbl.assigned_waiter_ids && tbl.assigned_waiter_ids.length > 0 && !isAssignedToMe;
    
    if (isAssignedToOthers) {
      return; // Table is locked by another waiter, can't toggle
    }

    setActionLoadingId(tbl.id);
    setErrorMsg(null);
    const previousWaiterIds = tbl.assigned_waiter_ids || [];
    let newWaiterIds = [...previousWaiterIds];
    
    if (isAssignedToMe) {
      newWaiterIds = newWaiterIds.filter(id => id !== currentStaffId);
    } else {
      newWaiterIds.push(currentStaffId);
    }

    // Optimistic UI update
    setTables(prev => prev.map(t => t.id === tbl.id ? { ...t, assigned_waiter_ids: newWaiterIds } : t));

    try {
      await rbacService.updateTableApi(tbl.id, { assigned_waiter_ids: newWaiterIds }, businessId);
    } catch (err: any) {
      // Revert optimistic update on failure
      setTables(prev => prev.map(t => t.id === tbl.id ? { ...t, assigned_waiter_ids: previousWaiterIds } : t));
      setErrorMsg(err.message || 'Failed to update table assignment.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReleaseAllMyTables = async () => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    if (claimedByMe.length === 0) return;

    setBatchLoading(true);
    setErrorMsg(null);
    const snapshot = [...tables];

    // Optimistic clear
    setTables(prev => prev.map(t => {
      if (t.assigned_waiter_ids?.includes(currentStaffId)) {
        return {
          ...t,
          assigned_waiter_ids: t.assigned_waiter_ids.filter(id => id !== currentStaffId)
        };
      }
      return t;
    }));

    try {
      await Promise.all(
        claimedByMe.map(tbl => {
          const newWaiterIds = (tbl.assigned_waiter_ids || []).filter(id => id !== currentStaffId);
          return rbacService.updateTableApi(tbl.id, { assigned_waiter_ids: newWaiterIds }, businessId);
        })
      );
    } catch (err: any) {
      setTables(snapshot);
      setErrorMsg(err.message || 'Failed to release some tables.');
    } finally {
      setBatchLoading(false);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setQuickFilter('all');
    setSelectedBuilding('all');
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Collapsible Drawer Section */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden transition-all duration-200">
        {/* Drawer Trigger Bar: Compact, clean, and clickable */}
        <div 
          onClick={() => setIsDrawerOpen(prev => !prev)}
          className="flex items-center justify-between p-3 sm:p-3.5 cursor-pointer hover:bg-zinc-50/80 transition-colors select-none"
        >
          {/* Left: Icon, Title & Live Claimed Summary */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
              <Users className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">
                  Waiter Shift & Table Selection
                </h2>
                {claimedByMe.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{claimedByMe.length} {claimedByMe.length === 1 ? 'Table' : 'Tables'} Claimed</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                    0 Tables Claimed
                  </span>
                )}

                {/* Compact table numbers preview in header bar when collapsed */}
                {claimedByMe.length > 0 && !isDrawerOpen && (
                  <div className="hidden md:flex items-center gap-1 text-[11px] text-zinc-500">
                    <span className="text-zinc-400">•</span>
                    <span className="truncate max-w-[280px]">
                      {claimedByMe.map(t => t.table_number).join(', ')}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 truncate hidden sm:block mt-0.5">
                {isDrawerOpen
                  ? 'Select or unclaim tables you will be serving during this shift.'
                  : claimedByMe.length > 0
                  ? `Active shift: orders for your ${claimedByMe.length} claimed ${claimedByMe.length === 1 ? 'table' : 'tables'} appear in the KDS below.`
                  : 'Click the arrow button to select tables you will be serving during this shift.'}
              </p>
            </div>
          </div>

          {/* Right: Staff ID Badge & Dedicated Arrow Toggle Button */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-2">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500 font-medium bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200/60">
              <span>Staff:</span>
              <span className="font-mono text-amber-700 font-semibold bg-amber-50 px-1 py-0.5 rounded text-[11px] max-w-[120px] truncate" title={currentStaffId}>
                {staffDisplayName}
              </span>
            </div>

            {/* Dedicated Arrow Toggle Button */}
            <button
              type="button"
              id="waiter-table-selection-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setIsDrawerOpen(prev => !prev);
              }}
              aria-expanded={isDrawerOpen}
              aria-controls="waiter-table-selection-drawer"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shadow-2xs active:scale-95 cursor-pointer ${
                isDrawerOpen
                  ? 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 border border-zinc-300/80'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 border border-amber-600'
              }`}
              aria-label={isDrawerOpen ? "Hide table selection options" : "Show table selection options"}
            >
              <span>{isDrawerOpen ? 'Hide Tables' : 'Select Tables'}</span>
              <ChevronDown 
                className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                  isDrawerOpen ? 'rotate-180 text-zinc-600' : 'text-white'
                }`} 
              />
            </button>
          </div>
        </div>

        {/* Drawer Body: Smooth CSS Grid animation to reveal table options */}
        <div
          id="waiter-table-selection-drawer"
          role="region"
          aria-labelledby="waiter-table-selection-trigger"
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isDrawerOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-zinc-100 p-3 sm:p-4 bg-zinc-50/50 space-y-3 sm:space-y-3.5">
              {/* Context Subtitle & Mobile Staff ID */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-zinc-500">
                <p>
                  Claim tables you will be serving during this shift. Tables claimed by you will send their orders to your Waiter KDS view below.
                </p>
                <div className="flex items-center gap-1 lg:hidden text-zinc-500 font-medium">
                  <span>Staff:</span>
                  <span className="font-mono text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded text-[11px] border border-amber-200/60 max-w-[140px] truncate" title={currentStaffId}>
                    {staffDisplayName}
                  </span>
                </div>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="truncate">{errorMsg}</span>
                  </div>
                  <button 
                    onClick={() => setErrorMsg(null)}
                    className="p-1 text-red-500 hover:text-red-700 rounded cursor-pointer shrink-0"
                    aria-label="Dismiss error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Filter and Control Toolbar */}
              <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between bg-white p-2.5 sm:p-3 rounded-xl border border-zinc-200/80 shadow-2xs">
                {/* Left: Quick Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setQuickFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      quickFilter === 'all'
                        ? 'bg-zinc-900 text-white shadow-2xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                    }`}
                  >
                    All ({tables.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickFilter('mine')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                      quickFilter === 'mine'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Claimed by Me ({claimedByMe.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickFilter('available')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                      quickFilter === 'available'
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                    }`}
                  >
                    Available ({availableTables.length})
                  </button>
                  {claimedByOthers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuickFilter('others')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                        quickFilter === 'others'
                          ? 'bg-zinc-600 text-white shadow-2xs'
                          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200/80'
                      }`}
                    >
                      <Lock className="w-2.5 h-2.5" />
                      Other Staff ({claimedByOthers.length})
                    </button>
                  )}
                </div>

                {/* Right: Search, Building/Section Filter, Sort Dropdown & Batch Release */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Table input */}
                  <div className="relative min-w-[130px] flex-1 sm:flex-initial">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search table or section..."
                      className="w-full pl-8 pr-7 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Building / Section Dropdown */}
                  <select
                    value={selectedBuilding}
                    onChange={(e) => setSelectedBuilding(e.target.value)}
                    className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="all">All Buildings / Sections</option>
                    {buildingList.map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                    <option value="none">General / No Section</option>
                  </select>

                  {/* Sort dropdown */}
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="asc">Sort A-Z</option>
                    <option value="desc">Sort Z-A</option>
                  </select>

                  {/* Release All Button */}
                  {claimedByMe.length > 0 && (
                    <button
                      type="button"
                      onClick={handleReleaseAllMyTables}
                      disabled={batchLoading}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Release all tables claimed by you"
                    >
                      {batchLoading ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-rose-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-rose-600" />
                      )}
                      <span>Release All ({claimedByMe.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Professional Table Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
                {loading && tables.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-zinc-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
                    Loading tables...
                  </div>
                ) : filteredAndSortedTables.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-zinc-500 text-xs font-medium bg-white rounded-xl border border-dashed border-zinc-200 p-4 space-y-2">
                    <p>No tables match your selected filters.</p>
                    {(searchQuery || quickFilter !== 'all' || selectedBuilding !== 'all') && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Filters</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredAndSortedTables.map((tbl) => {
                    const isAssignedToMe = tbl.assigned_waiter_ids?.includes(currentStaffId);
                    const isAssignedToOthers = tbl.assigned_waiter_ids && tbl.assigned_waiter_ids.length > 0 && !isAssignedToMe;
                    const isOperating = actionLoadingId === tbl.id;

                    return (
                      <div
                        key={tbl.id}
                        onClick={() => !isOperating && !isAssignedToOthers && handleToggleWaiterAssignment(tbl)}
                        role="button"
                        tabIndex={isAssignedToOthers ? -1 : 0}
                        aria-pressed={isAssignedToMe}
                        aria-disabled={isAssignedToOthers}
                        aria-label={`Table ${tbl.table_number}, ${tbl.building || tbl.floor || 'General'}, ${
                          isAssignedToMe ? 'Claimed by you. Click to release' : isAssignedToOthers ? 'Locked by another waiter' : 'Available. Click to claim'
                        }`}
                        onKeyDown={(e) => {
                          if (!isAssignedToOthers && !isOperating && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleToggleWaiterAssignment(tbl);
                          }
                        }}
                        className={`group relative flex flex-col justify-between p-2.5 sm:p-3 rounded-xl border transition-all select-none min-h-[80px] ${
                          isAssignedToMe
                            ? 'bg-gradient-to-b from-blue-50/90 to-blue-50/40 border-blue-400 shadow-2xs ring-1 ring-blue-400/30 hover:border-blue-500 cursor-pointer'
                            : isAssignedToOthers
                            ? 'bg-zinc-50 border-zinc-200/80 opacity-60 cursor-not-allowed'
                            : 'bg-white border-zinc-200 hover:border-amber-400 hover:shadow-xs hover:bg-amber-50/20 cursor-pointer'
                        } ${isOperating ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        {/* Top line: Table Number & Status Pill */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0 pr-1">
                            <span className={`text-sm font-bold truncate ${
                              isAssignedToMe ? 'text-blue-950 font-extrabold' : isAssignedToOthers ? 'text-zinc-500' : 'text-zinc-900 group-hover:text-amber-800'
                            }`}>
                              {tbl.table_number}
                            </span>
                            {tbl.capacity ? (
                              <span className="text-[10px] text-zinc-400 font-normal shrink-0">
                                ({tbl.capacity}p)
                              </span>
                            ) : null}
                          </div>

                          {/* Top-Right Status Chip */}
                          {isAssignedToMe ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-700 bg-blue-100/90 px-1.5 py-0.5 rounded-md shrink-0 border border-blue-200">
                              <Check className="w-2.5 h-2.5 text-blue-600 stroke-[3]" />
                              Mine
                            </span>
                          ) : isAssignedToOthers ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-200/70 px-1.5 py-0.5 rounded-md shrink-0">
                              <Lock className="w-2.5 h-2.5 text-zinc-400" />
                              Taken
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md shrink-0 border border-emerald-200/60">
                              Free
                            </span>
                          )}
                        </div>

                        {/* Middle line: Building / Section */}
                        <div className="text-[11px] text-zinc-500 flex items-center gap-1 truncate my-1.5">
                          {tbl.building ? (
                            <Building2 className="w-3 h-3 shrink-0 text-zinc-400" />
                          ) : (
                            <Layers className="w-3 h-3 shrink-0 text-zinc-400" />
                          )}
                          <span className="truncate">{tbl.building || tbl.floor || 'General'}</span>
                        </div>

                        {/* Bottom line: Interactive Action Button / Status indicator */}
                        <div className="mt-0.5">
                          {isOperating ? (
                            <div className="w-full py-1 rounded-md text-[10px] font-medium bg-zinc-100 text-zinc-500 flex items-center justify-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                              <span>Updating...</span>
                            </div>
                          ) : isAssignedToMe ? (
                            <div className="w-full py-1 px-1.5 rounded-md text-[10px] font-bold text-center bg-blue-100/90 text-blue-800 group-hover:bg-rose-100 group-hover:text-rose-800 group-hover:border-rose-300 border border-blue-200/80 transition-colors flex items-center justify-center gap-1">
                              <span className="group-hover:hidden flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-blue-600" /> Serving
                              </span>
                              <span className="hidden group-hover:flex items-center gap-1 text-rose-700">
                                <X className="w-3 h-3" /> Tap to Release
                              </span>
                            </div>
                          ) : isAssignedToOthers ? (
                            <div className="w-full py-1 px-1.5 rounded-md text-[10px] font-medium text-center bg-zinc-100 text-zinc-400 border border-zinc-200/60 flex items-center justify-center gap-1">
                              <Lock className="w-2.5 h-2.5 text-zinc-400" />
                              <span>Other Waiter</span>
                            </div>
                          ) : (
                            <div className="w-full py-1 px-1.5 rounded-md text-[10px] font-semibold text-center bg-zinc-100 text-zinc-700 group-hover:bg-amber-600 group-hover:text-white border border-zinc-200/80 group-hover:border-amber-600 transition-colors flex items-center justify-center gap-1">
                              <Plus className="w-3 h-3" />
                              <span>Claim Table</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KDS Waiter View */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-zinc-800 mb-3 px-1 uppercase tracking-wide flex items-center justify-between">
          <span>Active Orders for Your Tables</span>
          {claimedByMe.length > 0 && (
            <span className="text-xs font-medium text-zinc-500 normal-case">
              Monitoring {claimedByMe.length} {claimedByMe.length === 1 ? 'table' : 'tables'}
            </span>
          )}
        </h3>
        <KitchenDisplaySystem
          businessId={businessId}
          businessName={businessName}
          currentUserRole={currentUserRole}
          isViewOnly={isViewOnly}
          onRequestRoleSignIn={onRequestRoleSignIn}
          defaultStation="WAITER"
        />
      </div>
    </div>
  );
};
