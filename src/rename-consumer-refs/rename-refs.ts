/**
 * rename-consumer-refs — core logic for rewriting `docker/cagent-action`
 * references to `docker/docker-agent-action` in consumer workflow files.
 *
 * Handles every consumer reference shape observed in the wild:
 *
 *   uses: docker/cagent-action@SHA                                  # root action
 *   uses: docker/cagent-action@SHA # v1.5.4                         # with version comment
 *   uses: docker/cagent-action/review-pr@SHA                        # sub-action
 *   uses: docker/cagent-action/setup-credentials@SHA                # sub-action
 *   uses: docker/cagent-action/.github/workflows/review-pr.yml@SHA  # reusable workflow
 *   uses: docker/cagent-action@v1.5.4                               # tag ref (older repos)
 *   uses: docker/cagent-action@main                                 # branch ref
 *
 * Two rewrite modes:
 *
 *   - rename-only: replace the repo slug, keep the existing ref untouched.
 *   - repin: replace the repo slug AND update the ref to a new SHA with a
 *     `# vX.Y.Z` trailing comment (used on rename day so consumers land on
 *     the first release published under the new name).
 *
 * Non-`uses:` references (e.g. `gh api repos/docker/cagent-action/...`,
 * documentation links) are also rewritten via the plain slug replacement,
 * but only on lines that actually contain the old slug — the rest of the
 * file is preserved byte-for-byte.
 *
 * Pure functions only — no filesystem or network access. The CLI wrapper in
 * index.ts handles I/O.
 */

export const OLD_SLUG = 'docker/cagent-action';
export const NEW_SLUG = 'docker/docker-agent-action';

export interface RenameOptions {
  /**
   * When set, every `uses:` reference to the renamed repo is re-pinned to
   * this commit SHA (with `# version` appended as a comment).
   * When undefined, existing refs are preserved (rename-only mode).
   */
  newSha?: string;
  /** Human-readable version (e.g. `v2.0.0`) appended as a trailing comment when re-pinning. */
  newVersion?: string;
}

export interface RenameResult {
  /** Rewritten file content. Identical to input when no references were found. */
  content: string;
  /** True when at least one replacement was made. */
  changed: boolean;
  /** Count of `uses:` references rewritten. */
  usesCount: number;
  /** Count of non-`uses:` references rewritten (API URLs, doc links, etc.). */
  otherCount: number;
}

/**
 * Escape a string for use inside a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a `uses:` line referencing the old repo. Captures:
 *   1. prefix     — everything before the slug (indentation, `- uses:`, quotes)
 *   2. subpath    — optional sub-action / workflow path (e.g. `/review-pr`)
 *   3. ref        — the ref after `@` (SHA, tag, or branch)
 *   4. comment    — optional trailing ` # vX.Y.Z` comment
 *
 * The slug must be followed by `/` or `@` so that a hypothetical
 * `docker/cagent-action-fork` is not matched.
 */
const USES_RE = new RegExp(
  `^(\\s*(?:-\\s*)?uses:\\s*["']?)${escapeRegExp(OLD_SLUG)}((?:/[^@\\s"']*)?)@([^\\s"'#]+)(["']?)([ \\t]*#[^\\n]*)?\\s*$`,
);

/**
 * Plain slug occurrences on non-`uses:` lines (API URLs, --repo flags, links).
 * Guarded so `docker/cagent-action-foo` is not rewritten.
 */
const PLAIN_RE = new RegExp(`${escapeRegExp(OLD_SLUG)}(?![A-Za-z0-9-])`, 'g');

/**
 * Rewrite all old-slug references in a single file's content.
 */
export function renameRefs(content: string, options: RenameOptions = {}): RenameResult {
  if (options.newSha !== undefined && !/^[0-9a-f]{40}$/.test(options.newSha)) {
    throw new Error(`newSha must be a 40-char lowercase hex SHA, got: "${options.newSha}"`);
  }

  // Preserve the original line ending style and trailing newline exactly:
  // split on \n and re-join, keeping any \r at line ends untouched (the
  // regexes tolerate \r via the trailing \s* / [^\n] classes only on full
  // matches, so handle \r explicitly).
  const lines = content.split('\n');
  let usesCount = 0;
  let otherCount = 0;

  const out = lines.map((rawLine) => {
    // Tolerate CRLF: strip a trailing \r for matching, re-append afterwards.
    const hasCR = rawLine.endsWith('\r');
    const line = hasCR ? rawLine.slice(0, -1) : rawLine;

    const usesMatch = line.match(USES_RE);
    if (usesMatch) {
      const [, prefix, subpath, ref, closeQuote, comment] = usesMatch;
      usesCount++;
      let newRef = ref;
      let newComment = comment ?? '';
      if (options.newSha !== undefined) {
        newRef = options.newSha;
        newComment = options.newVersion ? ` # ${options.newVersion}` : '';
      }
      const rebuilt = `${prefix}${NEW_SLUG}${subpath}@${newRef}${closeQuote}${newComment}`;
      return hasCR ? `${rebuilt}\r` : rebuilt;
    }

    if (PLAIN_RE.test(line)) {
      PLAIN_RE.lastIndex = 0; // reset after .test() with /g flag
      otherCount++;
      const rebuilt = line.replace(PLAIN_RE, NEW_SLUG);
      return hasCR ? `${rebuilt}\r` : rebuilt;
    }
    PLAIN_RE.lastIndex = 0;

    return rawLine;
  });

  const result = out.join('\n');
  return {
    content: result,
    changed: result !== content,
    usesCount,
    otherCount,
  };
}
