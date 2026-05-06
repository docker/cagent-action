import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

// Explicit entry list: only modules that back an actual action.yml entrypoint.
// Library sub-modules (add-reaction, check-org-membership, get-pr-meta,
// post-comment) are imported by mention-reply but have no standalone action,
// so they don't get their own top-level dist bundle.
const src = (name: string) => {
  const p = resolve(import.meta.dirname, 'src', name, 'index.ts');
  if (!existsSync(p)) throw new Error(`tsup entry not found: ${p}`);
  return p;
};
const entry = {
  credentials: src('credentials'),
  main: src('main'),
  'mention-reply': src('mention-reply'),
  security: src('security'),
  'signed-commit': src('signed-commit'),
};

export default defineConfig({
  entry,
  format: ['esm'],
  // Target Node.js explicitly so esbuild resolves the "node" export condition
  // in AWS SDK packages instead of the browser variant (which pulls in
  // DOMParser / document and breaks at runtime in a GitHub Action).
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  // Keep .js extension so the action can `node dist/credentials.js` directly.
  // Without this tsup would emit .mjs for ESM format.
  outExtension: () => ({ js: '.js' }),
  // Sourcemaps disabled: this action is consumed via `uses: docker/cagent-action@v1`,
  // which clones the tagged release including dist/. Sourcemaps would add ~10MB to every
  // consumer clone with no runtime benefit (Node doesn't load them by default).
  sourcemap: false,
  clean: true,
  // Disable code splitting so each entry is fully self-contained.
  splitting: false,
  // tsup's externalizeDepsPlugin marks all node_modules as external by default.
  // The action runs `node dist/credentials.js` with no node_modules present at
  // runtime, so every npm dependency (AWS SDK, @actions/core, @octokit/…) must
  // be bundled in. Node.js built-ins stay external automatically (platform:'node').
  noExternal: [/.*/],
  // CJS packages bundled into ESM (e.g. tunnel@0.0.6 via @actions/http-client)
  // call require('net') / require('tls') at runtime. esbuild's __require shim
  // checks `typeof require !== "undefined"` — which is false in pure ESM — and
  // throws "Dynamic require of 'net' is not supported". Injecting createRequire
  // as a top-level banner supplies a real require() before the shim runs,
  // so those CJS modules can load Node.js built-ins normally.
  // NOTE: this banner uses import/import.meta.url — only valid in ESM output.
  // If format is ever extended to include 'cjs', this must be conditioned or
  // moved to a format-specific banner ({ esm: '...' }) to avoid a parse error.
  banner: {
    js: "import { createRequire } from 'node:module'; var require = createRequire(import.meta.url);",
  },
});
