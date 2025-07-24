import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import type {MinifyOptions} from "terser";

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',              // same barrel file
            name: 'Recorder',                   // the global variable in <script>
            fileName: (format) => `recorder.${format}.js`,
            formats: ['es', 'iife']             // ES for module-aware browsers, IIFE for globals
        },
        outDir: 'dist/browser',
        emptyOutDir: true,
    },
    plugins: [
        dts({ outDir: 'dist/browser' })
    ]
});


// export default defineConfig({
//     build: {
//         lib: {
//             entry: 'src/index.ts',
//             name: 'Recorder',
//             formats: ['es', 'iife'],
//             fileName: (format) => `recorder.${format}.js`
//         },
//         rollupOptions: {
//             // keep runtime deps external for the module build
//             external: ['axios', 'rrweb', 'ua-parser-js']
//         }
//     },
//     plugins: [dts({ outDir: 'dist', insertTypesEntry: true })]
// });

/*
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',              // same barrel file
      name: 'Recorder',                   // the global variable in <script>
      fileName: (format) => `recorder.${format}.js`,
      formats: ['es', 'iife']             // ES for module-aware browsers, IIFE for globals
    },
    outDir: 'dist/browser',
    emptyOutDir: true
  },
  plugins: [
    dts({ outputDir: 'dist/browser', skipDiagnostics: true })
  ]
});

 */
