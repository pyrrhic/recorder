import { defineConfig } from 'vite';
import type { MinifyOptions } from "terser";

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Recorder',                  // global = window.Recorder
      formats: ['iife'],
      fileName: () => 'index.iife.js'
    },
    outDir: 'dist/browser',              // keeps dist/ tidy
    minify: 'esbuild',                    // optional – smaller payload
    // No "external": we want a single self-contained file
  }
});
