/// <reference types="node" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Builds the side panel HTML page only.
// content.ts and background.ts are built separately as self-contained IIFE
// bundles by scripts/build.js so they work correctly as Chrome content scripts.
export default defineConfig({
  build: {
    minify: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'icons/*', dest: 'icons' },
        { src: 'src/styles.css', dest: '.' },
      ],
    }),
  ],
});
