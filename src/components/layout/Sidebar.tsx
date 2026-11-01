import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import namasteQrIcon from '../../assets/namasteqr-icon.png';
import { 
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  QrCode,
  Users,
  Receipt,
  SlidersHorizontal,
  Building2,
  ShieldCheck,
  Globe,
  Bell,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  User,
  UserCheck,
  LogOut,
  CheckCircle2,
  Crown,
  Store,
  ExternalLink,
  ChevronDown,
  Lock,
  TrendingUp
} from 'lucide-react';
import { StaffAccountSession } from '../../types/rbac';
import { canAccessTab } from '../../utils/tabAccess';

export type DashboardTab = 
  | 'overview'
  | 'operations' 
  | 'kds' 
  | 'waiter'
  | 'menus' 
  | 'checkins' 
  | 'team' 
  | 'billing' 
  | 'analytics'
  | 'account' 
  | 'audit' 
  | 'configurations';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  staffSession: StaffAccountSession | null;
  onSwitchRole: () => void;
  onOpenProfile?: () => void;
  onOpenAddBranch?: () => void;
  onNavigate: (route: string) => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  staffSession,
  onSwitchRole,
  onOpenProfile,
  onOpenAddBranch,
  onNavigate,
  className = '',
}) => {
  const { user, logout, activeBusiness } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(1);

  const business = activeBusiness || user?.business;
  const businessName = business?.name || 'NamasteQR Venue';
  const currentUserName = staffSession?.name || user?.name || user?.email?.split('@')[0] || 'Staff';
  const userRole = staffSession?.role || user?.role || 'OWNER';

  const subject = staffSession ?? user;

  const navItems = [
    {
      id: 'overview' as DashboardTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      visible: canAccessTab(subject, 'overview'),
    },
    {
      id: 'account' as DashboardTab,
      label: 'Business Details',
      icon: Store,
      badge: null,
      visible: canAccessTab(subject, 'account'),
    },
    {
      id: 'operations' as DashboardTab,
      label: 'Business Operations',
      icon: ClipboardList,
      badge: null,
      visible: canAccessTab(subject, 'operations'),
    },
    {
      id: 'kds' as DashboardTab,
      label: 'Orders',
      icon: ClipboardList,
      badge: 'Live',
      badgeColor: 'bg-amber-500 text-white animate-pulse',
      visible: canAccessTab(subject, 'kds'),
    },
    {
      id: 'waiter' as DashboardTab,
      label: 'Waiter Station',
      icon: Bell,
      badge: null,
      visible: canAccessTab(subject, 'waiter'),
    },
    {
      id: 'checkins' as DashboardTab,
      label: 'Table & Space',
      icon: QrCode,
      badge: null,
      visible: canAccessTab(subject, 'checkins'),
    },
    {
      id: 'menus' as DashboardTab,
      label: 'Menu',
      icon: UtensilsCrossed,
      badge: null,
      visible: canAccessTab(subject, 'menus'),
    },
    {
      id: 'billing' as DashboardTab,
      label: 'Finance & POS',
      icon: Receipt,
      badge: null,
      visible: canAccessTab(subject, 'billing'),
    },
    {
      id: 'analytics' as DashboardTab,
      label: 'Analytics',
      icon: TrendingUp,
      badge: null,
      visible: canAccessTab(subject, 'analytics' as any),
    },
    {
      id: 'team' as DashboardTab,
      label: 'Staff',
      icon: Users,
      badge: null,
      visible: canAccessTab(subject, 'team'),
    },
    {
      id: 'configurations' as DashboardTab,
      label: 'Settings',
      icon: SlidersHorizontal,
      badge: null,
      visible: canAccessTab(subject, 'configurations'),
    },
  ];

  return (
    <aside
      className={`relative z-30 flex flex-col bg-white border-r border-zinc-200 transition-all duration-300 select-none ${
        isCollapsed ? 'w-20' : 'w-full md:w-64'
      } h-full md:h-screen shrink-0 shadow-sm ${className}`}
    >
      {/* Top Header: Logo + Collapse Button */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-zinc-100 shrink-0">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden cursor-pointer" onClick={() => onSelectTab('overview')}>
            <img
              src={namasteQrIcon}
              alt="NamasteQR"
              className="w-9 h-9 object-contain shrink-0"
            />
            <div className="flex flex-col">
              <span className="font-black text-base tracking-tight text-zinc-950 flex items-center gap-0.5">
                Namaste<span className="text-blue-600">QR</span>
              </span>
              <span className="text-[10px] font-semibold text-zinc-400 -mt-0.5 tracking-wider uppercase">
                Restaurant POS
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto cursor-pointer" onClick={() => onSelectTab('overview')} title="NamasteQR">
            <img
              src={namasteQrIcon}
              alt="NamasteQR"
              className="w-8 h-8 object-contain"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Business Profile Selector Card */}
      {!isCollapsed ? (
        <div className="p-3 mx-3 mt-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
              {businessName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-xs text-zinc-900 truncate">
                  {businessName}
                </h4>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <Crown className="w-2.5 h-2.5 text-amber-600" />
                  Premium
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-3 flex justify-center shrink-0">
          <div 
            className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center font-bold text-sm cursor-pointer shadow-2xs"
            title={`${businessName} (Verified)`}
          >
            {businessName.slice(0, 2).toUpperCase()}
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const hasAccess = item.visible;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              type="button"
              onClick={() => hasAccess && onSelectTab(item.id)}
              disabled={!hasAccess}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all group ${
                !hasAccess 
                  ? 'opacity-50 cursor-not-allowed bg-zinc-50 text-zinc-400 border-l-4 border-transparent'
                  : isActive
                    ? 'bg-amber-50 text-amber-700 shadow-2xs font-extrabold border-l-4 border-amber-600 cursor-pointer'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/80 border-l-4 border-transparent cursor-pointer'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform ${
                  !hasAccess ? 'text-zinc-300' : isActive ? 'text-amber-600 scale-105' : 'text-zinc-400 group-hover:text-zinc-700'
                }`}
              />

              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {!hasAccess ? (
                     <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${item.badgeColor || 'bg-amber-100 text-amber-800'}`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}


      </nav>

      {/* Bottom User Card */}
      <div className="p-3 border-t border-zinc-200/80 bg-zinc-50/70 shrink-0 mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div 
              className="flex items-center gap-2.5 min-w-0 cursor-pointer group/user hover:opacity-90 transition-opacity"
              onClick={onOpenProfile || onSwitchRole}
              title="View User Profile"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs group-hover/user:scale-105 transition-transform">
                {Array.from(currentUserName).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-900 truncate group-hover/user:text-amber-700">
                  {currentUserName}
                </div>
                <div className="text-[10px] font-mono text-zinc-500 truncate -mt-0.5">
                  @{userRole.toLowerCase().replace(/_/g, '')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                id="btn-switch-role-sidebar"
                onClick={onOpenProfile || onSwitchRole}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-zinc-100 transition cursor-pointer"
                title="User Profile"
              >
                <User className="w-4 h-4" />
              </button>
              <button
                type="button"
                id="btn-sidebar-logout"
                onClick={logout}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div 
              className="w-9 h-9 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs cursor-pointer hover:scale-105 transition-transform"
              title={`${currentUserName} (@${userRole}) - User Profile`}
              onClick={onOpenProfile || onSwitchRole}
            >
              {Array.from(currentUserName).slice(0, 2).join('').toUpperCase()}
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};


