import { DateTimeDisplay } from '../common/DateTimeDisplay';
import { renderFormattedDate, DateFormatMode } from '../../utils/dateFormatter';
import { Globe, Receipt, Calendar } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Business, BusinessType, MenuThemeConfig } from '../../types/auth';
import { 
  MenuItem, 
  MenuCategory, 
  MenuStatus, 
  AppRole, 
  BusinessTaxConfig, 
  GLAccountLink,
  RestaurantTable
} from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { authApi } from '../../api/authApi';
import { Button } from '../ui/Button';

// Configuration Sub-Components
import { MenuThemeCustomizerModal } from '../menu/MenuThemeCustomizerModal';
import { MenuItemFormModal } from '../menu/MenuItemFormModal';
import { MenuItemCard } from '../menu/MenuItemCard';
import { MenuItemPreviewModal } from '../menu/MenuItemPreviewModal';
import { DeleteConfirmationModal } from '../menu/DeleteConfirmationModal';
import { CategoryManager } from '../menu/CategoryManager';
import { TableManagementGrid } from '../tables/TableManagementGrid';
import { TaxConfigurationPanel } from '../billing/TaxConfigurationPanel';
import { GLAccountsTable } from '../billing/GLAccountsTable';
import { ExcelSheetPreviewModal } from '../billing/ExcelSheetPreviewModal';
import { FranchiseBranchList } from '../franchise/FranchiseBranchList';
import { AddBranchModal } from '../franchise/AddBranchModal';
import { TeamStaffManagement } from '../team/TeamStaffManagement';
import { buildSalesWorkbookData, ExcelSheetData } from '../../utils/excelExport';

import {
  UtensilsCrossed,
  Paintbrush,
  QrCode,
  Sliders,
  BookOpen,
  Building2,
  Store,
  Users,
  ShieldCheck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Save,
  RotateCcw,
  Edit3,
  Clock,
  MapPin,
  Phone,
  Mail,
  FileSpreadsheet,
  Download,
  RefreshCw,
  AlertCircle,
  Crown,
  Layers,
  Lock,
  Tag,
  Image as ImageIcon,
  Upload,
  Trash2,
  Check,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  FileText,
  X,
  Printer,
} from 'lucide-react';

import { PrinterConfiguration } from './PrinterConfiguration';

export type ConfigurationDomain =
  | 'menu'
  | 'themes'
  | 'tables'
  | 'taxes'
  | 'gl_accounts'
  | 'business_profile'
  | 'franchise'
  | 'team'
  | 'audit'
  | 'hardware'
  | 'date_localization';

interface ConfigurationNavOption {
  id: ConfigurationDomain;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const CONFIG_NAV_OPTIONS: ConfigurationNavOption[] = [
  {
    id: 'menu',
    label: 'Menu & Dish Catalog',
    shortLabel: 'Menu',
    description: 'Add dishes, pricing, variants, categories, and availability.',
    icon: <UtensilsCrossed className="w-4 h-4" />,
    badge: 'Catalog',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    id: 'themes',
    label: 'Themes, Branding & Layout',
    shortLabel: 'Themes',
    description: 'Color palettes, local logo & backdrop images, layout styles.',
    icon: <Paintbrush className="w-4 h-4" />,
    badge: 'Design',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  {
    id: 'tables',
    label: 'Dining Tables & QR Codes',
    shortLabel: 'Tables',
    description: 'Add tables, assign floors, capacity, and generate QR cards.',
    icon: <QrCode className="w-4 h-4" />,
    badge: 'Floor Plan',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    id: 'taxes',
    label: 'Taxes, Currency & Invoicing',
    shortLabel: 'Taxes',
    description: 'Configure VAT %, Service Charge, PAN, currency, promo vouchers.',
    icon: <Sliders className="w-4 h-4" />,
    badge: 'Financial',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'gl_accounts',
    label: 'GL Accounts & Link Mapping',
    shortLabel: 'GL Links',
    description: 'Chart of accounts code mapping for sales, tax, and settlement.',
    icon: <BookOpen className="w-4 h-4" />,
    badge: 'ERP Sync',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'business_profile',
    label: 'Business Details & Hours',
    shortLabel: 'Profile',
    description: 'Registered trade name, tagline, dining area, and kitchen hours.',
    icon: <Building2 className="w-4 h-4" />,
    badge: 'Core Details',
    badgeColor: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  },
  {
    id: 'franchise',
    label: 'Franchise & Multi-Branch',
    shortLabel: 'Branches',
    description: 'Manage multiple restaurant outlets and branch codes.',
    icon: <Store className="w-4 h-4" />,
    badge: 'Multi-Unit',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  {
    id: 'team',
    label: 'Staff Roles & Security PINs',
    shortLabel: 'Staff Roles',
    description: 'Staff member role permissions, access control, and PINs.',
    icon: <Users className="w-4 h-4" />,
    badge: 'Security',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  {
    id: 'audit',
    label: 'Security & Audit Logs',
    shortLabel: 'Audit Trail',
    description: 'Track operations activity, sign-ins, and security logs.',
    icon: <ShieldCheck className="w-4 h-4" />,
    badge: 'Logs',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
  },
  {
    id: 'date_localization',
    label: 'Operations & Localization',
    shortLabel: 'Localization',
    description: 'Configure Nepali and English date & time formats for the app and billing.',
    icon: <Globe className="w-4 h-4" />,
    badge: 'Localization',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  {
    id: 'hardware',
    label: 'Hardware & Printers',
    shortLabel: 'Hardware',
    description: 'Configure receipt printers, KOT routing, and KDS mode.',
    icon: <Printer className="w-4 h-4" />,
    badge: 'Devices',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
];

interface BusinessConfigurationCenterProps {
  business: Business;
  user: any;
  activeRole?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
  onNavigate: (route: string) => void;
  initialDomain?: ConfigurationDomain;
}

export const BusinessConfigurationCenter: React.FC<BusinessConfigurationCenterProps> = ({
  business,
  user,
  activeRole = 'OWNER',
  isViewOnly = false,
  onRequestRoleSignIn,
  onNavigate,
  initialDomain = 'menu',
}) => {
  const { updateBusiness } = useAuth();
  const [activeDomain, setActiveDomain] = useState<ConfigurationDomain>(initialDomain);
  const [domainSearchFilter, setDomainSearchFilter] = useState('');

  const businessId = business?.id || user?.business?.id || 'default-biz';
  const [businessProfile, setBusinessProfile] = useState<Business>(business as Business);
  const activeBusiness = businessProfile || business || user?.business;
  const businessName = business?.name || user?.business?.name || 'ServeFlow Business';
  const phoneE164 = business?.phone || user?.phone?.e164 || '';
  const isOwnerOrAdmin = !isViewOnly;
  const canCreateMenu = !isViewOnly;

  // ==========================================
  // DOMAIN: DATE & TIME LOCALIZATION STATE
  // ==========================================
  const [navDateFormat, setNavDateFormat] = useState<DateFormatMode>(() => {
    return (businessProfile?.date_format_nav as DateFormatMode) || (business?.date_format_nav as DateFormatMode) || 'ENGLISH';
  });
  const [billingDateFormat, setBillingDateFormat] = useState<DateFormatMode>(() => {
    return (businessProfile?.date_format_billing as DateFormatMode) || (business?.date_format_billing as DateFormatMode) || 'ENGLISH';
  });
  const [dateSaving, setDateSaving] = useState(false);
  const [dateSaveSuccess, setDateSaveSuccess] = useState<string | null>(null);

  // SYNC BUSINESS AND DATE FORMAT FROM PROPS/AUTH ON RELOAD
  useEffect(() => {
    const biz = business || user?.business;
    if (biz) {
      setBusinessProfile((prev) => ({
        ...prev,
        ...biz,
      }));
      if (biz.date_format_nav) {
        setNavDateFormat(biz.date_format_nav as DateFormatMode);
      }
      if (biz.date_format_billing) {
        setBillingDateFormat(biz.date_format_billing as DateFormatMode);
      }
    }
  }, [business, user?.business]);

  const handleSaveDateLocalization = async (newNavFormat?: DateFormatMode, newBillingFormat?: DateFormatMode) => {
    const navVal = newNavFormat || navDateFormat;
    const billingVal = newBillingFormat || billingDateFormat;
    try {
      setDateSaving(true);
      await rbacService.updateBusinessProfileApi({
        date_format_nav: navVal,
        date_format_billing: billingVal,
      }, businessId);

      const freshBiz = {
        ...businessProfile,
        date_format_nav: navVal,
        date_format_billing: billingVal,
      };
      setBusinessProfile(freshBiz);
      updateBusiness(freshBiz);
      setDateSaveSuccess('Date & time localization settings saved successfully!');
      setTimeout(() => setDateSaveSuccess(null), 3500);
    } catch (err: any) {
      alert(`Failed to save date localization: ${err.message}`);
    } finally {
      setDateSaving(false);
    }
  };

  const handleNavFormatChange = (val: DateFormatMode) => {
    setNavDateFormat(val);
    handleSaveDateLocalization(val, billingDateFormat);
  };

  const handleBillingFormatChange = (val: DateFormatMode) => {
    setBillingDateFormat(val);
    handleSaveDateLocalization(navDateFormat, val);
  };

  // ==========================================
  // DOMAIN 1: MENU & DISH CATALOG STATE
  // ==========================================
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [isMenuItemFormOpen, setIsMenuItemFormOpen] = useState(false);
  const [menuItemToEdit, setMenuItemToEdit] = useState<MenuItem | null>(null);
  const [previewMenuItem, setPreviewMenuItem] = useState<MenuItem | null>(null);
  const [menuItemToDelete, setMenuItemToDelete] = useState<MenuItem | null>(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuSelectedCategory, setMenuSelectedCategory] = useState('All');
  const [menuDietaryFilter, setMenuDietaryFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const [menuStatusFilter, setMenuStatusFilter] = useState<'all' | MenuStatus>('all');
  const [menuSuccessMsg, setMenuSuccessMsg] = useState<string | null>(null);
  const [menuErrorMsg, setMenuErrorMsg] = useState<string | null>(null);

  const fetchMenuData = async () => {
    setLoadingMenu(true);
    try {
      const [items, cats] = await Promise.all([
        rbacService.getMenusApi(businessId),
        rbacService.getCategoriesApi(businessId).catch(() => []),
      ]);
      setMenuItems(items);
      setCategories(cats);
    } catch (e: any) {
      console.warn('Failed loading menu for config center:', e);
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => {
    fetchMenuData();
  }, [businessId]);

  // ==========================================
  // DOMAIN 2: THEMES & BRANDING STATE
  // ==========================================

  const [isThemeStudioOpen, setIsThemeStudioOpen] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaveSuccess, setThemeSaveSuccess] = useState<string | null>(null);

  const currentTheme = useMemo<MenuThemeConfig>(() => {
    return (
      businessProfile?.menu_theme_config || {
        preset: 'minimal',
        fontFamily: 'sans',
        layoutMode: 'cards',
      }
    );
  }, [businessProfile]);

  const handleUpdateTheme = async (updatedConfig: MenuThemeConfig) => {
    try {
      setThemeSaving(true);
      await rbacService.updateBusinessProfileApi({ menu_theme_config: updatedConfig }, businessId);
      const freshBiz = {
        ...businessProfile,
        menu_theme_config: updatedConfig,
      };
      setBusinessProfile(freshBiz);
      updateBusiness(freshBiz);
      setThemeSaveSuccess('Theme & layout configuration published to customer menu!');
      setTimeout(() => setThemeSaveSuccess(null), 4000);
    } catch (err: any) {
      alert(`Failed to save theme: ${err.message}`);
    } finally {
      setThemeSaving(false);
    }
  };

  // Quick Preset Selection
  const PRESET_OPTIONS = [
    { id: 'minimal', name: 'Modern Minimal', colorBg: 'bg-zinc-100', colorText: 'text-zinc-900', border: 'border-zinc-300' },
    { id: 'bistro', name: 'Warm Bistro', colorBg: 'bg-orange-50', colorText: 'text-orange-950', border: 'border-orange-300' },
    { id: 'midnight', name: 'Midnight Dark', colorBg: 'bg-zinc-900', colorText: 'text-amber-400', border: 'border-zinc-700' },
    { id: 'emerald', name: 'Royal Emerald', colorBg: 'bg-[#062c22]', colorText: 'text-emerald-200', border: 'border-emerald-700' },
    { id: 'vibrant', name: 'Vibrant Cafe', colorBg: 'bg-rose-50', colorText: 'text-rose-700', border: 'border-rose-300' },
    { id: 'rustic', name: 'Rustic Wood Bento', colorBg: 'bg-[#4a2e18]', colorText: 'text-amber-200', border: 'border-amber-700' },
  ];

  const handleQuickApplyPreset = async (presetId: string) => {
    const updated: MenuThemeConfig = {
      ...currentTheme,
      preset: presetId as any,
    };
    await handleUpdateTheme(updated);
  };

  // Local Logo / Backdrop image picker with compression
  const handleUploadBrandingImage = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'backdrop') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const updatedConfig: MenuThemeConfig = {
          ...currentTheme,
          [type === 'logo' ? 'logoUrl' : 'backdropUrl']: dataUrl,
        };
        await handleUpdateTheme(updatedConfig);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(`Error uploading ${type}: ${err.message}`);
    }
  };

  const handleRemoveBrandingImage = async (type: 'logo' | 'backdrop') => {
    const updatedConfig: MenuThemeConfig = {
      ...currentTheme,
      [type === 'logo' ? 'logoUrl' : 'backdropUrl']: undefined,
    };
    await handleUpdateTheme(updatedConfig);
  };

  // ==========================================
  // DOMAIN 4: TAX & INVOICING CONFIG STATE
  // ==========================================
  const [taxConfig, setTaxConfig] = useState<BusinessTaxConfig | null>(null);
  const [loadingTax, setLoadingTax] = useState(false);

  const fetchTaxConfig = async () => {
    setLoadingTax(true);
    try {
      const data = await rbacService.getTaxConfigApi(businessId);
      setTaxConfig(data);
    } catch (e: any) {
      console.warn('Failed loading tax config:', e);
    } finally {
      setLoadingTax(false);
    }
  };

  useEffect(() => {
    fetchTaxConfig();
  }, [businessId]);

  // ==========================================
  // DOMAIN 5: GL ACCOUNTS & MAPPING STATE
  // ==========================================
  const [glAccounts, setGlAccounts] = useState<GLAccountLink[]>([]);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelPreviewSheets, setExcelPreviewSheets] = useState<ExcelSheetData[]>([]);

  const fetchGLAccounts = async () => {
    try {
      const data = await rbacService.getGLAccountsApi(businessId);
      setGlAccounts(data);
    } catch (e) {
      console.warn('Failed loading GL accounts:', e);
    }
  };

  useEffect(() => {
    fetchGLAccounts();
  }, [businessId]);

  const handleOpenExcelPreview = async () => {
    try {
      const sales = await rbacService.getSalesApi({}, businessId);
      const sheets = buildSalesWorkbookData(sales, glAccounts, taxConfig?.currency || 'Rs.');
      setExcelPreviewSheets(sheets);
      setExcelPreviewOpen(true);
    } catch (err: any) {
      alert(`Failed to prepare Excel preview: ${err.message}`);
    }
  };

  // ==========================================
  // DOMAIN 6: BUSINESS DETAILS STATE
  // ==========================================
  const [bizForm, setBizForm] = useState({
    name: business?.name || '',
    type: (business?.type || 'RESTAURANT') as BusinessType,
    tagline: business?.tagline || '',
    location: business?.location || '',
    address: business?.address || '',
    kitchen_hours: business?.kitchen_hours || '',
    phone: business?.phone || phoneE164 || '',
  });
  const [savingBizProfile, setSavingBizProfile] = useState(false);
  const [bizSaveSuccessMsg, setBizSaveSuccessMsg] = useState<string | null>(null);

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewOnly) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    setSavingBizProfile(true);
    setBizSaveSuccessMsg(null);
    try {
      const updated = await rbacService.updateBusinessProfileApi({
        name: bizForm.name.trim(),
        business_type: bizForm.type,
        tagline: bizForm.tagline.trim(),
        location: bizForm.location.trim(),
        address: bizForm.address.trim(),
        kitchen_hours: bizForm.kitchen_hours.trim(),
        phone: bizForm.phone.trim(),
      }, businessId);

      const freshBiz: Business = {
        ...businessProfile,
        name: updated.name,
        type: updated.type,
        tagline: updated.tagline,
        location: updated.location !== undefined ? updated.location : bizForm.location.trim(),
        address: updated.address !== undefined ? updated.address : bizForm.address.trim(),
        kitchen_hours: updated.kitchen_hours,
        phone: updated.phone,
      };
      setBusinessProfile(freshBiz);
      updateBusiness(freshBiz);
      setBizSaveSuccessMsg('Business details published to all customer menus and receipts!');
      setTimeout(() => setBizSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to update business profile: ${err.message}`);
    } finally {
      setSavingBizProfile(false);
    }
  };

  // ==========================================
  // DOMAIN 7: FRANCHISE STATE
  // ==========================================
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);

  // ==========================================
  // DOMAIN 9: SECURITY & AUDIT LOGS STATE
  // ==========================================
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditDateFilter, setAuditDateFilter] = useState('');
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);

  const handleDeleteLogs = async (type: 'ALL' | 'DAY' | 'CUSTOM') => {
    let dateToPass = undefined;
    if (type === 'DAY') {
       dateToPass = new Date().toISOString().split('T')[0]; // Today
    } else if (type === 'CUSTOM') {
       if (!auditDateFilter) {
          alert('Please select a date to filter before deleting custom logs.');
          return;
       }
       dateToPass = auditDateFilter;
    }
    
    const confirmMsg = type === 'ALL' ? 'ALL audit logs' : (type === 'DAY' ? 'TODAY\'S audit logs' : 'logs for the SELECTED DATE');
    if (!window.confirm(`Are you sure you want to delete ${confirmMsg}? This cannot be undone.`)) return;
    
    setIsDeletingLogs(true);
    try {
      await authApi.deleteAuditLogs({
        userId: user?.id,
        email: user?.email,
        filterType: type,
        date: dateToPass,
      });
      alert('Audit logs deleted successfully.');
      fetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert('Failed to delete audit logs.');
    } finally {
      setIsDeletingLogs(false);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    if (!auditDateFilter) return auditLogs;
    return auditLogs.filter(log => {
      const d = new Date(log.created_at || log.last_active_at);
      // Adjust to local date string matching YYYY-MM-DD
      const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      return localDate === auditDateFilter;
    });
  }, [auditLogs, auditDateFilter]);


  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await authApi.getAuditLogs({ userId: user?.id, email: user?.email });
      if (res?.data?.logs) {
        setAuditLogs(res.data.logs);
      }
    } catch (e) {
      console.warn('Failed loading audit logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeDomain === 'audit') {
      fetchAuditLogs();
    }
  }, [activeDomain]);

  // Filtered menu items for Domain 1
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchSearch =
        !menuSearchQuery ||
        item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(menuSearchQuery.toLowerCase()));

      const matchCategory =
        menuSelectedCategory === 'All' ||
        item.category === menuSelectedCategory ||
        (item.additional_categories && item.additional_categories.includes(menuSelectedCategory));

      const matchDietary =
        menuDietaryFilter === 'all' || item.food_type === menuDietaryFilter;

      const matchStatus =
        menuStatusFilter === 'all' || item.status === menuStatusFilter;

      return matchSearch && matchCategory && matchDietary && matchStatus;
    });
  }, [menuItems, menuSearchQuery, menuSelectedCategory, menuDietaryFilter, menuStatusFilter]);

  // Filtered navigation domains
  const filteredNavOptions = useMemo(() => {
    if (!domainSearchFilter.trim()) return CONFIG_NAV_OPTIONS;
    const query = domainSearchFilter.toLowerCase();
    return CONFIG_NAV_OPTIONS.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.shortLabel.toLowerCase().includes(query) ||
        opt.description.toLowerCase().includes(query)
    );
  }, [domainSearchFilter]);

  const activeOptionMeta = CONFIG_NAV_OPTIONS.find((o) => o.id === activeDomain) || CONFIG_NAV_OPTIONS[0];

  return (
    <div id="business-configuration-center" className="space-y-6">

      {/* Main Configuration Grid: Navigation Sidebar + Configuration Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navigation Sidebar (3 Cols on Large) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-3 bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/90 shadow-xs">
          {/* Quick Search across Configuration Domains */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={domainSearchFilter}
              onChange={(e) => setDomainSearchFilter(e.target.value)}
              placeholder="Filter configurations..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-2 pt-1">
            Configuration Sections ({filteredNavOptions.length})
          </div>

          {/* Navigation Option Items */}
          <nav className="space-y-1.5" aria-label="Configuration Sections">
            {filteredNavOptions.map((opt) => {
              const isActive = activeDomain === opt.id;
              return (
                <button
                  key={opt.id}
                  id={`nav-config-${opt.id}`}
                  type="button"
                  onClick={() => setActiveDomain(opt.id)}
                  className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 border ${
                    isActive
                      ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-bold shadow-xs ring-1 ring-amber-400/40'
                      : 'bg-white hover:bg-zinc-50/80 border-transparent text-zinc-700 hover:border-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold shadow-2xs ${
                        isActive
                          ? 'bg-amber-500 text-zinc-950 shadow-xs'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {opt.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <span>{opt.label}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 font-normal truncate mt-0.5">
                        {opt.description}
                      </div>
                    </div>
                  </div>

                  {opt.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 hidden sm:inline-block ${
                        opt.badgeColor || 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Configuration Detail Body (8-9 Cols on Large) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Domain Active Header Bar */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-xs shrink-0">
                {activeOptionMeta.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-zinc-900 tracking-tight">
                    {activeOptionMeta.label}
                  </h3>
                  {activeOptionMeta.badge && (
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        activeOptionMeta.badgeColor || 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {activeOptionMeta.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {activeOptionMeta.description}
                </p>
              </div>
            </div>

            {/* Contextual Action Button based on Active Domain */}
            <div className="flex items-center gap-2">
              {activeDomain === 'menu' && canCreateMenu && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCategoryManagerOpen(true)}
                    className="text-xs font-bold cursor-pointer"
                  >
                    Manage Categories
                  </Button>
                  <Button
                    id="btn-config-add-dish"
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setMenuItemToEdit(null);
                      setIsMenuItemFormOpen(true);
                    }}
                    leftIcon={<Plus className="w-4 h-4" />}
                    className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs"
                  >
                    + Add Dish
                  </Button>
                </>
              )}

              {activeDomain === 'themes' && (
                <Button
                  id="btn-open-theme-studio-full"
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsThemeStudioOpen(true)}
                  leftIcon={<Paintbrush className="w-4 h-4" />}
                  className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs"
                >
                  Launch Full Theme Studio
                </Button>
              )}

              {activeDomain === 'gl_accounts' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenExcelPreview}
                  leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                  className="text-xs font-bold cursor-pointer"
                >
                  Export Accounting Sheet
                </Button>
              )}
            </div>
          </div>

          {/* ========================================================== */}
          {/* SECTION 1: MENU & DISH CATALOG CONFIGURATION              */}
          {/* ========================================================== */}
          {activeDomain === 'menu' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Filter controls */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={menuSearchQuery}
                      onChange={(e) => setMenuSearchQuery(e.target.value)}
                      placeholder="Search dishes by name or ingredients..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Category Filter */}
                  <select
                    value={menuSelectedCategory}
                    onChange={(e) => setMenuSelectedCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="All">All Categories ({categories.length})</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>

                  {/* Dietary Filter */}
                  <select
                    value={menuDietaryFilter}
                    onChange={(e) => setMenuDietaryFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="all">All Dietary</option>
                    <option value="veg">Pure Veg 🟢</option>
                    <option value="non-veg">Non-Veg 🔴</option>
                  </select>

                  {/* Status Filter */}
                  <select
                    value={menuStatusFilter}
                    onChange={(e) => setMenuStatusFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="all">All Stock Statuses</option>
                    <option value="available">Available (In Stock)</option>
                    <option value="unavailable">Unavailable (Hidden)</option>
                    <option value="out_of_stock">Sold Out (Out of Stock)</option>
                  </select>
                </div>

                <div className="text-xs font-bold text-zinc-500">
                  {filteredMenuItems.length} of {menuItems.length} Dishes
                </div>
              </div>

              {/* Dishes Grid */}
              {loadingMenu ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-zinc-200">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-zinc-600">Loading catalog items...</p>
                </div>
              ) : filteredMenuItems.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-zinc-200 space-y-3">
                  <UtensilsCrossed className="w-10 h-10 text-zinc-300 mx-auto" />
                  <h4 className="text-sm font-bold text-zinc-800">No dishes match the selected filter</h4>
                  <p className="text-xs text-zinc-500">Add a new dish to your restaurant catalog or clear your search.</p>
                  {canCreateMenu && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setMenuItemToEdit(null);
                        setIsMenuItemFormOpen(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                    >
                      + Add New Dish
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredMenuItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      canManage={canCreateMenu}
                      isKitchenStaff={false}
                      onEdit={(it) => {
                        setMenuItemToEdit(it);
                        setIsMenuItemFormOpen(true);
                      }}
                      onDelete={(it) => setMenuItemToDelete(it)}
                      onPreview={(it) => setPreviewMenuItem(it)}
                      onStatusChange={async (it, newStatus) => {
                        try {
                          await rbacService.updateMenuItemStatusApi(it.id, newStatus, businessId);
                          fetchMenuData();
                        } catch (err: any) {
                          alert(`Error: ${err.message}`);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 2: THEMES, BRANDING & LAYOUT CONFIGURATION         */}
          {/* ========================================================== */}
          {activeDomain === 'themes' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {themeSaveSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{themeSaveSuccess}</span>
                </div>
              )}

              {/* Active Theme Overview Card */}
              <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                  <div>
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Menu Theme</span>
                    <h4 className="text-base font-black text-zinc-900 capitalize">
                      {currentTheme.preset || 'Modern Minimal'} Palette
                    </h4>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setIsThemeStudioOpen(true)}
                    leftIcon={<Paintbrush className="w-3.5 h-3.5" />}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                  >
                    Open Theme Studio Modal
                  </Button>
                </div>

                {/* One-Click Theme Preset Chooser */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 block">
                    Switch Active Theme Preset (One-Click Application)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {PRESET_OPTIONS.map((p) => {
                      const isSelected = currentTheme.preset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleQuickApplyPreset(p.id)}
                          disabled={themeSaving}
                          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                            isSelected
                              ? 'border-amber-500 ring-2 ring-amber-400/40 shadow-xs'
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <div className={`w-full h-8 rounded-xl ${p.colorBg} ${p.border} border flex items-center justify-center font-bold text-xs ${p.colorText}`}>
                            {p.name}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-zinc-800">{p.name}</span>
                            {isSelected && <Check className="w-4 h-4 text-amber-600 font-black" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Local Logo & Backdrop Upload Card */}
              <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div>
                    <h4 className="text-sm font-black text-zinc-900 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-amber-600" />
                      Header Branding & Backdrop Images
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Upload your business logo and hero backdrop banner directly from your computer.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Brand Logo Upload */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <label className="text-xs font-bold text-zinc-700 block">
                      Restaurant Logo
                    </label>
                    <div className="flex items-center gap-3">
                      {currentTheme.logoUrl ? (
                        <div className="relative w-16 h-16 rounded-xl border border-zinc-300 overflow-hidden bg-white shrink-0 shadow-2xs">
                          <img
                            src={currentTheme.logoUrl}
                            alt="Logo"
                            className="w-full h-full object-contain p-1"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl border border-dashed border-zinc-300 bg-white flex items-center justify-center text-zinc-400 shrink-0">
                          <Building2 className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1.5 flex-1">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs cursor-pointer shadow-2xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Choose Logo from PC</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleUploadBrandingImage(e, 'logo')}
                            className="hidden"
                          />
                        </label>
                        {currentTheme.logoUrl && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBrandingImage('logo')}
                            className="block text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Remove Logo
                          </button>
                        )}
                        <p className="text-[10px] text-zinc-500">PNG, SVG or JPEG recommended</p>
                      </div>
                    </div>
                  </div>

                  {/* Backdrop Banner Upload */}
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                    <label className="text-xs font-bold text-zinc-700 block">
                      Header Backdrop Banner
                    </label>
                    <div className="flex items-center gap-3">
                      {currentTheme.backdropUrl ? (
                        <div className="relative w-24 h-16 rounded-xl border border-zinc-300 overflow-hidden bg-zinc-900 shrink-0 shadow-2xs">
                          <img
                            src={currentTheme.backdropUrl}
                            alt="Backdrop"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-16 rounded-xl border border-dashed border-zinc-300 bg-white flex items-center justify-center text-zinc-400 shrink-0">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1.5 flex-1">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs cursor-pointer shadow-2xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Choose Banner from PC</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleUploadBrandingImage(e, 'backdrop')}
                            className="hidden"
                          />
                        </label>
                        {currentTheme.backdropUrl && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBrandingImage('backdrop')}
                            className="block text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Remove Backdrop
                          </button>
                        )}
                        <p className="text-[10px] text-zinc-500">High-resolution banner background</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Layout Styles & Header Alignment Card */}
              <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-4">
                <h4 className="text-sm font-black text-zinc-900">
                  Digital Menu Layout & Arrangement
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'cards', label: 'Interactive Cards (Default)' },
                    { id: 'bento', label: 'Modern Bento Grid' },
                    { id: 'list', label: 'Compact Text List' },
                    { id: 'mixed', label: 'Mixed Hybrid Layout' },
                  ].map((style) => {
                    const isSelected = (currentTheme.layoutMode || 'cards') === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => handleUpdateTheme({ ...currentTheme, layoutMode: style.id as any })}
                        className={`p-3.5 rounded-2xl border text-xs font-bold text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-400/40 shadow-xs'
                            : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 3: DINING TABLES & QR CODES CONFIGURATION          */}
          {/* ========================================================== */}
          {activeDomain === 'tables' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <TableManagementGrid
                businessId={businessId}
                businessName={businessName}
                currentUserRole={activeRole as AppRole}
                isViewOnly={isViewOnly}
                onRequestRoleSignIn={onRequestRoleSignIn}
              />
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 4: TAXES, CURRENCY & INVOICING CONFIGURATION       */}
          {/* ========================================================== */}
          {activeDomain === 'taxes' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {taxConfig ? (
                <TaxConfigurationPanel
                  isInline={true}
                  taxConfig={taxConfig}
                  businessId={businessId}
                  onSaved={(updated) => setTaxConfig(updated)}
                />
              ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-zinc-200">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-zinc-600">Loading taxation rules...</p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 5: GL ACCOUNTS & MAPPING CONFIGURATION             */}
          {/* ========================================================== */}
          {activeDomain === 'gl_accounts' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <GLAccountsTable
                businessId={businessId}
                glAccounts={glAccounts}
                onAccountsChange={setGlAccounts}
                isOwner={isOwnerOrAdmin}
                onOpenExcelPreview={handleOpenExcelPreview}
                showToast={(msg) => console.log(msg)}
              />
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 6: BUSINESS PROFILE & OPERATIONS DETAILS           */}
          {/* ========================================================== */}
          {activeDomain === 'business_profile' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {bizSaveSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{bizSaveSuccessMsg}</span>
                </div>
              )}

              {/* Profile Editing Form */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-xs space-y-6">
                <form onSubmit={handleSaveBusinessProfile} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Business Name */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Business / Trade Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={bizForm.name}
                        onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
                        placeholder="e.g., Grand Horizon Kitchen & Bar"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Displayed across customer menus, orders, and receipts.
                      </p>
                    </div>

                    {/* Business Type */}
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
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Determines default icons and customer experience categorization.
                      </p>
                    </div>

                    {/* Tagline / Subtitle */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Cuisine / Hospitality Tagline
                      </label>
                      <input
                        type="text"
                        value={bizForm.tagline}
                        onChange={(e) => setBizForm({ ...bizForm, tagline: e.target.value })}
                        placeholder="e.g., Authentic Himalayan & Multi-Cuisine • Prepared Fresh to Order"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Short description appearing under your business name in customer menu header.
                      </p>
                    </div>

                    {/* Street Address & City */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Street Address / Location
                      </label>
                      <input
                        type="text"
                        value={bizForm.address}
                        onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
                        placeholder="e.g., Lakeside Ward 6, Pokhara"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Physical restaurant or hotel address displayed on receipts and headers.
                      </p>
                    </div>

                    {/* Location / Dining Areas */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Dining Hall / Seating Area
                      </label>
                      <input
                        type="text"
                        value={bizForm.location}
                        onChange={(e) => setBizForm({ ...bizForm, location: e.target.value })}
                        placeholder="e.g., Main Dining Hall, Terrace & Garden"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Specific indoor or outdoor dining zone within the facility.
                      </p>
                    </div>

                    {/* Kitchen / Open Hours */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Kitchen & Service Operating Hours
                      </label>
                      <input
                        type="text"
                        value={bizForm.kitchen_hours}
                        onChange={(e) => setBizForm({ ...bizForm, kitchen_hours: e.target.value })}
                        placeholder="e.g., 07:30 AM – 10:30 PM"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Accurate kitchen opening and ordering hours for your guests.
                      </p>
                    </div>

                    {/* Contact Phone */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                        Public Contact Phone
                      </label>
                      <input
                        type="text"
                        value={bizForm.phone}
                        onChange={(e) => setBizForm({ ...bizForm, phone: e.target.value })}
                        placeholder="e.g., +977-9800000000 or +1-555-0199"
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={savingBizProfile}
                      leftIcon={<Save className="w-4 h-4" />}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                    >
                      {savingBizProfile ? 'Saving Changes...' : 'Save & Publish to Customer View'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 7: FRANCHISE & MULTI-BRANCH CONFIGURATION          */}
          {/* ========================================================== */}
          {activeDomain === 'franchise' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <FranchiseBranchList onOpenAddBranch={() => setIsAddBranchModalOpen(true)} />
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 8: STAFF ROLES & ACCESS CONTROL                    */}
          {/* ========================================================== */}
          {activeDomain === 'team' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <TeamStaffManagement
                businessId={businessId}
                currentUserRole={activeRole as AppRole}
                isViewOnly={isViewOnly}
                onRequestRoleSignIn={onRequestRoleSignIn}
              />
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 10: HARDWARE & PRINTER ROUTING                     */}
          {/* ========================================================== */}
          {activeDomain === 'hardware' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <PrinterConfiguration />
            </div>
          )}

          {/* ========================================================== */}
          {/* SECTION 9: SECURITY & AUDIT TRAIL LOGS                     */}
          {/* ========================================================== */}
          {activeDomain === 'audit' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900">Operational Audit Trail</h4>
                      <p className="text-xs text-zinc-500">Live tracker of authentication, order events, and configuration modifications.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      <input 
                        type="date" 
                        value={auditDateFilter}
                        onChange={(e) => setAuditDateFilter(e.target.value)}
                        className="bg-transparent border-none text-xs text-zinc-700 outline-none w-28"
                      />
                      {auditDateFilter && (
                        <button onClick={() => setAuditDateFilter('')} className="text-zinc-400 hover:text-zinc-700">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchAuditLogs}
                      leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />}
                      className="text-xs font-bold"
                    >
                      Refresh
                    </Button>

                    <div className="relative group">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDeletingLogs}
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        className="text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                      >
                        Delete...
                      </Button>
                      
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-zinc-200 shadow-xl rounded-xl p-1 z-50 hidden group-hover:block group-focus-within:block">
                        <button 
                          onClick={() => handleDeleteLogs('ALL')}
                          className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Delete All Logs
                        </button>
                        <button 
                          onClick={() => handleDeleteLogs('DAY')}
                          className="w-full text-left px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 rounded-lg"
                        >
                          Delete Today's Logs
                        </button>
                        <button 
                          onClick={() => handleDeleteLogs('CUSTOM')}
                          disabled={!auditDateFilter}
                          className="w-full text-left px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Delete Selected Date
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 text-zinc-400 uppercase text-[10px] tracking-wider font-bold">
                        <th className="py-2.5 px-3">Event Type</th>
                        <th className="py-2.5 px-3">User / Account</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredAuditLogs.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-zinc-500 text-xs">No logs found for selected criteria.</td></tr>
                      ) : filteredAuditLogs.map((log, idx) => (
                        <tr key={log.id || idx} className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-3 font-bold text-zinc-900 font-mono">
                            {log.event_type}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600">
                            {log.account_name || log.email || 'Admin'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {log.status || 'RECORDED'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : 'Just now'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {/* ========================================================== */}
          {/* SECTION: DATE & TIME LOCALIZATION SETTINGS                 */}
          {/* ========================================================== */}
          {activeDomain === 'date_localization' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {dateSaveSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2.5 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{dateSaveSuccess}</span>
                </div>
              )}

              {/* Main Container Card */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-zinc-900">
                        Date & Time Localization
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Configure Bikram Sambat (BS) Nepali dates and Gregorian (AD) English dates across the system.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={dateSaving}
                    onClick={() => handleSaveDateLocalization()}
                    leftIcon={<Save className="w-4 h-4" />}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                  >
                    {dateSaving ? 'Saving...' : 'Save Preferences'}
                  </Button>
                </div>

                {/* Grid with 2 distinct configuration cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Card 1: Navigation Bar */}
                  <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-600" />
                          <h4 className="text-sm font-bold text-zinc-900">Top Navigation Bar Display</h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Header Clock
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Choose how the live real-time date and time are rendered on the top navigation bar across all staff pages.
                      </p>

                      <div className="space-y-2 pt-2">
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                          Select Format Option
                        </label>
                        <select
                          value={navDateFormat}
                          onChange={(e) => handleNavFormatChange(e.target.value as DateFormatMode)}
                          className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
                        >
                          <option value="ENGLISH">1. Only English Date (AD)</option>
                          <option value="NEPALI">2. Only Nepali Date (BS)</option>
                          <option value="BOTH">3. Both Nepali & English Date (AD & BS)</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Preview for Nav Bar */}
                    <div className="bg-white rounded-xl p-3 border border-zinc-200/80 space-y-1.5 mt-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Live Navigation Widget Preview
                      </span>
                      <DateTimeDisplay mode={navDateFormat} />
                    </div>
                  </div>

                  {/* Card 2: Billing & KOT/BOT */}
                  <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-amber-600" />
                          <h4 className="text-sm font-bold text-zinc-900">Billing, Receipts & KOT / BOT</h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Receipts & Tickets
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Controls how timestamps and dates are formatted on customer invoices, physical thermal receipts, and kitchen/bar order tickets.
                      </p>

                      <div className="space-y-2 pt-2">
                        <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                          Select Format Option
                        </label>
                        <select
                          value={billingDateFormat}
                          onChange={(e) => handleBillingFormatChange(e.target.value as DateFormatMode)}
                          className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
                        >
                          <option value="ENGLISH">1. Only English Date (AD)</option>
                          <option value="NEPALI">2. Only Nepali Date (BS)</option>
                          <option value="BOTH">3. Both Nepali & English Date (AD & BS)</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Preview for Billing */}
                    <div className="bg-white rounded-xl p-3 border border-zinc-200/80 space-y-1.5 mt-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Live Receipt / KOT Timestamp Preview
                      </span>
                      <div className="font-mono text-xs text-zinc-800 bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200">
                        {renderFormattedDate(new Date(), billingDateFormat)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Helper Info */}
                <div className="rounded-2xl bg-amber-50/60 border border-amber-200/70 p-4 text-xs text-amber-900/90 flex items-start gap-3">
                  <Globe className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Instant Real-Time Synchronization</p>
                    <p className="text-amber-800/80 leading-relaxed">
                      Changes made here will instantly reflect across the top navigation bar, the Billing & POS register, Final Bill customer checkout, and kitchen display tickets without requiring a server restart.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modals required across configuration domains */}
      {/* 1. Theme Customizer Modal */}
      {isThemeStudioOpen && (
        <MenuThemeCustomizerModal
          currentConfig={currentTheme}
          onSave={handleUpdateTheme}
          onClose={() => setIsThemeStudioOpen(false)}
          menuItems={menuItems}
          categories={categories}
        />
      )}

      {/* 2. Menu Item Form Modal */}
      {isMenuItemFormOpen && (
        <MenuItemFormModal
          isOpen={true}
          itemToEdit={menuItemToEdit}
          categories={categories}
          onClose={() => {
            setIsMenuItemFormOpen(false);
            setMenuItemToEdit(null);
          }}
          onSave={async (itemData) => {
            if (menuItemToEdit) {
              await rbacService.updateMenuItemApi(menuItemToEdit.id, itemData, businessId);
              alert(`Changes saved successfully to database for ${itemData.name}!`);
            } else {
              await rbacService.createMenuItemApi(itemData as any, businessId);
              alert(`Created successfully in database for ${itemData.name}!`);
            }
            fetchMenuData();
            setIsMenuItemFormOpen(false);
            setMenuItemToEdit(null);
          }}
        />
      )}

      {/* 3. Category Manager Modal */}
      {isCategoryManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full border border-zinc-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-base font-black text-zinc-900">Manage Menu Categories</h3>
              <button
                type="button"
                onClick={() => setIsCategoryManagerOpen(false)}
                className="p-1 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CategoryManager
              categories={categories}
              selectedCategory={menuSelectedCategory}
              onSelectCategory={(catName) => {
                setMenuSelectedCategory(catName);
                setIsCategoryManagerOpen(false);
              }}
              canManageCategories={!isViewOnly}
              onAddCategory={async (name) => {
                await rbacService.createCategoryApi(name, businessId);
                fetchMenuData();
              }}
              onRenameCategory={async (id, newName) => {
                await rbacService.updateCategoryApi(id, newName, businessId);
                fetchMenuData();
              }}
              onDeleteCategory={async (id) => {
                await rbacService.deleteCategoryApi(id, businessId);
                fetchMenuData();
              }}
            />
          </div>
        </div>
      )}

      {/* 4. Delete Dish Confirmation Modal */}
      {menuItemToDelete && (
        <DeleteConfirmationModal
          isOpen={true}
          item={menuItemToDelete}
          onClose={() => setMenuItemToDelete(null)}
          onConfirm={async () => {
            try {
              await rbacService.deleteMenuItemApi(menuItemToDelete.id, businessId);
              setMenuItemToDelete(null);
              fetchMenuData();
            } catch (err: any) {
              alert(`Failed to delete: ${err.message}`);
            }
          }}
        />
      )}

      {/* 5. Menu Item Preview Modal */}
      {previewMenuItem && (
        <MenuItemPreviewModal
          isOpen={true}
          item={previewMenuItem}
          onClose={() => setPreviewMenuItem(null)}
        />
      )}

      {/* 6. Excel Accounting Sheet Preview Modal */}
      {excelPreviewOpen && (
        <ExcelSheetPreviewModal
          isOpen={true}
          onClose={() => setExcelPreviewOpen(false)}
          initialSheets={excelPreviewSheets}
          businessName={business?.name}
          filenamePrefix="Financial_Accounting_Mapping"
        />
      )}

      {/* 7. Add Branch Modal */}
      {isAddBranchModalOpen && (
        <AddBranchModal
          isOpen={true}
          onClose={() => setIsAddBranchModalOpen(false)}
          onSuccess={() => setIsAddBranchModalOpen(false)}
        />
      )}
    </div>
  );
};
