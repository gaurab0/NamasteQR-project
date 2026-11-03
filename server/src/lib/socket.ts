import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { db } from '../services/db.service';
import { prisma } from './prisma';
import { assertBusinessAccess, buildSessionBusiness } from '../middleware/auth.middleware';
import { BusinessType, UserRole } from '../types';

let io: SocketIOServer | null = null;

function extractSocketTokens(socket: Socket, payloadToken?: string): string[] {
  const candidates: string[] = [];
  if (payloadToken && typeof payloadToken === 'string') candidates.push(payloadToken);
  if (socket.handshake?.auth?.token && typeof socket.handshake.auth.token === 'string') {
    candidates.push(socket.handshake.auth.token);
  }
  const authHeader = socket.handshake?.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    candidates.push(authHeader.substring(7));
  }
  const xAuthToken = socket.handshake?.headers?.['x-auth-token'];
  if (xAuthToken && typeof xAuthToken === 'string') {
    candidates.push(xAuthToken);
  }
  const cookieHeader = socket.handshake?.headers?.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const cookies = cookieHeader.split(';').map((c: string) => c.trim());
    for (const c of cookies) {
      if (c.startsWith('auth_token=')) {
        candidates.push(c.substring('auth_token='.length));
      }
    }
  }
  return candidates;
}

export async function authenticateSocket(socket: Socket, payloadToken?: string) {
  const tokens = extractSocketTokens(socket, payloadToken);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        userId: string;
        role: UserRole;
        email?: string;
        businessId?: string;
        businessName?: string;
        businessType?: BusinessType;
      };
      let user = await db.findUserById(decoded.userId);
      if (!user && decoded.email) {
        user = await db.findUserByEmail(decoded.email);
      }
      if (!user) {
        const targetBizId = decoded.businessId || 'maya-forest-resort';
        const targetBizName = decoded.businessName;
        const targetBizType = decoded.businessType;
        const business = await db.ensureBusiness(targetBizId, targetBizName, targetBizType);
        user = await db.ensureUser({
          id: decoded.userId,
          business_id: business.id,
          email: decoded.email || `owner@${business.id}.app`,
          role: decoded.role || (business.business_type === 'HOTEL' ? 'HOTEL_OWNER' : 'RESTAURANT_OWNER'),
        });
      }

      if (user && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED') {
        let business = await db.findBusinessById(user.business_id);
        if (!business) {
          business = await db.ensureBusiness(user.business_id);
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
          created_at: user.created_at,
          role: user.role,
          status: user.status,
          allowed_tabs: await db.ensureAllowedTabsPersisted(user),
          custom_permissions: user.custom_permissions,
          business: buildSessionBusiness(business, user.business_id),
        };
      }
    } catch (err) {
      // Try next token candidate
    }
  }
  return null;
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (requestOrigin, callback) => {
        // Allow clients with no origin header (e.g. native mobile apps, local test runners)
        if (!requestOrigin) return callback(null, true);

        const allowed = [
          config.frontendUrl,
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:5173',
          ...config.allowedOrigins,
        ];

        if (allowed.some((ao) => ao && requestOrigin.toLowerCase() === ao.toLowerCase()) || !config.isProduction) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by Socket.IO CORS policy'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    // When a staff or authorized user connects and joins their business room
    socket.on('join:business', async (data: string | { businessId: string; token?: string }) => {
      const businessId = typeof data === 'string' ? data : data?.businessId;
      const payloadToken = typeof data === 'object' ? data?.token : undefined;

      if (!businessId) {
        socket.emit('socket:error', { code: 'INVALID_REQUEST', message: 'Missing businessId' });
        return;
      }

      const authUser = await authenticateSocket(socket, payloadToken);
      if (!authUser) {
        socket.emit('socket:error', {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to join business room',
        });
        return;
      }

      const isAuthorized = await assertBusinessAccess(authUser as any, businessId);
      if (!isAuthorized) {
        socket.emit('socket:error', {
          code: 'FORBIDDEN',
          message: 'Access denied: You do not have permission to join this business room',
        });
        return;
      }

      socket.join(`business:${businessId}`);
      socket.emit('joined:business', { businessId });
    });

    socket.on('leave:business', (data: string | { businessId: string }) => {
      const businessId = typeof data === 'string' ? data : data?.businessId;
      if (businessId) {
        socket.leave(`business:${businessId}`);
        socket.emit('left:business', { businessId });
      }
    });

    // When a customer joins their specific dining table
    socket.on('join:table', async (data: any) => {
      const businessId = data?.businessId;
      const tableId = data?.tableId;
      if (!businessId || !tableId) {
        socket.emit('socket:error', { code: 'INVALID_REQUEST', message: 'Missing businessId or tableId' });
        return;
      }

      try {
        const table = await prisma.restaurantTable.findFirst({
          where: {
            business_id: businessId,
            OR: [{ id: tableId }, { table_number: tableId }],
          },
        });

        if (!table) {
          socket.emit('socket:error', {
            code: 'TABLE_NOT_FOUND',
            message: `Table ${tableId} not found in business ${businessId}`,
          });
          return;
        }

        socket.join(`table:${businessId}:${table.id}`);
        if (table.id !== tableId) {
          socket.join(`table:${businessId}:${tableId}`);
        }
        socket.emit('joined:table', { businessId, tableId: table.id });
      } catch (err) {
        socket.emit('socket:error', {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join table room',
        });
      }
    });

    socket.on('leave:table', (data: any) => {
      const businessId = data?.businessId;
      const tableId = data?.tableId;
      if (businessId && tableId) {
        socket.leave(`table:${businessId}:${tableId}`);
        socket.emit('left:table', { businessId, tableId });
      }
    });

    // Public menu updates channel (diners can receive menu edits without leaking orders)
    socket.on('join:menu', (businessId: string) => {
      if (businessId) {
        socket.join(`menu:${businessId}`);
        socket.emit('joined:menu', { businessId });
      }
    });

    socket.on('leave:menu', (businessId: string) => {
      if (businessId) {
        socket.leave(`menu:${businessId}`);
        socket.emit('left:menu', { businessId });
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
    if (io && businessId) {
      io.to(`menu:${businessId}`).emit('menu:updated', { businessId, timestamp: new Date().toISOString() });
    }
  },
  taxConfigUpdated(businessId: string, config: any) {
    emitToBusiness(businessId, 'tax_config:updated', config);
  },
    saleCreated(businessId: string, sale: any) {
    emitToBusiness(businessId, 'sale:created', sale);
  },
  cashierSessionUpdated(businessId: string, session: any) {
    emitToBusiness(businessId, 'cashier_session:updated', session);
  },
  businessProfileUpdated(businessId: string, business: any) {
    emitToBusiness(businessId, 'business:updated', business);
  },
};
