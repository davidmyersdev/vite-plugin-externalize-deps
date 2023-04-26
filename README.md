# vite-plugin-externalize-deps

A configurable Vite plugin to help externalize your dependencies (including [subpaths](https://nodejs.org/api/packages.html#subpath-patterns)).

## Getting Started

Install the package as a dev dependency.

```sh
# npm
npm install --save-dev vite-plugin-externalize-deps

# pnpm
pnpm install --save-dev vite-plugin-externalize-deps

# yarn
yarn add --dev vite-plugin-externalize-deps
```

Add the plugin to your `vite.config.ts` file.

```ts
import { defineConfig } from 'vite'
import { externalizeDeps } from 'vite-plugin-externalize-deps'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    externalizeDeps(),
  ],
})
```

### Configuration

Pass an object to `externalizeDeps` to override the default configuration.

```ts
// These are the default values.
externalizeDeps({
  deps: true,
  devDeps: false,
  except: [],
  nodeBuiltins: true,
  optionalDeps: true,
  peerDeps: true,
  useFile: join(process.cwd(), 'package.json'),
})
```

To _include_ specific dependencies in your bundle, you can add exceptions with the `except` option.

```ts
externalizeDeps({
  except: [
    // Match exact values with strings.
    '@some/obscure/dependency',
    // Or match patterns with regular expressions.
    /^@some\/obscure(?:\/.+)?$/,
  ],
})
```
