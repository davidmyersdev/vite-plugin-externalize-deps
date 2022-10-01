import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import type { Plugin } from 'vite'

interface UserOptions {
  deps: boolean,
  devDeps: boolean,
  nodeBuiltins: boolean,
  optionalDeps: boolean,
  peerDeps: boolean,
  useFile: string,
}

const parseFile = (file: string) => {
  return JSON.parse(readFileSync(file).toString())
}

export const externalizeDeps = (options: Partial<UserOptions> = {}): Plugin => {
  const optionsResolved: UserOptions = {
    deps: true,
    devDeps: false,
    nodeBuiltins: true,
    optionalDeps: true,
    peerDeps: true,
    useFile: join(process.cwd(), 'package.json'),
    // User options take priority.
    ...options,
  }

  return {
    name: 'vite-plugin-externalize-deps',
    config: (_config, _env) => {
      if (existsSync(optionsResolved.useFile)) {
        const externalDeps = new Set<RegExp>()
        const {
          dependencies = {},
          devDependencies = {},
          optionalDependencies = {},
          peerDependencies = {},
        } = parseFile(optionsResolved.useFile)

        if (optionsResolved.deps) {
          Object.keys(dependencies).forEach((dep) => {
            const depMatcher = new RegExp(`^${dep}(?:/.+)?$`)

            externalDeps.add(depMatcher)
          })
        }

        if (optionsResolved.devDeps) {
          Object.keys(devDependencies).forEach((dep) => {
            const depMatcher = new RegExp(`^${dep}(?:/.+)?$`)

            externalDeps.add(depMatcher)
          })
        }

        if (optionsResolved.nodeBuiltins) {
          builtinModules.forEach((builtinModule) => {
            const builtinMatcher = new RegExp(`^(?:node:)?${builtinModule}$`)

            externalDeps.add(builtinMatcher)
          })
        }

        if (optionsResolved.optionalDeps) {
          Object.keys(optionalDependencies).forEach((dep) => {
            const depMatcher = new RegExp(`^${dep}(?:/.+)?$`)

            externalDeps.add(depMatcher)
          })
        }

        if (optionsResolved.peerDeps) {
          Object.keys(peerDependencies).forEach((dep) => {
            const depMatcher = new RegExp(`^${dep}(?:/.+)?$`)

            externalDeps.add(depMatcher)
          })
        }

        return {
          build: {
            rollupOptions: {
              external: [
                ...externalDeps.values(),
              ],
            },
          },
        }
      }
    },
  }
}
