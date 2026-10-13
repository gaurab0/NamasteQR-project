import path from 'path';
import { createApp } from './server/src/app';

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ServeFlow Server running on http://0.0.0.0:${PORT}`);
    
    // Automatically convert any legacy UUID document IDs in Firestore to human-readable identifiers
    import('./server/src/services/migration.service')
      .then((m) => m.migrateAllFirestoreDocumentsToReadableIds())
      .catch((e) => console.warn('Background migration note:', e.message));
  });
}

function expressStatic(root: string) {
  const express = require('express');
  return express.static(root);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
