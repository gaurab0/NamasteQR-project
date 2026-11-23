import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { createApp } from './server/src/app';
import { prisma } from './server/src/lib/prisma';
import { initSocketServer } from './server/src/lib/socket';

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize Socket.io real-time engine
  const socketServer = initSocketServer(httpServer);

  // Determine whether to serve compiled dist or attach live Vite middleware
  const hasDist = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.argv[1] && process.argv[1].endsWith('server.cjs')) ||
    (!process.env.VITE_DEV && hasDist);

  if (!isProduction) {
    console.log('⚡ Starting Vite development server...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/.chrome*/**',
            '**/.chrome*/**/*',
            '**/.*/**',
            '**/.*/**/*',
            '**/dist/**',
            '**/graphify-out/**',
            '**/.agents/**',
            '**/.system_generated/**',
            '**/*.log',
          ],
        },
      },
      appType: 'spa',
    });
    // Guard against unhandled EBUSY/locked file errors from crashing the process
    vite.watcher?.on('error', (err: any) => {
      console.warn('Vite watcher non-fatal notice:', err?.message || err);
    });
    app.use(vite.middlewares);
    console.log('✅ Vite middleware attached successfully');
  } else {
    console.log('📦 Serving production static build from dist/');
    const distPath = path.join(process.cwd(), 'dist');

    // 1. Static asset server with CORS & proper cache control
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          if (filePath.endsWith('index.html')) {
            // Prevent browsers (like Edge) from caching stale HTML pointing to old hashed CSS/JS
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    // 2. Reject missing assets with 404 (never send index.html for missing .css/.js to prevent MIME errors)
    app.get(['/assets/*', '/*.*'], (req, res) => {
      res.status(404).type('text/plain').send('Asset not found');
    });

    // 3. SPA catch-all fallback for HTML page routing
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NamasteQR Server running on http://0.0.0.0:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing HTTP, Socket.IO, and database connections.`);

    const forceExit = setTimeout(() => {
      console.error('Graceful shutdown timed out; forcing process exit.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    socketServer.close(async () => {
      clearTimeout(forceExit);
      try {
        await prisma.$disconnect();
        console.log('Graceful shutdown complete.');
      } catch (error) {
        console.error('Database disconnect failed during shutdown:', error);
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exitCode = 1;
});
