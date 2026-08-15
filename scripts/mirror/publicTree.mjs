// HRD.17 — shared helpers for the public-mirror tier split. Both
// tests/public-export.test.ts and publish.mjs need the same answer to
// "which tracked files are public" and "what regexes must never appear in
// them", so the logic lives here once instead of being duplicated (and
// drifting) between the test and the publish script.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SCRUB_LIST_PATH = 'scripts/mirror/scrub-list.private.txt';
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.wasm']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

/**
 * Every `git ls-files` path in `root` that is NOT export-ignored, per the
 * *working-tree* `.gitattributes` (not HEAD) — so this reflects uncommitted
 * `.gitattributes` edits, which is what a pre-commit test needs to check.
 * `git archive HEAD` (used by publish.mjs for the real export) reads
 * attributes from the committed tree instead — see publish.mjs and the
 * W2 report for the empirical difference.
 * @param {string} root repo root (cwd for the git invocations)
 * @returns {string[]} public file paths, posix-style, relative to root
 */
export function listPublicFiles(root) {
  const lsOut = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const paths = lsOut.toString('utf8').split('\0').filter(Boolean);
  if (paths.length === 0) return [];

  const stdin = paths.map((p) => `${p}\0`).join('');
  const checkOut = execFileSync('git', ['check-attr', '--stdin', '-z', 'export-ignore'], {
    cwd: root,
    input: stdin,
    maxBuffer: 64 * 1024 * 1024,
  });
  const fields = checkOut.toString('utf8').split('\0');
  if (fields[fields.length - 1] === '') fields.pop(); // trailing NUL leaves an empty last field

  const publicFiles = [];
  for (let i = 0; i < fields.length; i += 3) {
    const path = fields[i];
    const value = fields[i + 2];
    if (value !== 'set') publicFiles.push(path);
  }
  return publicFiles;
}

/**
 * @typedef {{ regex: RegExp, allow: Set<string> }} ScrubPattern
 */

/**
 * Reads scripts/mirror/scrub-list.private.txt: one case-insensitive regex
 * per line, `#` comments and blank lines skipped. A line may end with one
 * or more ` !<path>` tokens naming files where that pattern is allowed
 * (e.g. the licence file is allowed to carry the author's name). The
 * allowlist lives in the private file, never in this public helper, so
 * the helper itself can't become a scrub hit.
 * @param {string} root repo root
 * @returns {ScrubPattern[] | null} compiled patterns, or null when the
 *   file is absent (the scrub list is itself export-ignored, so it never
 *   exists in an exported public tree — callers should skip the scrub
 *   check there).
 */
export function readScrubPatterns(root) {
  const filePath = join(root, SCRUB_LIST_PATH);
  if (!existsSync(filePath)) return null;

  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [source, ...rest] = line.split(/\s+!/);
      return { regex: new RegExp(source, 'i'), allow: new Set(rest.map((p) => p.trim()).filter(Boolean)) };
    });
}

/**
 * Scans `files` (paths relative to `root`, as returned by listPublicFiles)
 * for any regex in `patterns`. Skips known binary extensions and anything
 * over 2 MB. A pattern's own `allow` set names the files where it is
 * permitted (see readScrubPatterns).
 * @param {string} root repo root
 * @param {string[]} files paths relative to root
 * @param {ScrubPattern[]} patterns compiled scrub patterns
 * @returns {string[]} `file:line: pattern` for every hit
 */
export function findScrubHits(root, files, patterns) {
  const hits = [];
  for (const file of files) {
    if (BINARY_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const full = join(root, file);
    if (!existsSync(full)) continue; // e.g. a gitlink, not a regular file
    const st = statSync(full);
    if (!st.isFile() || st.size > MAX_SCAN_BYTES) continue;

    const lines = readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { regex, allow } of patterns) {
        if (allow.has(file)) continue;
        if (regex.test(line)) hits.push(`${file}:${i + 1}: ${regex.source}`);
      }
    });
  }
  return hits;
}
