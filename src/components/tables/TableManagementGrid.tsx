import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  QrCode, 
  Edit2, 
  Trash2, 
  RefreshCw, 
  Building2, 
  Layers, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Printer,
  Eye, 
  ExternalLink,
  ChevronDown,
  Sparkles,
  SlidersHorizontal,
  RotateCcw
} from 'lucide-react';
import { RestaurantTable, TableStatus, AppRole } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { Button } from '../ui/Button';
import { TableQrCardModal } from './TableQrCardModal';
import { TableFormModal } from './TableFormModal';

interface TableManagementGridProps {
  businessId: string;
  businessName: string;
  currentUserRole?: AppRole;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
}

export const TableManagementGrid: React.FC<TableManagementGridProps> = ({
  businessId,
  businessName,
  currentUserRole,
  isViewOnly = false,
  onRequestRoleSignIn,
}) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [qrModalTable, setQrModalTable] = useState<RestaurantTable | null>(null);
  const [deleteConfirmTable, setDeleteConfirmTable] = useState<RestaurantTable | null>(null);
  const [batchPrintMode, setBatchPrintMode] = useState(false);

  const canManageTables = !isViewOnly;
  const currentStaffId = rbacService.getCurrentStaffSession()?.id || 'TEST_WAITER';
  const canUpdateStatus = !isViewOnly;

  const fetchTables = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await rbacService.getTablesApi(businessId);
      setTables(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load restaurant tables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [businessId]);

  // Derived building & floor lists for filters
  const buildingList = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => {
      if (t.building) set.add(t.building);
    });
    return Array.from(set);
  }, [tables]);

  const floorList = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => {
      if (t.floor) set.add(t.floor);
    });
    return Array.from(set);
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchesSearch = 
        t.table_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.floor && t.floor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.building && t.building.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesBuilding = 
        selectedBuilding === 'all' ? true :
        selectedBuilding === 'none' ? !t.building :
        t.building === selectedBuilding;

      const matchesFloor = 
        selectedFloor === 'all' ? true :
        selectedFloor === 'none' ? !t.floor :
        t.floor === selectedFloor;

      const matchesStatus = 
        selectedStatus === 'all' ? true :
        t.status === selectedStatus;

      return matchesSearch && matchesBuilding && matchesFloor && matchesStatus;
    });
  }, [tables, searchTerm, selectedBuilding, selectedFloor, selectedStatus]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = tables.length;
    const active = tables.filter((t) => t.status === 'ACTIVE').length;
    const occupied = tables.filter((t) => t.status === 'OCCUPIED').length;
    const reserved = tables.filter((t) => t.status === 'RESERVED').length;
    const inactive = tables.filter((t) => t.status === 'INACTIVE').length;
    const totalCapacity = tables.reduce((sum, t) => sum + (t.capacity || 0), 0);
    return { total, active, occupied, reserved, inactive, totalCapacity };
  }, [tables]);

  // Handlers
  const handleSaveTable = async (data: {
    table_number: string;
    floor: string | null;
    building: string | null;
    capacity: number;
    status: TableStatus;
    pay_first_enabled?: boolean;
    credit_only?: boolean;
  }) => {
    if (editingTable) {
      await rbacService.updateTableApi(editingTable.id, data, businessId);
      setSuccessMsg(`Table "${data.table_number}" updated successfully.`);
    } else {
      await rbacService.createTableApi(data, businessId);
      setSuccessMsg(`Table "${data.table_number}" created successfully.`);
    }
    await fetchTables();
  };

  const handleStatusChange = async (table: RestaurantTable, newStatus: TableStatus) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    setActionLoadingId(table.id);
    setErrorMsg(null);
    try {
      await rbacService.updateTableStatusApi(table.id, newStatus, businessId);
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, status: newStatus } : t))
      );
      setSuccessMsg(`Table ${table.table_number} marked as ${newStatus}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update table status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteClick = (table: RestaurantTable) => {
    if (!canManageTables) {
      setErrorMsg('Access Denied: Owner/Admin/Manager role required to delete tables.');
      return;
    }
    setDeleteConfirmTable(table);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTable) return;
    const tableToDelete = deleteConfirmTable;

    setActionLoadingId(tableToDelete.id);
    setErrorMsg(null);
    try {
      await rbacService.deleteTableApi(tableToDelete.id, businessId);
      setTables((prev) => prev.filter((t) => t.id !== tableToDelete.id));
      setSuccessMsg(`Table ${tableToDelete.table_number} deleted successfully.`);
      setDeleteConfirmTable(null);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete table');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleWaiterAssignment = async (tbl: RestaurantTable) => {
    if (isViewOnly) return;
    setActionLoadingId(tbl.id);
    setErrorMsg(null);
    try {
      const isAssigned = tbl.assigned_waiter_ids?.includes(currentStaffId);
      let newWaiterIds = [...(tbl.assigned_waiter_ids || [])];
      
      if (isAssigned) {
        newWaiterIds = newWaiterIds.filter(id => id !== currentStaffId);
      } else {
        newWaiterIds.push(currentStaffId);
      }

      await rbacService.updateTableApi(tbl.id, { assigned_waiter_ids: newWaiterIds }, businessId);
      setSuccessMsg(isAssigned ? `${tbl.table_number} unclaimed.` : `${tbl.table_number} claimed for your shift.`);
      await fetchTables();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update table assignment.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetSession = async (table: RestaurantTable) => {
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    setActionLoadingId(table.id);
    setErrorMsg(null);
    try {
      await rbacService.resetTableSessionApi(table.id, businessId);
      setTables((prev) =>
        prev.map((t) =>
          t.id === table.id
            ? { ...t, status: 'ACTIVE', current_session_id: null, host_token: undefined }
            : t
        )
      );
      setSuccessMsg(`Session for Table ${table.table_number} was reset. Table is now available.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset table session');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSeedDefaults = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const seeded = await rbacService.seedDefaultTablesApi(businessId);
      setTables(seeded);
      setSuccessMsg(`Generated ${seeded.length} starter tables for ${businessName}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to seed tables');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: TableStatus) => {
    switch (status) {
      case 'ACTIVE':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Active (Free)',
        };
      case 'OCCUPIED':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-500 animate-pulse',
          label: 'Occupied (Dining)',
        };
      case 'RESERVED':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Reserved',
        };
      case 'INACTIVE':
      default:
        return {
          bg: 'bg-zinc-100 text-zinc-600 border-zinc-200',
          dot: 'bg-zinc-400',
          label: 'Inactive (Off)',
        };
    }
  };

  return (
    <div id="table-management-section" className="space-y-6">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Tables</div>
          <div className="text-2xl font-extrabold text-zinc-900 mt-1">{stats.total}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{stats.totalCapacity} total guest seats</div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Active (Available)
          </div>
          <div className="text-2xl font-extrabold text-emerald-950 mt-1">{stats.active}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Ready for QR scanning</div>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Occupied (In-Use)
          </div>
          <div className="text-2xl font-extrabold text-blue-950 mt-1">{stats.occupied}</div>
          <div className="text-[11px] text-blue-700 mt-0.5">Active dining sessions</div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Reserved
          </div>
          <div className="text-2xl font-extrabold text-amber-950 mt-1">{stats.reserved}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Upcoming bookings</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Inactive / Closed</div>
          <div className="text-2xl font-extrabold text-zinc-700 mt-1">{stats.inactive}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">Maintenance / Closed</div>
        </div>
      </div>

      {/* Main Table Management Container */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        {/* Header Toolbar */}
        <div className="p-5 sm:p-6 border-b border-zinc-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-extrabold text-zinc-900">
                Restaurant Tables & QR Stand Grid
              </h2>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Manage physical table layouts, floors, buildings, and generate fixed digital ordering QR codes for your guests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={fetchTables}
              disabled={loading}
              className="p-2.5 text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
              title="Refresh table grid"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Quick All QRs modal preview */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (tables.length > 0) setQrModalTable(tables[0]);
              }}
              leftIcon={<Printer className="w-4 h-4 text-zinc-600" />}
              className="text-xs font-semibold"
            >
              QR Stand Cards
            </Button>

            {/* Add Table Button */}
            {canManageTables ? (
              <Button
                id="btn-add-table"
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingTable(null);
                  setFormModalOpen(true);
                }}
                leftIcon={<Plus className="w-4 h-4" />}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs text-xs"
              >
                Add Table
              </Button>
            ) : (
              <Button
                id="btn-add-table-viewonly"
                type="button"
                variant="outline"
                size="sm"
                onClick={onRequestRoleSignIn}
                leftIcon={<Plus className="w-4 h-4 text-zinc-400" />}
                className="text-xs text-zinc-400 cursor-not-allowed"
                title="Sign in as Manager/Owner to add tables"
              >
                Add Table (Owner Only)
              </Button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-zinc-50/80 border-b border-zinc-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              id="search-table-input"
              type="text"
              placeholder="Search table number, floor, or building..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Building filter */}
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Buildings / Sections</option>
              {buildingList.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
              <option value="none">No Building Specified</option>
            </select>

            {/* Floor filter */}
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Floors</option>
              {floorList.map((fl) => (
                <option key={fl} value={fl}>
                  {fl}
                </option>
              ))}
              <option value="none">No Floor (Single Level)</option>
            </select>

            {/* Status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">🟢 Active</option>
              <option value="OCCUPIED">🔵 Occupied</option>
              <option value="RESERVED">🟡 Reserved</option>
              <option value="INACTIVE">⚪ Inactive</option>
            </select>
          </div>
        </div>

        {/* Banners */}
        {errorMsg && (
          <div className="mx-5 sm:mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 sm:mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Easy-to-read Table Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-600">
            <thead className="bg-zinc-50 border-b border-zinc-200/80 text-[11px] uppercase font-bold text-zinc-500 tracking-wider">
              <tr>
                <th className="px-5 py-3.5 w-16 text-center">S.N.</th>
                <th className="px-5 py-3.5">Table Number</th>
                <th className="px-5 py-3.5">Floor</th>
                <th className="px-5 py-3.5">Building</th>
                <th className="px-5 py-3.5">Active / Inactive Status</th>
                <th className="px-5 py-3.5 text-center">Pay First</th>
                <th className="px-5 py-3.5 text-center">QR Ordering Code</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/70">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
                    Loading restaurant tables...
                  </td>
                </tr>
              ) : filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="max-w-sm mx-auto text-zinc-500 space-y-3">
                      <QrCode className="w-10 h-10 mx-auto text-zinc-300" />
                      <div>
                        <p className="font-bold text-sm text-zinc-800">
                          {searchTerm || selectedBuilding !== 'all' || selectedFloor !== 'all' || selectedStatus !== 'all' 
                            ? 'No tables match your current filter' 
                            : `No tables configured for ${businessName}`}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {searchTerm 
                            ? 'Try clearing your search query or filter criteria.' 
                            : 'Set up tables individually or generate starter tables with QR codes.'}
                        </p>
                      </div>
                      {!searchTerm && selectedBuilding === 'all' && selectedFloor === 'all' && selectedStatus === 'all' && canManageTables && (
                        <div className="pt-2 flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSeedDefaults}
                            leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-600" />}
                            className="text-xs border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-amber-900"
                          >
                            Generate 6 Starter Tables
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setEditingTable(null);
                              setFormModalOpen(true);
                            }}
                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            Add Table
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTables.map((tbl, index) => {
                  const badge = getStatusBadge(tbl.status);
                  const isOperating = actionLoadingId === tbl.id;

                  return (
                    <tr 
                      key={tbl.id} 
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        tbl.status === 'INACTIVE' ? 'opacity-70 bg-zinc-50/40' : ''
                      }`}
                    >
                      {/* Serial Number */}
                      <td className="px-5 py-4 text-center font-bold text-zinc-400 font-mono">
                        {index + 1}
                      </td>

                      {/* Table Number */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-extrabold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                            {tbl.table_number.replace(/[^0-9A-Z]/gi, '').slice(0, 3) || 'T'}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-zinc-900 flex items-center gap-1.5 flex-wrap">
                              {tbl.table_number}
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                                {tbl.capacity} Seats
                              </span>
                              {tbl.credit_only && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                                  💳 Credit Only
                                </span>
                              )}
                              {tbl.comp_enabled && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                                  🎁 Comp Mode
                                </span>
                              )}
                            </div>
                            {tbl.last_scanned_at && (
                              <div className="text-[10px] text-zinc-400 mt-0.5">
                                Last scan: {new Date(tbl.last_scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Floor (Nullable) */}
                      <td className="px-5 py-4">
                        {tbl.floor ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-800 font-medium text-xs">
                            <Layers className="w-3 h-3 text-zinc-500" />
                            {tbl.floor}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic text-xs font-mono">
                            — None (Single Level) —
                          </span>
                        )}
                      </td>

                      {/* Building (Nullable) */}
                      <td className="px-5 py-4">
                        {tbl.building ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-800 font-medium text-xs">
                            <Building2 className="w-3 h-3 text-zinc-500" />
                            {tbl.building}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic text-xs font-mono">
                            — None (Main Hall) —
                          </span>
                        )}
                      </td>

                      {/* Active / Inactive Status Change */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            id={`status-select-${tbl.id}`}
                            value={tbl.status}
                            disabled={isOperating || isViewOnly}
                            onChange={(e) => handleStatusChange(tbl, e.target.value as TableStatus)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-500 ${badge.bg}`}
                          >
                            <option value="ACTIVE">🟢 Active (Available)</option>
                            <option value="OCCUPIED">🔵 Occupied (Dining)</option>
                            <option value="RESERVED">🟡 Reserved</option>
                            <option value="INACTIVE">⚪ Inactive (Closed)</option>
                          </select>

                          {isOperating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
                        </div>
                      </td>

                      {/* Pay First Toggle */}
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          disabled={!canManageTables || isOperating || tbl.credit_only}
                          onClick={async () => {
                            if (!canManageTables || tbl.credit_only) return;
                            try {
                              setActionLoadingId(tbl.id);
                              await rbacService.updateTableApi(tbl.id, { pay_first_enabled: !tbl.pay_first_enabled }, businessId);
                              setTables((prev) => prev.map((t) => (t.id === tbl.id ? { ...t, pay_first_enabled: !tbl.pay_first_enabled } : t)));
                            } catch (err: any) {
                              alert(err.message || 'Failed to toggle Pay First');
                            } finally {
                              setActionLoadingId(null);
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-hidden ${tbl.pay_first_enabled ? 'bg-amber-500' : 'bg-zinc-300'} ${!canManageTables || isOperating || tbl.credit_only ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={tbl.credit_only ? "Pay First is mandatory for Credit Only tables" : tbl.pay_first_enabled ? "Pay First Enabled - Click to Disable" : "Pay First Disabled - Click to Enable"}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${tbl.pay_first_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </td>

                      {/* QR Ordering Code */}
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setQrModalTable(tbl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300/80 rounded-xl text-xs font-bold transition-all shadow-2xs group cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                          <span>View QR Card</span>
                        </button>
                      </td>

                      {/* Actions (Reset Session / Edit / Delete) */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Waiter Assignment (Claim/Unclaim) */}
                          {!isViewOnly && (
                            <button
                              type="button"
                              onClick={() => handleToggleWaiterAssignment(tbl)}
                              disabled={isOperating}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                                tbl.assigned_waiter_ids?.includes(currentStaffId)
                                  ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600 shadow-2xs cursor-pointer'
                                  : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200 cursor-pointer'
                              } ${isOperating ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={tbl.assigned_waiter_ids?.includes(currentStaffId) ? "Unclaim table" : "Claim table for your shift"}
                            >
                              <Users className="w-3 h-3" />
                              <span>{tbl.assigned_waiter_ids?.includes(currentStaffId) ? 'Unclaim' : 'Claim'}</span>
                            </button>
                          )}

                          {/* Cancel / Reset Active Session button */}
                          <button
                            type="button"
                            onClick={() => handleResetSession(tbl)}
                            disabled={!canUpdateStatus || isOperating}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                              tbl.status === 'OCCUPIED' || tbl.current_session_id
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs cursor-pointer'
                                : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200 cursor-pointer'
                            } ${!canUpdateStatus || isOperating ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Reset table session and release for new guests if customer left"
                          >
                            <RotateCcw className={`w-3 h-3 ${isOperating ? 'animate-spin' : 'text-amber-700'}`} />
                            <span>Reset Session</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingTable(tbl);
                              setFormModalOpen(true);
                            }}
                            disabled={!canManageTables}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              canManageTables
                                ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200 cursor-pointer'
                                : 'text-zinc-300 border-zinc-100 cursor-not-allowed'
                            }`}
                            title={canManageTables ? 'Edit table' : 'Manager role required'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteClick(tbl)}
                            disabled={!canManageTables || isOperating}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              canManageTables
                                ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50 border-zinc-200 cursor-pointer'
                                : 'text-zinc-300 border-zinc-100 cursor-not-allowed'
                            }`}
                            title={canManageTables ? 'Delete table' : 'Manager role required'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Stand Card Modal */}
      {qrModalTable && (
        <TableQrCardModal
          table={qrModalTable}
          businessName={businessName}
          businessId={businessId}
          onClose={() => setQrModalTable(null)}
          onTableUpdated={(updated) => {
            setQrModalTable(updated);
            setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      )}

      {/* Add / Edit Table Modal */}
      {formModalOpen && (
        <TableFormModal
          table={editingTable}
          isOpen={formModalOpen}
          onClose={() => {
            setFormModalOpen(false);
            setEditingTable(null);
          }}
          onSave={handleSaveTable}
          existingFloors={floorList.length > 0 ? floorList : ['Ground Floor', '1st Floor', '2nd Floor', 'Rooftop', 'Garden/Outdoor']}
          existingBuildings={buildingList.length > 0 ? buildingList : ['Main Building', 'Garden Courtyard', 'Terrace Annex', 'Poolside Cabana']}
          nextSuggestedNumber={tables.length + 1}
        />
      )}

      {/* Delete Table Confirmation Modal */}
      {deleteConfirmTable && (
        <div 
          id="delete-table-modal-backdrop" 
          className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => !actionLoadingId && setDeleteConfirmTable(null)}
        >
          <div 
            id="delete-table-modal" 
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Delete Restaurant Table?
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Are you sure you want to permanently delete{' '}
                  <span className="font-bold text-zinc-800">{deleteConfirmTable.table_number}</span>?
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-600 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-500">Table:</span>
                <span className="font-semibold text-zinc-800">{deleteConfirmTable.table_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Capacity:</span>
                <span className="font-semibold text-zinc-800">{deleteConfirmTable.capacity} Seats</span>
              </div>
              {deleteConfirmTable.floor && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Floor:</span>
                  <span className="font-semibold text-zinc-800">{deleteConfirmTable.floor}</span>
                </div>
              )}
              {deleteConfirmTable.building && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Building / Area:</span>
                  <span className="font-semibold text-zinc-800">{deleteConfirmTable.building}</span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-zinc-200 text-[11px] text-amber-700 font-medium">
                ⚠️ Notice: Any active QR code printed for this table will immediately become inactive.
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmTable(null)}
                disabled={actionLoadingId === deleteConfirmTable.id}
              >
                Cancel
              </Button>
              <button
                id="confirm-delete-table-btn"
                type="button"
                onClick={handleConfirmDelete}
                disabled={actionLoadingId === deleteConfirmTable.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoadingId === deleteConfirmTable.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Table</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

