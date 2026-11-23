const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined,
  });
  try {
    const page = await browser.newPage({
      locale: 'en-US',
      viewport: { width: 932, height: 430 },
      reducedMotion: 'reduce',
    });
    const language = page.locator('[data-action="frontend-language"]');
    const choose = async (name) => {
      await language.click();
      await page.getByRole('option', { name, exact: true }).click();
    };
    await page.goto(base + '/#settings');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await choose('简体中文');
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await page.reload();
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();

    await choose('English');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await choose('Follow system');
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('tml-launcher-ui-v1')).language === 'system',
    );

    const nativePage = await browser.newPage({
      locale: 'en-US',
      viewport: { width: 932, height: 430 },
      reducedMotion: 'reduce',
    });
    await nativePage.addInitScript(() => {
      const snapshot = {
        protocol: 1,
        systemLocale: 'zh-CN',
        busy: false,
        mods: [],
        packs: [],
        patches: [],
        preferences: { language: 'system' },
      };
      window.LauncherNative = {
        postMessage(raw) {
          const { id, method, params } = JSON.parse(raw);
          if (method === 'settings.save') {
            snapshot.preferences = { ...snapshot.preferences, ...params.preferences };
            window.savedLauncherLanguage = snapshot.preferences.language;
          }
          queueMicrotask(() =>
            this.onmessage({ data: JSON.stringify({ id, ok: true, data: snapshot }) }),
          );
        },
      };
    });
    await nativePage.goto(base + '/#settings');
    await nativePage.getByRole('heading', { name: '设置', exact: true }).waitFor();
    await nativePage.locator('[data-action="frontend-language"]').click();
    await nativePage.getByRole('option', { name: 'English', exact: true }).click();
    await nativePage.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await nativePage.waitForFunction(() => window.savedLauncherLanguage === 'en');
    console.log(
      'PASS: launcher localization follows the system, switches live and saves the language.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
