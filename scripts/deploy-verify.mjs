// DEP.2 — wait until production serves the build for a given commit.
//   node scripts/deploy-verify.mjs <sha> [url]
// Polls the page every 30 s for up to 10 min (a Coolify build is ~2 min,
// plus Traefik's ~30 s re-registration, during which a 503 is a retry, not
// a failure). Exit 0 when the served build stamp is the commit's short SHA;
// exit 1 on timeout, printing what it saw last so a red run says why.
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { isLive, stampOf } from './deploy-verify-lib.mjs';

const sha = process.argv[2];
if (!sha) {
  console.error('usage: node scripts/deploy-verify.mjs <sha> [url]');
  process.exit(2);
}
const url = process.argv[3] ?? process.env.PROD_URL ?? 'https://rokket-boy.uk/';
const want = sha.slice(0, 7);
const EVERY_MS = 30_000;
const deadline = Date.now() + 10 * 60_000;

for (;;) {
  let seen;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      if (isLive(html, sha)) {
        console.log(`live: ${want} at ${url}`);
        process.exit(0);
      }
      seen = stampOf(html) ?? 'no stamp';
    } else {
      seen = `HTTP ${res.status}`;
    }
  } catch (err) {
    seen = err instanceof Error ? err.message : String(err);
  }
  if (Date.now() >= deadline) {
    console.error(`timed out: wanted ${want}, last saw ${seen}`);
    process.exit(1);
  }
  console.log(`waiting: want ${want}, saw ${seen}`);
  await sleep(EVERY_MS);
}
