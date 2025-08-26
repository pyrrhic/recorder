import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    define: {
        'import.meta.env.DEV': JSON.stringify(
            process.env.FORCE_DEV === 'true'
        )
    },

    esbuild: {
        legalComments: "none",     // drop every comment
        minifyWhitespace: true,
        minifySyntax: true,
        minifyIdentifiers: false
    },

    build: {
        lib: {
            entry: 'src/index.ts',              // same barrel file
            name: 'scryspell',                 // the global variable in <script>
            fileName: (format) => `recorder.${format}.js`,
            formats: ['iife']             // ES for module-aware browsers, IIFE for globals
        },
        outDir: 'dist/browser',
        emptyOutDir: true,
        minify: 'esbuild',
        sourcemap: true,
    },
    plugins: [
        dts({ outDir: 'dist/browser' })
    ]
});
