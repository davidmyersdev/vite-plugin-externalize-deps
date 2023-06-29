import { nodeResolve } from '@rollup/plugin-node-resolve'
import { defineConfig } from 'vite'
import { externalizeDeps } from '../dist'

export default defineConfig({
  build: {
    lib: {
      entry: './test/entry.ts',
      fileName: 'test',
      formats: ['es'],
    },
    outDir: './test/dist',
  },
  plugins: [
    // We need nodeResolve to resolve dependencies of chalk.
    nodeResolve(),
    externalizeDeps({
      devDeps: true,
      include: [
        /^unlisted-dep(?:\/.*)?$/,
      ],
      useFile: './test/test.json',
    }),
  ],
})
