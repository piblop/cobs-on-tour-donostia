import { webkit, devices } from '@playwright/test';
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('https://piblop.github.io/cobs-on-tour-donostia/?v=' + Date.now());
try {
  await page.waitForFunction(() => document.body.dataset.state === 'title' || document.querySelector('.fatal'), null, { timeout: 120000 });
} catch (e) { console.log('no title'); }
console.log('state', await page.evaluate(() => document.body.dataset.state), 'fatal', await page.locator('.fatal').count(), 'touch-mode', await page.evaluate(() => document.body.classList.contains('touch-mode')));
await page.screenshot({ path: process.argv[2] + '/wk-title.png' });
await page.getByRole('button', { name: 'Start Trip' }).tap().catch((e) => console.log('tap start failed', e.message.split('\n')[0]));
await page.waitForTimeout(1500);
console.log('after start tap', await page.evaluate(() => document.body.dataset.state));
await page.getByRole('button', { name: 'Step outside' }).tap().catch((e) => console.log('tap step failed', e.message.split('\n')[0]));
await page.waitForTimeout(6000);
console.log('after step', await page.evaluate(() => document.body.dataset.state));
console.log('hits', await page.evaluate(() => [[70, 500], [200, 300]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.id || el?.className; })));
// Synthetic pointer stream at the hit-tested element, as WebKit would send it.
await page.evaluate(() => {
  const el = document.elementFromPoint(70, 500);
  const fire = (type, x) => (type === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 500, bubbles: true, cancelable: true }));
  fire('pointerdown', 70);
  for (let i = 1; i < 7; i++) fire('pointermove', 70 + i * 10);
});
console.log('stick on', await page.evaluate(() => document.querySelector('.stick-base')?.classList.contains('on')));
await page.waitForTimeout(1500);
await page.screenshot({ path: process.argv[2] + '/wk-walk.png' });
await page.getByRole('button', { name: 'Journal' }).tap().catch((e) => console.log('tap journal failed', e.message.split('\n')[0]));
await page.waitForTimeout(1200);
console.log('after journal', await page.evaluate(() => document.body.dataset.state), 'errors', errs.slice(0, 5));
await browser.close();
