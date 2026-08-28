// PKG.3: the built game installs its service worker and boots with the
// network gone. Prod builds strip __debug, so "booted" is read off the
// canvas: the title screen fills with the DMG green (#8bac0f) after the
// ~90-frame boot card — the smoke spec's non-blank probe, narrowed.
import { test, expect } from '@playwright/test';

async function titleGreenVisible(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const c = document.getElementById('screen') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, 160, 144).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0x8b && d[i + 1] === 0xac && d[i + 2] === 0x0f) return true;
      return false;
    },
    undefined,
    { timeout: 10_000 },
  );
}

test('service worker installs, and the game boots offline', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await titleGreenVisible(page);
  // install pre-caches '/', so ready + a controller is enough — no second online load
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller), undefined, {
    timeout: 10_000,
  });
  const cached = await page.evaluate(() => caches.open('rokket-v1').then((c) => c.match('/')).then((r) => !!r));
  expect(cached).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('canvas#screen')).toBeVisible();
  await titleGreenVisible(page);
  expect(errors).toEqual([]);
});

test('manifest and worker are served next to the game', async ({ request }) => {
  expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toContain('javascript');
});
