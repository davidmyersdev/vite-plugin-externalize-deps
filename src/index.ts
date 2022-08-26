import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Plugin } from 'vite'

interface UserOptions {
  deps: boolean,
  peerDeps: boolean,
  useFile: string,
}

export const externalizeDeps = (options: Partial<UserOptions> = {}): Plugin => {
  const optionsResolved: UserOptions = {
    deps: true,
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
        const { dependencies = {}, peerDependencies = {} } = JSON.parse(readFileSync(optionsResolved.useFile).toString())

        if (optionsResolved.deps) {
          Object.keys(dependencies).forEach((dep) => {
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
