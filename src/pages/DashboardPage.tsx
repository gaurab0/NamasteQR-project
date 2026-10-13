import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { authApi } from '../api/authApi';
import { rbacService } from '../services/rbac.service';
import { TeamStaffManagement } from '../components/team/TeamStaffManagement';
import { MenuModule } from '../components/menu/MenuModule';
import { CheckInsModule } from '../components/checkin/CheckInsModule';
import { KitchenDisplaySystem, KDSViewMode } from '../components/kds/KitchenDisplaySystem';
import { WaiterStationDashboard } from '../components/waiter/WaiterStationDashboard';
import { DateTimeDisplay } from '../components/common/DateTimeDisplay';
import { StaffRoleLoginModal } from '../components/team/StaffRoleLoginModal';
import { BillingPOS } from '../components/billing/BillingPOS';
import { StaffAccountSession, AppRole } from '../types/rbac';
import { Business, BusinessType } from '../types/auth';
import { 
  Building2, 
  CheckCircle2, 
  ShieldCheck, 
  ChefHat, 
  Bell, 
  Receipt, 
  RefreshCw, 
  Activity, 
  Users, 
  Lock, 
  Phone, 
  MapPin, 
  Edit3, 
  ExternalLink, 
  Save, 
  RotateCcw, 
  SlidersHorizontal,
  Menu,
  Clock,
  LayoutDashboard,
  QrCode,
  UtensilsCrossed,
  Sparkles,
  AlertCircle,
  ChevronDown,
  UserCheck,
  LogOut
} from 'lucide-react';
import { canAccessTab, getFirstPermittedTab, isBusinessOwner } from '../utils/tabAccess';
import { BranchSwitcher } from '../components/layout/BranchSwitcher';
import { AddBranchModal } from '../components/franchise/AddBranchModal';
import { FranchiseBranchList } from '../components/franchise/FranchiseBranchList';
import { BusinessConfigurationCenter } from '../components/config/BusinessConfigurationCenter';
import { Sidebar, DashboardTab } from '../components/layout/Sidebar';
import { OperationsOverviewDashboard } from '../components/dashboard/OperationsOverviewDashboard';
import { OperationsManagementTab } from '../components/operations/OperationsManagementTab';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
}

interface AuditLogItem {
  id: string;
  user_id?: string;
  business_id?: string;
  account_name?: string;
  email?: string;
  status?: string;
  event_type: string;
  ip_address?: string;
  user_agent?: string;
  last_active_at?: string;
  created_at: string;
  updated_at?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user, logout, updateBusiness } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [globalTimeFilter, setGlobalTimeFilter] = useState<'today' | 'week' | 'month'>('today');
  const [globalDaybookFilter, setGlobalDaybookFilter] = useState<string>('all');
  const [kdsDefaultStation, setKdsDefaultStation] = useState<KDSViewMode>('KITCHEN');
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  
  // Sidebar responsive collapse state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('serveflow_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Business Profile Configuration State
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const businessName = user?.business?.name || 'ServeFlow Business';
  const businessId = user?.business?.id || user?.id || 'default-business';
  const businessType = user?.business?.type || 'RESTAURANT';
  const phoneE164 = user?.business?.phone || user?.phone?.e164 || '';
  const businessAddress = user?.business?.address || '';

  const [bizForm, setBizForm] = useState({
    name: user?.business?.name || '',
    type: (user?.business?.type || 'RESTAURANT') as BusinessType,
    tagline: user?.business?.tagline || '',
    location: user?.business?.location || '',
    address: user?.business?.address || '',
    kitchen_hours: user?.business?.kitchen_hours || '',
    phone: user?.business?.phone || user?.phone?.e164 || '',
  });
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [bizSaveSuccess, setBizSaveSuccess] = useState<string | null>(null);
  const [bizSaveError, setBizSaveError] = useState<string | null>(null);

  const currentBusinessObj: Business = user?.business || {
    id: businessId,
    name: businessName,
    type: businessType as BusinessType,
    status: 'ACTIVE',
    location: user?.business?.location || '',
    address: user?.business?.address || '',
    phone: phoneE164,
  };

  // Sync bizForm with user.business on change or tab switch
  useEffect(() => {
    if (user?.business) {
      setBizForm({
        name: user.business.name || '',
        type: user.business.type || 'RESTAURANT',
        tagline: user.business.tagline || (user.business.type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
        location: user.business.location !== undefined ? user.business.location : 'Main Dining & Service Area',
        address: user.business.address || '',
        kitchen_hours: user.business.kitchen_hours || '07:30 AM – 10:30 PM',
        phone: user.business.phone || user.phone?.e164 || '',
      });
    }
  }, [user?.business, user?.phone?.e164]);

  // Load fresh business profile from backend when account tab opens
  useEffect(() => {
    if (activeTab === 'account' && user?.business?.id) {
      rbacService.getBusinessProfileApi(user.business.id).then((fresh) => {
        if (fresh) {
          updateBusiness(fresh);
          setBizForm({
            name: fresh.name || '',
            type: fresh.type || 'RESTAURANT',
            tagline: fresh.tagline || (fresh.type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
            location: fresh.location !== undefined ? fresh.location : 'Main Dining & Service Area',
            address: fresh.address || '',
            kitchen_hours: fresh.kitchen_hours || '07:30 AM – 10:30 PM',
            phone: fresh.phone || user.phone?.e164 || '',
          });
        }
      }).catch(() => {});
    }
  }, [activeTab, user?.business?.id]);

    // Role Authentication / View-Only State
  const [staffSession, setStaffSession] = useState<StaffAccountSession | null>(() => rbacService.getCurrentStaffSession());
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const currentUserName = staffSession?.name || user?.name || user?.email?.split('@')[0] || 'User';

  const subject = staffSession ?? user;

  useEffect(() => {
    const isPermitted = activeTab === 'audit'
      ? isBusinessOwner(subject?.role)
      : canAccessTab(subject, activeTab as any);

    if (!isPermitted) {
      const first = getFirstPermittedTab(subject);
      if (first) {
        setActiveTab(first);
      }
    }
  }, [staffSession, user, activeTab]);

  useEffect(() => {
    const handleSessionChange = () => {
      setStaffSession(rbacService.getCurrentStaffSession());
    };
    window.addEventListener('serveflow:staff-session-changed', handleSessionChange);
    return () => {
      window.removeEventListener('serveflow:staff-session-changed', handleSessionChange);
    };
  }, []);

  const isViewOnly = !staffSession && !user;

  const filterCurrentAccountLogs = (logs: AuditLogItem[]) => {
    if (!logs || logs.length === 0) return [];
    const currentUserId = user?.id;
    const currentEmail = user?.email?.toLowerCase().trim();
    const currentName = user?.business?.name?.toLowerCase().trim();

    const matched = logs.filter((log) => {
      if (currentUserId && (log.id === currentUserId || log.user_id === currentUserId)) return true;
      if (currentEmail && log.email && log.email.toLowerCase().trim() === currentEmail) return true;
      if (currentName && ((log.account_name && log.account_name.toLowerCase().trim() === currentName) || (log.business_id && log.business_id.toLowerCase().trim() === currentName))) return true;
      return false;
    });

    return matched.length > 0 ? matched.slice(0, 1) : logs.slice(0, 1);
  };

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await authApi.getAuditLogs({ userId: user?.id, email: user?.email });
      if (res?.data?.logs) {
        setAuditLogs(filterCurrentAccountLogs(res.data.logs));
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
      const timer = setInterval(() => {
        authApi.getAuditLogs({ userId: user?.id, email: user?.email }).then((res) => {
          if (res?.data?.logs) {
            setAuditLogs(filterCurrentAccountLogs(res.data.logs));
          }
        }).catch(() => {});
      }, 8000);
      return () => clearInterval(timer);
    }
  }, [activeTab, user?.id, user?.email]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-900">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mb-3" />
        <p className="text-sm font-semibold text-zinc-700">Loading your operations workspace...</p>
      </div>
    );
  }

  const handleRoleAuthSuccess = (session: StaffAccountSession) => {
    setStaffSession(session);
  };

  const handleRoleSignOut = () => {
    rbacService.clearStaffSession();
    setStaffSession(null);
  };

  const getRoleLabel = (role?: string) => {
    if (!role) return 'View-Only (Unassigned)';
    switch (role) {
      case 'HOTEL_OWNER':
      case 'RESTAURANT_OWNER':
      case 'OWNER':
        return 'Business Owner (Restaurant / Hotel)';
      case 'ADMIN':
        return 'System Administrator';
      case 'MANAGER':
      case 'HOTEL_MANAGER':
      case 'RESTAURANT_MANAGER':
        return 'General Manager';
      case 'FRONT_DESK':
        return 'Front Desk & Reception';
      case 'KITCHEN_STAFF':
        return 'Kitchen Staff & Chef';
      case 'CASHIER':
        return 'Cashier & Billing';
      case 'HOUSEKEEPING':
        return 'Housekeeping';
      default:
        return role.replace(/_/g, ' ');
    }
  };

  const getBusinessTypeLabel = (type: string) => {
    switch (type) {
      case 'RESTAURANT':
        return 'Restaurant';
      case 'HOTEL':
        return 'Hotel Property';
      case 'RESORT':
        return 'Resort & Spa';
      case 'CAFE':
        return 'Café & Bakery';
      case 'BAR':
        return 'Bar & Lounge';
      default:
        return type;
    }
  };

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizForm.name.trim()) {
      setBizSaveError('Business display name cannot be empty.');
      return;
    }
    if (isViewOnly) {
      setIsRoleModalOpen(true);
      return;
    }

    setSavingBusiness(true);
    setBizSaveError(null);
    setBizSaveSuccess(null);
    try {
      const updated = await rbacService.updateBusinessProfileApi({
        id: businessId,
        name: bizForm.name.trim(),
        business_type: bizForm.type,
        tagline: bizForm.tagline.trim(),
        location: bizForm.location.trim(),
        address: bizForm.address.trim(),
        kitchen_hours: bizForm.kitchen_hours.trim(),
        phone: bizForm.phone.trim(),
      }, businessId);
      updateBusiness({
        ...user?.business,
        ...updated,
        name: bizForm.name.trim(),
        type: bizForm.type,
        tagline: bizForm.tagline.trim(),
        location: bizForm.location.trim(),
        address: bizForm.address.trim(),
        kitchen_hours: bizForm.kitchen_hours.trim(),
        phone: bizForm.phone.trim(),
      });
      setBizSaveSuccess('Business profile and live customer menu configuration updated successfully!');
      setIsEditingBusiness(false);
      setTimeout(() => setBizSaveSuccess(null), 6000);
    } catch (err: any) {
      setBizSaveError(err.message || 'Failed to update business configuration');
    } finally {
      setSavingBusiness(false);
    }
  };

  return (
    <div id="main-dashboard-container" className="flex h-screen overflow-hidden bg-zinc-100/70 text-zinc-900 font-sans">
      {/* Desktop Left RestroX-style Collapsible Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
          }}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => {
            const next = !isCollapsed;
            setIsCollapsed(next);
            try {
              localStorage.setItem('serveflow_sidebar_collapsed', String(next));
            } catch {}
          }}
          staffSession={staffSession}
          onSwitchRole={() => setIsRoleModalOpen(true)}
          onOpenAddBranch={() => setIsAddBranchModalOpen(true)}
          onNavigate={onNavigate}
        />
      </div>

      {/* Mobile Slide-Out Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-10">
            <Sidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                setIsMobileMenuOpen(false);
              }}
              isCollapsed={false}
              onToggleCollapse={() => setIsMobileMenuOpen(false)}
              staffSession={staffSession}
              onSwitchRole={() => {
                setIsMobileMenuOpen(false);
                setIsRoleModalOpen(true);
              }}
              onOpenAddBranch={() => {
                setIsMobileMenuOpen(false);
                setIsAddBranchModalOpen(true);
              }}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}

      {/* Main Workspace (Right Area) */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        {/* Top Workspace Header Bar matching RestroX layout */}
        <header className="h-16 px-4 sm:px-6 bg-white border-b border-zinc-200/90 flex items-center justify-between shrink-0 shadow-2xs z-20">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger menu toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar shrink-0">
              <DateTimeDisplay mode={user?.business?.date_format_nav || 'ENGLISH'} />
            </div>
          </div>

          {/* Right Controls matching RestroX: Date Filter + Daybook + Branch Analytics */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Timeframe Filter */}
            <div className="hidden lg:flex relative items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 bg-zinc-50 shadow-2xs hover:bg-zinc-100 transition-colors">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={globalTimeFilter}
                onChange={(e) => setGlobalTimeFilter(e.target.value as any)}
                className="appearance-none bg-transparent outline-none pr-4 cursor-pointer text-zinc-700 font-bold"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Daybook selector */}
            <div className="hidden xl:flex relative items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 bg-zinc-50 shadow-2xs hover:bg-zinc-100 transition-colors">
              <select
                value={globalDaybookFilter}
                onChange={(e) => setGlobalDaybookFilter(e.target.value)}
                className="appearance-none bg-transparent outline-none pr-4 cursor-pointer text-zinc-700 font-bold"
              >
                <option value="all">Daybook: All</option>
                <option value="dine_in">Daybook: Dine-In</option>
                <option value="delivery">Daybook: Delivery</option>
                <option value="takeaway">Daybook: Takeaway</option>
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Branch Switcher / Analytics */}
            <BranchSwitcher onOpenAddBranch={() => setIsAddBranchModalOpen(true)} />

            {/* Switch User Button */}
            <button
              type="button"
              id="btn-switch-user-header"
              onClick={() => setIsRoleModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition cursor-pointer shadow-2xs"
              title="Switch Staff Designation / Account"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-700" />
              <span>{currentUserName}</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 space-y-6">
          {!isBusinessOwner(subject?.role) && getFirstPermittedTab(subject) === null ? (
            <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
              <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                  <Lock className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">No tabs assigned</h2>
                  <p className="text-sm text-zinc-600 mt-2">
                    Your account has no dashboard access yet. Ask the business owner to assign tabs.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={() => setIsRoleModalOpen(true)}
                    leftIcon={<UserCheck className="w-4 h-4" />}
                    className="w-full sm:w-auto"
                  >
                    Switch Role
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={logout}
                    leftIcon={<LogOut className="w-4 h-4" />}
                    className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-white"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Operations Overview Tab matching the RestroX Design */}
              {activeTab === 'overview' && canAccessTab(subject, 'overview') && (
            <OperationsOverviewDashboard
              business={currentBusinessObj}
              user={user}
              staffSession={staffSession}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenRoleModal={() => setIsRoleModalOpen(true)}
              timeFilter={globalTimeFilter}
              onChangeTimeFilter={setGlobalTimeFilter}
              daybookFilter={globalDaybookFilter}
            />
          )}

          {activeTab === 'operations' && canAccessTab(subject, 'operations') && <OperationsManagementTab />}

          {/* KDS & Live Orders Tab */}
          {activeTab === 'kds' && canAccessTab(subject, 'kds') && (
            <KitchenDisplaySystem
              businessId={businessId}
              businessName={businessName}
              currentUserRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              defaultStation={kdsDefaultStation}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
            />
          )}

          {/* Waiter Station Tab */}
          {activeTab === 'waiter' && canAccessTab(subject, 'waiter') && (
            <WaiterStationDashboard
              businessId={businessId}
              businessName={businessName}
              currentUserRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
            />
          )}

          {/* Menus Management Tab */}
          {activeTab === 'menus' && canAccessTab(subject, 'menus') && (
            <MenuModule 
              businessId={businessId}
              currentUserRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
              onNavigate={onNavigate}
            />
          )}

          {/* Check-Ins & Tables Tab */}
          {activeTab === 'checkins' && canAccessTab(subject, 'checkins') && (
            <CheckInsModule
              businessId={businessId}
              businessName={businessName}
              currentUserRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
            />
          )}

          {/* Team Management Tab */}
          {activeTab === 'team' && canAccessTab(subject, 'team') && (
            <TeamStaffManagement 
              businessId={businessId}
              businessName={businessName}
              currentUserRole={staffSession?.role || user.role}
              currentUserId={user.id}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
            />
          )}

          {/* Billing & POS Tab */}
          {activeTab === 'billing' && canAccessTab(subject, 'billing') && (
            <BillingPOS
              business={currentBusinessObj}
              user={user}
              activeRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
              onNavigate={onNavigate}
            />
          )}

          {/* Settings & Configurations Tab */}
          {activeTab === 'configurations' && canAccessTab(subject, 'configurations') && (
            <BusinessConfigurationCenter
              business={currentBusinessObj}
              user={user}
              activeRole={staffSession?.role || user.role}
              isViewOnly={isViewOnly}
              onRequestRoleSignIn={() => setIsRoleModalOpen(true)}
              onNavigate={onNavigate}
            />
          )}

          {/* Business Details & Profile Tab */}
          {activeTab === 'account' && canAccessTab(subject, 'account') && (
            <div className="space-y-6 max-w-5xl">
              {bizSaveSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 text-sm font-semibold shadow-2xs">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>{bizSaveSuccess}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate(`/menu?businessId=${encodeURIComponent(businessId)}`)}
                    rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                    className="bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs"
                  >
                    View Customer Menu
                  </Button>
                </div>
              )}

              {bizSaveError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-900 text-sm font-semibold shadow-2xs">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{bizSaveError}</span>
                </div>
              )}

              {/* Main Business Profile Card */}
              <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-bold">
                        {user.business?.type === 'HOTEL' ? '🏨' : user.business?.type === 'CAFE' ? '☕' : user.business?.type === 'BAR' ? '🍸' : '🍲'}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-zinc-900">
                          Business Profile & Dining Settings
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Public business details displayed on table QR barcodes, guest menus, and receipts.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {!isEditingBusiness ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onNavigate(`/menu?businessId=${encodeURIComponent(businessId)}`)}
                          leftIcon={<ExternalLink className="w-3.5 h-3.5 text-zinc-500" />}
                          className="text-xs font-semibold"
                        >
                          Preview Menu
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            if (isViewOnly) {
                              setIsRoleModalOpen(true);
                            } else {
                              setIsEditingBusiness(true);
                            }
                          }}
                          leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold"
                        >
                          Edit Details
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingBusiness(false);
                          setBizSaveError(null);
                        }}
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                        className="text-xs font-semibold"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* View or Edit Mode Form */}
                {isEditingBusiness ? (
                  <form onSubmit={handleSaveBusinessProfile} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Business / Trade Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={bizForm.name}
                          onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
                          placeholder="e.g., Annapurna Vista Dining"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Business Operation Type
                        </label>
                        <select
                          value={bizForm.type}
                          onChange={(e) => setBizForm({ ...bizForm, type: e.target.value as any })}
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition cursor-pointer"
                        >
                          <option value="RESTAURANT">Restaurant (Dining & Kitchen)</option>
                          <option value="HOTEL">Hotel Property (Rooms & Hospitality)</option>
                          <option value="RESORT">Resort & Spa</option>
                          <option value="CAFE">Café & Bakery</option>
                          <option value="BAR">Bar & Lounge</option>
                          <option value="OTHER">Other Hospitality</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Cuisine / Hospitality Tagline
                        </label>
                        <input
                          type="text"
                          value={bizForm.tagline}
                          onChange={(e) => setBizForm({ ...bizForm, tagline: e.target.value })}
                          placeholder="Authentic Cuisine • Prepared Fresh to Order"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Street Address / City
                        </label>
                        <input
                          type="text"
                          value={bizForm.address}
                          onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
                          placeholder="e.g., Street 14, Lakeside Pokhara"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Dining Hall / Seating Zone
                        </label>
                        <input
                          type="text"
                          value={bizForm.location}
                          onChange={(e) => setBizForm({ ...bizForm, location: e.target.value })}
                          placeholder="e.g., Main Dining & Service Area"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Operating / Kitchen Hours
                        </label>
                        <input
                          type="text"
                          value={bizForm.kitchen_hours}
                          onChange={(e) => setBizForm({ ...bizForm, kitchen_hours: e.target.value })}
                          placeholder="e.g., 07:30 AM – 10:30 PM"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                          Public Contact Phone
                        </label>
                        <input
                          type="text"
                          value={bizForm.phone}
                          onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })}
                          placeholder="e.g., +977-9800000000"
                          className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={() => setIsEditingBusiness(false)}
                        disabled={savingBusiness}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={savingBusiness}
                        leftIcon={<Save className="w-4 h-4" />}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                      >
                        {savingBusiness ? 'Saving Changes...' : 'Save & Publish Changes'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Business Display Name
                        </label>
                        <div className="text-base font-extrabold text-zinc-900 mt-1">
                          {user.business?.name || 'ServeFlow Business'}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Operation Category
                        </label>
                        <div className="text-sm font-bold text-zinc-900 mt-1">
                          {getBusinessTypeLabel(user.business?.type || 'RESTAURANT')}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Account Status
                        </label>
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active & Verified
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100 sm:col-span-2">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Hospitality & Cuisine Tagline
                        </label>
                        <div className="text-xs text-zinc-700 font-medium mt-1">
                          {user.business?.tagline || 'Authentic Cuisine • Prepared Fresh to Order'}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Street Address / Location
                        </label>
                        <div className="text-xs font-semibold text-zinc-800 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{user.business?.address || 'Not configured'}</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Dining Hall / Seating Zone
                        </label>
                        <div className="text-xs font-semibold text-zinc-800 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{user.business?.location || 'Main Dining & Service Area'}</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Kitchen & Service Hours
                        </label>
                        <div className="text-xs font-semibold text-zinc-800 mt-1 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{user.business?.kitchen_hours || '07:30 AM – 10:30 PM'}</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-100">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                          Contact Phone
                        </label>
                        <div className="text-xs font-mono font-bold text-zinc-800 mt-1 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{user.business?.phone || phoneE164 || 'Not configured'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Franchise & Multi-Branch Management Section */}
              <FranchiseBranchList onOpenAddBranch={() => setIsAddBranchModalOpen(true)} />
            </div>
          )}
            </>
          )}
        </main>
      </div>

      {/* Staff Role Sign-In Modal */}
      <StaffRoleLoginModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        onSuccess={handleRoleAuthSuccess}
        businessName={businessName}
        businessId={businessId}
        businessOwnerEmail={user.email}
      />

      {/* Add Franchise Branch Modal */}
      <AddBranchModal
        isOpen={isAddBranchModalOpen}
        onClose={() => setIsAddBranchModalOpen(false)}
      />
    </div>
  );
};

