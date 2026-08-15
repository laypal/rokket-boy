// HRD.17: the public mirror is `git archive HEAD` filtered through
// .gitattributes export-ignore (see scripts/mirror/publish.mjs) — nothing
// else knows the public/private split. This test is the permanent guard on
// that split: it walks the *working-tree* attributes (so it catches an
// uncommitted .gitattributes regression before it ships) and asserts three
// things — the agent-harness/identity tier stays private, the public
// surface (README, tests, CI, the game itself) stays public, and none of
// the private scrub strings (server IPs, hostnames, co-tenant project
// names — see scripts/mirror/scrub-list.private.txt) ever reach a public
// file. `describe.skipIf`s the scrub check when the scrub list itself is
// absent, since that file is export-ignored and will never exist in an
// already-exported public tree (the private repo's own CI already ran it).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { findScrubHits, listPublicFiles, readScrubPatterns } from '../scripts/mirror/publicTree.mjs';

const REPO_ROOT = join(__dirname, '..');

function gitLsFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO_ROOT })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
}

// The agent-harness + identity tier (HRD.17 card). A trailing '/' means
// "any tracked file under this directory".
const EXCLUDED_PINNED = [
  'ABOUT.md',
  'VOICE.md',
  'AGENTS.md',
  'CLAUDE.md',
  'DEPLOYMENT.md',
  'opencode.json',
  'OPENCODE-DEV.md',
  'OPENCODE-SETUP.md',
  'OPENCODE-BEST-PRACTICES.md',
  '.aiwg/voices/lyall-writing.yaml',
  '.carl/base.md',
  '.claude/settings.json',
  '.opencode/agents/',
  '.paul/PLAN.md',
  '.paul/handoff/index.md',
  '.github/workflows/mirror.yml',
  'scripts/mirror/scrub-list.private.txt',
  // working-notes tier (Lyall, 2026-08-15): decks/specs/plan stay private,
  // ROADMAP.md is the public view
  'docs/tasks/',
  'docs/superpowers/',
  'team-rokket-expansion-plan.md',
  // personal-voice docs (Lyall, same day): blog docs, changelog, errors log
  'project-documentation/',
  'docs/CHANGELOG.md',
  'ERRORS.md',
  'STACK.md',
];

// The public surface: game source, docs, tests, CI, the mirror tooling
// itself, and the front door HRD.16 added.
const INCLUDED_PINNED = [
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'docs/screenshots/title.png',
  'package.json',
  'src/main.ts',
  'ROADMAP.md',
  'docs/screenshots/overworld.png',
  '.github/workflows/ci.yml',
  'tests/public-export.test.ts',
  'scripts/mirror/publish.mjs',
];

describe('public mirror export (HRD.17)', () => {
  it('export-ignores every pinned private path that exists in the tree', () => {
    const tracked = new Set(gitLsFiles());
    const publicSet = new Set(listPublicFiles(REPO_ROOT));

    const leaked: string[] = [];
    for (const entry of EXCLUDED_PINNED) {
      const matches = entry.endsWith('/')
        ? [...tracked].filter((p) => p.startsWith(entry))
        : tracked.has(entry)
          ? [entry]
          : [];
      for (const path of matches) {
        if (publicSet.has(path)) leaked.push(path);
      }
    }

    expect(
      leaked,
      `these private paths are NOT export-ignored and would leak into the public mirror: ${leaked.join(', ')}`,
    ).toEqual([]);
  });

  it('does not export-ignore any pinned public path', () => {
    const publicSet = new Set(listPublicFiles(REPO_ROOT));
    const missing = INCLUDED_PINNED.filter((p) => !publicSet.has(p));

    expect(
      missing,
      `these paths must be public but are export-ignored (or not yet tracked by git): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  const scrubPatterns = readScrubPatterns(REPO_ROOT);

  describe.skipIf(scrubPatterns === null)('scrub list has zero hits across the public tree', () => {
    it('contains none of the private scrub strings in any public text file', () => {
      const publicFiles = listPublicFiles(REPO_ROOT);
      const hits = findScrubHits(REPO_ROOT, publicFiles, scrubPatterns ?? []);

      expect(hits, `private strings found in public files:\n${hits.join('\n')}`).toEqual([]);
    });
  });
});
