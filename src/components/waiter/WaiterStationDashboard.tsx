import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { RestaurantTable, AppRole } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import { KitchenDisplaySystem } from '../kds/KitchenDisplaySystem';
import { CheckCircle2, Users, Building2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { Button } from '../ui/Button';

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
  
  const currentStaffId = rbacService.getCurrentStaffSession()?.id || 'UNKNOWN';

  // Filters
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!businessId) return;

    setLoading(true);
    const tablesColRef = collection(db, 'businesses', businessId, 'tables');
    
    const unsubscribe = onSnapshot(tablesColRef, (snapshot) => {
      const liveTables: RestaurantTable[] = [];
      snapshot.forEach((docSnap) => {
        liveTables.push({
          id: docSnap.id,
          ...docSnap.data()
        } as RestaurantTable);
      });
      setTables(liveTables);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching tables real-time:", err);
      setErrorMsg("Failed to sync tables. " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
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
      if (t.building) set.add(t.building);
    });
    return Array.from(set);
  }, [tables]);

  const filteredAndSortedTables = useMemo(() => {
    let result = [...tables];
    if (selectedBuilding !== 'all') {
      if (selectedBuilding === 'none') {
        result = result.filter(t => !t.building);
      } else {
        result = result.filter(t => t.building === selectedBuilding);
      }
    }

    result.sort((a, b) => {
      const aVal = a.table_number.toLowerCase();
      const bVal = b.table_number.toLowerCase();
      if (sortOrder === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });

    return result;
  }, [tables, selectedBuilding, sortOrder]);


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
    try {
      let newWaiterIds = [...(tbl.assigned_waiter_ids || [])];
      
      if (isAssignedToMe) {
        newWaiterIds = newWaiterIds.filter(id => id !== currentStaffId);
      } else {
        newWaiterIds.push(currentStaffId);
      }

      await rbacService.updateTableApi(tbl.id, { assigned_waiter_ids: newWaiterIds }, businessId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update table assignment.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header section */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-2xs">
        <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-600" />
          Waiter Shift & Table Selection
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Claim tables you will be serving during this shift. Tables claimed by you will send their orders to your Waiter KDS view.
        </p>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-zinc-100 pt-5">
          <div className="flex gap-3 w-full sm:w-auto">
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Buildings / Sections</option>
              {buildingList.map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
              <option value="none">No Building Specified</option>
            </select>
            
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="asc">Sort A-Z</option>
              <option value="desc">Sort Z-A</option>
            </select>
          </div>
          
          <div className="text-xs font-semibold text-zinc-500">
            Current Staff ID: <span className="text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded">{currentStaffId.substring(0, 8)}...</span>
          </div>
        </div>

        {/* Tables Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {loading && tables.length === 0 ? (
            <div className="col-span-full py-8 text-center text-zinc-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
              Loading tables...
            </div>
          ) : filteredAndSortedTables.length === 0 ? (
            <div className="col-span-full py-8 text-center text-zinc-500 text-sm font-medium">
              No tables found matching criteria.
            </div>
          ) : (
            filteredAndSortedTables.map((tbl) => {
              const isAssignedToMe = tbl.assigned_waiter_ids?.includes(currentStaffId);
              const isAssignedToOthers = tbl.assigned_waiter_ids && tbl.assigned_waiter_ids.length > 0 && !isAssignedToMe;
              const isOperating = actionLoadingId === tbl.id;

              let cardStyle = 'bg-white border-zinc-200 hover:border-amber-400 hover:bg-amber-50 cursor-pointer';
              let statusLabel = 'Available to Claim';
              let textColor = 'text-zinc-700';

              if (isAssignedToMe) {
                cardStyle = 'bg-blue-50 border-blue-400 shadow-inner cursor-pointer';
                statusLabel = 'Claimed by You';
                textColor = 'text-blue-900';
              } else if (isAssignedToOthers) {
                cardStyle = 'bg-zinc-100 border-zinc-200 opacity-60 cursor-not-allowed';
                statusLabel = 'Claimed by Another';
                textColor = 'text-zinc-500';
              }

              return (
                <div
                  key={tbl.id}
                  onClick={() => !isOperating && handleToggleWaiterAssignment(tbl)}
                  className={`relative p-3 rounded-2xl border-2 transition-all select-none ${cardStyle} ${isOperating ? 'opacity-50' : ''}`}
                >
                  {isAssignedToMe && (
                    <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-0.5 shadow-sm">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div className={`text-sm font-extrabold truncate ${textColor}`}>
                    {tbl.table_number}
                  </div>
                  
                  <div className="text-[10px] mt-1 text-zinc-500 flex items-center gap-1 truncate">
                    {tbl.building ? <Building2 className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                    {tbl.building || tbl.floor || 'General'}
                  </div>
                  
                  <div className={`mt-2 text-[10px] font-bold text-center px-1 py-0.5 rounded ${
                    isAssignedToMe ? 'bg-blue-100 text-blue-700' : 
                    isAssignedToOthers ? 'bg-zinc-200 text-zinc-500' : 
                    'bg-zinc-100 text-zinc-600'
                  }`}>
                    {statusLabel}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* KDS Waiter View */}
      <div className="pt-4">
        <h3 className="text-sm font-bold text-zinc-800 mb-4 px-2 uppercase tracking-wide">Active Orders for Your Tables</h3>
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
