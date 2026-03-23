import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import type { Plugin } from 'vite'

interface UserOptions {
  deps: boolean,
  devDeps: boolean,
  except: Array<string | RegExp>,
  /**
   * Additional dependencies to externalize.
   *
   * @example
   *
   * ```ts
   * externalizeDeps({
   *   include: [
   *     /^unlisted-dep(?:\/.*)?$/,
   *   ],
   * })
   * ```
   *
   * @default []
   */
  include: Array<string | RegExp>,
  nodeBuiltins: boolean,
  optionalDeps: boolean,
  peerDeps: boolean,
  useFile: string,
}

interface PackageJson {
  dependencies?: Record<string, string>,
  devDependencies?: Record<string, string>,
  optionalDependencies?: Record<string, string>,
  peerDependencies?: Record<string, string>,
}

const parseFile = (file: string): PackageJson => {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const matchesDependency = (id: string, dependency: string) => {
  return id === dependency || id.startsWith(`${dependency}/`)
}

const createBuiltinIdSet = () => {
  const builtinIds = new Set<string>()

  builtinModules.forEach((builtinModule) => {
    builtinIds.add(builtinModule)

    if (!builtinModule.startsWith('node:')) {
      builtinIds.add(`node:${builtinModule}`)
    }
  })

  return builtinIds
}

/**
 * Returns a Vite plugin to exclude dependencies from the bundle.
 *
 * @example
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { externalizeDeps } from 'vite-plugin-externalize-deps'
 *
 * export default defineConfig({
 *   plugins: [
 *     externalizeDeps({
 *       deps: true,
 *       devDeps: false,
 *       except: [
 *         // Match exact values with strings.
 *         '@some/obscure/dependency',
 *         // Or match patterns with regular expressions.
 *         /^@some\/obscure(?:\/.+)?$/,
 *       ],
 *       include: [
 *         // Match exact values with strings.
 *         '@some/obscure/dependency',
 *         // Or match patterns with regular expressions.
 *         /^@some\/obscure(?:\/.+)?$/,
 *       ],
 *       nodeBuiltins: true,
 *       optionalDeps: true,
 *       peerDeps: true,
 *       useFile: join(process.cwd(), 'package.json'),
 *     }),
 *   ],
 * })
 * ```
 */
export const externalizeDeps = (options: Partial<UserOptions> = {}): Plugin => {
  const optionsResolved: UserOptions = {
    deps: true,
    devDeps: false,
    except: [],
    include: [],
    nodeBuiltins: true,
    optionalDeps: true,
    peerDeps: true,
    useFile: join(process.cwd(), 'package.json'),
    // User options take priority.
    ...options,
  }

  const builtinIds = optionsResolved.nodeBuiltins
    ? createBuiltinIdSet()
    : new Set<string>()
  const dependencyIds = new Set<string>()
  let isInitialized = false

  const isException = (id: string) => {
    return optionsResolved.except.some((exception) => {
      if (typeof exception === 'string') {
        return exception === id
      }

      return exception.test(id)
    })
  }

  const isIncluded = (id: string) => {
    return optionsResolved.include.some((included) => {
      if (typeof included === 'string') {
        return included === id
      }

      return included.test(id)
    })
  }

  const initialize = () => {
    if (isInitialized) {
      return
    }

    if (!existsSync(optionsResolved.useFile)) {
      throw new Error(`[vite-plugin-externalize-deps] The file specified for useFile (${optionsResolved.useFile}) does not exist.`)
    }

    const {
      dependencies = {},
      devDependencies = {},
      optionalDependencies = {},
      peerDependencies = {},
    } = parseFile(optionsResolved.useFile)

    if (optionsResolved.deps) {
      Object.keys(dependencies).forEach((dependency) => {
        dependencyIds.add(dependency)
      })
    }

    if (optionsResolved.devDeps) {
      Object.keys(devDependencies).forEach((dependency) => {
        dependencyIds.add(dependency)
      })
    }

    if (optionsResolved.optionalDeps) {
      Object.keys(optionalDependencies).forEach((dependency) => {
        dependencyIds.add(dependency)
      })
    }

    if (optionsResolved.peerDeps) {
      Object.keys(peerDependencies).forEach((dependency) => {
        dependencyIds.add(dependency)
      })
    }

    isInitialized = true
  }

  return {
    name: 'vite-plugin-externalize-deps',
    apply: 'build',
    enforce: 'pre',
    configResolved: () => {
      initialize()
    },
    resolveId: (id: string) => {
      initialize()

      if (isException(id)) {
        return null
      }

      if (isIncluded(id) || builtinIds.has(id)) {
        return {
          external: true,
          id,
        }
      }

      for (const dependency of dependencyIds) {
        if (matchesDependency(id, dependency)) {
          return {
            external: true,
            id,
          }
        }
      }

      return null
    },
  }
}
