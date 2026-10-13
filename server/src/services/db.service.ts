import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { 
  firestoreDb, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocFromServer,
  collectionGroup
} from '../config/firebase';
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

class FirestoreDatabaseStore {
  private isFirestoreConnected = false;
  private isInitialized = false;

  // In-memory caching layer for instant sub-millisecond responses
  private businesses: Map<string, Business> = new Map();
  private users: Map<string, User> = new Map();
  private phoneVerifications: Map<string, PhoneVerification> = new Map();
  private otpVerifications: Map<string, OtpVerification> = new Map();
  private passwordResetTokens: Map<string, PasswordResetToken> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private devOtpStore: Map<string, string> = new Map();

  constructor() {
    this.initFirestore();
  }

  private async initFirestore() {
    try {
      // Test and sync Firestore collections on startup
      await this.syncFromFirestore();
      this.isFirestoreConnected = true;
      this.isInitialized = true;
      console.log('✅ Connected to Google Firebase Firestore & synced live collections.');
    } catch (err: any) {
      console.warn('⚠️ Firestore initialization notice (using memory sync):', err.message);
    }
  }

  private async syncFromFirestore() {
    try {
      // 1. Sync Businesses (strictly registered business entities only, purging any stray documents)
      const bSnap = await getDocs(collection(firestoreDb, 'businesses'));
      for (const d of bSnap.docs) {
        const data = d.data() as any;
        const currentId = d.id;
        
        // A valid business document must have a valid business name, business type, and cannot be a session or staff doc
        const isStray = currentId.startsWith('customer-sess-') || 
                        currentId.startsWith('order-') ||
                        currentId.startsWith('LOG-') ||
                        currentId === 'staff' || 
                        currentId === 'audit_logs' || 
                        !data ||
                        !data.name ||
                        typeof data.name !== 'string' ||
                        data.name.trim().length === 0 ||
                        (!data.business_type && !data.status);

        if (isStray) {
          try {
            await deleteDoc(doc(firestoreDb, 'businesses', currentId));
          } catch (err) {}
        } else {
          this.businesses.set(d.id, {
            id: d.id,
            name: data.name || d.id,
            business_type: data.business_type || 'RESTAURANT',
            status: data.status || 'ACTIVE',
            tagline: data.tagline ?? (data.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
            location: data.location ?? 'Main Dining & Service Area',
            address: data.address || '',
            kitchen_hours: data.kitchen_hours ?? '07:30 AM – 10:30 PM',
            phone: data.phone ?? '',
            parent_business_id: data.parent_business_id || undefined,
            owner_uid: data.owner_uid || undefined,
            branch_code: data.branch_code || undefined,
            currency: data.currency || undefined,
            tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : undefined,
            created_at: data.created_at ? new Date(data.created_at) : new Date(),
            updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
          });
        }
      }

      // 1b. Sync Franchises
      const fSnap = await getDocs(collectionGroup(firestoreDb, 'franchises'));
      for (const d of fSnap.docs) {
        const data = d.data() as any;
        const bizId = d.ref.path.replace('businesses/', ''); // e.g. "parent_id/franchises/slug"
        this.businesses.set(bizId, {
          id: bizId,
          name: data.name || d.id,
          business_type: data.business_type || 'RESTAURANT',
          status: data.status || 'ACTIVE',
          tagline: data.tagline,
          location: data.location,
          address: data.address || '',
          kitchen_hours: data.kitchen_hours,
          phone: data.phone ?? '',
          parent_business_id: data.parent_business_id || undefined,
          owner_uid: data.owner_uid || undefined,
          branch_code: data.branch_code || undefined,
          currency: data.currency || undefined,
          tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : undefined,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        });
      }

      // If database is brand new (e.g. freshly remixed), initialize default business
      if (this.businesses.size === 0) {
        await this.ensureBusiness('maya-forest-resort', 'Maya Forest Resort', 'HOTEL');
      }

      // 2. Sync Users
      const uSnap = await getDocs(collection(firestoreDb, 'users'));
      uSnap.forEach((d) => {
        const data = d.data() as any;
        this.users.set(d.id, {
          id: d.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash,
          role: data.role,
          status: data.status,
          custom_permissions: data.custom_permissions,
          allowed_tabs: Array.isArray(data.allowed_tabs) ? sanitizeTabs(data.allowed_tabs) : undefined,
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        });
      });

      // 3. Sync Phone Verifications
      const pSnap = await getDocs(collection(firestoreDb, 'phone_verifications'));
      pSnap.forEach((d) => {
        const data = d.data() as any;
        this.phoneVerifications.set(d.id, {
          id: d.id,
          user_id: data.user_id,
          phone_country_code: data.phone_country_code,
          phone_number: data.phone_number,
          phone_e164: data.phone_e164,
          is_verified: data.is_verified,
          verified_at: data.verified_at ? new Date(data.verified_at) : null,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        });
      });

      // 4. Sync Audit Logs
      const aSnap = await getDocs(collection(firestoreDb, 'audit_logs'));
      aSnap.forEach((d) => {
        const data = d.data() as any;
        this.auditLogs.set(d.id, {
          id: d.id,
          user_id: data.user_id || data.account_name,
          business_id: data.business_id || data.account_name,
          account_name: data.account_name || 'ServeFlow Business',
          email: data.email,
          status: data.status || 'OFFLINE',
          event_type: data.event_type,
          ip_address: data.ip_address,
          user_agent: data.user_agent,
          last_active_at: data.last_active_at ? new Date(data.last_active_at) : new Date(),
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        });
      });
    } catch (e: any) {
      console.warn('Firestore initial sync notice:', e.message);
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
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.businesses.set(business.id, business);

    try {
      const payload: any = {
        id: business.id,
        name: business.name,
        business_type: business.business_type,
        status: business.status,
        tagline: business.tagline,
        location: business.location,
        address: business.address,
        kitchen_hours: business.kitchen_hours,
        phone: business.phone,
        created_at: business.created_at.toISOString(),
        updated_at: business.updated_at.toISOString(),
      };
      if (business.parent_business_id) payload.parent_business_id = business.parent_business_id;
      if (business.owner_uid) payload.owner_uid = business.owner_uid;
      if (business.branch_code) payload.branch_code = business.branch_code;
      if (business.currency) payload.currency = business.currency;
      if (typeof business.tax_rate === 'number') payload.tax_rate = business.tax_rate;

      await setDoc(doc(firestoreDb, 'businesses', business.id), payload);
    } catch (err: any) {
      console.warn('Firestore createBusiness notice:', err.message);
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
      // Flagship/parent first
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
      const snap = await getDoc(doc(firestoreDb, 'businesses', id));
      if (snap.exists()) {
        const data = snap.data() as any;
        const b: Business = {
          id: snap.id,
          name: data.name || name || id,
          business_type: data.business_type || type || 'RESTAURANT',
          status: data.status || 'ACTIVE',
          tagline: data.tagline ?? (data.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: data.location ?? 'Main Dining & Service Area',
            address: data.address || '',
          kitchen_hours: data.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: data.phone ?? '',
          parent_business_id: data.parent_business_id || undefined,
          owner_uid: data.owner_uid || undefined,
          branch_code: data.branch_code || undefined,
          currency: data.currency || undefined,
          tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : undefined,
          show_menu_images: data.show_menu_images !== undefined ? Boolean(data.show_menu_images) : true,
          created_at: new Date(data.created_at || Date.now()),
          updated_at: new Date(data.updated_at || Date.now()),
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
      await setDoc(doc(firestoreDb, 'businesses', business.id), {
        id: business.id,
        name: business.name,
        business_type: business.business_type,
        status: business.status,
        tagline: business.tagline,
        location: business.location,
        kitchen_hours: business.kitchen_hours,
        phone: business.phone,
        created_at: business.created_at.toISOString(),
        updated_at: business.updated_at.toISOString(),
      });
    } catch (err: any) {
      console.warn('Firestore ensureBusiness notice:', err.message);
    }
    return business;
  }

  async findBusinessById(id: string): Promise<Business | null> {
    if (this.businesses.has(id)) {
      return this.businesses.get(id)!;
    }
    try {
      const snap = await getDoc(doc(firestoreDb, 'businesses', id));
      if (snap.exists()) {
        const data = snap.data() as any;
        const b: Business = {
          id: snap.id,
          name: data.name,
          business_type: data.business_type,
          status: data.status,
          tagline: data.tagline ?? (data.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: data.location ?? 'Main Dining & Service Area',
            address: data.address || '',
          kitchen_hours: data.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: data.phone ?? '',
          parent_business_id: data.parent_business_id || undefined,
          owner_uid: data.owner_uid || undefined,
          branch_code: data.branch_code || undefined,
          currency: data.currency || undefined,
          tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : undefined,
          show_menu_images: data.show_menu_images !== undefined ? Boolean(data.show_menu_images) : true,
          menu_theme_config: data.menu_theme_config || undefined,
          date_format_nav: data.date_format_nav || undefined,
          date_format_billing: data.date_format_billing || undefined,
          created_at: new Date(data.created_at),
          updated_at: new Date(data.updated_at),
        };
        this.businesses.set(b.id, b);
        return b;
      }
    } catch (e) {}
    return null;
  }

  async getAllBusinesses(): Promise<Business[]> {
    try {
      const snap = await getDocs(collection(firestoreDb, 'businesses'));
      const list: Business[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        const isStray = d.id.startsWith('customer-sess-') || 
                        d.id === 'staff' || 
                        d.id === 'audit_logs' || 
                        (!data.name && !data.business_type);
        if (!isStray) {
          const b: Business = {
            id: d.id,
            name: data.name || 'Unnamed Venue',
            business_type: data.business_type || 'RESTAURANT',
            status: data.status || 'ACTIVE',
            tagline: data.tagline ?? (data.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
            location: data.location ?? 'Main Dining & Service Area',
            address: data.address || '',
            kitchen_hours: data.kitchen_hours ?? '07:30 AM – 10:30 PM',
            phone: data.phone ?? '',
            parent_business_id: data.parent_business_id || undefined,
            owner_uid: data.owner_uid || undefined,
            branch_code: data.branch_code || undefined,
            currency: data.currency || undefined,
            tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : undefined,
            show_menu_images: data.show_menu_images !== undefined ? Boolean(data.show_menu_images) : true,
            menu_theme_config: data.menu_theme_config || undefined,
            date_format_nav: data.date_format_nav || undefined,
            date_format_billing: data.date_format_billing || undefined,
            created_at: new Date(data.created_at || Date.now()),
            updated_at: new Date(data.updated_at || Date.now()),
          };
          this.businesses.set(b.id, b);
          list.push(b);
        }
      });
      if (list.length > 0) {
        return list;
      }
    } catch (e: any) {
      console.warn('getAllBusinesses Firestore read notice:', e.message);
    }
    return [];
  }

  async getDefaultBusiness(): Promise<Business | null> {
    if (this.businesses.size > 0) {
      return this.businesses.values().next().value;
    }
    try {
      const snap = await getDocs(collection(firestoreDb, 'businesses'));
      if (!snap.empty) {
        const firstDoc = snap.docs[0];
        const data = firstDoc.data() as any;
        const b: Business = {
          id: firstDoc.id,
          name: data.name,
          business_type: data.business_type,
          status: data.status,
          tagline: data.tagline ?? (data.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
          location: data.location ?? 'Main Dining & Service Area',
            address: data.address || '',
          kitchen_hours: data.kitchen_hours ?? '07:30 AM – 10:30 PM',
          phone: data.phone ?? '',
          show_menu_images: data.show_menu_images !== undefined ? Boolean(data.show_menu_images) : true,
          menu_theme_config: data.menu_theme_config || undefined,
          date_format_nav: data.date_format_nav || undefined,
          date_format_billing: data.date_format_billing || undefined,
          created_at: new Date(data.created_at || Date.now()),
          updated_at: new Date(data.updated_at || Date.now()),
        };
        this.businesses.set(b.id, b);
        return b;
      }
    } catch (e) {}
    return null;
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
      await setDoc(doc(firestoreDb, 'businesses', id), {
        ...(updates.name !== undefined ? { name: business.name } : {}),
        ...(updates.business_type !== undefined ? { business_type: business.business_type } : {}),
        ...(updates.tagline !== undefined ? { tagline: business.tagline } : {}),
        ...(updates.location !== undefined ? { location: business.location } : {}),
        ...(updates.address !== undefined ? { address: business.address } : {}),
        ...(updates.kitchen_hours !== undefined ? { kitchen_hours: business.kitchen_hours } : {}),
        ...(updates.phone !== undefined ? { phone: business.phone } : {}),
        ...(updates.show_menu_images !== undefined ? { show_menu_images: business.show_menu_images } : {}),
        ...(updates.menu_theme_config !== undefined ? { menu_theme_config: business.menu_theme_config } : {}),
        ...(updates.date_format_nav !== undefined ? { date_format_nav: business.date_format_nav } : {}),
        ...(updates.date_format_billing !== undefined ? { date_format_billing: business.date_format_billing } : {}),
        updated_at: business.updated_at.toISOString(),
      }, { merge: true });
    } catch (e: any) {
      console.error('Firestore updateBusinessProfile ERROR:', e.code, e.message);
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
      await setDoc(doc(firestoreDb, 'businesses', id), {
        status,
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (e: any) {
      console.error('Firestore updateBusinessStatus ERROR:', e.code, e.message);
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
      await setDoc(doc(firestoreDb, 'users', user.id), {
        id: user.id,
        business_id: user.business_id,
        email: user.email,
        password_hash: user.password_hash,
        role: user.role,
        status: user.status,
        ...(user.allowed_tabs ? { allowed_tabs: user.allowed_tabs } : {}),
        last_login_at: null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      });
    } catch (err: any) {
      console.warn('Firestore createUser notice:', err.message);
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
      const q = query(collection(firestoreDb, 'users'), where('email', '==', normalized), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        const u: User = {
          id: d.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash,
          role: data.role,
          status: data.status,
          custom_permissions: data.custom_permissions,
          allowed_tabs: Array.isArray(data.allowed_tabs) ? sanitizeTabs(data.allowed_tabs) : undefined,
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: new Date(data.created_at),
          updated_at: new Date(data.updated_at),
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
      await setDoc(doc(firestoreDb, 'users', user.id), {
        id: user.id,
        business_id: user.business_id,
        email: user.email,
        password_hash: user.password_hash,
        role: user.role,
        status: user.status,
        last_login_at: user.last_login_at?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      });
    } catch (err: any) {
      console.warn('Firestore ensureUser notice:', err.message);
    }
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    if (this.users.has(id)) {
      return this.users.get(id)!;
    }
    try {
      const snap = await getDoc(doc(firestoreDb, 'users', id));
      if (snap.exists()) {
        const data = snap.data() as any;
        const u: User = {
          id: snap.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash,
          role: data.role,
          status: data.status,
          custom_permissions: data.custom_permissions,
          allowed_tabs: Array.isArray(data.allowed_tabs) ? sanitizeTabs(data.allowed_tabs) : undefined,
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: new Date(data.created_at),
          updated_at: new Date(data.updated_at),
        };
        this.users.set(u.id, u);
        return u;
      }
    } catch (e) {}
    return null;
  }

  async findUsersByBusinessId(businessId: string): Promise<User[]> {
    const listMap = new Map<string, User>();

    // First populate from in-memory cache
    for (const u of this.users.values()) {
      if (u.business_id === businessId) {
        listMap.set(u.id, u);
      }
    }

    try {
      const q = query(
        collection(firestoreDb, 'users'),
        where('business_id', '==', businessId)
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data() as any;
        const u: User = {
          id: d.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash || '',
          role: data.role,
          status: data.status || 'ACTIVE',
          custom_permissions: data.custom_permissions,
          allowed_tabs: Array.isArray(data.allowed_tabs) ? sanitizeTabs(data.allowed_tabs) : undefined,
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        };
        listMap.set(u.id, u);
        this.users.set(u.id, u);
      });
    } catch (err: any) {
      console.warn('findUsersByBusinessId error:', err.message);
    }

    const results = Array.from(listMap.values());
    return results;
  }

  /**
   * Updates a user's role label and (optionally) the tabs they may open.
   * `custom_permissions` is deprecated and ignored for access decisions; it is only passed
   * through when explicitly given and is never deleted from existing documents.
   */
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
      const updates: any = {
        role,
        updated_at: new Date().toISOString(),
      };
      if (custom_permissions !== undefined) {
        updates.custom_permissions = custom_permissions;
      }
      if (cleanTabs !== undefined) {
        updates.allowed_tabs = cleanTabs;
      }
      await updateDoc(doc(firestoreDb, 'users', id), updates);
    } catch (e) {}
    return user || null;
  }

  private pinnedTabsGuard: Set<string> = new Set();

  /**
   * Lazy one-time migration: persists the derived tab list for a non-owner account that has no
   * stored `allowed_tabs`, so the result stays stable and editable. Best effort, never throws.
   * Returns the effective tab list for the account.
   */
  async ensureAllowedTabsPersisted(user: User): Promise<TabPermissionId[]> {
    if (isBusinessOwnerRole(user.role)) return deriveAllowedTabs(user.role); // owners: all tabs, nothing stored
    if (Array.isArray(user.allowed_tabs)) return sanitizeTabs(user.allowed_tabs);

    const derived = deriveAllowedTabs(user.role, user.custom_permissions);
    user.allowed_tabs = derived;
    const cached = this.users.get(user.id);
    if (cached && cached !== user) cached.allowed_tabs = derived;

    if (!this.pinnedTabsGuard.has(user.id)) {
      this.pinnedTabsGuard.add(user.id);
      try {
        await updateDoc(doc(firestoreDb, 'users', user.id), { allowed_tabs: derived });
      } catch (e) {
        this.pinnedTabsGuard.delete(user.id);
      }
    }
    return derived;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    try {
      await deleteDoc(doc(firestoreDb, 'users', id));
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
      await updateDoc(doc(firestoreDb, 'users', id), {
        status,
        updated_at: new Date().toISOString(),
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
      await updateDoc(doc(firestoreDb, 'users', id), {
        last_login_at: now.toISOString(),
        updated_at: now.toISOString(),
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
      await updateDoc(doc(firestoreDb, 'users', id), {
        password_hash,
        updated_at: now.toISOString(),
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
      await setDoc(doc(firestoreDb, 'phone_verifications', pv.id), {
        id: pv.id,
        user_id: pv.user_id,
        phone_country_code: pv.phone_country_code,
        phone_number: pv.phone_number,
        phone_e164: pv.phone_e164,
        is_verified: pv.is_verified,
        verified_at: null,
        created_at: pv.created_at.toISOString(),
        updated_at: pv.updated_at?.toISOString() || null,
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
      const q = query(collection(firestoreDb, 'phone_verifications'), where('user_id', '==', userId), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        const pv: PhoneVerification = {
          id: d.id,
          user_id: data.user_id,
          phone_country_code: data.phone_country_code,
          phone_number: data.phone_number,
          phone_e164: data.phone_e164,
          is_verified: data.is_verified,
          verified_at: data.verified_at ? new Date(data.verified_at) : null,
          created_at: new Date(data.created_at),
          updated_at: data.updated_at ? new Date(data.updated_at) : null,
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
      const q = query(collection(firestoreDb, 'phone_verifications'), where('phone_e164', '==', phone_e164), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        const pv: PhoneVerification = {
          id: d.id,
          user_id: data.user_id,
          phone_country_code: data.phone_country_code,
          phone_number: data.phone_number,
          phone_e164: data.phone_e164,
          is_verified: data.is_verified,
          verified_at: data.verified_at ? new Date(data.verified_at) : null,
          created_at: new Date(data.created_at),
          updated_at: data.updated_at ? new Date(data.updated_at) : null,
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
        await updateDoc(doc(firestoreDb, 'phone_verifications', pv.id), {
          is_verified: true,
          verified_at: now.toISOString(),
          updated_at: now.toISOString(),
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
        await updateDoc(doc(firestoreDb, 'phone_verifications', pv.id), {
          is_verified: true,
          verified_at: now.toISOString(),
          updated_at: now.toISOString(),
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
      await setDoc(doc(firestoreDb, 'otp_verifications', otp.id), {
        id: otp.id,
        user_id: otp.user_id,
        phone_e164: otp.phone_e164,
        otp_hash: otp.otp_hash,
        purpose: otp.purpose,
        expires_at: otp.expires_at.toISOString(),
        attempt_count: otp.attempt_count,
        verified_at: null,
        created_at: otp.created_at.toISOString(),
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
        await updateDoc(doc(firestoreDb, 'otp_verifications', id), {
          attempt_count: otp.attempt_count,
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
        await updateDoc(doc(firestoreDb, 'otp_verifications', id), {
          verified_at: now.toISOString(),
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
      await setDoc(doc(firestoreDb, 'password_reset_tokens', prt.id), {
        id: prt.id,
        user_id: prt.user_id,
        token_hash: prt.token_hash,
        expires_at: prt.expires_at.toISOString(),
        used_at: null,
        created_at: prt.created_at.toISOString(),
      });
    } catch (e) {}

    return prt;
  }

  async findPasswordResetToken(token_hash: string): Promise<PasswordResetToken | null> {
    for (const prt of this.passwordResetTokens.values()) {
      if (prt.token_hash === token_hash) return prt;
    }
    return null;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    const prt = this.passwordResetTokens.get(id);
    const now = new Date();
    if (prt) {
      prt.used_at = now;
      this.passwordResetTokens.set(id, prt);
      try {
        await updateDoc(doc(firestoreDb, 'password_reset_tokens', id), {
          used_at: now.toISOString(),
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
    return this.isFirestoreConnected ? 'FIREBASE_FIRESTORE_CONNECTED' : 'LOCAL_FIREBASE_STORE_READY';
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
        matchesUser = true; // Admin deletion or fallback
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
        await deleteDoc(doc(firestoreDb, 'audit_logs', id));
        deletedCount++;
      } catch(e) {
        console.error('Failed to delete log from Firestore', id, e);
      }
    }

    return { deletedCount };
  }

  async upsertAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.set(log.id, log);
    try {
      await setDoc(doc(firestoreDb, 'audit_logs', log.id), {
        id: log.id,
        user_id: log.user_id || log.account_name,
        business_id: log.business_id || log.account_name,
        account_name: log.account_name,
        email: log.email || null,
        status: log.status || 'OFFLINE',
        event_type: log.event_type,
        ip_address: log.ip_address || null,
        user_agent: log.user_agent || null,
        last_active_at: (log.last_active_at || log.created_at).toISOString(),
        created_at: log.created_at.toISOString(),
        updated_at: (log.updated_at || log.created_at).toISOString(),
      }, { merge: true });
    } catch (e: any) {
      console.warn('Firestore upsert audit_log error:', e.message);
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
}

export const db = new FirestoreDatabaseStore();

