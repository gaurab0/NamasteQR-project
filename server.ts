import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { createApp } from './server/src/app';
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
  initSocketServer(httpServer);

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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NamasteQR Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
