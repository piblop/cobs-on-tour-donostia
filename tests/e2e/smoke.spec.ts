import { expect, test, type Page } from '@playwright/test';
import { SUBPATH } from '../../playwright.config.ts';

const state = (page: Page) => page.evaluate(() => document.body.dataset.state);

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Walk in a direction until the interaction prompt shows the expected text. */
async function walkUntil(page: Page, key: string, text: string, maxMs = 4000) {
  await page.keyboard.down(key);
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const t = await page.locator('.prompt').evaluate((el) => (getComputedStyle(el).opacity !== '0' ? el.textContent ?? '' : ''));
    if (t.includes(text)) break;
    await page.waitForTimeout(60);
  }
  await page.keyboard.up(key);
}

/** Start (or restart) a trip and get through the opening. Optionally hop to the promenade spawn. */
async function startTrip(page: Page, toPromenade = true) {
  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  const fresh = page.getByRole('button', { name: 'New trip' });
  if (await fresh.count()) {
    await fresh.click();
    await page.getByRole('button', { name: 'Start fresh' }).click();
  } else {
    await page.getByRole('button', { name: 'Start Trip' }).click();
  }
  await page.getByRole('button', { name: 'Step outside' }).click();
  await expect.poll(() => state(page), { timeout: 20_000 }).toBe('exploring');
  if (toPromenade) {
    await page.keyboard.press('Escape');
    await expect.poll(() => state(page)).toBe('menu');
    await page.getByRole('button', { name: 'Return to the promenade' }).click();
    await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
  }
}

test('boots under a repository subpath with no errors or foreign requests', async ({ page }) => {
  const errors: string[] = [];
  const badRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('request', (r) => {
    const url = new URL(r.url());
    const local = url.hostname === 'localhost' && url.pathname.startsWith(SUBPATH);
    if (!local && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) badRequests.push(`foreign ${r.url()}`);
  });

  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await expect(page.getByRole('heading', { name: 'Cobs on Tour' })).toBeVisible();
  await expect(page.locator('canvas#world')).toBeVisible();

  // The production build ships its CSP as a meta tag.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toContain('unsafe-eval');

  expect(errors).toEqual([]);
  expect(badRequests).toEqual([]);
});

test('the opening: a train ticket, then a gentle first goal', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await page.getByRole('button', { name: 'Start Trip' }).click();
  await expect(page.getByRole('dialog', { name: 'Donostia' })).toBeVisible();
  await page.getByRole('button', { name: 'Step outside' }).click();
  await expect.poll(() => state(page), { timeout: 20_000 }).toBe('exploring');
  await expect(page.locator('.goals')).toContainText('Find somewhere for pintxos tonight');
});

test('start, walk, pause, recover and resume', async ({ page }) => {
  await startTrip(page);
  await expect(page.locator('.area-banner')).toContainText('La Concha');
  await hold(page, 'KeyW', 500);
  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('menu');
  await expect(page.getByRole('button', { name: 'Return to the promenade' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => state(page)).toBe('exploring');
});

test('discovering La Concha shows a polaroid and counts it once', async ({ page }) => {
  await startTrip(page);
  // From the promenade spawn the railing spot is a short stroll west and toward the sea
  // (the default camera looks inland, so that is D and S on screen).
  await hold(page, 'KeyD', 450);
  await walkUntil(page, 'KeyS', 'Lean on the railing');
  await expect(page.locator('.prompt')).toContainText('Lean on the railing');

  await page.keyboard.press('KeyE');
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('card');
  await expect(page.getByRole('dialog', { name: 'La Concha' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to the journal' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
  await expect(page.locator('.collection-chip')).toContainText('1 / 12');

  // A repeat visit is quicker and does not count twice.
  await page.keyboard.press('KeyE');
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('card');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
  await expect(page.locator('.collection-chip')).toContainText('1 / 12');
});

test('Tab hands control to the next friend', async ({ page }) => {
  await startTrip(page, false);
  await expect(page.locator('.crew-chip.leader')).toHaveAttribute('aria-label', /Paulo/);
  await page.keyboard.press('Tab');
  await expect(page.locator('.crew-chip.leader')).toHaveAttribute('aria-label', /Annette/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.crew-chip.leader')).toHaveAttribute('aria-label', /Paulo/);
});

test('the crew can sit together on a bench and stand up again', async ({ page }) => {
  await startTrip(page);
  // The nearest bench is a few steps east of the promenade spawn (A on screen).
  await walkUntil(page, 'KeyA', 'Sit together');
  await expect(page.locator('.prompt')).toContainText('Sit together');
  await page.keyboard.press('KeyE');
  // A seated friendship scene may be offered first; let it play, then stand.
  await expect(page.locator('.prompt')).toContainText(/Stand up|♥/, { timeout: 5_000 });
  if ((await page.locator('.prompt').textContent())?.includes('♥')) {
    await page.keyboard.press('KeyE');
    await expect(page.locator('.prompt')).toContainText('Stand up', { timeout: 30_000 });
  }
  await page.keyboard.press('KeyE');
  await expect
    .poll(() =>
      page.locator('.prompt').evaluate((el) => !el.textContent?.includes('Stand up') || getComputedStyle(el).opacity === '0'),
    )
    .toBe(true);
});

test('settings persist across a reload', async ({ page }) => {
  await startTrip(page, false);
  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('menu');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-caption-bar').click();
  await expect(page.locator('#set-caption-bar')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#set-caption-bar')).toHaveAttribute('aria-pressed', 'true');
});

test('the trip saves and can be continued after a reload', async ({ page }) => {
  await startTrip(page, false);
  // The opening autosaves; give IndexedDB a moment.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  const cont = page.getByRole('button', { name: /Continue trip · Day 1/ });
  await expect(cont).toBeVisible();
  await expect(page.getByRole('button', { name: 'New trip' })).toBeVisible();
  await cont.click();
  await expect.poll(() => state(page), { timeout: 20_000 }).toBe('exploring');
  await expect(page.locator('.goals')).toContainText('Find somewhere for pintxos tonight');
  // Starting a new trip asks before overwriting.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to title' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('title');
  await page.getByRole('button', { name: 'New trip' }).click();
  await expect(page.getByRole('dialog', { name: 'Start a new trip?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep my trip' }).click();
  await expect(page.getByRole('button', { name: /Continue trip/ })).toBeVisible();
});

test('the journal opens with J and shows sights and the Pintxo-dex', async ({ page }) => {
  await startTrip(page, false);
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog', { name: 'Trip journal' })).toBeVisible();
  await expect(page.locator('.journal-count')).toContainText('of 12 sights');
  await page.getByRole('tab', { name: 'Pintxo-dex' }).click();
  await expect(page.locator('.journal-count')).toContainText('tasted');
  await page.getByRole('button', { name: 'Close journal' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('touch controls: joystick walks, buttons work', async ({ page }) => {
    // Real touches through the browser's hit testing, so an overlay that swallows them fails the test.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await page.goto('./');
    await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
    await page.getByRole('button', { name: 'Start Trip' }).tap();
    await page.getByRole('button', { name: 'Step outside' }).tap();
    await expect.poll(() => state(page), { timeout: 20_000 }).toBe('exploring');
    await expect(page.locator('body')).toHaveClass(/touch-mode/);
    await expect(page.getByRole('button', { name: 'Interact' })).toBeVisible();
    await expect(page.locator('.hint')).toContainText('Drag on the left');

    // Thumb down on the left half and push: the stick appears, then lets go cleanly.
    // Both halves of the screen must reach the world, not an invisible layer.
    for (const [x, y] of [[70, 600], [300, 400]]) {
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [x, y])).toBe('world');
    }
    await touch('touchStart', 70, 600);
    await expect(page.locator('.stick-base')).toHaveClass(/on/);
    for (let i = 1; i <= 6; i++) await touch('touchMove', 70 + i * 10, 600);
    await page.waitForTimeout(800);
    await touch('touchEnd');
    await expect(page.locator('.stick-base')).not.toHaveClass(/on/);

    await page.getByRole('button', { name: 'Journal' }).tap();
    await expect(page.getByRole('heading', { name: 'Trip journal' })).toBeVisible();
  });
});
