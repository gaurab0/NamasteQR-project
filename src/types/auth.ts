import type { TabPermissionId } from './rbac';

export type BusinessType = 'RESTAURANT' | 'HOTEL' | 'CAFE' | 'RESORT' | 'BAR' | 'OTHER';
export type BusinessStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type UserRole = 'RESTAURANT_OWNER' | 'HOTEL_OWNER' | 'ADMIN' | 'STAFF';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface MenuItemCustomStyle {
  display_style?: 'auto' | 'hero' | 'bento' | 'text_only';
  show_image?: boolean;
  promo_badge?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface MenuThemeConfig {
  preset: 'minimal' | 'bistro' | 'midnight' | 'emerald' | 'vibrant' | 'rustic' | 'paper';
  fontFamily: 'sans' | 'serif' | 'rounded' | 'classic';
  layoutMode: 'cards' | 'list' | 'bento' | 'mixed';
  primaryColor?: string;
  logoUrl?: string;
  coverUrl?: string;
  backdropUrl?: string;
  taxNotice?: string;
  categoryLayouts?: Record<string, 'cards' | 'list' | 'bento'>;
  itemOrder?: string[];
  categoryOrder?: string[];
  itemCustomizations?: Record<string, MenuItemCustomStyle>;
}

export type OperationalStatus = 'OPEN' | 'CLOSED' | 'REOPENED';

export interface BusinessOperatingHours {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  autoDateAdvance: boolean;
}

export interface OperationalDayRecord {
  id?: string;
  businessDate: string;
  status: OperationalStatus;
  openedAt?: string;
  openedBy?: string;
  openedByName?: string;
  openingFloat?: number;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  reopenReason?: string;
  totalOrdersCount?: number;
  totalSalesAmount?: number;
  updatedAt?: string;
}

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  status: BusinessStatus;
  tagline?: string;
  location?: string;
  address?: string;
  kitchen_hours?: string;
  phone?: string;
  tableCount?: number;
  menuCount?: number;
  parent_business_id?: string;
  owner_uid?: string;
  branch_code?: string;
  currency?: string;
  tax_rate?: number;
  show_menu_images?: boolean;
  menu_theme_config?: MenuThemeConfig;
  date_format_nav?: "BOTH" | "ENGLISH" | "NEPALI";
  date_format_billing?: "BOTH" | "ENGLISH" | "NEPALI";
  operations_config?: BusinessOperatingHours;
  current_operational_day?: OperationalDayRecord;
}

export interface UserPhone {
  countryCode: string;
  number: string;
  e164: string;
  isVerified: boolean;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Tabs this account may open. Owners always have all 11 (see working.md section 19). */
  allowed_tabs?: TabPermissionId[];
  /** @deprecated Ignored. Access is decided by allowed_tabs only. */
  custom_permissions?: any;
  business: Business;
  phone: UserPhone;
}

export interface SignupFormData {
  businessName: string;
  businessType: BusinessType;
  address?: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

export interface LoginFormData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface VerifyOtpFormData {
  email?: string;
  phone_e164?: string;
  otp: string;
}

export interface CountryInfo {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
}
