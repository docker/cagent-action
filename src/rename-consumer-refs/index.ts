/**
 * rename-consumer-refs CLI entrypoint.
 *
 * Rewrites `docker/cagent-action` references to `docker/docker-agent-action`
 * in one or more files, in-place.
 *
 * Usage:
 *   node dist/rename-consumer-refs.js [--sha <40-hex> --version <vX.Y.Z>] <file> [<file> ...]
 *
 * Flags:
 *   --sha <sha>          Re-pin every `uses:` ref to this commit SHA.
 *   --version <version>  Trailing `# version` comment used with --sha.
 *
 * Without --sha, existing refs are preserved (rename-only mode).
 *
 * Output (stdout): one line per changed file:  `changed <path>`
 * Progress/diagnostics go to stderr. Exit code 0 even when nothing changed —
 * callers detect changes via the stdout lines (or `git diff`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renameRefs } from './rename-refs.js';

interface ParsedArgs {
  sha?: string;
  version?: string;
  files: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { files: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sha') {
      const val = args[++i];
      if (val === undefined) throw new Error('--sha requires a value');
      result.sha = val;
    } else if (arg === '--version') {
      const val = args[++i];
      if (val === undefined) throw new Error('--version requires a value');
      result.version = val;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      result.files.push(arg);
    }
  }
  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.files.length === 0) {
    process.stderr.write(
      'Usage: rename-consumer-refs [--sha <40-hex> --version <vX.Y.Z>] <file> [<file> ...]\n',
    );
    process.exit(1);
  }

  if (args.version !== undefined && args.sha === undefined) {
    throw new Error('--version requires --sha');
  }

  let totalChanged = 0;
  for (const file of args.files) {
    const before = readFileSync(file, 'utf-8');
    const result = renameRefs(before, { newSha: args.sha, newVersion: args.version });
    if (result.changed) {
      writeFileSync(file, result.content, 'utf-8');
      process.stdout.write(`changed ${file}\n`);
      process.stderr.write(
        `✅ ${file}: ${result.usesCount} uses ref(s), ${result.otherCount} other ref(s) rewritten\n`,
      );
      totalChanged++;
    } else {
      process.stderr.write(`ℹ️  ${file}: no old references found\n`);
    }
  }

  process.stderr.write(`Done: ${totalChanged}/${args.files.length} file(s) changed\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
