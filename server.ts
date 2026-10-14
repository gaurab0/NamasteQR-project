import http from 'http';
import path from 'path';
import { createApp } from './server/src/app';
import { initSocketServer } from './server/src/lib/socket';

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize Socket.io real-time engine
  initSocketServer(httpServer);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname.endsWith('dist') ? __dirname : path.join(process.cwd(), 'dist');
    app.use(expressStatic(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NamasteQR Server running on http://0.0.0.0:${PORT}`);
  });
}

function expressStatic(root: string) {
  const express = require('express');
  return express.static(root);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
