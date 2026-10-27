import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  RefreshCw, 
  ShieldAlert, 
  User, 
  Lock,
  Sliders,
  ShieldCheck,
  UserCheck,
  X
} from 'lucide-react';
import { Button } from '../ui/Button';
import { rbacService } from '../../services/rbac.service';
import { useAuth } from '../../context/AuthContext';
import { TeamMember, AppRole, TabPermissionId, TAB_PERMISSION_IDS } from '../../types/rbac';
import { TAB_LABELS, canAccessTab, isBusinessOwner } from '../../utils/tabAccess';

interface TeamStaffManagementProps {
  currentUserRole?: string;
  currentUserId?: string;
  businessId?: string;
  businessName?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
}

const TAB_DESCRIPTIONS: Record<TabPermissionId, string> = {
  overview: 'Executive overview, sales metrics, and daily operation KPIs',
  operations: 'Table layout, space management, and operational floor plan',
  kds: 'Kitchen, Bar & live kitchen display order management',
  waiter: 'Waiter order dispatch, table status, and service station',
  checkins: 'Guest check-ins, reservations, and room/table assignments',
  menus: 'Menu catalog, categories, pricing, and dish availability',
  billing: 'Finance, POS billing, invoicing, payments, and receipts',
  team: 'Staff directory, account provisioning, and tab permissions',
  configurations: 'Business preferences, operating hours, and system settings',
  account: 'Business profile, dining setup, and public details',
  franchise: 'Switch between branches and franchise locations in the top bar',
};

export const TeamStaffManagement: React.FC<TeamStaffManagementProps> = ({
  currentUserRole,
  currentUserId,
  businessId,
  businessName,
  isViewOnly = false,
  onRequestRoleSignIn,
}) => {
  const { user } = useAuth();
  const staffSession = rbacService.getCurrentStaffSession();
  const currentSubject = staffSession ?? user ?? { role: currentUserRole };
  const isCurrentUserOwner = isBusinessOwner(currentSubject?.role);
  const canAllocateRoles = !isViewOnly && canAccessTab(currentSubject, 'team');

  const isTabGrantable = (tab: TabPermissionId) => {
    if (isCurrentUserOwner) return true;
    // Non-owners cannot grant team or franchise (anti-escalation rule)
    if (tab === 'team' || tab === 'franchise') return false;
    return canAccessTab(currentSubject, tab);
  };

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite form state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('KITCHEN_STAFF');
  const [createSelectedTabs, setCreateSelectedTabs] = useState<TabPermissionId[]>([]);
  const [modalErrorMsg, setModalErrorMsg] = useState<string | null>(null);

  // Permission Override Customizer Modal
  const [customizingMember, setCustomizingMember] = useState<TeamMember | null>(null);
  const [selectedTabs, setSelectedTabs] = useState<TabPermissionId[]>([]);
  const [customizeErrorMsg, setCustomizeErrorMsg] = useState<string | null>(null);

  const loadTeam = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const members = await rbacService.getTeamMembers(businessId);
      setTeam(members);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [businessId]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!canAllocateRoles) return;
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const target = team.find((m) => m.id === userId);
      await rbacService.updateStaffRole(userId, newRole, target?.allowed_tabs, businessId);
      setSuccessMsg(`Role allocated to ${newRole.replace(/_/g, ' ')}`);
      await loadTeam();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update role');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (userId: string, email: string) => {
    if (!canAllocateRoles) return;
    if (!window.confirm(`Are you sure you want to remove staff member "${email}"? This action cannot be undone.`)) {
      return;
    }
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.deleteStaffMember(userId, businessId);
      setSuccessMsg(`Staff member ${email} removed successfully.`);
      await loadTeam();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove staff member');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !invitePassword) {
      setModalErrorMsg('Please enter both email and an initial temporary password.');
      return;
    }
    if (createSelectedTabs.length === 0) {
      setModalErrorMsg('Select at least one permitted tab for this staff member.');
      return;
    }
    setActionLoading(true);
    setErrorMsg(null);
    setModalErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.addStaffMember({
        email: inviteEmail.trim(),
        password: invitePassword,
        role: inviteRole,
        allowed_tabs: createSelectedTabs,
      }, businessId);
      setSuccessMsg(`Account successfully provisioned for ${inviteEmail}! Designation: ${inviteRole.replace(/_/g, ' ')}.`);
      setInviteEmail('');
      setInvitePassword('');
      setCreateSelectedTabs([]);
      setShowInviteModal(false);
      await loadTeam();
    } catch (err: any) {
      setModalErrorMsg(err.message || 'Failed to create staff account');
      setErrorMsg(err.message || 'Failed to create staff account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCustomize = (member: TeamMember) => {
    if (!member) return;
    setCustomizingMember(member);
    setCustomizeErrorMsg(null);
    if (isBusinessOwner(member.role)) {
      setSelectedTabs([...TAB_PERMISSION_IDS]);
    } else {
      setSelectedTabs(Array.isArray(member.allowed_tabs) ? [...member.allowed_tabs] : []);
    }
  };

  const handleSaveCustomPermissions = async () => {
    if (!customizingMember) return;
    const isTargetOwner = isBusinessOwner(customizingMember.role);
    if (!isTargetOwner && selectedTabs.length === 0) {
      setCustomizeErrorMsg('Select at least one permitted tab.');
      return;
    }
    setActionLoading(true);
    setErrorMsg(null);
    setCustomizeErrorMsg(null);
    setSuccessMsg(null);
    try {
      await rbacService.updateStaffRole(
        customizingMember.id,
        customizingMember.role,
        isTargetOwner ? [...TAB_PERMISSION_IDS] : selectedTabs,
        businessId
      );
      setSuccessMsg(`Tab permissions allocated for ${customizingMember.email}`);
      setCustomizingMember(null);
      await loadTeam();
    } catch (err: any) {
      setCustomizeErrorMsg(err.message || 'Failed to save tab permissions');
      setErrorMsg(err.message || 'Failed to save tab permissions');
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const norm = rbacService.normalizeRole(role);
    if (norm === 'OWNER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
          Business Owner
        </span>
      );
    }
    if (norm === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Shield className="w-3.5 h-3.5 text-purple-600" />
          System Admin
        </span>
      );
    }
    if (norm === 'MANAGER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Shield className="w-3.5 h-3.5 text-blue-600" />
          General Manager
        </span>
      );
    }
    if (role === 'FRONT_DESK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <User className="w-3.5 h-3.5 text-cyan-600" />
          Front Desk
        </span>
      );
    }
    if (role === 'KITCHEN_STAFF') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <User className="w-3.5 h-3.5 text-emerald-600" />
          Kitchen Staff
        </span>
      );
    }
    if (role === 'HOUSEKEEPING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <User className="w-3.5 h-3.5 text-rose-600" />
          Housekeeping
        </span>
      );
    }
    if (role === 'CASHIER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <User className="w-3.5 h-3.5 text-indigo-600" />
          Cashier
        </span>
      );
    }
    if (role === 'WAITER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <User className="w-3.5 h-3.5 text-blue-600" />
          Waiter
        </span>
      );
    }
    if (role === 'BAR_STAFF') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <User className="w-3.5 h-3.5 text-purple-600" />
          Bar Staff
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
        <User className="w-3.5 h-3.5 text-zinc-500" />
        {role.replace(/_/g, ' ')}
      </span>
    );
  };

  const isTargetOwner = customizingMember ? isBusinessOwner(customizingMember.role) : false;

  return (
    <div id="team-staff-management-page" className="space-y-6">
      {/* View Only Mode Banner */}
      {isViewOnly && (
        <div id="team-view-only-notice" className="bg-amber-50 border border-amber-200 text-amber-900 px-5 py-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900">
                Staff Governance Mode: View-Only
              </div>
              <p className="text-xs text-zinc-600 mt-0.5">
                Viewing staff rosters is available to everyone. Authorized users with Staff tab access can allocate roles, assign tab access, or provision new staff accounts.
              </p>
            </div>
          </div>
          {onRequestRoleSignIn && (
            <button
              id="btn-team-role-login"
              type="button"
              onClick={onRequestRoleSignIn}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer"
            >
              Sign In as Owner / Admin →
            </button>
          )}
        </div>
      )}

      {/* Header & Controls */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="team-header-title" className="text-xl font-extrabold text-zinc-900 tracking-tight">
              Team & Staff Role Governance
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              {team.length} {team.length === 1 ? 'Member' : 'Members'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Staff Governance & Tab Access: Roles serve as display labels. System access is controlled strictly by assigning permitted tabs to each staff account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {onRequestRoleSignIn && (
            <Button
              id="btn-team-switch-role"
              variant="outline"
              size="sm"
              onClick={onRequestRoleSignIn}
              leftIcon={<UserCheck className="w-3.5 h-3.5 text-amber-600" />}
              className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold shadow-2xs"
            >
              Switch Staff Role
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadTeam}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          {canAllocateRoles && (
            <Button
              id="btn-add-staff-member"
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateSelectedTabs([]);
                setModalErrorMsg(null);
                setShowInviteModal(true);
              }}
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Add Staff Member
            </Button>
          )}
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/70 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
            Assigned Personnel & Designations
          </span>
          <span className="text-xs text-zinc-500">
            {canAllocateRoles ? 'Change roles or click the sliders to manage permitted tabs' : 'Sign in with Staff access to modify staff'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
            <span>Loading authorized team records...</span>
          </div>
        ) : team.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500 space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
              <Users className="w-6 h-6" />
            </div>
            <div className="font-semibold text-zinc-800">No staff members enrolled yet</div>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Provision accounts for your kitchen chefs, managers, receptionists, or housekeeping staff.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {team.map((member) => {
              const isSelf = member.id === currentUserId;
              return (
                <div
                  key={member.id}
                  id={`staff-row-${member.id}`}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/60 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-900 flex items-center justify-center font-bold text-sm shrink-0">
                      {member.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900">{member.email}</span>
                        {isSelf && (
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-bold border border-zinc-200">
                            Current User
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                        <span>Created {new Date(member.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Status: <strong className="text-emerald-700">{member.status}</strong></span>
                        <span>•</span>
                        {(() => {
                          const isOwner = isBusinessOwner(member.role);
                          const tabs = isOwner
                            ? TAB_PERMISSION_IDS
                            : (member.allowed_tabs || []);
                          const tabNames = tabs.map((t) => TAB_LABELS[t] || t).join(', ');
                          return (
                            <span
                              className="text-[10px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-bold border border-zinc-200 cursor-help"
                              title={tabNames ? `Permitted tabs: ${tabNames}` : 'No tabs assigned'}
                            >
                              {isOwner ? 'All 11 tabs' : `${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 justify-start sm:justify-end">
                    {/* Role Allocation Dropdown or Badge */}
                    {canAllocateRoles ? (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase">Role:</label>
                        <select
                          id={`select-role-${member.id}`}
                          value={member.role}
                          disabled={actionLoading}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          className="bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="HOTEL_OWNER">Hotel / Resort Owner</option>
                          <option value="RESTAURANT_OWNER">Restaurant Owner</option>
                          <option value="ADMIN">System Administrator</option>
                          <option value="MANAGER">General Manager</option>
                          <option value="KITCHEN_STAFF">Kitchen Staff / Chef</option>
                          <option value="FRONT_DESK">Front Desk / Reception</option>
                          <option value="HOUSEKEEPING">Housekeeping</option>
                          <option value="CASHIER">Cashier / Billing</option>
                          <option value="WAITER">Waiter / Service Staff</option>
                          <option value="BAR_STAFF">Bar Staff / Bartender</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleOpenCustomize(member)}
                          className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
                          title="Manage tab access"
                        >
                          <Sliders className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                      </div>
                    ) : (
                      getRoleBadge(member.role)
                    )}

                    {/* Delete Action */}
                    {canAllocateRoles && (
                      <button
                        id={`btn-delete-staff-${member.id}`}
                        type="button"
                        onClick={() => handleDeleteStaff(member.id, member.email)}
                        disabled={actionLoading || isSelf}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition disabled:opacity-30 cursor-pointer"
                        title={isSelf ? 'You cannot remove your own account' : 'Remove staff member'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showInviteModal && (
        <div id="add-staff-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-zinc-200 shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="bg-zinc-900 text-white p-6 relative">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Enroll Staff Member</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Create login credentials and allocate permitted tabs under <strong>{businessName}</strong>.
              </p>
            </div>

            <form onSubmit={handleCreateStaff} className="p-6 space-y-4">
              {modalErrorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalErrorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Staff Email *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="chef@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Temporary Password / PIN *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Allocated Designation / Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppRole)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                >
                  <option value="KITCHEN_STAFF">Kitchen Staff / Chef</option>
                  <option value="FRONT_DESK">Front Desk & Reception</option>
                  <option value="MANAGER">General Manager</option>
                  <option value="HOUSEKEEPING">Housekeeping</option>
                  <option value="CASHIER">Cashier & Billing</option>
                  <option value="WAITER">Waiter & Service Staff</option>
                  <option value="BAR_STAFF">Bar Staff & Bartender</option>
                  <option value="ADMIN">System Administrator</option>
                </select>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Role is a display label. Select permitted tabs below to control actual system access.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-semibold text-zinc-700">Permitted Dashboard Tabs *</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const grantable = TAB_PERMISSION_IDS.filter((t) => isTabGrantable(t));
                        setCreateSelectedTabs(grantable);
                      }}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={() => setCreateSelectedTabs([])}
                      className="text-[11px] font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
                    >
                      Clear all
                    </button>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      ({createSelectedTabs.length}/11)
                    </span>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto border border-zinc-200 rounded-xl p-2.5 bg-zinc-50/50 space-y-1.5">
                  {TAB_PERMISSION_IDS.map((tabId) => {
                    const isChecked = createSelectedTabs.includes(tabId);
                    const grantable = isTabGrantable(tabId);

                    return (
                      <label
                        key={tabId}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs transition ${
                          !grantable
                            ? 'bg-zinc-100/60 border-zinc-200 opacity-60 cursor-not-allowed'
                            : isChecked
                            ? 'bg-amber-50 border-amber-300 text-zinc-900 cursor-pointer'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 cursor-pointer'
                        }`}
                        title={!grantable ? 'You can only grant tabs you have access to' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!grantable}
                          onChange={(e) => {
                            if (!grantable) return;
                            if (e.target.checked) {
                              setCreateSelectedTabs((prev) => [...prev, tabId]);
                            } else {
                              setCreateSelectedTabs((prev) => prev.filter((t) => t !== tabId));
                            }
                          }}
                          className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 font-semibold text-zinc-900 text-[11px]">
                            <span>{TAB_LABELS[tabId]}</span>
                            {!grantable && <Lock className="w-2.5 h-2.5 text-zinc-400" />}
                          </div>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {TAB_DESCRIPTIONS[tabId]}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2 cursor-pointer"
                >
                  Cancel
                </button>
                <Button type="submit" variant="primary" size="sm" disabled={actionLoading}>
                  {actionLoading ? 'Creating...' : 'Enroll Staff'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Customizer Modal */}
      {customizingMember && (
        <div id="customize-permissions-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-zinc-200 shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="bg-zinc-900 text-white p-6 relative">
              <button
                type="button"
                onClick={() => setCustomizingMember(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Allocate Specific Permissions</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Choose which tabs <strong>{customizingMember.email}</strong> can open ({customizingMember.role ? customizingMember.role.replace(/_/g, ' ') : 'Staff'}).
              </p>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Target owner read-only note */}
              {isTargetOwner && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Owners and administrators always have full access to all tabs and branch features.</span>
                </div>
              )}

              {/* Inline error */}
              {customizeErrorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{customizeErrorMsg}</span>
                </div>
              )}

              {/* Controls: Select all, Clear all, Live counter */}
              <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                <span className="font-semibold text-zinc-700">
                  {isTargetOwner ? 'All 11' : selectedTabs.length} of {TAB_PERMISSION_IDS.length} selected
                </span>
                {!isTargetOwner && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const grantable = TAB_PERMISSION_IDS.filter((t) => isTabGrantable(t));
                        setSelectedTabs(grantable);
                      }}
                      className="font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTabs([])}
                      className="font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {/* Responsive 2-column list of 11 checkbox cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TAB_PERMISSION_IDS.map((tabId) => {
                  const isChecked = isTargetOwner || selectedTabs.includes(tabId);
                  const grantable = isTabGrantable(tabId);
                  const isDisabled = isTargetOwner || !grantable;

                  return (
                    <label
                      key={tabId}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all text-xs ${
                        isDisabled
                          ? 'bg-zinc-100/70 border-zinc-200 opacity-70 cursor-not-allowed'
                          : isChecked
                          ? 'bg-amber-50/70 border-amber-300 text-zinc-900 cursor-pointer hover:bg-amber-50'
                          : 'bg-white border-zinc-200 text-zinc-700 cursor-pointer hover:bg-zinc-50'
                      }`}
                      title={!grantable && !isTargetOwner ? 'You can only grant tabs you have access to' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={(e) => {
                          if (isDisabled) return;
                          if (e.target.checked) {
                            setSelectedTabs((prev) => [...prev, tabId]);
                          } else {
                            setSelectedTabs((prev) => prev.filter((t) => t !== tabId));
                          }
                        }}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <span>{TAB_LABELS[tabId]}</span>
                          {!grantable && !isTargetOwner && (
                            <span title="You can only grant tabs you have access to" className="text-zinc-400">
                              <Lock className="w-3 h-3 inline" />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                          {TAB_DESCRIPTIONS[tabId]}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 bg-zinc-50 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setCustomizingMember(null)}
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2 cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveCustomPermissions}
                disabled={actionLoading || isTargetOwner}
              >
                {actionLoading ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
