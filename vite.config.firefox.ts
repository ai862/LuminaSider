import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Firefox extension build config
// Builds everything as a single bundle for better compatibility
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-firefox',
    cssCodeSplit: false,
    minify: false, // Disable minification for easier debugging
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
