import type { TabPermissionId } from './rbac.types';

export type BusinessType = 'RESTAURANT' | 'CAFE' | 'BAR' | 'OTHER';

export type BusinessStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type UserRole = 'RESTAURANT_OWNER' | 'ADMIN' | 'STAFF';

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type OtpPurpose = 'SIGNUP_VERIFICATION' | 'LOGIN_VERIFICATION' | 'PASSWORD_RESET';

export type AuditEventType = 
  | 'ACCOUNT_CREATED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'LOGOUT';

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
  taxNotice?: string;
  categoryLayouts?: Record<string, 'cards' | 'list' | 'bento'>;
  itemOrder?: string[];
  itemCustomizations?: Record<string, MenuItemCustomStyle>;
}

export interface Business {
  id: string;
  name: string;
  business_type: BusinessType;
  status: BusinessStatus;
  tagline?: string;
  location?: string;
  address?: string;
  kitchen_hours?: string;
  phone?: string;
  parent_business_id?: string;
  owner_uid?: string;
  branch_code?: string;
  currency?: string;
  tax_rate?: number;
  show_menu_images?: boolean;
  menu_theme_config?: MenuThemeConfig;
  date_format_nav?: "BOTH" | "ENGLISH" | "LOCAL" | "NEPALI";
  date_format_billing?: "BOTH" | "ENGLISH" | "LOCAL" | "NEPALI";
  kds_print_mode?: string;
  default_language?: string;
  comp_password?: string | null;
  comp_password_hash?: string | null;
  printer_relay_host?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  business_id: string;
  email: string;
  name?: string;
  /** Tabs this account may open (tab-based RBAC). Owners always have all. */
  allowed_tabs?: TabPermissionId[];
  /** @deprecated Ignored. Access is decided by allowed_tabs only. */
  custom_permissions?: any;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PhoneVerification {
  id: string;
  user_id: string;
  phone_country_code: string;
  phone_number: string;
  phone_e164: string;
  is_verified: boolean;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OtpVerification {
  id: string;
  user_id: string;
  phone_e164: string;
  otp_hash: string;
  purpose: OtpPurpose;
  expires_at: Date;
  attempt_count: number;
  verified_at: Date | null;
  created_at: Date;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  business_id?: string | null;
  account_name?: string | null;
  email?: string | null;
  status?: 'ONLINE' | 'OFFLINE' | 'PENDING_VERIFICATION' | string;
  event_type: AuditEventType | string;
  ip_address?: string | null;
  user_agent?: string | null;
  last_active_at?: Date;
  created_at: Date;
  updated_at?: Date;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  name?: string;
  created_at?: Date | string;
  role: UserRole;
  status: UserStatus;
  /** Effective tabs (always populated by the auth middleware). */
  allowed_tabs?: TabPermissionId[];
  /**
   * Set only when a business owner's session is acting as a (narrower) staff member
   * via the PIN staff-session overlay. Permission checks use this subject when present.
   */
  acting_as?: {
    id: string;
    email: string;
    role: string;
    allowed_tabs: TabPermissionId[];
  };
  /** @deprecated Ignored. Access is decided by allowed_tabs only. */
  custom_permissions?: any;
  business: {
    id: string;
    name: string;
    type: BusinessType;
    status: BusinessStatus;
    tagline?: string;
    location?: string;
    address?: string;
    kitchen_hours?: string;
    phone?: string;
    menu_theme_config?: MenuThemeConfig;
    date_format_nav?: 'BOTH' | 'ENGLISH' | 'NEPALI';
    date_format_billing?: 'BOTH' | 'ENGLISH' | 'LOCAL' | 'NEPALI';
  };
  phone: {
    countryCode: string;
    number: string;
    e164: string;
    isVerified: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export * from './rbac.types';

