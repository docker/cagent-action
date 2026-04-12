import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import nodeExternals from 'rollup-plugin-node-externals'
import json from '@rollup/plugin-json'

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    // Externalize Node.js built-ins (available on runner); bundle all deps
    nodeExternals({ builtins: true, deps: false, devDeps: true }),
    resolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript(),
  ],
}
