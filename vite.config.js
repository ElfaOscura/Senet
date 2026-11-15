import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
   base: './',
  plugins: [tailwindcss()],
  server: { open: true },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) =>
          info.names?.[0]?.endsWith('.css') ? 'assets/style.css' : 'assets/[name][extname]',
      },
    },
  },
});