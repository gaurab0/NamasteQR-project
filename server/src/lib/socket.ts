import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    // When a client connects and joins their business room
    socket.on('join:business', (businessId: string) => {
      if (businessId) {
        socket.join(`business:${businessId}`);
      }
    });

    socket.on('leave:business', (businessId: string) => {
      if (businessId) {
        socket.leave(`business:${businessId}`);
      }
    });

    socket.on('join:table', ({ businessId, tableId }: { businessId: string; tableId: string }) => {
      if (businessId && tableId) {
        socket.join(`table:${businessId}:${tableId}`);
      }
    });

    socket.on('leave:table', ({ businessId, tableId }: { businessId: string; tableId: string }) => {
      if (businessId && tableId) {
        socket.leave(`table:${businessId}:${tableId}`);
      }
    });
  });

  console.log('⚡ Socket.io real-time engine initialized');
  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitToBusiness(businessId: string, event: string, data: any) {
  if (io && businessId) {
    io.to(`business:${businessId}`).emit(event, data);
  }
}

export function emitToTable(businessId: string, tableId: string, event: string, data: any) {
  if (io && businessId && tableId) {
    io.to(`table:${businessId}:${tableId}`).emit(event, data);
  }
}

export const realtimeEmitter = {
  orderUpdated(businessId: string, order: any) {
    emitToBusiness(businessId, 'order:updated', order);
    if (order.table_id) {
      emitToTable(businessId, order.table_id, 'order:updated', order);
    }
  },
  orderCreated(businessId: string, order: any) {
    emitToBusiness(businessId, 'order:created', order);
    if (order.table_id) {
      emitToTable(businessId, order.table_id, 'order:created', order);
    }
  },
  tableUpdated(businessId: string, table: any) {
    emitToBusiness(businessId, 'table:updated', table);
    if (table.id) {
      emitToTable(businessId, table.id, 'table:updated', table);
    }
  },
  serviceRequestUpdated(businessId: string, request: any) {
    emitToBusiness(businessId, 'request:updated', request);
  },
  menuUpdated(businessId: string) {
    emitToBusiness(businessId, 'menu:updated', { businessId, timestamp: new Date().toISOString() });
  },
  taxConfigUpdated(businessId: string, config: any) {
    emitToBusiness(businessId, 'tax_config:updated', config);
  },
  businessProfileUpdated(businessId: string, business: any) {
    emitToBusiness(businessId, 'business:updated', business);
  },
};
