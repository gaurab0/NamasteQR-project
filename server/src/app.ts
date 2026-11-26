import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import menuRoutes from './routes/menu.routes';
import imageRoutes from './routes/image.routes';
import contactRoutes from './routes/contact.routes';
import printRoutes from './routes/print.routes';
import printAgentRoutes from './routes/print-agent.routes';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { generalApiLimiter } from './middleware/rateLimit.middleware';
import { config } from './config/env';
import { checkPrinter } from './services/printer.service';

export function createApp() {
  const app = express();

  // 1. Reverse proxy configuration: trust first proxy hop for client IP detection behind Cloudflare, Nginx, ALB, Cloud Run
  app.set('trust proxy', 1);

  // 2. Security headers via Helmet & Express hardening
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite handles development script injection & HMR
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: { action: 'sameorigin' }, // X-Frame-Options: SAMEORIGIN
      xContentTypeOptions: true, // X-Content-Type-Options: nosniff
      hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false, // Strict-Transport-Security
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, // Referrer-Policy
    })
  );

  // 3. Constrained CORS configuration
  const configuredAllowedOrigins = [
    config.frontendUrl,
    config.appUrl,
    ...config.allowedOrigins,
  ].filter(Boolean) as string[];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Permit requests with no origin (e.g. mobile apps, curl, direct server-to-server, LAN printer bridge)
        if (!origin) {
          return callback(null, true);
        }

        // In non-production, allow localhost, 127.0.0.1, and local private LAN ranges
        if (!config.isProduction) {
          if (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
            /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
            configuredAllowedOrigins.includes(origin)
          ) {
            return callback(null, true);
          }
        } else {
          // In production, strictly match authorized origins
          if (configuredAllowedOrigins.includes(origin)) {
            return callback(null, true);
          }
        }

        // Deny unlisted origins without throwing 500 internal server crash
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-auth-token',
        'x-staff-session',
        'x-staff-email',
        'x-staff-role',
        'x-business-id',
        'x-business-name',
        'x-business-type',
        'x-user-id',
        'x-user-email',
        'x-user-role',
        'x-printer-host',
        'x-printer-port',
      ],
    })
  );

  // 4. Body and cookie parsers
  app.use(express.raw({ type: ['application/octet-stream', 'application/x-escpos'], limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // 5. Input validation & Prototype pollution sanitization
  app.use(sanitizeInput);

  // Health checks are intentionally public and do not query the database.
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({ 
      status: 'ok', 
      service: 'NamasteQR Core API', 
      version: '1.0.0', 
      env: config.nodeEnv,
      timestamp: new Date().toISOString() 
    });
  };
  app.get('/health', healthHandler);
  app.get('/health/printer', async (_req, res) => {
    const result = await checkPrinter();
    return res.status(result.ok ? 200 : 503).json(result);
  });

  // 6. General API Rate Limiting for all /api endpoints
  app.use('/api', generalApiLimiter);
  app.get('/api/health', healthHandler);

  // Short URL Table Router: e.g. /t/tbl-cabin-901-floor-9-6fcf or /t/1
  app.get('/t/:tableId', async (req, res, next) => {
    try {
      const { tableId } = req.params;
      if (!tableId) return next();

      const { prisma } = await import('./lib/prisma');
      let table = await prisma.restaurantTable.findUnique({
        where: { id: tableId },
      });

      if (!table) {
        table = await prisma.restaurantTable.findFirst({
          where: {
            OR: [
              { table_number: tableId },
              { id: { contains: tableId, mode: 'insensitive' } },
            ],
          },
        });
      }

      if (!table) {
        return res.redirect('/menu');
      }

      const query = new URLSearchParams({
        businessId: table.business_id,
        tableId: table.id,
        tableNumber: table.table_number,
      });
      if (table.floor) query.set('floor', table.floor);
      if (table.building) query.set('building', table.building);

      return res.redirect(302, `/menu?${query.toString()}`);
    } catch {
      return res.redirect('/menu');
    }
  });

  // Short URL Table Router with business: e.g. /t/7-spices/1 or /t/7-spices/Cabin-901
  app.get('/t/:businessId/:tableNumber', async (req, res, next) => {
    try {
      const { businessId, tableNumber } = req.params;
      if (!businessId || !tableNumber) return next();

      const { prisma } = await import('./lib/prisma');
      const table = await prisma.restaurantTable.findFirst({
        where: {
          business_id: businessId,
          table_number: { equals: tableNumber, mode: 'insensitive' },
        },
      });

      if (!table) {
        return res.redirect(`/menu?businessId=${encodeURIComponent(businessId)}`);
      }

      const query = new URLSearchParams({
        businessId: table.business_id,
        tableId: table.id,
        tableNumber: table.table_number,
      });
      if (table.floor) query.set('floor', table.floor);
      if (table.building) query.set('building', table.building);

      return res.redirect(302, `/menu?${query.toString()}`);
    } catch {
      return res.redirect('/menu');
    }
  });

  // 7. Mount Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rbac', rbacRoutes);
  app.use('/api/business', rbacRoutes);
  app.use('/api/menus', menuRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/print-agent', printAgentRoutes);
  app.use('/api/print', printRoutes);

  // 8. Centralized error handler
  app.use(errorHandler);

  return app;
}
