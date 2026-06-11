/**
 * Unit tests for src/rename-consumer-refs.
 *
 * Covers every consumer reference shape from the rename roadmap:
 *   - root action `uses:` (SHA-pinned, tag-pinned, branch, with/without comments)
 *   - sub-action paths (review-pr, setup-credentials, review-pr/reply, …)
 *   - reusable workflow path (.github/workflows/review-pr.yml)
 *   - non-uses references (gh api URLs, --repo flags, markdown links)
 *   - repin mode (--sha/--version) vs rename-only mode
 *   - safety: similarly-named slugs are NOT rewritten
 */
import { describe, expect, it } from 'vitest';
import { NEW_SLUG, OLD_SLUG, renameRefs } from '../rename-refs.js';

const SHA_OLD = '3f5dc9969f307d3c76acb7e9ccaefdd96bd62f4b';
const SHA_NEW = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// ═════════════════════════════════════════════════════════════════════════════
// uses: references — rename-only mode
// ═════════════════════════════════════════════════════════════════════════════

describe('renameRefs — uses: root action (rename-only)', () => {
  it('rewrites the slug and preserves the SHA ref', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD}\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@${SHA_OLD}\n`);
    expect(result.usesCount).toBe(1);
    expect(result.changed).toBe(true);
  });

  it('preserves an existing version comment', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD} # v1.5.4\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@${SHA_OLD} # v1.5.4\n`);
  });

  it('handles `uses:` without a dash prefix (job-level uses)', () => {
    const input = `    uses: ${OLD_SLUG}/.github/workflows/review-pr.yml@${SHA_OLD} # v1.5.4\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(
      `    uses: ${NEW_SLUG}/.github/workflows/review-pr.yml@${SHA_OLD} # v1.5.4\n`,
    );
    expect(result.usesCount).toBe(1);
  });

  it('handles tag refs', () => {
    const input = `      - uses: ${OLD_SLUG}@v1.4.2\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@v1.4.2\n`);
  });

  it('handles branch refs', () => {
    const input = `      - uses: ${OLD_SLUG}@main\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@main\n`);
  });

  it('handles quoted uses values', () => {
    const input = `      - uses: "${OLD_SLUG}@${SHA_OLD}"\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: "${NEW_SLUG}@${SHA_OLD}"\n`);
  });
});

describe('renameRefs — uses: sub-actions and reusable workflow', () => {
  it.each([
    'review-pr',
    'review-pr/reply',
    'review-pr/mention-reply',
    'setup-credentials',
    '.github/workflows/review-pr.yml',
    '.github/actions/mention-reply',
  ])('rewrites the %s path', (subpath) => {
    const input = `      - uses: ${OLD_SLUG}/${subpath}@${SHA_OLD} # v1.5.4\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}/${subpath}@${SHA_OLD} # v1.5.4\n`);
    expect(result.usesCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// uses: references — repin mode (--sha/--version)
// ═════════════════════════════════════════════════════════════════════════════

describe('renameRefs — repin mode', () => {
  it('replaces the ref with the new SHA and version comment', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD} # v1.5.4\n`;
    const result = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@${SHA_NEW} # v2.0.0\n`);
  });

  it('repins tag refs to the SHA', () => {
    const input = `      - uses: ${OLD_SLUG}/review-pr@v1.4.2\n`;
    const result = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}/review-pr@${SHA_NEW} # v2.0.0\n`);
  });

  it('repins the reusable workflow ref', () => {
    const input = `    uses: ${OLD_SLUG}/.github/workflows/review-pr.yml@${SHA_OLD} # v1.5.0\n`;
    const result = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(result.content).toBe(
      `    uses: ${NEW_SLUG}/.github/workflows/review-pr.yml@${SHA_NEW} # v2.0.0\n`,
    );
  });

  it('omits the comment when no version is given', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD} # v1.5.4\n`;
    const result = renameRefs(input, { newSha: SHA_NEW });
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@${SHA_NEW}\n`);
  });

  it('rejects invalid SHAs', () => {
    expect(() => renameRefs('x', { newSha: 'not-a-sha' })).toThrow(/40-char/);
    expect(() => renameRefs('x', { newSha: SHA_NEW.toUpperCase() })).toThrow(/40-char/);
    expect(() => renameRefs('x', { newSha: SHA_NEW.slice(0, 39) })).toThrow(/40-char/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// non-uses references
// ═════════════════════════════════════════════════════════════════════════════

describe('renameRefs — non-uses references', () => {
  it('rewrites gh api URLs', () => {
    const input = `          OBJ=$(gh api "repos/${OLD_SLUG}/git/ref/tags/$VERSION" --jq .object.type)\n`;
    const result = renameRefs(input);
    expect(result.content).toContain(`repos/${NEW_SLUG}/git/ref/tags/`);
    expect(result.otherCount).toBe(1);
    expect(result.usesCount).toBe(0);
  });

  it('rewrites --repo flags', () => {
    const input = `          gh release view --repo ${OLD_SLUG} --json tagName\n`;
    const result = renameRefs(input);
    expect(result.content).toContain(`--repo ${NEW_SLUG} `);
  });

  it('rewrites markdown links', () => {
    const input = `See [the docs](https://github.com/${OLD_SLUG}/blob/main/README.md).\n`;
    const result = renameRefs(input);
    expect(result.content).toContain(`https://github.com/${NEW_SLUG}/blob/main/README.md`);
  });

  it('rewrites multiple occurrences on a single line, counting it once', () => {
    const input = `echo "${OLD_SLUG} and ${OLD_SLUG} again"\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`echo "${NEW_SLUG} and ${NEW_SLUG} again"\n`);
    expect(result.otherCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Safety
// ═════════════════════════════════════════════════════════════════════════════

describe('renameRefs — safety', () => {
  it('does not rewrite similarly-named slugs', () => {
    const input = `      - uses: docker/cagent-action-fork@${SHA_OLD}\n`;
    const result = renameRefs(input);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(input);
  });

  it('does not rewrite the new slug (idempotent)', () => {
    const input = `      - uses: ${NEW_SLUG}@${SHA_OLD} # v2.0.0\n`;
    const result = renameRefs(input);
    expect(result.changed).toBe(false);
  });

  it('is idempotent: running twice produces the same output', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD} # v1.5.4\n`;
    const once = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    const twice = renameRefs(once.content, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(twice.content).toBe(once.content);
    expect(twice.changed).toBe(false);
  });

  it('returns changed=false for content with no references', () => {
    const input = 'name: CI\non: push\njobs: {}\n';
    const result = renameRefs(input);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(input);
  });

  it('preserves unrelated lines byte-for-byte', () => {
    const input = [
      'name: Review',
      'jobs:',
      '  review:',
      `    uses: ${OLD_SLUG}/.github/workflows/review-pr.yml@${SHA_OLD} # v1.5.4`,
      '    secrets:',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression in a test fixture
      '      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
      '',
    ].join('\n');
    const result = renameRefs(input);
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('name: Review');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression in a test fixture
    expect(lines[5]).toBe('      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}');
    expect(lines[6]).toBe('');
  });

  it('handles CRLF line endings', () => {
    const input = `      - uses: ${OLD_SLUG}@${SHA_OLD}\r\nname: x\r\n`;
    const result = renameRefs(input);
    expect(result.content).toBe(`      - uses: ${NEW_SLUG}@${SHA_OLD}\r\nname: x\r\n`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Realistic consumer file shapes
// ═════════════════════════════════════════════════════════════════════════════

describe('renameRefs — realistic consumer workflows', () => {
  it('two-workflow consumer pattern (reusable workflow caller)', () => {
    const input = [
      'name: PR Review',
      'on:',
      '  pull_request:',
      '    types: [opened, synchronize]',
      'jobs:',
      '  review:',
      `    uses: ${OLD_SLUG}/.github/workflows/review-pr.yml@${SHA_OLD} # v1.5.4`,
      '    secrets: inherit',
      '',
    ].join('\n');
    const result = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(result.usesCount).toBe(1);
    expect(result.content).toContain(
      `uses: ${NEW_SLUG}/.github/workflows/review-pr.yml@${SHA_NEW} # v2.0.0`,
    );
  });

  it('single-workflow consumer pattern (direct action usage)', () => {
    const input = [
      'jobs:',
      '  agent:',
      '    steps:',
      '      - name: Setup credentials',
      `        uses: ${OLD_SLUG}/setup-credentials@${SHA_OLD} # v1.5.4`,
      '      - name: Run agent',
      `        uses: ${OLD_SLUG}@${SHA_OLD} # v1.5.4`,
      '        with:',
      '          agent: docker/pirate',
      '',
    ].join('\n');
    const result = renameRefs(input, { newSha: SHA_NEW, newVersion: 'v2.0.0' });
    expect(result.usesCount).toBe(2);
    expect(result.content).toContain(`uses: ${NEW_SLUG}/setup-credentials@${SHA_NEW} # v2.0.0`);
    expect(result.content).toContain(`uses: ${NEW_SLUG}@${SHA_NEW} # v2.0.0`);
    expect(result.content).not.toContain(OLD_SLUG);
  });

  it('mixed file with uses refs and API URL refs', () => {
    const input = [
      `        uses: ${OLD_SLUG}@${SHA_OLD}`,
      '        run: |',
      `          gh api "repos/${OLD_SLUG}/releases/latest"`,
      '',
    ].join('\n');
    const result = renameRefs(input);
    expect(result.usesCount).toBe(1);
    expect(result.otherCount).toBe(1);
    expect(result.content).not.toContain(OLD_SLUG);
  });
});
