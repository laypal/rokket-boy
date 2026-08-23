#!/usr/bin/env node
// PostToolUse hook (Write|Edit): warn when a session-orienting context file
// passes the 400-line rule (CLAUDE.md "File hygiene"). Exit 2 surfaces the
// message to the model; it never blocks the edit itself.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LIMIT = 400;

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath = data?.tool_input?.file_path;
if (!filePath) process.exit(0);

const projectDir = data?.cwd || process.cwd();
const rel = path.relative(projectDir, filePath).replace(/\\/g, '/');
if (rel.startsWith('..') || !rel.endsWith('.md')) process.exit(0);

// Watched: files loaded to orient a session, plus project-documentation/
// since 2026-08-22 (Lyall: one chapter per feature deck, no unbounded
// journals). docs/superpowers/ is deliberately not listed.
const WATCHED = [
  /^\.paul\//,
  /^docs\/tasks\//,
  /^project-documentation\//,
  /^(CLAUDE|AGENTS|ABOUT|ERRORS|STACK|VOICE)\.md$/,
];
// Exempt: rolled-off records — they are read one at a time, on purpose.
const EXEMPT = [/(^|\/)archive\//, /(^|\/)completed\//];

if (!WATCHED.some((r) => r.test(rel))) process.exit(0);
if (EXEMPT.some((r) => r.test(rel))) process.exit(0);

let lines;
try {
  // Count like `wc -l` (newline chars) so a trailing newline is not an
  // extra line.
  lines = (readFileSync(filePath, 'utf8').match(/\n/g) || []).length;
} catch {
  process.exit(0);
}

if (lines > LIMIT) {
  process.stderr.write(
    `${rel} is now ${lines} lines — past the ${LIMIT}-line context-file rule ` +
      `(CLAUDE.md "File hygiene"). Split it into index + leaves ` +
      `(doc-splitter agent) in this session, not later.\n`,
  );
  process.exit(2);
}
process.exit(0);
