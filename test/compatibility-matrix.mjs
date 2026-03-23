import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const pluginEntry = resolve(projectRoot, 'dist', 'index.js')
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const viteVersions = [
  '2.9.18',
  '3.2.11',
  '4.5.14',
  '5.4.19',
  '6.4.1',
  '7.0.3',
  '8.0.2',
]

const run = (command, args, cwd) => {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      rejectPromise(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stderr, stdout })
        return
      }

      rejectPromise(new Error([
        `Command failed: ${command} ${args.join(' ')}`,
        stdout,
        stderr,
      ].filter(Boolean).join('\n')))
    })
  })
}

const createFixture = async (root) => {
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'compatibility-fixture',
      private: true,
      type: 'module',
      dependencies: {
        chalk: '^5.6.2',
      },
    }, null, 2),
  )
  await writeFile(
    join(root, 'src', 'entry.ts'),
    [
      'import chalk from "chalk"',
      'import path from "node:path"',
      'console.log(chalk.green("ok"), path.sep)',
    ].join('\n'),
  )
  await writeFile(
    join(root, 'vite.config.mjs'),
    [
      'import { defineConfig } from "vite"',
      `import { externalizeDeps } from ${JSON.stringify(pluginEntry)}`,
      '',
      'export default defineConfig({',
      '  plugins: [externalizeDeps({ useFile: "./package.json" })],',
      '  ssr: {',
      '    noExternal: true,',
      '  },',
      '  build: {',
      '    ssr: true,',
      '    lib: {',
      '      entry: "./src/entry.ts",',
      '      formats: ["es"],',
      '      fileName: "bundle",',
      '    },',
      '    outDir: "./dist",',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
}

const assertOutput = async (root, viteVersion) => {
  const output = await readFile(join(root, 'dist', 'entry.js'), 'utf8')

  if (!output.includes('import chalk from "chalk";')) {
    throw new Error(`Vite ${viteVersion} bundled chalk unexpectedly.\n\n${output}`)
  }

  if (!output.includes('import path from "node:path";')) {
    throw new Error(`Vite ${viteVersion} bundled node:path unexpectedly.\n\n${output}`)
  }
}

const main = async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'vite-plugin-externalize-deps-compat-'))

  try {
    for (const viteVersion of viteVersions) {
      const fixtureRoot = join(tempRoot, viteVersion.replaceAll('.', '-'))

      await createFixture(fixtureRoot)
      process.stdout.write(`Testing Vite ${viteVersion}\n`)
      await run(pnpmCommand, ['add', '-D', `vite@${viteVersion}`], fixtureRoot)
      await run(pnpmCommand, ['vite', 'build'], fixtureRoot)
      await assertOutput(fixtureRoot, viteVersion)
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
