import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import menuRoutes from './routes/menu.routes';
import imageRoutes from './routes/image.routes';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config/env';

export function createApp() {
  const app = express();

  // Basic security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite handles development script injection
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Body and cookie parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      service: 'NamasteQR Core API', 
      version: '1.0.0', 
      env: config.nodeEnv,
      timestamp: new Date().toISOString() 
    });
  });

  // Mount Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rbac', rbacRoutes);
  app.use('/api/business', rbacRoutes);
  app.use('/api/menus', menuRoutes);
  app.use('/api/images', imageRoutes);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}
