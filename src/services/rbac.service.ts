
import { 
  AppRole, 
  MenuItem, 
  MenuCategory, 
  MenuStatus, 
  CheckIn, 
  CheckInStatus, 
  RestaurantTable,
  TableStatus,
  TableOrder,
  TableOrderItem,
  OrderStatus,
  TeamMember,
  StaffAccountSession,
  BusinessTaxConfig,
  TaxRateItem,
  SaleRecord,
  SaleItem,
  GLAccountLink,
  GLAccountCategory,
  TabPermissionId
} from '../types/rbac';
import { Business } from '../types/auth';

export class ClientRBACService {
  private static readonly STORAGE_SESSION_KEY = 'serveflow_staff_role_session';
  private currentStaffSession: StaffAccountSession | null = null;

  constructor() {
    this.loadPersistedSession();
  }

  private loadPersistedSession() {
    try {
      const stored = sessionStorage.getItem(ClientRBACService.STORAGE_SESSION_KEY);
      if (stored) {
        this.currentStaffSession = JSON.parse(stored);
      }
    } catch {
      this.currentStaffSession = null;
    }
  }

  public getCurrentStaffSession(): StaffAccountSession | null {
    if (!this.currentStaffSession) {
      this.loadPersistedSession();
    }
    return this.currentStaffSession;
  }

  public setCurrentStaffSession(session: StaffAccountSession | null) {
    this.currentStaffSession = session;
    if (session) {
      sessionStorage.setItem(ClientRBACService.STORAGE_SESSION_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(ClientRBACService.STORAGE_SESSION_KEY);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('serveflow:staff-session-changed', { detail: session }));
    }
  }

  public clearStaffSession() {
    this.setCurrentStaffSession(null);
  }



  public normalizeRole(role?: string): 'OWNER' | 'ADMIN' | 'MANAGER' | 'KITCHEN_STAFF' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'CASHIER' {
    if (!role) return 'KITCHEN_STAFF';
    const upper = role.toUpperCase().trim();
    if (upper.includes('OWNER')) {
      return 'OWNER';
    }
    if (upper.includes('ADMIN')) {
      return 'ADMIN';
    }
    if (upper.includes('MANAGER')) {
      return 'MANAGER';
    }
    if (upper.includes('FRONT') || upper.includes('DESK') || upper.includes('RECEPTION')) {
      return 'FRONT_DESK';
    }
    if (upper.includes('HOUSEKEEPING') || upper.includes('CLEANING')) {
      return 'HOUSEKEEPING';
    }
    if (upper.includes('CASHIER')) {
      return 'CASHIER';
    }
    return 'KITCHEN_STAFF'; // Fallback
  }



  // =========================================================================
  // REST & SOCKET COLLECTIONS (Client-Side Helper Methods)
  // =========================================================================

  public async fetchMenus(businessId: string, userRole?: string): Promise<MenuItem[]> {
    return this.getMenuItemsApi(businessId);
  }

  public async fetchCheckIns(businessId: string, userRole?: string): Promise<CheckIn[]> {
    return this.getCheckInsApi(businessId);
  }

  public getAuthHeaders(extra?: Record<string, string>, businessId?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }
    const session = this.getCurrentStaffSession();
    if (session) {
      headers['x-staff-session'] = JSON.stringify(session);
      headers['x-staff-role'] = session.role;
      headers['x-staff-email'] = session.email;
      if (session.businessId) {
        headers['x-business-id'] = session.businessId;
      }
    }
    const cachedUserStr = localStorage.getItem('serveflow_cached_user');
    if (cachedUserStr) {
      try {
        const cachedUser = JSON.parse(cachedUserStr);
        if (cachedUser) {
          if (cachedUser.id && !headers['x-user-id']) headers['x-user-id'] = cachedUser.id;
          if (cachedUser.email && !headers['x-user-email']) headers['x-user-email'] = cachedUser.email;
          if (cachedUser.role && !headers['x-user-role']) headers['x-user-role'] = cachedUser.role;
          if (cachedUser.business?.id && !headers['x-business-id']) {
            headers['x-business-id'] = cachedUser.business.id;
          }
          if (cachedUser.business?.name && !headers['x-business-name']) {
            headers['x-business-name'] = cachedUser.business.name;
          }
          if (cachedUser.business?.type && !headers['x-business-type']) {
            headers['x-business-type'] = cachedUser.business.type;
          }
        }
      } catch {}
    }
    if (businessId) {
      headers['x-business-id'] = businessId;
    }
    return headers;
  }

  // =========================================================================
  // API CLIENT METHODS FOR TEAM MANAGEMENT
  // =========================================================================

  public async getTeamMembers(businessId?: string): Promise<TeamMember[]> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/staff${query}`, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch team members');
    }
    return data.data || [];
  }

  public async addStaffMember(payload: { email: string; password: string; role: string; allowed_tabs?: TabPermissionId[] }, businessId?: string): Promise<TeamMember> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/staff${query}`, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...payload, businessId, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to add staff member');
    }
    return data.data;
  }

  public async updateStaffRole(userId: string, role: string, allowed_tabs?: TabPermissionId[], businessId?: string): Promise<void> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/staff/${userId}/role${query}`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ role, allowed_tabs, businessId, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to update staff role');
    }
  }

  public async deleteStaffMember(userId: string, businessId?: string): Promise<void> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/staff/${userId}${query}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to remove staff member');
    }
  }

  // Businesses API
  public async getBusinessesApi(): Promise<Business[]> {
    const res = await fetch('/api/rbac/businesses', {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch businesses');
    return data.data || [];
  }

  public async createBusinessApi(biz: { name: string; business_type?: string; tagline?: string; location?: string; kitchen_hours?: string; phone?: string }): Promise<Business> {
    const res = await fetch('/api/rbac/businesses', {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(biz),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to register business');
    return data.data;
  }

  // Categories API
  public async getCategoriesApi(businessId?: string): Promise<MenuCategory[]> {
    const url = businessId ? `/api/menus/categories?businessId=${encodeURIComponent(businessId)}` : '/api/menus/categories';
    const res = await fetch(url, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch categories');
    return data.data || [];
  }

  public async createCategoryApi(name: string, businessId?: string): Promise<MenuCategory> {
    const url = businessId ? `/api/menus/categories?businessId=${encodeURIComponent(businessId)}` : '/api/menus/categories';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ name, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create category');
    return data.data;
  }

  public async updateCategoryApi(id: string, name: string, businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/categories/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/menus/categories/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ name, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update category');
  }

  public async reorderCategoriesApi(orderedIds: string[], businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/categories/reorder?businessId=${encodeURIComponent(businessId)}` : '/api/menus/categories/reorder';
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ order: orderedIds, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to reorder categories');
  }

  public async deleteCategoryApi(id: string, businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/categories/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/menus/categories/${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete category');
  }

  // Menus API
  public async getMenusApi(businessId?: string): Promise<MenuItem[]> {
    const url = businessId ? `/api/menus?businessId=${encodeURIComponent(businessId)}` : '/api/menus';
    const res = await fetch(url, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch menus');
    return data.data || [];
  }

  public async createMenuItemApi(item: Partial<MenuItem>, businessId?: string): Promise<MenuItem> {
    const url = businessId ? `/api/menus?businessId=${encodeURIComponent(businessId)}` : '/api/menus';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...item, business_id: businessId || item.business_id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create menu item');
    return data.data;
  }

  public async updateMenuItemApi(id: string, updates: Partial<MenuItem>, businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/menus/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...updates, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update menu item');
  }

  public async updateMenuItemStatusApi(id: string, status: MenuStatus, businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/${id}/status?businessId=${encodeURIComponent(businessId)}` : `/api/menus/${id}/status`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ status, is_available: status === 'available', business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update menu item status');
  }

  public async deleteMenuItemApi(id: string, businessId?: string): Promise<void> {
    const url = businessId ? `/api/menus/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/menus/${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete menu item');
  }

  // Check-ins API
  public async getCheckInsApi(businessId?: string): Promise<CheckIn[]> {
    const url = businessId ? `/api/rbac/check-ins?businessId=${encodeURIComponent(businessId)}` : '/api/rbac/check-ins';
    const res = await fetch(url, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch check-ins');
    return data.data || [];
  }

  public async createCheckInApi(checkIn: Partial<CheckIn>, businessId?: string): Promise<CheckIn> {
    const url = businessId ? `/api/rbac/check-ins?businessId=${encodeURIComponent(businessId)}` : '/api/rbac/check-ins';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...checkIn, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create check-in');
    return data.data;
  }

  public async updateCheckInStatusApi(id: string, status: CheckInStatus, businessId?: string): Promise<void> {
    const url = businessId ? `/api/rbac/check-ins/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/rbac/check-ins/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ status, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update check-in');
  }

  public async deleteCheckInApi(id: string, businessId?: string): Promise<void> {
    const url = businessId ? `/api/rbac/check-ins/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/rbac/check-ins/${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete check-in');
  }

  // =========================================================================
  // Tables & QR Digital Ordering API
  // =========================================================================

  public async getTablesApi(businessId?: string): Promise<RestaurantTable[]> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/tables${query}`, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch tables');
    return data.data || [];
  }

  public async createTableApi(table: Partial<RestaurantTable>, businessId?: string): Promise<RestaurantTable> {
    const url = businessId ? `/api/rbac/tables?businessId=${encodeURIComponent(businessId)}` : '/api/rbac/tables';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...table, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create table');
    return data.data;
  }

  public async seedDefaultTablesApi(businessId?: string): Promise<RestaurantTable[]> {
    const url = businessId ? `/api/rbac/tables/seed-defaults?businessId=${encodeURIComponent(businessId)}` : '/api/rbac/tables/seed-defaults';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to seed tables');
    return data.data || [];
  }

  public async updateTableApi(id: string, updates: Partial<RestaurantTable>, businessId?: string): Promise<void> {
    const url = businessId ? `/api/rbac/tables/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/rbac/tables/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ ...updates, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update table');
  }

  public async updateTableStatusApi(id: string, status: TableStatus, businessId?: string): Promise<void> {
    const url = businessId ? `/api/rbac/tables/${id}/status?businessId=${encodeURIComponent(businessId)}` : `/api/rbac/tables/${id}/status`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
      body: JSON.stringify({ status, business_id: businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update table status');
  }

  public async resetTableStatusApi(businessId?: string, tableId?: string, tableNumber?: string): Promise<void> {
    try {
      await fetch('/api/rbac/tables/reset-status', {
        method: 'POST',
        headers: this.getAuthHeaders(undefined, businessId),
        body: JSON.stringify({ businessId, tableId, tableNumber }),
      });
    } catch (err) {
      console.warn('resetTableStatusApi error:', err);
    }
  }

  public async deleteTableApi(id: string, businessId?: string): Promise<void> {
    const url = businessId ? `/api/rbac/tables/${id}?businessId=${encodeURIComponent(businessId)}` : `/api/rbac/tables/${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to delete table via server');
    }
  }

  public async resetTableSessionApi(tableId: string, businessId?: string): Promise<RestaurantTable> {
    const url = businessId 
      ? `/api/rbac/tables/${encodeURIComponent(tableId)}/reset-session?businessId=${encodeURIComponent(businessId)}`
      : `/api/rbac/tables/${encodeURIComponent(tableId)}/reset-session`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to reset table session');
    return data.data;
  }

  public async scanTableCheckInApi(
    tableIdOrBusinessId?: string,
    paramsOrTableId?: string | { business_id?: string; table_number?: string; floor?: string | null; building?: string | null; existingHostToken?: string },
    tableNumber?: string,
    existingHostToken?: string
  ): Promise<{ table: RestaurantTable; business: any; is_host: boolean; host_token: string | null; session_id: string }> {
    let businessId: string | undefined;
    let tableId: string | undefined;
    let tableNum: string | undefined;
    let hostToken: string | undefined = existingHostToken;

    if (typeof paramsOrTableId === 'object' && paramsOrTableId !== null) {
      tableId = tableIdOrBusinessId;
      businessId = paramsOrTableId.business_id;
      tableNum = paramsOrTableId.table_number;
      if (paramsOrTableId.existingHostToken) {
        hostToken = paramsOrTableId.existingHostToken;
      }
    } else {
      businessId = tableIdOrBusinessId;
      tableId = typeof paramsOrTableId === 'string' ? paramsOrTableId : undefined;
      tableNum = tableNumber;
    }

    const res = await fetch('/api/rbac/tables/scan-checkin', {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, businessId),
      body: JSON.stringify({ 
        businessId, 
        tableId, 
        tableNumber: tableNum,
        existingHostToken: hostToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to scan table check-in');
    return data.data;
  }

  public async placeTableOrderApi(orderData: Partial<TableOrder>): Promise<TableOrder> {
    const res = await fetch('/api/rbac/orders', {
      method: 'POST',
      headers: this.getAuthHeaders(undefined, orderData.business_id),
      body: JSON.stringify(orderData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to place table order');
    return data.data;
  }

  public async getTableOrdersApi(tableIdOrBusinessId?: string, businessId?: string): Promise<TableOrder[]> {
    const params = new URLSearchParams();
    let effectiveBizId = businessId;

    if (tableIdOrBusinessId && businessId) {
      params.append('tableId', tableIdOrBusinessId);
      params.append('businessId', businessId);
      effectiveBizId = businessId;
    } else if (tableIdOrBusinessId) {
      if (tableIdOrBusinessId.startsWith('table-') || tableIdOrBusinessId.startsWith('tbl_') || /^\d+$/.test(tableIdOrBusinessId)) {
        params.append('tableId', tableIdOrBusinessId);
      } else {
        params.append('businessId', tableIdOrBusinessId);
        effectiveBizId = tableIdOrBusinessId;
      }
    } else if (businessId) {
      params.append('businessId', businessId);
      effectiveBizId = businessId;
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/rbac/orders${query}`, {
      headers: this.getAuthHeaders(undefined, effectiveBizId),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch table orders');
    return data.data || [];
  }

  public async cancelTableOrderItemApi(
    orderId: string,
    itemIdentifier: { index?: number; itemKey?: string; itemId?: string },
    businessId?: string
  ): Promise<TableOrder> {
    return this.updateTableOrderItemStatusApi(orderId, itemIdentifier, 'CANCELLED', businessId);
  }

  public async updateTableOrderStatusApi(orderId: string, status: OrderStatus, businessId?: string): Promise<TableOrder> {
    const res = await fetch(`/api/rbac/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(undefined, businessId),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status, businessId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update order status');
    return data.data;
  }

  public async updateTableOrderItemStatusApi(
    orderId: string,
    itemIdentifier: { index?: number; itemKey?: string; itemId?: string },
    status: OrderStatus,
    businessId?: string
  ): Promise<TableOrder> {
    const res = await fetch(`/api/rbac/orders/${encodeURIComponent(orderId)}/items/status`, {
      method: 'PATCH',
      headers: {
        ...this.getAuthHeaders(undefined, businessId),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        itemIndex: itemIdentifier.index,
        itemKey: itemIdentifier.itemKey,
        itemId: itemIdentifier.itemId,
        status,
        businessId
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update item status');
    return data.data;
  }

  public async getBusinessProfileApi(businessId?: string): Promise<Business> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/business-profile${query}`, {
      headers: this.getAuthHeaders(undefined, businessId),
      credentials: 'include',
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
    }
    if (!res.ok) throw new Error(data.error?.message || 'Failed to load business profile');
    return data.data;
  }

  public async updateBusinessProfileApi(updates: Partial<Business> & { business_type?: string }, businessId?: string): Promise<Business> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/business-profile${query}`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(undefined, businessId),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
    }
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update business profile');
    return data.data;
  }

  // ==========================================
  // BILLING, POS SALES & TAX CONFIGURATION
  // ==========================================

  public async getTaxConfigApi(businessId?: string): Promise<BusinessTaxConfig> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/tax-config${query}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to load tax settings');
    return data.data;
  }

  public async updateTaxConfigApi(
    config: Partial<BusinessTaxConfig>,
    businessId?: string
  ): Promise<BusinessTaxConfig> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/tax-config${query}`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update tax settings');
    return data.data;
  }

  // ==========================================
  // GL (GENERAL LEDGER) ACCOUNTS (Owner Configurable)
  // ==========================================

  public async getGLAccountsApi(businessId?: string): Promise<GLAccountLink[]> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/gl-accounts${query}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to load GL accounts');
    return data.data;
  }

  public async createGLAccountApi(
    payload: Partial<GLAccountLink>,
    businessId?: string
  ): Promise<GLAccountLink> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/gl-accounts${query}`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create GL account');
    return data.data;
  }

  public async updateGLAccountApi(
    accountId: string,
    updates: Partial<GLAccountLink>,
    businessId?: string
  ): Promise<GLAccountLink> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/gl-accounts/${encodeURIComponent(accountId)}${query}`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to update GL account');
    return data.data;
  }

  public async deleteGLAccountApi(accountId: string, businessId?: string): Promise<void> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/gl-accounts/${encodeURIComponent(accountId)}${query}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete GL account');
  }

  public async resetDefaultGLAccountsApi(businessId?: string): Promise<GLAccountLink[]> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/gl-accounts/reset-default${query}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to reset GL accounts');
    return data.data;
  }

  public async getSalesApi(
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
      paymentMethod?: string;
      limit?: number;
    },
    businessId?: string
  ): Promise<SaleRecord[]> {
    const params = new URLSearchParams();
    if (businessId) params.append('businessId', businessId);
    if (filters?.date) params.append('date', filters.date);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/rbac/sales${queryString}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to load sales history');
    return data.data;
  }

  public async createSaleApi(
    payload: Partial<SaleRecord>,
    businessId?: string
  ): Promise<SaleRecord> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/sales${query}`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to record sale');
    return data.data;
  }

  public async deleteSaleApi(saleId: string, businessId?: string): Promise<void> {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
    const res = await fetch(`/api/rbac/sales/${encodeURIComponent(saleId)}${query}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete sale record');
  }

  public async deleteSalesByDateApi(
    date: string,
    businessId?: string
  ): Promise<{ deletedCount: number }> {
    const params = new URLSearchParams();
    params.append('date', date);
    if (businessId) params.append('businessId', businessId);

    const res = await fetch(`/api/rbac/sales?${params.toString()}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to delete day sales history');
    return data.data;
  }

  public async deleteAllSalesApi(businessId?: string): Promise<{ deletedCount: number }> {
    const params = new URLSearchParams();
    params.append('all', 'true');
    if (businessId) params.append('businessId', businessId);

    const res = await fetch(`/api/rbac/sales?${params.toString()}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to clear all sales history');
    return data.data;
  }

  public async cleanupDailyOrdersApi(
    businessId?: string
  ): Promise<{ deletedOrders: number; deletedSales: number }> {
    const params = new URLSearchParams();
    if (businessId) params.append('businessId', businessId);

    const res = await fetch(`/api/rbac/orders/cleanup?${params.toString()}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to perform daily order cleanup');
    return data.data;
  }

  public async purgeCompletedOrdersApi(
    businessId?: string
  ): Promise<{ deletedCount: number }> {
    const params = new URLSearchParams();
    if (businessId) params.append('businessId', businessId);

    const res = await fetch(`/api/rbac/orders/completed?${params.toString()}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to clear completed tickets');
    return data.data;
  }

  public async getBranchesApi(businessId?: string): Promise<Business[]> {
    const params = new URLSearchParams();
    if (businessId) params.append('businessId', businessId);
    const res = await fetch(`/api/business/branches${params.toString() ? '?' + params.toString() : ''}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch franchise branches');
    return data.data;
  }

  public async createBranchApi(branchData: {
    name: string;
    branch_code?: string;
    location?: string;
    phone?: string;
    tagline?: string;
    kitchen_hours?: string;
    currency?: string;
    tax_rate?: number;
    business_type?: string;
    clone_menu_from?: string;
  }): Promise<{ branch: Business; cloneStats?: { categoriesCloned: number; itemsCloned: number } }> {
    const res = await fetch('/api/business/branches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify(branchData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to create franchise branch');
    return { branch: data.data, cloneStats: data.cloneStats };
  }

  public async confirmTableOrderPaymentApi(orderId: string, businessId: string, paymentMethod: string, notes?: string): Promise<any> {
    const res = await fetch(`/api/rbac/orders/${orderId}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ businessId, payment_method: paymentMethod, notes }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error?.message || 'Failed to confirm payment');
    }
    return result;
  }

  public async rejectTableOrderPaymentApi(orderId: string, businessId: string, reason: string): Promise<any> {
    const res = await fetch(`/api/rbac/orders/${orderId}/reject-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ businessId, reason }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error?.message || 'Failed to reject payment');
    }
    return result;
  }

  public async updateTableOrderPaymentMethodApi(orderId: string, businessId: string, paymentMethod: string): Promise<void> {
    const res = await fetch(`/api/rbac/orders/${orderId}/payment-method`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ businessId, payment_method: paymentMethod }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error?.message || 'Failed to update payment method');
    }
  }

  public async acknowledgeBillFolioApi(businessId: string, orderId?: string, requestId?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/rbac/orders/${orderId || 'general'}/acknowledge-bill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ businessId, orderId, requestId }),
      });
      const result = await res.json();
      return result.success ?? false;
    } catch {
      return false;
    }
  }

  public async getOperationsDataApi(businessId: string): Promise<{ operations_config: any; current_operational_day: any; history: any[] }> {
    const res = await fetch(`/api/rbac/businesses/${businessId}/operations`, {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const result = await res.json();
    return result.data || { operations_config: null, current_operational_day: null, history: [] };
  }

  public async saveOperationsConfigApi(businessId: string, config: any): Promise<void> {
    const res = await fetch(`/api/rbac/businesses/${businessId}/operations/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ config }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Failed to save config');
  }

  public async createOperationalDayApi(businessId: string, day: any): Promise<any> {
    const res = await fetch(`/api/rbac/businesses/${businessId}/operations/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(day),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Failed to create operational day');
    return result.data;
  }

  public async updateOperationalDayApi(businessId: string, dayId: string, day: any): Promise<any> {
    const res = await fetch(`/api/rbac/businesses/${businessId}/operations/days/${dayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(day),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update operational day');
    return result.data;
  }

  public async createServiceRequestApi(payload: any): Promise<any> {
    const res = await fetch(`/api/rbac/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    return result.data;
  }

  public async getServiceRequestsApi(businessId: string): Promise<any[]> {
    const res = await fetch(`/api/rbac/service-requests?businessId=${encodeURIComponent(businessId)}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    const result = await res.json();
    return result.data || [];
  }

  public async acknowledgeTablePingApi(businessId: string, tableId: string): Promise<boolean> {
    const res = await fetch(`/api/rbac/tables/${encodeURIComponent(tableId)}/acknowledge-ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ businessId }),
    });
    const result = await res.json();
    return result.success ?? false;
  }

  public async requestBillApi(businessId: string, orderId: string, payload?: any): Promise<any> {
    const res = await fetch(`/api/rbac/orders/${orderId}/request-bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ businessId, ...payload }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error?.message || 'Failed to request bill');
    return result.data;
  }

}

export const rbacService = new ClientRBACService();
