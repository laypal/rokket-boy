// HRD.4 — emit the nginx security-header snippet for the built single file.
// Run in the Docker build stage AFTER `npm run build`; the CSP script-src is
// the sha256 of the one inline <script>, so the header is exact per build and
// an injected/altered script simply refuses to run. stdout → conf.d file.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';

const file = process.argv[2] ?? 'dist/team-rokket.html';
const html = readFileSync(file, 'utf8');

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter((m) => !/\bsrc\s*=/.test(m[1]))
  .map((m) => m[2]);
if (scripts.length === 0) {
  throw new Error('no inline <script> found in ' + file + ' — a hash-only CSP would brick the page');
}

const tokens = scripts.map(
  (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`,
);

const csp = [
  "default-src 'none'",
  `script-src ${tokens.join(' ')}`,
  "style-src 'unsafe-inline'",
  // PKG.2/3: 'self' covers the manifest icons, the service worker script
  // and the worker's own fetch() (nginx sends this header on /sw.js too —
  // without connect-src a worker under default-src 'none' can't fetch).
  "img-src 'self' data:",
  'media-src data:',
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

process.stdout.write(
  [
    'server_tokens off;',
    // no-cache = browsers revalidate every load (ETag 304s), so a deploy is
    // visible on the next refresh instead of whenever the cache expires
    'add_header Cache-Control "no-cache";',
    `add_header Content-Security-Policy "${csp}";`,
    'add_header X-Content-Type-Options "nosniff";',
    'add_header Referrer-Policy "no-referrer";',
    'add_header Permissions-Policy "geolocation=(), camera=(), microphone=()";',
    '',
  ].join('\n'),
);
