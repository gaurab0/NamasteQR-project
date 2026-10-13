import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  UserCheck, 
  Calendar, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  LogOut, 
  RefreshCw, 
  AlertCircle, 
  Phone, 
  Mail, 
  ShieldAlert,
  QrCode,
  Layers,
  Sparkles
} from 'lucide-react';
import { Button } from '../ui/Button';
import { rbacService } from '../../services/rbac.service';
import { CheckIn, CheckInStatus, AppRole } from '../../types/rbac';
import { TableManagementGrid } from '../tables/TableManagementGrid';

interface CheckInsModuleProps {
  currentUserRole?: string;
  businessId?: string;
  businessName?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
}

export const CheckInsModule: React.FC<CheckInsModuleProps> = ({ 
  currentUserRole, 
  businessId = 'maya-forest-resort',
  businessName = 'Maya Forest Resort',
  isViewOnly = false,
  onRequestRoleSignIn
}) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'guest_log'>('tables');
  const canDelete = !isViewOnly;
  const isManager = !isViewOnly;

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal form
  const [showAddModal, setShowAddModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [roomOrTable, setRoomOrTable] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [notes, setNotes] = useState('');

  const loadCheckIns = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const records = await rbacService.getCheckInsApi();
      setCheckIns(records);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load check-ins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'guest_log') {
      loadCheckIns();
    }
  }, [activeTab]);

  const handleCreateCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.createCheckInApi({
        guest_name: guestName.trim(),
        room_or_table_number: roomOrTable.trim(),
        guest_phone: guestPhone.trim(),
        guest_email: guestEmail.trim(),
        total_amount: parseFloat(totalAmount) || 0,
        notes: notes.trim(),
      });
      setSuccessMsg(`Guest "${guestName}" checked in successfully.`);
      setGuestName('');
      setRoomOrTable('');
      setGuestPhone('');
      setGuestEmail('');
      setTotalAmount('');
      setNotes('');
      setShowAddModal(false);
      await loadCheckIns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create check-in');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: CheckInStatus) => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.updateCheckInStatusApi(id, newStatus);
      setSuccessMsg(`Status updated to ${newStatus}`);
      await loadCheckIns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCheckIn = async (id: string, guest: string) => {
    if (isViewOnly) {
      onRequestRoleSignIn?.();
      return;
    }
    if (!window.confirm(`Permanently delete check-in record for "${guest}"?`)) return;
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.deleteCheckInApi(id);
      setSuccessMsg(`Record for "${guest}" removed.`);
      await loadCheckIns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete record');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div id="checkins-module-container" className="space-y-6">
      {/* Top Segmented Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-1.5 bg-zinc-100/90 rounded-2xl border border-zinc-200/80">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
            }`}
          >
            <QrCode className={`w-4 h-4 ${activeTab === 'tables' ? 'text-amber-600' : 'text-zinc-500'}`} />
            <span>Restaurant Tables & QR Codes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guest_log')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'guest_log'
                ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
            }`}
          >
            <UserCheck className={`w-4 h-4 ${activeTab === 'guest_log' ? 'text-amber-600' : 'text-zinc-500'}`} />
            <span>Guest Registration Log</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-3 text-[11px] text-zinc-500 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Real-time table occupancy & fixed QR code ordering enabled</span>
        </div>
      </div>

      {/* Tab 1: Restaurant Tables & QR Ordering Grid */}
      {activeTab === 'tables' && (
        <TableManagementGrid
          businessId={businessId}
          businessName={businessName}
          currentUserRole={currentUserRole as AppRole}
          isViewOnly={isViewOnly}
          onRequestRoleSignIn={onRequestRoleSignIn}
        />
      )}

      {/* Tab 2: Guest Registration & Audit Check-Ins */}
      {activeTab === 'guest_log' && (
        <div id="checkins-module" className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-xs">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-bold text-zinc-900">Guest Registration & Room Check-Ins</h2>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Real-time occupancy tracking for rooms and tables. Both Managers and Staff can check guests in/out.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="refresh-checkins-btn"
                type="button"
                onClick={loadCheckIns}
                disabled={loading}
                className="p-2 text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                title="Refresh check-ins"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <Button
                id="new-checkin-btn"
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                <Plus className="w-4 h-4" />
                Check In Guest
              </Button>
            </div>
          </div>

          {/* Notification banners */}
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase font-semibold text-zinc-500">
                <tr>
                  <th className="px-6 py-3.5">Guest Information</th>
                  <th className="px-6 py-3.5">Assigned Room / Table</th>
                  <th className="px-6 py-3.5">Check-In Date</th>
                  <th className="px-6 py-3.5">Occupancy Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-600" />
                      Loading check-ins...
                    </td>
                  </tr>
                ) : checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                      No active check-ins recorded.
                    </td>
                  </tr>
                ) : (
                  checkIns.map((ci) => {
                    const isCheckedIn = ci.status === 'CHECKED_IN';

                    return (
                      <tr key={ci.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-zinc-900">{ci.guest_name}</div>
                          <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                            {ci.guest_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {ci.guest_phone}
                              </span>
                            )}
                            {ci.guest_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {ci.guest_email}
                              </span>
                            )}
                          </div>
                          {ci.notes && (
                            <div className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded mt-1.5 inline-block">
                              Note: {ci.notes}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 font-semibold text-zinc-800">
                          {ci.room_or_table_number}
                        </td>

                        <td className="px-6 py-4 text-xs text-zinc-500">
                          {new Date(ci.check_in_date).toLocaleDateString()} {new Date(ci.check_in_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="px-6 py-4">
                          {isCheckedIn ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Checked In
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-full border border-zinc-200">
                              <LogOut className="w-3.5 h-3.5 text-zinc-500" />
                              Checked Out
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isCheckedIn ? (
                              <button
                                id={`checkout-btn-${ci.id}`}
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleStatusChange(ci.id, 'CHECKED_OUT')}
                                className="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                              >
                                Check Out
                              </button>
                            ) : (
                              <button
                                id={`reopen-checkin-btn-${ci.id}`}
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleStatusChange(ci.id, 'CHECKED_IN')}
                                className="px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                              >
                                Re-check In
                              </button>
                            )}

                            {canDelete && (
                              <button
                                id={`delete-checkin-${ci.id}`}
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleDeleteCheckIn(ci.id, ci.guest_name)}
                                className="p-1.5 text-zinc-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                title="Delete check-in record (Manager only)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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
      )}

      {/* Modal: New Check In */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-zinc-900">Check In Guest</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Guest Full Name</label>
                <input
                  id="guest-name"
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Room or Table Number</label>
                <input
                  id="room-table-input"
                  type="text"
                  required
                  placeholder="e.g. Room 204 / Table 8"
                  value={roomOrTable}
                  onChange={(e) => setRoomOrTable(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Phone (Optional)</label>
                  <input
                    id="guest-phone"
                    type="tel"
                    placeholder="+1 555-0199"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Email (Optional)</label>
                  <input
                    id="guest-email"
                    type="email"
                    placeholder="guest@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Special Notes / Requests</label>
                <textarea
                  id="checkin-notes"
                  rows={2}
                  placeholder="e.g. Late check-out, extra towels, allergen alert"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="submit-checkin-btn"
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Checking In...' : 'Confirm Check-In'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
