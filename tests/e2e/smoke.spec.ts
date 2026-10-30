import { expect, test, type Page } from '@playwright/test';
import { SUBPATH } from '../../playwright.config.ts';

const state = (page: Page) => page.evaluate(() => document.body.dataset.state);

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

test('start, walk, pause, recover and resume', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await page.getByRole('button', { name: 'Start Trip' }).click();
  await expect.poll(() => state(page), { timeout: 15_000 }).toBe('exploring');
  await expect(page.locator('.area-banner')).toContainText('La Concha');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');

  // Pausing stops gameplay input; the recovery action is always offered.
  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('menu');
  await expect(page.getByRole('button', { name: 'Return to the promenade' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to the promenade' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');

  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('menu');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => state(page)).toBe('exploring');
});

test('discovering La Concha shows a polaroid and counts it once', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await page.getByRole('button', { name: 'Start Trip' }).click();
  await expect.poll(() => state(page), { timeout: 15_000 }).toBe('exploring');

  // From the spawn point the railing spot is a short stroll west and toward the sea
  // (the default camera looks inland, so that is D and S on screen).
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyS');
  await expect(page.locator('.prompt')).toContainText('Lean on the railing');

  await page.keyboard.press('KeyE');
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('card');
  await expect(page.getByRole('dialog', { name: 'La Concha' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to the journal' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
  await expect(page.locator('.collection-chip')).toContainText('1 / 2');

  // A repeat visit is quicker and does not count twice.
  await page.keyboard.press('KeyE');
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('card');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('exploring');
  await expect(page.locator('.collection-chip')).toContainText('1 / 2');
});

async function startTrip(page: Page) {
  await page.goto('./');
  await expect.poll(() => state(page), { timeout: 60_000 }).toBe('title');
  await page.getByRole('button', { name: 'Start Trip' }).click();
  await expect.poll(() => state(page), { timeout: 15_000 }).toBe('exploring');
}

test('Tab hands control to the next friend', async ({ page }) => {
  await startTrip(page);
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
  // The nearest bench is a few steps east of the spawn point (A on screen).
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyA');
  await expect(page.locator('.prompt')).toContainText('Sit together');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.prompt')).toContainText('Stand up', { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  // Standing up hides the prompt (or swaps it for the bench again).
  await expect
    .poll(() =>
      page.locator('.prompt').evaluate((el) => !el.textContent?.includes('Stand up') || getComputedStyle(el).opacity === '0'),
    )
    .toBe(true);
});

test('settings persist across a reload', async ({ page }) => {
  await startTrip(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('menu');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-caption-bar').click();
  await expect(page.locator('#set-caption-bar')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await startTrip(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#set-caption-bar')).toHaveAttribute('aria-pressed', 'true');
});
