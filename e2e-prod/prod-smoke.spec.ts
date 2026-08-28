// Production smoke — runs against the live deployment (opt-in via
// `npm run test:e2e:prod`, see playwright.prod.config.ts). Prod builds
// strip window.__debug — asserted below, not just claimed. HRD.4: the
// security header set from scripts/gen-headers-conf.mjs is asserted
// header-by-header so a Dockerfile regression goes red here.
import { test, expect } from '@playwright/test';

test('prod deployment serves the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('TEAM RÖKKET — Rise of the Rocket');
  await expect(page.locator('canvas')).toBeVisible();

  // HRD.4 security headers
  const headers = response!.headers();
  expect(headers['cache-control']).toBe('no-cache');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("style-src 'unsafe-inline'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("form-action 'none'");
  // PKG.2/3: the PWA statics are allowed by CSP and actually served
  expect(csp).toContain("img-src 'self' data:");
  expect(csp).toContain("manifest-src 'self'");
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  // server_tokens off — nginx may name itself, but never with a version
  expect(headers['server'] ?? '').not.toMatch(/[0-9]/);

  // prod strips the debug hook — the build really must not ship it
  expect(await page.evaluate('typeof window.__debug')).toBe('undefined');

  // let the game loop boot and run a few frames before judging the console —
  // this is also the CSP canary: a wrong script hash kills boot loudly
  await page.waitForTimeout(1_000);
  expect(errors).toEqual([]);
});

test('prod serves the PWA statics next to the game', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(JSON.parse(await manifest.text()).display).toBe('standalone');
  const icon = await request.get('/icon-192.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toBe('image/png');
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toContain('javascript');
  expect(sw.headers()['cache-control']).toBe('no-cache'); // a new worker ships with the deploy that carries it
});
