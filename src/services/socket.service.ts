import { io, Socket } from 'socket.io-client';

class RealtimeSocketService {
  private socket: Socket | null = null;
  private currentBusinessId: string | null = null;
  private currentTableId: string | null = null;
  private orderListeners: Set<(order: any) => void> = new Set();
  private tableListeners: Set<(table: any) => void> = new Set();
  private requestListeners: Set<(request: any) => void> = new Set();
  private menuListeners: Set<(data: any) => void> = new Set();
  private businessProfileListeners: Set<(data: any) => void> = new Set();

  public connect(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Connect to current origin
    const url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('⚡ Socket.io real-time connected:', this.socket?.id);
      if (this.currentBusinessId) {
        this.socket?.emit('join:business', this.currentBusinessId);
      }
      if (this.currentBusinessId && this.currentTableId) {
        this.socket?.emit('join:table', { businessId: this.currentBusinessId, tableId: this.currentTableId });
      }
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

    this.socket.on('business:updated', (data: any) => {
      this.businessProfileListeners.forEach((listener) => listener(data));
    });

    return this.socket;
  }

  public joinBusiness(businessId: string): void {
    this.currentBusinessId = businessId;
    const socket = this.connect();
    if (socket.connected) {
      socket.emit('join:business', businessId);
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
