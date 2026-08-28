// PKG.3 — serve dist/ the way nginx does (/ → team-rokket.html) so the
// offline e2e (e2e-dist/) runs against the real built artifact. The dev
// server can't stand in: its module graph is dozens of files a one-entry
// cache never covers. Local test tool only — no CSP, no TLS.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const port = Number(process.argv[2] ?? 5198);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const rel = pathname === '/' ? 'team-rokket.html' : normalize(pathname).replace(/^[/\\]+/, '');
  const file = join(root, rel);
  if (rel.includes('..') || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`serve-dist: http://localhost:${port} → ${root}/`));
