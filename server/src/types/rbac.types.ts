export type AppRole = 
  | 'OWNER'
  | 'MANAGER'
  | 'ADMIN'
  | 'RESTAURANT_OWNER'
  | 'HOTEL_OWNER'
  | 'RESTAURANT_MANAGER'
  | 'HOTEL_MANAGER'
  | 'FRONT_DESK'
  | 'KITCHEN_STAFF'
  | 'HOUSEKEEPING'
  | 'CASHIER';

export type AppResource = 
  | 'menus'
  | 'check_ins'
  | 'tables'
  | 'rooms'
  | 'orders'
  | 'billing'
  | 'staff'
  | 'audit_logs'
  | 'settings'
  | 'business_details'
  | 'franchise';

export type AppAction = 'create' | 'read' | 'update' | 'delete' | 'manage';

export type Permission = `${AppAction}:${AppResource}`;

/**
 * Tab-based access control (see working.md section 19).
 * These 11 ids are the ONLY permission units: the 10 dashboard sidebar tabs
 * plus the navbar franchise/branch switcher. Keep identical on client and server.
 */
export const TAB_PERMISSION_IDS = [
  'overview',
  'operations',
  'kds',
  'waiter',
  'checkins',
  'menus',
  'billing',
  'team',
  'configurations',
  'account',
  'franchise',
] as const;

export type TabPermissionId = typeof TAB_PERMISSION_IDS[number];


export interface RolePermissions {
  role: AppRole;
  displayName: string;
  description: string;
  allowedActions: Record<AppResource, AppAction[]>;
}

export type FoodType = 'veg' | 'non-veg' | 'none';
export type MenuStatus = 'available' | 'unavailable' | 'out_of_stock';

export interface MenuCategory {
  id: string;
  business_id: string;
  name: string;
  order?: number;
  created_at: Date;
  updated_at: Date;
}

export interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
  is_available?: boolean;
  image_url?: string;
  description?: string;
  food_type?: FoodType;
}

export interface MenuItem {
  id: string;
  business_id: string;
  name: string;
  category: string;
  additional_categories?: string[];
  category_id?: string;
  price: number;
  currency: string;
  description?: string;
  image_url?: string;
  food_type: FoodType;
  status: MenuStatus;
  is_available: boolean;
  is_packageable?: boolean;
  has_variants?: boolean;
  variants?: MenuItemVariant[];
  variant_group_name?: string;
  display_style?: 'auto' | 'hero' | 'bento' | 'text_only';
  show_image?: boolean;
  promo_badge?: string;
  station?: KitchenStation;
  erp_item_code?: string;
  is_comp?: boolean;
  comp_qty?: number;
  comp_value?: number;
  is_packaged?: boolean;
  pack_qty?: number;
  packaging_charge?: number;
  order_index?: number;
  preparation_time_mins?: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export type CheckInStatus = 'CHECKED_IN' | 'CHECKED_OUT' | 'RESERVED' | 'CANCELLED';

export type TableStatus = 'ACTIVE' | 'INACTIVE' | 'OCCUPIED' | 'RESERVED';

export interface RestaurantTable {
  id: string;
  business_id: string;
  table_number: string;
  order_number?: string;
  floor?: string | null;
  building?: string | null;
  capacity: number;
  status: TableStatus;
  pay_first_enabled?: boolean;
  credit_only?: boolean;
  credit_customer_name?: string | null;
  credit_customer_phone?: string | null;
  credit_pin?: string | null;
  credit_gl_account_id?: string | null;
  credit_gl_account_number?: string | null;
  credit_gl_account_name?: string | null;
  comp_enabled?: boolean;
  comp_orderer_name?: string | null;
  comp_orderer_phone?: string | null;
  assigned_waiter_ids?: string[];
  waiter_ping?: {
    active: boolean;
    timestamp?: string | Date;
  } | null;
  qr_code_url?: string;
  last_scanned_at?: Date | null;
  current_session_id?: string | null;
  host_token?: string | null;
  created_at: Date;
  updated_at: Date;
}

export type OrderStatus = 'PENDING' | 'AWAITING_PAYMENT' | 'RECEIVED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';

export type KitchenStation = 'KITCHEN' | 'BAR' | 'BOTH';

export interface TableOrderItem {
  item_id: string;
  item_key?: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  special_instructions?: string;
  variant_id?: string;
  variant_name?: string;
  food_type?: FoodType;
  category?: string;
  additional_categories?: string[];
  station?: KitchenStation;
  erp_item_code?: string;
  status?: OrderStatus;
  is_comp?: boolean;
  comp_qty?: number;
  comp_value?: number;
  is_packageable?: boolean;
  is_packaged?: boolean;
  pack_qty?: number;
  packaging_charge?: number;
  ready_at?: Date | string | null;
  served_at?: Date | string | null;
  cancelled_at?: Date | string | null;
  round_number?: number;
  ordered_at?: Date | string | null;
}

export interface TableOrder {
  id: string;
  business_id: string;
  table_id: string;
  table_number: string;
  order_number?: string;
  floor?: string | null;
  building?: string | null;
  items: TableOrderItem[];
  subtotal: number;
  tax_amount?: number;
  total_amount: number;
  currency: string;
  customer_name?: string;
  customer_phone?: string;
  customer_pan?: string;
  order_notes?: string;
  status: OrderStatus;
  pay_first?: boolean;
  credit_only?: boolean;
  credit_pin_verified?: boolean;
  pin_verified?: boolean;
  credit_gl_account_id?: string | null;
  credit_gl_account_number?: string | null;
  credit_gl_account_name?: string | null;
  payment_confirmed_at?: string | Date | null;
  payment_confirmed_by?: string;
  sale_id?: string;
  payment_rejected_reason?: string;
  session_id?: string | null;
  bill_requested?: boolean;
  bill_requested_at?: string | Date | null;
  bill_acknowledged?: boolean;
  folio_delivered?: boolean;
  folio_delivered_at?: string | Date | null;
  payment_method?: string;
  payment_status?: string;
  promo_code?: string | null;
  promo_discount?: number;
  taxes?: SaleTaxBreakdown[];
  packaging_charge?: number;
  packaging_qty?: number;
  ready_at?: Date | null;
  served_at?: Date | null;
  source?: 'QR' | 'POS_MANUAL' | string;
  pos_sale_id?: string;
  is_follow_up?: boolean;
  round_number?: number;
  parent_order_id?: string | null;
  settled?: boolean;
  invoice_number?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CheckIn {
  id: string;
  business_id: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  room_or_table_number: string;
  check_in_date: Date;
  check_out_date?: Date | null;
  status: CheckInStatus;
  total_amount?: number;
  deposit_paid?: number;
  notes?: string;
  handled_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface AccessCheckResult {
  granted: boolean;
  role: AppRole;
  reason?: string;
}

export interface TaxRateItem {
  id: string;
  name: string;
  rate_percent: number;
  enabled: boolean;
  is_inclusive?: boolean;
  description?: string;
}

export interface BusinessTaxConfig {
  business_id: string;
  tax_enabled: boolean;
  tax_inclusive?: boolean;
  currency: string;
  currency_symbol: string;
  packaging_fee?: number;
  rates: TaxRateItem[];
  invoice_prefix?: string;
  receipt_footer_note?: string;
  pan_vat_number?: string;
  pan_vat_prefix?: string;
  invoice_display_name?: string;
  invoice_subtitle?: string;
  invoice_document_title?: string;
  invoice_address?: string;
  active_promo_code?: string;
  active_promo_percent?: number;
  active_promo_description?: string;
  active_promo_enabled?: boolean;
  order_reset_interval?: 'MANUAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  last_order_reset_date?: string;
  updated_at: string;
}

export interface SaleTaxBreakdown {
  id?: string;
  tax_id?: string;
  rate_percent: number;
  name: string;
  amount: number;
  is_inclusive?: boolean;
}

export interface SaleItem {
  item_id: string;
  name: string;
  variant_name?: string;
  price: number;
  quantity: number;
  subtotal: number;
  category?: string;
  notes?: string;
  comp_qty?: number;
  is_comp?: boolean;
  comp_value?: number;
  is_packageable?: boolean;
  is_packaged?: boolean;
  pack_qty?: number;
  packaging_charge?: number;
}

export type SaleType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'ROOM_SERVICE' | 'QUICK_POS';
export type SalePaymentMethod = 'CASH' | 'UPI_QR' | 'CARD' | 'ONLINE' | 'ROOM_BILL' | 'SPLIT' | 'QR_CODE' | 'CREDIT' | 'DEDUCT_FROM_DEPOSIT';
export type SalePaymentStatus = 'PAID' | 'REFUNDED' | 'CANCELLED';

export interface SaleRecord {
  id: string;
  invoice_number: string;
  order_number?: string;
  business_id: string;
  order_id?: string;
  table_id?: string;
  table_number?: string;
  customer_name: string;
  customer_phone?: string;
  customer_pan?: string;
  sale_type: SaleType;
  items: SaleItem[];
  subtotal: number;
  discount_percent?: number;
  discount_amount?: number;
  promo_code?: string;
  promo_discount?: number;
  taxes: SaleTaxBreakdown[];
  packaging_charge?: number;
  packaging_qty?: number;
  total_tax: number;
  service_charge?: number;
  total_amount: number;
  currency: string;
  payment_method: SalePaymentMethod;
  credit_gl_account_id?: string;
  credit_gl_account_number?: string;
  credit_gl_account_name?: string;
  payment_status: SalePaymentStatus;
  cashier_name?: string;
  cashier_id?: string;
  notes?: string;
  created_at: string | Date;
  date_string: string; // YYYY-MM-DD
  source?: 'POS_MANUAL' | 'QR' | string;
  is_manual_pos?: boolean;
  dispatch_kitchen?: boolean;
  comp_reason?: string;
}

export interface ServiceRequest {
  id: string;
  type: 'BILL_REQUEST' | 'WAITER_CALL' | 'WATER' | 'CLEANING';
  business_id?: string;
  order_id?: string;
  table_id: string;
  table_number: string;
  order_number?: string;
  payment_method?: string;
  total_amount?: number;
  currency?: string;
  status: 'PENDING' | 'ATTENDED' | 'RESOLVED';
  created_at: string | Date;
  notes?: string;
}

export type GLAccountCategory = 
  | 'REVENUE' 
  | 'TAX_LIABILITY' 
  | 'ASSET' 
  | 'EXPENSE' 
  | 'LIABILITY' 
  | 'EQUITY';

export interface GLAccountLink {
  id: string;
  business_id?: string;
  account_number: string;
  account_name: string;
  category: GLAccountCategory;
  mapping_key?: string;
  description?: string;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_extension?: string | null;
  customer_office_name?: string | null;
  customer_designation?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CashierRegisterSession {
  id: string;
  business_id: string;
  cashier_id: string;
  cashier_name: string;
  date_string: string;
  status: 'OPEN' | 'CLOSED';
  opening_float: number;
  closing_cash?: number | null;
  notes?: string | null;
  opened_at: string | Date;
  closed_at?: string | Date | null;
}

export interface CompRecordItem {
  item_id: string;
  name: string;
  comp_qty: number;
  unit_price: number;
  comp_value: number;
  category?: string;
  variant_name?: string;
}

export interface CompRecord {
  id: string;
  business_id: string;
  sale_id?: string;
  table_id?: string;
  table_number: string;
  staff_id?: string;
  staff_name: string;
  orderer_name?: string | null;
  orderer_phone?: string | null;
  reason?: string;
  items: CompRecordItem[];
  total_comp_value: number;
  currency: string;
  settled_at: string;
  date_string: string;
}
