import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    legalComments: "none",     // drop every comment
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false
  },

  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'scryspell',                  // global = window.Recorder
      formats: ['iife'],
      fileName: () => 'index.iife.js'
    },
    outDir: 'dist/browser',              // keeps dist/ tidy
    minify: 'esbuild',                    // optional – smaller payload
    // No "external": we want a single self-contained file
  }
});
