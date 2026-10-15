import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { 
  Business, 
  User, 
  PhoneVerification, 
  OtpVerification, 
  PasswordResetToken, 
  AuditLog, 
  BusinessType, 
  UserRole 
} from '../types';
import { slugify, sanitizePhoneId, generateUserDocId } from '../utils/id.utils';
import { sanitizeTabs, deriveAllowedTabs, isBusinessOwnerRole } from './tabAccess';
import type { TabPermissionId } from '../types/rbac.types';

class PostgresDatabaseStore {
  private isPostgresConnected = false;
  private isInitialized = false;

  // In-memory caching layer for instant sub-millisecond responses
  private businesses: Map<string, Business> = new Map();
  private users: Map<string, User> = new Map();
  private phoneVerifications: Map<string, PhoneVerification> = new Map();
  private otpVerifications: Map<string, OtpVerification> = new Map();
  private passwordResetTokens: Map<string, PasswordResetToken> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private devOtpStore: Map<string, string> = new Map();
  private demoBookings: Map<string, any> = new Map();
  private contactEnquiries: Map<string, any> = new Map();

  constructor() {
    this.initPostgres();
  }

  private async initPostgres() {
    try {
      await this.syncFromPostgres();
      this.isPostgresConnected = true;
      this.isInitialized = true;
      console.log('✅ Connected to PostgreSQL (Supabase) & synchronized live tables.');
    } catch (err: any) {
      console.warn('⚠️ PostgreSQL initialization notice (using memory sync):', err.message);
    }
  }

  private async syncFromPostgres() {
    try {
      // 1. Sync Businesses
      const dbBusinesses = await prisma.business.findMany();
      for (const d of dbBusinesses) {
        this.businesses.set(d.id, {
          id: d.id,
          name: d.name,
          business_type: (d.business_type as BusinessType) || 'RESTAURANT',
          status: (d.status as any) || 'ACTIVE',
          tagline: d.tagline ?? (d.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: d.location ?? 'Main Dining & Service Area',
          address: d.address || '',
          kitchen_hours: d.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: d.phone ?? '',
          parent_business_id: d.parent_business_id || undefined,
          owner_uid: d.owner_uid || undefined,
          branch_code: d.branch_code || undefined,
          currency: d.currency || 'Rs.',
          tax_rate: typeof d.tax_rate === 'number' ? d.tax_rate : 0,
          show_menu_images: d.show_menu_images,
          menu_theme_config: (d.menu_theme_config as any) || undefined,
          date_format_nav: (d.date_format_nav as any) || 'BOTH',
          date_format_billing: (d.date_format_billing as any) || 'BOTH',
          created_at: d.created_at,
          updated_at: d.updated_at,
        });
      }

      // If database has 0 businesses, initialize default
      if (this.businesses.size === 0) {
        await this.ensureBusiness('maya-forest-resort', 'Maya Forest Resort', 'HOTEL');
      }

      // 2. Sync Users
      const dbUsers = await prisma.user.findMany();
      for (const d of dbUsers) {
        this.users.set(d.id, {
          id: d.id,
          business_id: d.business_id,
          email: d.email,
          name: d.name || undefined,
          password_hash: d.password_hash,
          role: d.role as UserRole,
          status: d.status as any,
          allowed_tabs: Array.isArray(d.allowed_tabs) ? sanitizeTabs(d.allowed_tabs as any) : undefined,
          last_login_at: d.last_login_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        });
      }

      // 3. Sync Phone Verifications
      const dbPhones = await prisma.phoneVerification.findMany();
      for (const d of dbPhones) {
        this.phoneVerifications.set(d.id, {
          id: d.id,
          user_id: d.user_id,
          phone_country_code: d.phone_country_code,
          phone_number: d.phone_number,
          phone_e164: d.phone_e164,
          is_verified: d.is_verified,
          verified_at: d.verified_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        });
      }

      // 4. Sync Audit Logs
      const dbAudits = await prisma.auditLog.findMany({
        take: 500,
        orderBy: { created_at: 'desc' },
      });
      for (const d of dbAudits) {
        this.auditLogs.set(d.id, {
          id: d.id,
          user_id: d.user_id || d.account_name,
          business_id: d.business_id || d.account_name,
          account_name: d.account_name || 'NamasteQR Business',
          email: d.email || undefined,
          status: (d.status as any) || 'OFFLINE',
          event_type: d.event_type as any,
          ip_address: d.ip_address || undefined,
          user_agent: d.user_agent || undefined,
          created_at: d.created_at,
          updated_at: d.created_at,
        });
      }
    } catch (e: any) {
      console.warn('PostgreSQL initial sync notice:', e.message);
    }
  }

  // --- Businesses ---
  async createBusiness(name: string, businessType: BusinessType, extra?: Partial<Business>): Promise<Business> {
    const rawSlug = slugify(name) || crypto.randomUUID();
    let businessId = extra?.id || rawSlug;
    if (!extra?.id && this.businesses.has(businessId)) {
      businessId = `${rawSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const business: Business = {
      id: businessId,
      name,
      business_type: businessType,
      status: 'ACTIVE',
      tagline: extra?.tagline ?? (businessType === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
      location: (extra?.location ?? extra?.address) || 'Main Dining & Service Area',
      address: (extra?.address || extra?.location) ?? '',
      kitchen_hours: extra?.kitchen_hours ?? '07:30 AM – 10:30 PM',
      phone: extra?.phone || '',
      parent_business_id: extra?.parent_business_id,
      owner_uid: extra?.owner_uid,
      branch_code: extra?.branch_code,
      currency: extra?.currency || 'Rs.',
      tax_rate: typeof extra?.tax_rate === 'number' ? extra.tax_rate : 5,
      show_menu_images: extra?.show_menu_images !== undefined ? extra.show_menu_images : true,
      menu_theme_config: extra?.menu_theme_config,
      date_format_nav: extra?.date_format_nav || 'BOTH',
      date_format_billing: extra?.date_format_billing || 'BOTH',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.businesses.set(business.id, business);

    try {
      await prisma.business.upsert({
        where: { id: business.id },
        create: {
          id: business.id,
          name: business.name,
          business_type: business.business_type,
          status: business.status,
          tagline: business.tagline || null,
          location: business.location || null,
          address: business.address || null,
          kitchen_hours: business.kitchen_hours || null,
          phone: business.phone || null,
          parent_business_id: business.parent_business_id || null,
          owner_uid: business.owner_uid || null,
          branch_code: business.branch_code || null,
          currency: business.currency || 'Rs.',
          tax_rate: typeof business.tax_rate === 'number' ? business.tax_rate : 5,
          show_menu_images: business.show_menu_images,
          menu_theme_config: (business.menu_theme_config as any) || null,
          date_format_nav: business.date_format_nav || 'BOTH',
          date_format_billing: business.date_format_billing || 'BOTH',
          created_at: business.created_at,
          updated_at: business.updated_at,
        },
        update: {
          name: business.name,
          business_type: business.business_type,
          status: business.status,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      console.warn('PostgreSQL createBusiness notice:', err.message);
    }

    return business;
  }

  async createBranch(params: {
    name: string;
    businessType?: BusinessType;
    parentBusinessId: string;
    ownerUid: string;
    branchCode?: string;
    location?: string;
    phone?: string;
    tagline?: string;
    kitchenHours?: string;
    currency?: string;
    taxRate?: number;
  }): Promise<Business> {
    const parent = await this.findBusinessById(params.parentBusinessId);
    const bType = params.businessType || parent?.business_type || 'RESTAURANT';
    const rawSlug = slugify(params.name) || crypto.randomUUID();
    const branchId = `${params.parentBusinessId}/franchises/${rawSlug}`;

    return this.createBusiness(params.name, bType, {
      id: branchId,
      parent_business_id: params.parentBusinessId,
      owner_uid: params.ownerUid,
      branch_code: params.branchCode,
      location: params.location,
      phone: params.phone,
      tagline: params.tagline,
      kitchen_hours: params.kitchenHours,
      currency: params.currency,
      tax_rate: params.taxRate,
    });
  }

  async getBranchesForOwner(ownerUid: string, parentBusinessId: string): Promise<Business[]> {
    const all = await this.getAllBusinesses();
    const branchMap = new Map<string, Business>();

    // 1. Primary / Parent business
    const parent = all.find((b) => b.id === parentBusinessId);
    if (parent) {
      branchMap.set(parent.id, parent);
    }

    // 2. Child franchise branches
    all.forEach((b) => {
      if (b.parent_business_id === parentBusinessId || (ownerUid && b.owner_uid === ownerUid)) {
        branchMap.set(b.id, b);
      }
    });

    return Array.from(branchMap.values()).sort((a, b) => {
      if (a.id === parentBusinessId) return -1;
      if (b.id === parentBusinessId) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  async ensureBusiness(id: string, name?: string, type?: BusinessType, extra?: Partial<Business>): Promise<Business> {
    if (this.businesses.has(id)) {
      return this.businesses.get(id)!;
    }

    try {
      const dbBiz = await prisma.business.findUnique({ where: { id } });
      if (dbBiz) {
        const b: Business = {
          id: dbBiz.id,
          name: dbBiz.name,
          business_type: (dbBiz.business_type as BusinessType) || type || 'RESTAURANT',
          status: (dbBiz.status as any) || 'ACTIVE',
          tagline: dbBiz.tagline ?? (dbBiz.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: dbBiz.location ?? 'Main Dining & Service Area',
          address: dbBiz.address || '',
          kitchen_hours: dbBiz.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: dbBiz.phone ?? '',
          parent_business_id: dbBiz.parent_business_id || undefined,
          owner_uid: dbBiz.owner_uid || undefined,
          branch_code: dbBiz.branch_code || undefined,
          currency: dbBiz.currency || undefined,
          tax_rate: typeof dbBiz.tax_rate === 'number' ? dbBiz.tax_rate : undefined,
          show_menu_images: dbBiz.show_menu_images,
          menu_theme_config: (dbBiz.menu_theme_config as any) || undefined,
          created_at: dbBiz.created_at,
          updated_at: dbBiz.updated_at,
        };
        this.businesses.set(b.id, b);
        return b;
      }
    } catch (e) {}

    const formattedName = name || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const bType: BusinessType = type || (id.includes('hotel') || id.includes('resort') ? 'HOTEL' : 'RESTAURANT');
    const business: Business = {
      id,
      name: formattedName,
      business_type: bType,
      status: 'ACTIVE',
      tagline: extra?.tagline ?? (bType === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
      location: extra?.location ?? 'Main Dining & Service Area',
      kitchen_hours: extra?.kitchen_hours ?? '07:30 AM – 10:30 PM',
      phone: extra?.phone || '+9779800000000',
      parent_business_id: extra?.parent_business_id,
      owner_uid: extra?.owner_uid,
      branch_code: extra?.branch_code,
      currency: extra?.currency,
      tax_rate: extra?.tax_rate,
      date_format_nav: extra?.date_format_nav || 'ENGLISH',
      date_format_billing: extra?.date_format_billing || 'ENGLISH',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.businesses.set(business.id, business);

    try {
      await prisma.business.upsert({
        where: { id: business.id },
        create: {
          id: business.id,
          name: business.name,
          business_type: business.business_type,
          status: business.status,
          tagline: business.tagline || null,
          location: business.location || null,
          kitchen_hours: business.kitchen_hours || null,
          phone: business.phone || null,
          parent_business_id: business.parent_business_id || null,
          created_at: business.created_at,
          updated_at: business.updated_at,
        },
        update: {
          name: business.name,
          business_type: business.business_type,
          status: business.status,
        },
      });
    } catch (err: any) {
      console.warn('PostgreSQL ensureBusiness notice:', err.message);
    }

    return business;
  }

  async findBusinessById(id: string): Promise<Business | null> {
    if (this.businesses.has(id)) {
      return this.businesses.get(id)!;
    }
    try {
      const dbBiz = await prisma.business.findUnique({ where: { id } });
      if (dbBiz) {
        const b: Business = {
          id: dbBiz.id,
          name: dbBiz.name,
          business_type: dbBiz.business_type as BusinessType,
          status: dbBiz.status as any,
          tagline: dbBiz.tagline ?? (dbBiz.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: dbBiz.location ?? 'Main Dining & Service Area',
          address: dbBiz.address || '',
          kitchen_hours: dbBiz.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: dbBiz.phone ?? '',
          parent_business_id: dbBiz.parent_business_id || undefined,
          owner_uid: dbBiz.owner_uid || undefined,
          branch_code: dbBiz.branch_code || undefined,
          currency: dbBiz.currency || undefined,
          tax_rate: typeof dbBiz.tax_rate === 'number' ? dbBiz.tax_rate : undefined,
          show_menu_images: dbBiz.show_menu_images,
          menu_theme_config: (dbBiz.menu_theme_config as any) || undefined,
          date_format_nav: (dbBiz.date_format_nav as any) || undefined,
          date_format_billing: (dbBiz.date_format_billing as any) || undefined,
          created_at: dbBiz.created_at,
          updated_at: dbBiz.updated_at,
        };
        this.businesses.set(b.id, b);
        return b;
      }
    } catch (e) {}
    return null;
  }

  async getAllBusinesses(): Promise<Business[]> {
    try {
      const dbBizs = await prisma.business.findMany();
      const list: Business[] = [];
      for (const d of dbBizs) {
        const b: Business = {
          id: d.id,
          name: d.name || 'Unnamed Venue',
          business_type: (d.business_type as BusinessType) || 'RESTAURANT',
          status: (d.status as any) || 'ACTIVE',
          tagline: d.tagline ?? (d.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: d.location ?? 'Main Dining & Service Area',
          address: d.address || '',
          kitchen_hours: d.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: d.phone ?? '',
          parent_business_id: d.parent_business_id || undefined,
          owner_uid: d.owner_uid || undefined,
          branch_code: d.branch_code || undefined,
          currency: d.currency || undefined,
          tax_rate: typeof d.tax_rate === 'number' ? d.tax_rate : undefined,
          show_menu_images: d.show_menu_images,
          menu_theme_config: (d.menu_theme_config as any) || undefined,
          date_format_nav: (d.date_format_nav as any) || undefined,
          date_format_billing: (d.date_format_billing as any) || undefined,
          created_at: d.created_at,
          updated_at: d.updated_at,
        };
        this.businesses.set(b.id, b);
        list.push(b);
      }
      if (list.length > 0) return list;
    } catch (e: any) {
      console.warn('getAllBusinesses PostgreSQL notice:', e.message);
    }
    return Array.from(this.businesses.values());
  }

  async getDefaultBusiness(): Promise<Business | null> {
    if (this.businesses.size > 0) {
      return this.businesses.values().next().value || null;
    }
    const all = await this.getAllBusinesses();
    return all.length > 0 ? all[0] : null;
  }

  async updateBusinessProfile(id: string, updates: Partial<Business>): Promise<Business | null> {
    let business = this.businesses.get(id);
    if (!business) {
      business = await this.findBusinessById(id);
    }
    if (!business) return null;

    if (updates.name !== undefined) business.name = updates.name.trim();
    if (updates.business_type !== undefined) business.business_type = updates.business_type;
    if (updates.tagline !== undefined) business.tagline = updates.tagline.trim();
    if (updates.location !== undefined) business.location = updates.location.trim();
    if (updates.address !== undefined) business.address = updates.address.trim();
    if (updates.kitchen_hours !== undefined) business.kitchen_hours = updates.kitchen_hours.trim();
    if (updates.phone !== undefined) business.phone = updates.phone.trim();
    if (updates.show_menu_images !== undefined) business.show_menu_images = Boolean(updates.show_menu_images);
    if (updates.menu_theme_config !== undefined) business.menu_theme_config = updates.menu_theme_config;
    if (updates.date_format_nav !== undefined) business.date_format_nav = updates.date_format_nav;
    if (updates.date_format_billing !== undefined) business.date_format_billing = updates.date_format_billing;
    business.updated_at = new Date();

    this.businesses.set(id, business);

    try {
      await prisma.business.update({
        where: { id },
        data: {
          ...(updates.name !== undefined ? { name: business.name } : {}),
          ...(updates.business_type !== undefined ? { business_type: business.business_type } : {}),
          ...(updates.tagline !== undefined ? { tagline: business.tagline } : {}),
          ...(updates.location !== undefined ? { location: business.location } : {}),
          ...(updates.address !== undefined ? { address: business.address } : {}),
          ...(updates.kitchen_hours !== undefined ? { kitchen_hours: business.kitchen_hours } : {}),
          ...(updates.phone !== undefined ? { phone: business.phone } : {}),
          ...(updates.show_menu_images !== undefined ? { show_menu_images: business.show_menu_images } : {}),
          ...(updates.menu_theme_config !== undefined ? { menu_theme_config: business.menu_theme_config as any } : {}),
          ...(updates.date_format_nav !== undefined ? { date_format_nav: business.date_format_nav } : {}),
          ...(updates.date_format_billing !== undefined ? { date_format_billing: business.date_format_billing } : {}),
          updated_at: business.updated_at,
        },
      });
    } catch (e: any) {
      console.error('PostgreSQL updateBusinessProfile ERROR:', e.message);
    }

    return business;
  }

  async updateBusinessStatus(id: string, status: Business['status']): Promise<Business | null> {
    const business = this.businesses.get(id);
    if (business) {
      business.status = status;
      business.updated_at = new Date();
      this.businesses.set(id, business);
    }
    try {
      await prisma.business.update({
        where: { id },
        data: {
          status,
          updated_at: new Date(),
        },
      });
    } catch (e: any) {
      console.error('PostgreSQL updateBusinessStatus ERROR:', e.message);
    }
    return business || null;
  }

  // --- Users ---
  async createUser(data: {
    business_id: string;
    email: string;
    password_hash: string;
    role: UserRole;
    allowed_tabs?: TabPermissionId[];
  }): Promise<User> {
    const biz = this.businesses.get(data.business_id);
    const userId = generateUserDocId(biz?.name || data.business_id, data.email);
    const user: User = {
      id: userId,
      business_id: data.business_id,
      email: data.email.toLowerCase().trim(),
      password_hash: data.password_hash,
      role: data.role,
      status: 'PENDING_VERIFICATION',
      ...(data.allowed_tabs ? { allowed_tabs: sanitizeTabs(data.allowed_tabs) } : {}),
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.set(user.id, user);

    try {
      await prisma.user.upsert({
        where: { email: user.email },
        create: {
          id: user.id,
          business_id: user.business_id,
          email: user.email,
          password_hash: user.password_hash,
          role: user.role,
          status: user.status,
          allowed_tabs: user.allowed_tabs || [],
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        update: {
          password_hash: user.password_hash,
          role: user.role,
          status: user.status,
          allowed_tabs: user.allowed_tabs || [],
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      console.warn('PostgreSQL createUser notice:', err.message);
    }

    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }

    try {
      const dbUser = await prisma.user.findUnique({ where: { email: normalized } });
      if (dbUser) {
        const u: User = {
          id: dbUser.id,
          business_id: dbUser.business_id,
          email: dbUser.email,
          password_hash: dbUser.password_hash,
          role: dbUser.role as UserRole,
          status: dbUser.status as any,
          allowed_tabs: Array.isArray(dbUser.allowed_tabs) ? sanitizeTabs(dbUser.allowed_tabs as any) : undefined,
          last_login_at: dbUser.last_login_at,
          created_at: dbUser.created_at,
          updated_at: dbUser.updated_at,
        };
        this.users.set(u.id, u);
        return u;
      }
    } catch (e) {}
    return null;
  }

  async ensureUser(data: {
    id?: string;
    business_id: string;
    email: string;
    role?: UserRole;
    password_hash?: string;
  }): Promise<User> {
    const email = data.email.toLowerCase().trim();
    if (data.id && this.users.has(data.id)) {
      return this.users.get(data.id)!;
    }
    const existingByEmail = await this.findUserByEmail(email);
    if (existingByEmail) {
      return existingByEmail;
    }

    const biz = await this.findBusinessById(data.business_id);
    const userId = data.id || generateUserDocId(biz?.name || data.business_id, email);
    const user: User = {
      id: userId,
      business_id: data.business_id,
      email,
      password_hash: data.password_hash || '',
      role: data.role || (biz?.business_type === 'HOTEL' ? 'HOTEL_OWNER' : 'RESTAURANT_OWNER'),
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.set(user.id, user);

    try {
      await prisma.user.upsert({
        where: { email },
        create: {
          id: user.id,
          business_id: user.business_id,
          email: user.email,
          password_hash: user.password_hash,
          role: user.role,
          status: user.status,
          allowed_tabs: user.allowed_tabs || [],
          last_login_at: user.last_login_at,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        update: {
          role: user.role,
          status: user.status,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      console.warn('PostgreSQL ensureUser notice:', err.message);
    }
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    if (this.users.has(id)) {
      return this.users.get(id)!;
    }
    try {
      const dbUser = await prisma.user.findUnique({ where: { id } });
      if (dbUser) {
        const u: User = {
          id: dbUser.id,
          business_id: dbUser.business_id,
          email: dbUser.email,
          password_hash: dbUser.password_hash,
          role: dbUser.role as UserRole,
          status: dbUser.status as any,
          allowed_tabs: Array.isArray(dbUser.allowed_tabs) ? sanitizeTabs(dbUser.allowed_tabs as any) : undefined,
          last_login_at: dbUser.last_login_at,
          created_at: dbUser.created_at,
          updated_at: dbUser.updated_at,
        };
        this.users.set(u.id, u);
        return u;
      }
    } catch (e) {}
    return null;
  }

  async findUsersByBusinessId(businessId: string): Promise<User[]> {
    const listMap = new Map<string, User>();

    // First populate from cache
    for (const u of this.users.values()) {
      if (u.business_id === businessId) {
        listMap.set(u.id, u);
      }
    }

    try {
      const dbUsers = await prisma.user.findMany({ where: { business_id: businessId } });
      for (const d of dbUsers) {
        const u: User = {
          id: d.id,
          business_id: d.business_id,
          email: d.email,
          password_hash: d.password_hash || '',
          role: d.role as UserRole,
          status: d.status as any,
          allowed_tabs: Array.isArray(d.allowed_tabs) ? sanitizeTabs(d.allowed_tabs as any) : undefined,
          last_login_at: d.last_login_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        };
        listMap.set(u.id, u);
        this.users.set(u.id, u);
      }
    } catch (err: any) {
      console.warn('findUsersByBusinessId error:', err.message);
    }

    return Array.from(listMap.values());
  }

  async updateUserRoleAndPermissions(
    id: string,
    role: UserRole,
    custom_permissions?: any,
    allowed_tabs?: TabPermissionId[]
  ): Promise<User | null> {
    const user = this.users.get(id);
    const cleanTabs = allowed_tabs !== undefined ? sanitizeTabs(allowed_tabs) : undefined;
    if (user) {
      user.role = role;
      if (custom_permissions !== undefined) user.custom_permissions = custom_permissions;
      if (cleanTabs !== undefined) user.allowed_tabs = cleanTabs;
      user.updated_at = new Date();
      this.users.set(id, user);
    }
    try {
      await prisma.user.update({
        where: { id },
        data: {
          role,
          ...(cleanTabs !== undefined ? { allowed_tabs: cleanTabs } : {}),
          updated_at: new Date(),
        },
      });
    } catch (e: any) {
      console.warn('updateUserRoleAndPermissions error:', e.message);
    }
    return user || null;
  }

  private pinnedTabsGuard: Set<string> = new Set();

  async ensureAllowedTabsPersisted(user: User): Promise<TabPermissionId[]> {
    if (isBusinessOwnerRole(user.role)) return deriveAllowedTabs(user.role);
    if (Array.isArray(user.allowed_tabs)) return sanitizeTabs(user.allowed_tabs);

    const derived = deriveAllowedTabs(user.role, user.custom_permissions);
    user.allowed_tabs = derived;
    const cached = this.users.get(user.id);
    if (cached && cached !== user) cached.allowed_tabs = derived;

    if (!this.pinnedTabsGuard.has(user.id)) {
      this.pinnedTabsGuard.add(user.id);
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { allowed_tabs: derived },
        });
      } catch (e) {
        this.pinnedTabsGuard.delete(user.id);
      }
    }
    return derived;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    try {
      await prisma.user.delete({ where: { id } });
    } catch (e) {}
  }

  async updateUserStatus(id: string, status: User['status']): Promise<User | null> {
    const user = this.users.get(id);
    if (user) {
      user.status = status;
      user.updated_at = new Date();
      this.users.set(id, user);
    }
    try {
      await prisma.user.update({
        where: { id },
        data: { status, updated_at: new Date() },
      });
    } catch (e) {}
    return user || null;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    const now = new Date();
    if (user) {
      user.last_login_at = now;
      user.updated_at = now;
      this.users.set(id, user);
    }
    try {
      await prisma.user.update({
        where: { id },
        data: { last_login_at: now, updated_at: now },
      });
    } catch (e) {}
  }

  async updateLastLogin(id: string): Promise<void> {
    return this.updateUserLastLogin(id);
  }

  async findActivePasswordResetTokens(userId: string): Promise<PasswordResetToken[]> {
    const tokens: PasswordResetToken[] = [];
    const now = new Date();
    for (const prt of this.passwordResetTokens.values()) {
      if (prt.user_id === userId && !prt.used_at && prt.expires_at > now) {
        tokens.push(prt);
      }
    }
    return tokens;
  }

  async upsertAccountAuditLog(data: {
    userId: string;
    accountName: string;
    businessName?: string | null;
    email?: string | null;
    status: string;
    eventType: string;
    ipAddress?: string;
    userAgent?: string;
    businessId?: string | null;
  }): Promise<void> {
    const user = Array.from(this.users.values()).find(u => u.id === data.userId);
    const resolvedBusinessId = data.businessId || user?.business_id || data.accountName;

    const log: AuditLog = {
      id: data.userId,
      user_id: data.userId,
      business_id: resolvedBusinessId,
      account_name: data.accountName,
      email: data.email || undefined,
      status: (data.status as any) || 'OFFLINE',
      event_type: data.eventType as any,
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      last_active_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    await this.upsertAuditLog(log);
  }

  async updateUserPassword(id: string, password_hash: string): Promise<void> {
    const user = this.users.get(id);
    const now = new Date();
    if (user) {
      user.password_hash = password_hash;
      user.updated_at = now;
      this.users.set(id, user);
    }
    try {
      await prisma.user.update({
        where: { id },
        data: { password_hash, updated_at: now },
      });
    } catch (e) {}
  }

  // --- Phone Verifications ---
  async createPhoneVerification(data: {
    user_id: string;
    phone_country_code: string;
    phone_number: string;
    phone_e164: string;
  }): Promise<PhoneVerification> {
    const docId = sanitizePhoneId(data.phone_e164);
    const pv: PhoneVerification = {
      id: docId,
      user_id: data.user_id,
      phone_country_code: data.phone_country_code,
      phone_number: data.phone_number,
      phone_e164: data.phone_e164,
      is_verified: false,
      verified_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.phoneVerifications.set(pv.id, pv);

    try {
      await prisma.phoneVerification.upsert({
        where: { id: pv.id },
        create: {
          id: pv.id,
          user_id: pv.user_id,
          phone_country_code: pv.phone_country_code,
          phone_number: pv.phone_number,
          phone_e164: pv.phone_e164,
          is_verified: pv.is_verified,
          verified_at: null,
          created_at: pv.created_at,
          updated_at: pv.updated_at,
        },
        update: {
          phone_country_code: pv.phone_country_code,
          phone_number: pv.phone_number,
          phone_e164: pv.phone_e164,
          updated_at: new Date(),
        },
      });
    } catch (e) {}

    return pv;
  }

  async createPhone(userId: string, countryCode: string, number: string, e164: string, isVerified = false): Promise<PhoneVerification> {
    const pv = await this.createPhoneVerification({
      user_id: userId,
      phone_country_code: countryCode,
      phone_number: number,
      phone_e164: e164,
    });
    if (isVerified) {
      await this.markPhoneVerified(userId);
    }
    return pv;
  }

  async findPhoneByUserId(userId: string): Promise<PhoneVerification | null> {
    for (const pv of this.phoneVerifications.values()) {
      if (pv.user_id === userId) return pv;
    }
    try {
      const dbPv = await prisma.phoneVerification.findFirst({ where: { user_id: userId } });
      if (dbPv) {
        const pv: PhoneVerification = {
          id: dbPv.id,
          user_id: dbPv.user_id,
          phone_country_code: dbPv.phone_country_code,
          phone_number: dbPv.phone_number,
          phone_e164: dbPv.phone_e164,
          is_verified: dbPv.is_verified,
          verified_at: dbPv.verified_at,
          created_at: dbPv.created_at,
          updated_at: dbPv.updated_at,
        };
        this.phoneVerifications.set(pv.id, pv);
        return pv;
      }
    } catch (e) {}
    return null;
  }

  async findPhoneByE164(phone_e164: string): Promise<PhoneVerification | null> {
    for (const pv of this.phoneVerifications.values()) {
      if (pv.phone_e164 === phone_e164) return pv;
    }
    try {
      const dbPv = await prisma.phoneVerification.findFirst({ where: { phone_e164 } });
      if (dbPv) {
        const pv: PhoneVerification = {
          id: dbPv.id,
          user_id: dbPv.user_id,
          phone_country_code: dbPv.phone_country_code,
          phone_number: dbPv.phone_number,
          phone_e164: dbPv.phone_e164,
          is_verified: dbPv.is_verified,
          verified_at: dbPv.verified_at,
          created_at: dbPv.created_at,
          updated_at: dbPv.updated_at,
        };
        this.phoneVerifications.set(pv.id, pv);
        return pv;
      }
    } catch (e) {}
    return null;
  }

  async markPhoneVerified(userId: string): Promise<void> {
    const pv = await this.findPhoneByUserId(userId);
    const now = new Date();
    if (pv) {
      pv.is_verified = true;
      pv.verified_at = now;
      pv.updated_at = now;
      this.phoneVerifications.set(pv.id, pv);

      try {
        await prisma.phoneVerification.updateMany({
          where: { user_id: userId },
          data: { is_verified: true, verified_at: now, updated_at: now },
        });
      } catch (e) {}
    }
  }

  async verifyPhone(phone_e164: string): Promise<void> {
    const pv = await this.findPhoneByE164(phone_e164);
    const now = new Date();
    if (pv) {
      pv.is_verified = true;
      pv.verified_at = now;
      pv.updated_at = now;
      this.phoneVerifications.set(pv.id, pv);

      try {
        await prisma.phoneVerification.updateMany({
          where: { phone_e164 },
          data: { is_verified: true, verified_at: now, updated_at: now },
        });
      } catch (e) {}
    }
  }

  // --- OTP Verifications ---
  async createOtpVerification(data: {
    user_id: string;
    phone_e164: string;
    email?: string;
    otp_hash: string;
    purpose: OtpVerification['purpose'];
    expires_at: Date;
    rawOtpDev?: string;
  }): Promise<OtpVerification> {
    const docId = sanitizePhoneId(data.phone_e164);
    const otp: OtpVerification = {
      id: docId,
      user_id: data.user_id,
      phone_e164: data.phone_e164,
      otp_hash: data.otp_hash,
      purpose: data.purpose,
      expires_at: data.expires_at,
      attempt_count: 0,
      verified_at: null,
      created_at: new Date(),
    };
    this.otpVerifications.set(otp.id, otp);

    if (data.rawOtpDev) {
      this.devOtpStore.set(data.phone_e164, data.rawOtpDev);
      if (data.email) {
        this.devOtpStore.set(data.email.toLowerCase().trim(), data.rawOtpDev);
      }
      this.devOtpStore.set(data.user_id, data.rawOtpDev);
    }

    try {
      await prisma.otpVerification.upsert({
        where: { id: otp.id },
        create: {
          id: otp.id,
          user_id: otp.user_id,
          phone_e164: otp.phone_e164,
          otp_hash: otp.otp_hash,
          purpose: otp.purpose,
          expires_at: otp.expires_at,
          attempt_count: otp.attempt_count,
          verified_at: null,
          created_at: otp.created_at,
        },
        update: {
          otp_hash: otp.otp_hash,
          expires_at: otp.expires_at,
          attempt_count: otp.attempt_count,
        },
      });
    } catch (e) {}

    return otp;
  }

  async getLatestOtp(userId: string, purpose: OtpVerification['purpose']): Promise<OtpVerification | null> {
    let latest: OtpVerification | null = null;
    for (const otp of this.otpVerifications.values()) {
      if (otp.user_id === userId && otp.purpose === purpose) {
        if (!latest || otp.created_at > latest.created_at) {
          latest = otp;
        }
      }
    }
    return latest;
  }

  async incrementOtpAttempt(id: string): Promise<number> {
    const otp = this.otpVerifications.get(id);
    if (otp) {
      otp.attempt_count += 1;
      this.otpVerifications.set(id, otp);
      try {
        await prisma.otpVerification.update({
          where: { id },
          data: { attempt_count: otp.attempt_count },
        });
      } catch (e) {}
      return otp.attempt_count;
    }
    return 0;
  }

  async markOtpVerified(id: string): Promise<void> {
    const otp = this.otpVerifications.get(id);
    const now = new Date();
    if (otp) {
      otp.verified_at = now;
      this.otpVerifications.set(id, otp);
      try {
        await prisma.otpVerification.update({
          where: { id },
          data: { verified_at: now },
        });
      } catch (e) {}
    }
  }

  async getRecentOtpRequestsCount(phone_e164: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    let count = 0;
    for (const otp of this.otpVerifications.values()) {
      if (otp.phone_e164 === phone_e164 && otp.created_at.getTime() > cutoff) {
        count++;
      }
    }
    return count;
  }

  // --- Password Reset Tokens ---
  async createPasswordResetToken(data: {
    user_id: string;
    token_hash: string;
    expires_at: Date;
    rawTokenDev?: string;
  }): Promise<PasswordResetToken> {
    const prt: PasswordResetToken = {
      id: crypto.randomUUID(),
      user_id: data.user_id,
      token_hash: data.token_hash,
      expires_at: data.expires_at,
      used_at: null,
      created_at: new Date(),
    };
    this.passwordResetTokens.set(prt.id, prt);

    try {
      await prisma.passwordResetToken.create({
        data: {
          id: prt.id,
          user_id: prt.user_id,
          token_hash: prt.token_hash,
          expires_at: prt.expires_at,
          used_at: null,
          created_at: prt.created_at,
        },
      });
    } catch (e) {}

    return prt;
  }

  async findPasswordResetToken(token_hash: string): Promise<PasswordResetToken | null> {
    for (const prt of this.passwordResetTokens.values()) {
      if (prt.token_hash === token_hash) return prt;
    }
    try {
      const dbPrt = await prisma.passwordResetToken.findUnique({ where: { token_hash } });
      if (dbPrt) {
        const prt: PasswordResetToken = {
          id: dbPrt.id,
          user_id: dbPrt.user_id,
          token_hash: dbPrt.token_hash,
          expires_at: dbPrt.expires_at,
          used_at: dbPrt.used_at,
          created_at: dbPrt.created_at,
        };
        this.passwordResetTokens.set(prt.id, prt);
        return prt;
      }
    } catch (e) {}
    return null;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    const prt = this.passwordResetTokens.get(id);
    const now = new Date();
    if (prt) {
      prt.used_at = now;
      this.passwordResetTokens.set(id, prt);
      try {
        await prisma.passwordResetToken.update({
          where: { id },
          data: { used_at: now },
        });
      } catch (e) {}
    }
  }

  getDevOtp(phone_e164?: string, email?: string): string | null {
    if (phone_e164 && this.devOtpStore.has(phone_e164)) {
      return this.devOtpStore.get(phone_e164)!;
    }
    if (email && this.devOtpStore.has(email.toLowerCase().trim())) {
      return this.devOtpStore.get(email.toLowerCase().trim())!;
    }
    return null;
  }

  getDevResetToken(email: string): string | null {
    const normalized = email.toLowerCase().trim();
    for (const prt of this.passwordResetTokens.values()) {
      if (!prt.used_at && prt.expires_at > new Date()) {
        const user = this.users.get(prt.user_id);
        if (user && user.email.toLowerCase() === normalized) {
          return prt.token_hash;
        }
      }
    }
    return null;
  }

  getDbStatus(): string {
    return this.isPostgresConnected ? 'POSTGRESQL_SUPABASE_CONNECTED' : 'LOCAL_POSTGRES_STORE_READY';
  }

  // --- Audit Logs ---
  async getAuditLogs(userId?: string, email?: string, businessId?: string): Promise<AuditLog[]> {
    let logs = Array.from(this.auditLogs.values());
    if (businessId) {
      logs = logs.filter(l => l.business_id === businessId || l.account_name === businessId);
    } else if (userId || email) {
      logs = logs.filter(l => 
        (userId && (l.user_id === userId || l.id === userId)) || 
        (email && l.email?.toLowerCase() === email.toLowerCase())
      );
    }
    logs.sort((a, b) => (b.last_active_at || b.created_at).getTime() - (a.last_active_at || a.created_at).getTime());
    return logs;
  }

  async deleteAuditLogs(userId?: string, email?: string, businessId?: string, filterType?: string, date?: string): Promise<{ deletedCount: number }> {
    let logsToDelete: string[] = [];
    const targetDate = date ? new Date(date).toISOString().split('T')[0] : null;

    for (const log of this.auditLogs.values()) {
      let matchesUser = false;
      if (businessId) {
        if (log.business_id === businessId || log.account_name === businessId) matchesUser = true;
      } else if (userId || email) {
        if (userId && (log.user_id === userId || log.id === userId)) matchesUser = true;
        if (email && log.email?.toLowerCase() === email.toLowerCase()) matchesUser = true;
      } else {
        matchesUser = true;
      }

      if (matchesUser) {
        let matchesDate = false;
        if (filterType === 'ALL') {
          matchesDate = true;
        } else if ((filterType === 'DAY' || filterType === 'CUSTOM') && targetDate) {
          const logDate = (log.last_active_at || log.created_at).toISOString().split('T')[0];
          if (logDate === targetDate) {
            matchesDate = true;
          }
        }

        if (matchesDate) {
          logsToDelete.push(log.id);
        }
      }
    }

    let deletedCount = 0;
    for (const id of logsToDelete) {
      this.auditLogs.delete(id);
      try {
        await prisma.auditLog.delete({ where: { id } });
        deletedCount++;
      } catch(e) {}
    }

    return { deletedCount };
  }

  async upsertAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.set(log.id, log);
    try {
      await prisma.auditLog.upsert({
        where: { id: log.id },
        create: {
          id: log.id,
          user_id: log.user_id || log.account_name || null,
          business_id: log.business_id || null,
          account_name: log.account_name || null,
          email: log.email || null,
          status: log.status || 'OFFLINE',
          event_type: log.event_type,
          ip_address: log.ip_address || null,
          user_agent: log.user_agent || null,
          created_at: log.created_at,
        },
        update: {
          status: log.status || 'OFFLINE',
          event_type: log.event_type,
        },
      });
    } catch (e: any) {
      console.warn('PostgreSQL upsert audit_log error:', e.message);
    }
  }

  async updateUserActiveState(userId: string, isOnline: boolean): Promise<void> {
    const user = this.users.get(userId);
    const now = new Date();
    const log = this.auditLogs.get(userId);
    if (log) {
      log.status = isOnline ? 'ONLINE' : 'OFFLINE';
      log.last_active_at = now;
      log.updated_at = now;
      await this.upsertAuditLog(log);
    }
  }

  saveDemoBooking(payload: any): void {
    this.demoBookings.set(payload.id, payload);
    console.log(`📌 [DB:DEMO_SAVED] Demo booking #${payload.id} recorded for ${payload.businessName} (${payload.email})`);
  }

  getDemoBookings(): any[] {
    return Array.from(this.demoBookings.values());
  }

  saveContactEnquiry(payload: any): void {
    this.contactEnquiries.set(payload.id, payload);
    console.log(`📌 [DB:ENQUIRY_SAVED] Enquiry #${payload.id} recorded from ${payload.name} (${payload.email})`);
  }

  getContactEnquiries(): any[] {
    return Array.from(this.contactEnquiries.values());
  }
}

export const db = new PostgresDatabaseStore();
