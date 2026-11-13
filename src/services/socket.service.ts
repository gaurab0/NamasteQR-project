import { io, Socket } from 'socket.io-client';

class RealtimeSocketService {
  private socket: Socket | null = null;
  private currentBusinessId: string | null = null;
  private currentTableId: string | null = null;
  private currentMenuBizId: string | null = null;
  private orderListeners: Set<(order: any) => void> = new Set();
  private tableListeners: Set<(table: any) => void> = new Set();
  private requestListeners: Set<(request: any) => void> = new Set();
  private menuListeners: Set<(data: any) => void> = new Set();
  private businessProfileListeners: Set<(data: any) => void> = new Set();
  private salesListeners: Set<(sale: any) => void> = new Set();
  private salesDeletedListeners: Set<(payload: any) => void> = new Set();
  private cashierSessionListeners: Set<(session: any) => void> = new Set();
  private operationsConfigListeners: Set<(config: any) => void> = new Set();
  private operationalDayListeners: Set<(day: any) => void> = new Set();
  private reconnectListeners: Set<() => void> = new Set();
  private hasConnectedOnce = false;

  public onReconnect(cb: () => void): () => void {
    this.reconnectListeners.add(cb);
    return () => {
      this.reconnectListeners.delete(cb);
    };
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public connect(): Socket {
    if (this.socket) {
      if (this.socket.disconnected) {
        this.socket.connect();
      }
      return this.socket;
    }

    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token'))
      : null;

    // Connect to current origin
    const url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: {
        token: token || undefined,
      },
    });

    this.socket.on('connect', () => {
      console.log('⚡ Socket.io real-time connected:', this.socket?.id);
      if (this.currentBusinessId) {
        const currentToken = typeof window !== 'undefined'
          ? (localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token'))
          : null;
        this.socket?.emit('join:business', { businessId: this.currentBusinessId, token: currentToken || undefined });
      }
      if (this.currentBusinessId && this.currentTableId) {
        this.socket?.emit('join:table', { businessId: this.currentBusinessId, tableId: this.currentTableId });
      }
      if (this.currentMenuBizId) {
        this.socket?.emit('join:menu', this.currentMenuBizId);
      }

      if (this.hasConnectedOnce) {
        // This is a reconnect — notify listeners
        this.reconnectListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.error('Error in socket reconnect listener:', e);
          }
        });
      }
      this.hasConnectedOnce = true;
    });

    this.socket.on('socket:error', (err: any) => {
      console.warn('⚠️ Socket.io security warning:', err?.message || err);
    });

    this.socket.on('order:created', (order: any) => {
      this.orderListeners.forEach((listener) => listener(order));
    });

    this.socket.on('order:updated', (order: any) => {
      this.orderListeners.forEach((listener) => listener(order));
    });

    this.socket.on('table:updated', (table: any) => {
      this.tableListeners.forEach((listener) => listener(table));
    });

    this.socket.on('request:updated', (request: any) => {
      this.requestListeners.forEach((listener) => listener(request));
    });

    this.socket.on('menu:updated', (data: any) => {
      this.menuListeners.forEach((listener) => listener(data));
    });

    this.socket.on('sale:created', (sale: any) => {
      this.salesListeners.forEach((listener) => listener(sale));
    });

    this.socket.on('sale:deleted', (payload: any) => {
      this.salesDeletedListeners.forEach((listener) => listener(payload));
    });

    this.socket.on('cashier_session:updated', (session: any) => {
      this.cashierSessionListeners.forEach((listener) => listener(session));
    });

    this.socket.on('business:updated', (data: any) => {
      this.businessProfileListeners.forEach((listener) => listener(data));
    });

    this.socket.on('operations_config:updated', (config: any) => {
      this.operationsConfigListeners.forEach((listener) => listener(config));
    });

    this.socket.on('operational_day:updated', (day: any) => {
      this.operationalDayListeners.forEach((listener) => listener(day));
    });

    return this.socket;
  }

  public joinBusiness(businessId: string): void {
    this.currentBusinessId = businessId;
    const socket = this.connect();
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token'))
      : null;
    if (socket) {
      (socket as any).auth = { token: token || undefined };
    }
    if (socket.connected) {
      socket.emit('join:business', { businessId, token: token || undefined });
    }
  }

  public leaveBusiness(businessId: string): void {
    if (this.currentBusinessId === businessId) {
      this.currentBusinessId = null;
    }
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave:business', { businessId });
    }
  }

  public joinTable(businessId: string, tableId: string): void {
    this.currentBusinessId = businessId;
    this.currentTableId = tableId;
    const socket = this.connect();
    if (socket.connected) {
      socket.emit('join:table', { businessId, tableId });
    }
  }

  public leaveTable(businessId: string, tableId: string): void {
    if (this.currentTableId === tableId) {
      this.currentTableId = null;
    }
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave:table', { businessId, tableId });
    }
  }

  public joinMenu(businessId: string): void {
    this.currentMenuBizId = businessId;
    const socket = this.connect();
    if (socket.connected) {
      socket.emit('join:menu', businessId);
    }
  }

  public leaveMenu(businessId: string): void {
    if (this.currentMenuBizId === businessId) {
      this.currentMenuBizId = null;
    }
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave:menu', businessId);
    }
  }

  public subscribeToOrders(callback: (order: any) => void): () => void {
    this.orderListeners.add(callback);
    this.connect();
    return () => {
      this.orderListeners.delete(callback);
    };
  }

  public subscribeToTables(callback: (table: any) => void): () => void {
    this.tableListeners.add(callback);
    this.connect();
    return () => {
      this.tableListeners.delete(callback);
    };
  }

  public subscribeToServiceRequests(callback: (request: any) => void): () => void {
    this.requestListeners.add(callback);
    this.connect();
    return () => {
      this.requestListeners.delete(callback);
    };
  }

  public subscribeToMenu(callback: (data: any) => void): () => void {
    this.menuListeners.add(callback);
    this.connect();
    return () => {
      this.menuListeners.delete(callback);
    };
  }

  
  public subscribeToSales(callback: (sale: any) => void): () => void {
    this.salesListeners.add(callback);
    this.connect();
    return () => {
      this.salesListeners.delete(callback);
    };
  }

  public subscribeToSalesDeleted(callback: (payload: { id?: string; dateString?: string; all?: boolean }) => void): () => void {
    this.salesDeletedListeners.add(callback);
    this.connect();
    return () => {
      this.salesDeletedListeners.delete(callback);
    };
  }

  public subscribeToOperationsConfig(callback: (config: any) => void): () => void {
    this.operationsConfigListeners.add(callback);
    this.connect();
    return () => {
      this.operationsConfigListeners.delete(callback);
    };
  }

  public subscribeToOperationalDay(callback: (day: any) => void): () => void {
    this.operationalDayListeners.add(callback);
    this.connect();
    return () => {
      this.operationalDayListeners.delete(callback);
    };
  }

  public subscribeToCashierSessions(callback: (session: any) => void): () => void {
    this.cashierSessionListeners.add(callback);
    this.connect();
    return () => {
      this.cashierSessionListeners.delete(callback);
    };
  }

  public subscribeToBusinessProfile(callback: (data: any) => void): () => void {
    this.businessProfileListeners.add(callback);
    this.connect();
    return () => {
      this.businessProfileListeners.delete(callback);
    };
  }
}

export const socketService = new RealtimeSocketService();
export const realtimeSocket = socketService;
export default socketService;
