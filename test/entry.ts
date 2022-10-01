import path from 'path'
import path2 from 'node:path'
import { resolve } from 'path'
import chalk from 'chalk'
import { defineConfig } from 'vite'
// @ts-ignore
import esbuild from 'esbuild'
// @ts-ignore
import rollup from 'rollup'

console.log(path, path2, resolve, chalk, esbuild, defineConfig, rollup)
