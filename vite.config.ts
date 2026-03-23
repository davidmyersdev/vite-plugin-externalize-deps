import { defineConfig } from 'vite'
import { externalizeDeps } from './src/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^node:.*$/],
      output: [
        {
          esModule: true,
          exports: 'named',
          format: 'es',
        },
        {
          exports: 'named',
          format: 'cjs',
          codeSplitting: false,
        },
      ],
    },
    sourcemap: true,
    target: 'esnext',
  },
  plugins: [
    externalizeDeps(),
  ],
})
