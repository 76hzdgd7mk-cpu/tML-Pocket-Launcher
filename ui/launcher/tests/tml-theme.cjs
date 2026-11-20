const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 932, height: 430 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const root = page.locator('html');
    const choose = (theme) => page.locator(`[data-theme-choice="${theme}"]`);
    const nav = (destination) => page.locator(`.main-nav [data-page="${destination}"]`);
    const capture = async (name) => {
      if (!process.env.LAUNCHER_CAPTURE) return;
      const dir = path.resolve(__dirname, '../../../build/ui-previews');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' });
    };
    await page.goto(base);
    assert.equal(await root.getAttribute('data-theme'), 'dark');
    assert.equal(await root.getAttribute('data-skin'), null);
    await nav('settings').click();
    await choose('dark').waitFor();
    assert.equal(await choose('tml').count(), 1, 'classic theme is available in Appearance');
    await choose('tml').click();
    assert.equal(await choose('tml').getAttribute('aria-pressed'), 'true');
    assert.equal(await root.getAttribute('data-skin'), 'tml');
    assert.equal(await root.getAttribute('data-theme'), 'dark');
    assert.equal(await root.getAttribute('data-glass'), 'off');
    assert.equal(await page.locator('.glass-lens').count(), 0);
    assert.equal(await page.locator('[data-action="glass-effects"]').count(), 0);
    assert.equal(
      await page
        .locator('.settings-section .panel')
        .first()
        .evaluate((panel) => {
          const style = getComputedStyle(panel);
          return (
            style.backgroundColor === 'rgb(33, 43, 79)' &&
            style.borderTopColor === 'rgb(9, 14, 33)' &&
            style.backdropFilter === 'none'
          );
        }),
      true,
    );
    await capture('tml-theme-settings-landscape');
    await page.reload();
    await page.locator('html[data-skin="tml"]').waitFor({ state: 'attached' });
    await nav('home').click();
    await page.locator('.tml-wordmark').evaluate((image) => image.decode());
    await capture('tml-theme-home-landscape');
    await page.locator('[data-action="page-help"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(
      await dialog.evaluate((element) => getComputedStyle(element).backdropFilter),
      'none',
    );
    await capture('tml-theme-dialog-landscape');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 320, height: 680 });
    await nav('settings').click();
    await choose('tml').waitFor();
    assert.equal(await choose('tml').getAttribute('aria-pressed'), 'true');
    assert.equal(
      await choose('tml').evaluate(
        (button) => button.getBoundingClientRect().right <= window.innerWidth,
      ),
      true,
    );
    await capture('tml-theme-settings-portrait');
    await choose('light').click();
    assert.equal(await root.getAttribute('data-skin'), null);
    assert.equal(await root.getAttribute('data-theme'), 'light');
    assert.equal(await root.getAttribute('data-glass'), 'on');
    await choose('system').click();
    assert.equal(await root.getAttribute('data-theme'), 'light');
    assert.equal(await choose('system').getAttribute('aria-pressed'), 'true');
    console.log(
      'PASS: tModLoader theme selection, persistence, panel/modal skin, narrow settings, light/system and glass restoration.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
