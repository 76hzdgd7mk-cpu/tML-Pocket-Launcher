const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) errors.push(message.text());
    });
    const nav = (id) => page.locator(`.main-nav [data-page="${id}"]`);
    const tab = (id) => page.locator(`[data-settings-tab="${id}"]`);
    const settle = () =>
      page.evaluate(async () => {
        await document.activeViewTransition?.finished.catch(() => {});
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
    await page.goto(base);
    await nav('settings').click();
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 480, height: 800 },
      { width: 600, height: 320 },
      { width: 740, height: 360 },
      { width: 932, height: 430 },
    ]) {
      await page.setViewportSize(viewport);
      assert.equal(
        await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height),
        48,
      );
      assert.equal(await page.locator('.topbar [role="tablist"]').count(), 0);
      assert.equal(
        await page.locator('main > .settings-tabs-viewport [role="tablist"]').count(),
        1,
      );
      const headerBox = await page.locator('.topbar').boundingBox();
      const categoryBox = await page.locator('.settings-tabs-viewport').boundingBox();
      const contentBox = await page.locator('#page-content').boundingBox();
      assert.equal(categoryBox.height, 56);
      assert.ok(categoryBox.y >= headerBox.y + headerBox.height);
      assert.ok(contentBox.y >= categoryBox.y + categoryBox.height);
      assert.equal(await page.locator('#page-content .settings-nav').count(), 0);
      assert.deepEqual(
        (await page.locator('.settings-nav [role="tab"]').allTextContents()).map((label) =>
          label.trim(),
        ),
        ['外观', '游戏与运行', '触控与输入', '存储与下载', '关于'],
      );
      const row = await page.locator('.settings-nav [role="tab"]').evaluateAll((tabs) =>
        tabs.map((el) => {
          const rect = el.getBoundingClientRect();
          return { y: rect.y, width: rect.width, height: rect.height };
        }),
      );
      assert.ok(row.every((item) => item.y === row[0].y && item.width >= 64 && item.height >= 48));
      assert.equal(
        await page.locator('.settings-nav').evaluate((el) => getComputedStyle(el).gap),
        '8px',
      );
      for (const id of ['appearance', 'runtime', 'controls', 'storage', 'about']) {
        await tab(id).click();
        await page.waitForFunction(
          (id) =>
            document.querySelector('#settings-panel')?.getAttribute('aria-labelledby') ===
            `settings-tab-${id}`,
          id,
        );
        const visible = await tab(id).evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const viewport = el.closest('.settings-tabs-viewport').getBoundingClientRect();
          return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
        });
        assert.equal(visible, true, 'active category scrolls into its dedicated row');
      }
      await page.screenshot({
        path: path.join(__dirname, `../test-results/settings-horizontal-${viewport.width}.png`),
        animations: 'disabled',
      });
    }
    await tab('about').focus();
    await page.keyboard.press('Home');
    assert.equal(await tab('appearance').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('runtime').getAttribute('aria-selected'), 'true');
    assert.equal(await tab('runtime').evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await tab('about').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    await settle();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await nav('home').click();
    await nav('settings').click();
    await tab('appearance').waitFor();
    await settle();
    const header = await page.locator('.topbar').boundingBox();
    const dock = await page.locator('.launch-bar').boundingBox();
    const expectPush = async (from) => {
      await page.waitForFunction(
        (from) =>
          document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.pseudoElement?.startsWith('::view-transition-new') &&
                animation.effect
                  .getKeyframes()
                  .some((frame) => frame.transform === `translateX(${from}%)`),
            ),
        from,
      );
      assert.deepEqual(await page.locator('.topbar').boundingBox(), header);
      assert.deepEqual(await page.locator('.launch-bar').boundingBox(), dock);
      await settle();
    };
    await tab('runtime').click();
    await expectPush(100);
    await tab('appearance').click();
    await expectPush(-100);
    await nav('games').click();
    await nav('mods').click();
    await nav('settings').click();
    await page.locator('#settings-panel').waitFor();
    await settle();
    assert.equal(await nav('settings').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('[data-slot="page-transition"]').count(), 1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tab('about').click();
    await settle();
    assert.equal(
      await page.evaluate(
        () =>
          document.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
      0,
    );

    const fallback = await browser.newPage();
    fallback.on('pageerror', (error) => errors.push(error.message));
    await fallback.addInitScript(() =>
      Object.defineProperty(document, 'startViewTransition', {
        value: undefined,
        configurable: true,
      }),
    );
    await fallback.goto(base);
    await fallback.locator('.main-nav [data-page="settings"]').click();
    await fallback.locator('[data-settings-tab="about"]').click();
    assert.equal(
      await fallback.locator('#settings-panel').getAttribute('aria-labelledby'),
      'settings-tab-about',
    );

    const phone = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      reducedMotion: 'reduce',
    });
    phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(base + '/preview.html?page=settings');
    const launcher = phone.frameLocator('iframe');
    const direction = launcher.getByRole('combobox', { name: '启动器方向', exact: true });
    const expectOrientation = async (orientation) => {
      await phone.waitForFunction((orientation) => {
        const frame = document.querySelector('iframe');
        const portrait = orientation === 'portrait';
        return (
          frame.contentWindow.innerWidth === (portrait ? 390 : 932) &&
          frame.contentWindow.innerHeight === (portrait ? 844 : 430) &&
          frame.contentDocument.documentElement.dataset.orientation === orientation
        );
      }, orientation);
      assert.equal(await direction.innerText(), orientation === 'portrait' ? '竖屏' : '横屏');
    };
    await expectOrientation('landscape');
    await phone.evaluate(() => {
      window.orientationDocument = document.querySelector('iframe').contentDocument;
    });
    await direction.click();
    await launcher.getByRole('option', { name: '竖屏', exact: true }).click();
    await expectOrientation('portrait');
    assert.equal(
      await phone.evaluate(
        () => window.orientationDocument === document.querySelector('iframe').contentDocument,
      ),
      true,
      'rotation preserves the live launcher document',
    );
    assert.equal(await launcher.locator('#screen-title').innerText(), '设置');
    assert.equal(new URL(phone.url()).searchParams.get('orientation'), 'portrait');
    await phone.reload();
    await expectOrientation('portrait');
    await phone.goto(base + '/preview.html?page=settings');
    await expectOrientation('portrait');
    await phone.getByRole('button', { name: '横屏手机', exact: true }).click();
    await expectOrientation('landscape');
    await phone.reload();
    await expectOrientation('landscape');
    await phone.goto(base + '/preview.html?page=settings&orientation=portrait');
    await expectOrientation('portrait');
    await phone.evaluate(() =>
      localStorage.setItem(
        'tml-launcher-ui-v1',
        JSON.stringify({ version: 1, theme: 'light', orientation: 'diagonal' }),
      ),
    );
    await phone.goto(base + '/preview.html?page=settings');
    await expectOrientation('landscape');
    assert.equal(
      await launcher.locator('html').getAttribute('data-theme'),
      'light',
      'invalid orientation preserves other valid preferences',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: dedicated 56px settings category row below the 48px header at six phone sizes; full labels, spacing, keyboard tabs and horizontal reveal; real directional PageTransition push snapshots; header/dock stay still; rapid navigation; reduced motion and unsupported-browser fallback; default landscape, live portrait setting, session retention, persistence, preview toolbar sync, explicit orientation URLs and invalid preference recovery.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
