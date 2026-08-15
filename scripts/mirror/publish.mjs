#!/usr/bin/env node
// HRD.17 — publishes the public mirror. `.gitattributes` export-ignore is
// the single source of truth for the public/private tier split (see that
// file), so `git archive HEAD` already produces exactly the public tree —
// this script's job is just: refuse if unsafe, scrub-check, export, and
// push that tree to MIRROR_REPO as one more commit on top of mirror
// history. Run by .github/workflows/mirror.yml after every green CI run on
// main, or locally (`npm run mirror:public`) for a manual first sync.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findScrubHits, listPublicFiles, readScrubPatterns } from './publicTree.mjs';

const REPO_ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const MIRROR_REPO = process.env.MIRROR_REPO ?? '';
const MIRROR_BRANCH = process.env.MIRROR_BRANCH || 'main';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

// GNU tar (bundled with Git for Windows, what's on PATH here) chokes on
// Windows backslash paths passed as argv (no shell to normalize them) — it
// misreads the drive letter's colon as an ssh-style `host:path` remote
// spec. Forward slashes work identically on Windows and are what ubuntu's
// tar expects natively, so normalize before ever calling tar.
const toTarPath = (p) => p.split('\\').join('/');

// Counts regular files actually extracted from the archive — not
// listPublicFiles(REPO_ROOT), which reflects *working-tree* attributes and
// can diverge from what `git archive HEAD` (committed-tree attributes)
// really wrote whenever .gitattributes has uncommitted edits.
// git archive emits a directory entry for an export-ignored dir's parents
// (e.g. `.paul/`) even when every file under it is ignored; tar dutifully
// creates the empty stub. Git would never commit it, but the dry-run
// listing and the mirror checkout are cleaner without them.
function pruneEmptyDirs(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pruneEmptyDirs(full);
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) count += countFiles(full);
    else count += 1;
  }
  return count;
}

if (!DRY_RUN && !MIRROR_REPO) {
  fail('MIRROR_REPO is required (unless --dry-run) — set it to the mirror repo git URL.');
}

if (!DRY_RUN) {
  const status = git(['status', '--porcelain']);
  if (status.trim() !== '') {
    fail('refusing to publish: working tree is dirty (git status --porcelain is non-empty). Commit or stash first, or use --dry-run.');
  }
}

const scrubPatterns = readScrubPatterns(REPO_ROOT);
if (scrubPatterns === null) {
  fail('scrub list missing (scripts/mirror/scrub-list.private.txt) — refusing to publish.');
}

const publicFiles = listPublicFiles(REPO_ROOT);
const scrubHits = findScrubHits(REPO_ROOT, publicFiles, scrubPatterns);
if (scrubHits.length > 0) {
  for (const hit of scrubHits) console.error(hit);
  fail(`${scrubHits.length} scrub hit(s) found in the public tree — aborting publish.`);
}

function main() {
  let tmpDir;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'rokket-mirror-'));
    const exportTar = join(tmpDir, 'export.tar');
    const treeDir = join(tmpDir, 'tree');
    mkdirSync(treeDir, { recursive: true });

    // --worktree-attributes: read export-ignore from the working tree's
    // .gitattributes, not HEAD's. On a clean tree (the only state a real
    // publish accepts) the two are identical; on --dry-run it means the
    // preview shows the split you're about to commit, not the one you had.
    git(['archive', '--worktree-attributes', '--format=tar', '-o', exportTar, 'HEAD']);
    // --force-local: belt-and-braces alongside toTarPath() above — still
    // needed even with forward slashes as long as a drive letter is present.
    execFileSync('tar', ['--force-local', '-xf', toTarPath(exportTar), '-C', toTarPath(treeDir)]);
    for (const entry of readdirSync(treeDir)) {
      const full = join(treeDir, entry);
      if (statSync(full).isDirectory()) pruneEmptyDirs(full);
    }

    const headSha = git(['rev-parse', '--short', 'HEAD']).trim();

    if (DRY_RUN) {
      const topLevel = readdirSync(treeDir).sort();
      console.log(`HEAD: ${headSha}`);
      console.log(`exported files: ${countFiles(treeDir)}`);
      console.log(`top-level entries: ${topLevel.join(', ')}`);
      console.log(`would push to ${MIRROR_REPO || '(unset)'}`);
      return;
    }

    const mirrorDir = join(tmpDir, 'mirror');
    try {
      execFileSync('git', ['clone', '--branch', MIRROR_BRANCH, '--single-branch', MIRROR_REPO, mirrorDir], {
        encoding: 'utf8',
      });
    } catch {
      // empty remote / branch doesn't exist yet — first sync is an orphan root commit
      mkdirSync(mirrorDir, { recursive: true });
      execFileSync('git', ['init', '-b', MIRROR_BRANCH], { cwd: mirrorDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', MIRROR_REPO], { cwd: mirrorDir, encoding: 'utf8' });
    }

    for (const entry of readdirSync(mirrorDir)) {
      if (entry === '.git') continue;
      rmSync(join(mirrorDir, entry), { recursive: true, force: true });
    }
    cpSync(treeDir, mirrorDir, { recursive: true });

    execFileSync('git', ['add', '-A'], { cwd: mirrorDir, encoding: 'utf8' });

    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: mirrorDir, encoding: 'utf8' });
      console.log('mirror already up to date');
      return;
    } catch {
      // non-zero exit from `git diff --cached --quiet` means there ARE staged changes — proceed
    }

    execFileSync(
      'git',
      [
        '-c',
        'user.name=team-rokket mirror',
        '-c',
        'user.email=mirror@rokket.local',
        'commit',
        '-m',
        `sync: ${headSha}`,
      ],
      { cwd: mirrorDir, encoding: 'utf8' },
    );
    execFileSync('git', ['push', 'origin', MIRROR_BRANCH], { cwd: mirrorDir, encoding: 'utf8' });

    const mirrorSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: mirrorDir, encoding: 'utf8' }).trim();
    console.log(`mirror commit: ${mirrorSha}`);
  } finally {
    // `return` (not process.exit) on the early paths above so this always runs
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
