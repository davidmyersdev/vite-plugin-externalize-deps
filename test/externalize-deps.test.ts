import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { externalizeDeps } from '../src/index'

interface PackageDefinition {
  code?: string,
  subpathFiles?: Record<string, string>,
}

interface ProjectDefinition {
  entry: string,
  manifest: Record<string, unknown>,
  packages?: Record<string, PackageDefinition>,
}

const temporaryDirectories: string[] = []

const createProject = async ({ entry, manifest, packages = {} }: ProjectDefinition) => {
  const root = await mkdtemp(join(tmpdir(), 'vite-plugin-externalize-deps-'))

  temporaryDirectories.push(root)

  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      type: 'module',
      ...manifest,
    }, null, 2),
  )
  await writeFile(join(root, 'src', 'entry.ts'), entry)

  await Promise.all(Object.entries(packages).map(async ([packageName, definition]) => {
    const packageDirectory = join(root, 'node_modules', ...packageName.split('/'))

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(
      join(packageDirectory, 'package.json'),
      JSON.stringify({
        name: packageName,
        type: 'module',
        version: '1.0.0',
        exports: './index.js',
      }, null, 2),
    )
    await writeFile(
      join(packageDirectory, 'index.js'),
      definition.code ?? `export default ${JSON.stringify(`${packageName} bundled`)}`,
    )

    if (definition.subpathFiles) {
      await Promise.all(Object.entries(definition.subpathFiles).map(async ([subpath, code]) => {
        const filePath = join(packageDirectory, subpath)

        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, code)
      }))
    }
  }))

  return root
}

const buildServerBundle = async (
  root: string,
  {
    pluginOptions = {},
    rollupExternal,
  }: {
    pluginOptions?: Parameters<typeof externalizeDeps>[0],
    rollupExternal?: string[],
  } = {},
) => {
  const entry = join(root, 'src', 'entry.ts')

  await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      externalizeDeps({
        useFile: join(root, 'package.json'),
        ...pluginOptions,
      }),
    ],
    root,
    ssr: {
      noExternal: true,
    },
    build: {
      emptyOutDir: true,
      minify: false,
      outDir: join(root, 'dist'),
      rollupOptions: rollupExternal
        ? {
            external: rollupExternal,
          }
        : undefined,
      ssr: true,
      lib: {
        entry,
        formats: ['es'],
      },
    },
  })

  const outputFile = join(root, 'dist', `${basename(entry, extname(entry))}.js`)

  return readFile(outputFile, 'utf8')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { force: true, recursive: true })
  }))
})

describe('externalizeDeps', () => {
  it('matches declared dependencies, include rules, and Node builtins without regex false positives', async () => {
    const root = await createProject({
      entry: 'export {}',
      manifest: {
        dependencies: {
          'foo.bar': '1.0.0',
        },
        devDependencies: {
          'dev-only': '1.0.0',
        },
        optionalDependencies: {
          'optional-only': '1.0.0',
        },
        peerDependencies: {
          'peer-only': '1.0.0',
        },
      },
    })

    const plugin = externalizeDeps({
      devDeps: true,
      include: ['manual-only'],
      useFile: join(root, 'package.json'),
    })
    const resolveId = plugin.resolveId as (id: string) => Promise<unknown> | unknown
    const resolve = (id: string) => Promise.resolve(resolveId(id))

    await expect(resolve('foo.bar')).resolves.toEqual({ external: true, id: 'foo.bar' })
    await expect(resolve('foo.bar/subpath')).resolves.toEqual({ external: true, id: 'foo.bar/subpath' })
    await expect(resolve('fooXbar')).resolves.toBeNull()
    await expect(resolve('dev-only')).resolves.toEqual({ external: true, id: 'dev-only' })
    await expect(resolve('optional-only')).resolves.toEqual({ external: true, id: 'optional-only' })
    await expect(resolve('peer-only')).resolves.toEqual({ external: true, id: 'peer-only' })
    await expect(resolve('manual-only')).resolves.toEqual({ external: true, id: 'manual-only' })
    await expect(resolve('node:path')).resolves.toEqual({ external: true, id: 'node:path' })
    await expect(resolve('path/posix')).resolves.toEqual({ external: true, id: 'path/posix' })
    await expect(resolve('node:test')).resolves.toEqual({ external: true, id: 'node:test' })
    await expect(resolve('test')).resolves.toBeNull()
  })

  it('honors exceptions before externalizing and still allows manual includes', async () => {
    const root = await createProject({
      entry: 'export {}',
      manifest: {
        dependencies: {
          'dep-a': '1.0.0',
        },
      },
    })

    const plugin = externalizeDeps({
      except: [/^dep-a(?:\/.*)?$/],
      include: [/^manual-dep(?:\/.*)?$/],
      useFile: join(root, 'package.json'),
    })
    const resolveId = plugin.resolveId as (id: string) => Promise<unknown> | unknown
    const resolve = (id: string) => Promise.resolve(resolveId(id))

    await expect(resolve('dep-a')).resolves.toBeNull()
    await expect(resolve('dep-a/subpath')).resolves.toBeNull()
    await expect(resolve('manual-dep/subpath')).resolves.toEqual({
      external: true,
      id: 'manual-dep/subpath',
    })
  })

  it('builds a server bundle on Vite 8 while bundling exceptions and externalizing the rest', async () => {
    const root = await createProject({
      entry: [
        'import bundled from "dep-a"',
        'import externalized from "dep-b"',
        'console.log(bundled, externalized)',
      ].join('\n'),
      manifest: {
        dependencies: {
          'dep-a': '1.0.0',
          'dep-b': '1.0.0',
        },
      },
      packages: {
        'dep-a': {
          code: 'export default "dep-a bundled"\n',
        },
      },
    })

    const output = await buildServerBundle(root, {
      pluginOptions: {
        except: [/^dep-a(?:\/.*)?$/],
      },
    })

    expect(output).toContain('dep-a bundled')
    expect(output).toContain('from "dep-b"')
    expect(output).not.toContain('from "dep-a"')
  })

  it('coexists with user-supplied static rollup externals in server builds', async () => {
    const root = await createProject({
      entry: [
        'import dependency from "dep-a"',
        'import custom from "custom-external"',
        'console.log(dependency, custom)',
      ].join('\n'),
      manifest: {
        dependencies: {
          'dep-a': '1.0.0',
        },
      },
    })

    const output = await buildServerBundle(root, {
      rollupExternal: ['custom-external'],
    })

    expect(output).toContain('from "dep-a"')
    expect(output).toContain('from "custom-external"')
  })
})
