import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Prevents Edge and strict browsers from blocking CSS via CORS policy
function removeCrossOriginFromCss() {
  return {
    name: 'remove-crossorigin-from-css',
    transformIndexHtml(html: string) {
      return html.replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), removeCrossOriginFromCss()],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
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
  };
});
