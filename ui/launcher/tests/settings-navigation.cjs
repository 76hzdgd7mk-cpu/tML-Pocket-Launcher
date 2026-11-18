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
      if (
        ['warning', 'error'].includes(message.type()) &&
        !message.text().startsWith('You have Reduced Motion enabled')
      )
        errors.push(message.text());
    });
    const nav = (id) => page.locator(`.main-nav [data-page="${id}"]`);
    const tab = (id) => page.locator(`#settings-tab-${id}`);
    const labels = ['外观', '游戏与运行', '触控与输入', '存储与下载', '关于'];
    const ids = ['appearance', 'runtime', 'controls', 'storage', 'about'];
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
      assert.equal(await page.locator('#page-tabs .tabbar [role="tab"]').count(), 5);
      assert.deepEqual(
        (await page.locator('#page-tabs .tabbar [role="tab"]').allTextContents()).map((label) =>
          label.trim(),
        ),
        labels,
      );
      const row = await page.locator('#page-tabs .tabbar [role="tab"]').evaluateAll((tabs) =>
        tabs.map((el) => {
          const rect = el.getBoundingClientRect();
          return { y: rect.y, width: rect.width, height: rect.height };
        }),
      );
      assert.ok(row.every((item) => item.y === row[0].y && item.width > 0 && item.height >= 40));
      assert.equal(
        await page.locator('#page-tabs .tabbar').evaluate((el) => getComputedStyle(el).gap),
        '20px',
      );
      const underline = await page
        .locator('#page-tabs .tabbar [role="tab"][aria-selected="true"]')
        .evaluate((tab) => {
          const indicator = tab.closest('.tabbar').querySelector('[data-slot="tabs-indicator"]');
          const box = tab.getBoundingClientRect();
          const rule = getComputedStyle(indicator, '::after');
          return {
            spansTab: Math.abs(indicator.getBoundingClientRect().width - box.width) <= 1,
            inset: rule.left,
            height: rule.height,
            radius: rule.borderRadius,
            narrower: parseFloat(rule.width) <= box.width - 4,
          };
        });
      assert.deepEqual(underline, {
        spansTab: true,
        inset: '2px',
        height: '2px',
        radius: '1.5px 1.5px 0px 0px',
        narrower: true,
      });
      for (const id of ids) {
        await tab(id).click();
        await page.waitForFunction(
          (id) =>
            document.querySelector(`#settings-tab-${id}`)?.getAttribute('aria-selected') === 'true',
          id,
        );
        const visible = await tab(id).evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const viewport = el.closest('.tabbar').getBoundingClientRect();
          return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
        });
        assert.equal(visible, true, 'active tab scrolls into its category row');
      }
      await page.screenshot({
        path: path.join(__dirname, `../test-results/settings-tabs-${viewport.width}.png`),
        animations: 'disabled',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await tab('appearance').click();
    const indicator = await page.locator('#page-tabs [data-slot="tabs-indicator"]').count();
    assert.equal(indicator, 1, 'selected tab is marked by the sliding underline');
    assert.equal(
      await page
        .locator('#page-tabs [data-slot="tabs-indicator"]')
        .evaluate((el) => getComputedStyle(el, '::after').height),
      '2px',
    );
    const scroller = page.locator('#page-content .page-scroll');
    const measure = () =>
      page.evaluate(() => ({
        tab: document.querySelector('#page-tabs').getBoundingClientRect().top,
        scrollTop: document.querySelector('#page-content .page-scroll').scrollTop,
        maxScroll:
          document.querySelector('#page-content .page-scroll').scrollHeight -
          document.querySelector('#page-content .page-scroll').clientHeight,
      }));
    await scroller.evaluate((el) => {
      el.scrollTop = 200;
    });
    const half = await measure();
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const bottom = await measure();
    assert.ok(
      bottom.scrollTop > half.scrollTop && bottom.maxScroll > 200,
      'settings content scrolls',
    );
    assert.equal(
      await page.evaluate(
        () =>
          !document
            .querySelector('#page-content .page-scroll')
            .contains(document.querySelector('#page-tabs')),
      ),
      true,
      'tab row sits outside the scrolling area',
    );
    assert.ok(
      Math.abs(half.tab - bottom.tab) <= 1,
      `tab row stays fixed while content scrolls (${half.tab} -> ${bottom.tab})`,
    );
    await page.screenshot({
      path: path.join(__dirname, '../test-results/settings-tabs-fixed.png'),
      animations: 'disabled',
    });
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await tab('about').focus();
    const selected = async (id) =>
      page.waitForFunction(
        (id) =>
          document.querySelector(`#settings-tab-${id}`)?.getAttribute('aria-selected') === 'true',
        id,
      );
    await page.keyboard.press('Home');
    await selected('appearance');
    assert.equal(await tab('appearance').evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('ArrowRight');
    await selected('runtime');
    assert.equal(await tab('runtime').evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('End');
    await selected('about');
    await page.keyboard.press('Home');
    await selected('appearance');
    await settle();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await nav('home').click();
    await nav('settings').click();
    await tab('appearance').waitFor();
    await settle();
    const header = await page.locator('.topbar').boundingBox();
    const dock = await page.locator('.launch-bar').boundingBox();
    await tab('runtime').click();
    await tab('appearance').click();
    await settle();
    assert.deepEqual(await page.locator('.topbar').boundingBox(), header);
    assert.deepEqual(await page.locator('.launch-bar').boundingBox(), dock);
    await nav('games').click();
    await nav('mods').click();
    await nav('settings').click();
    await page.locator('#page-tabs .tabbar').waitFor();
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
    await fallback.locator('#settings-tab-about').click();
    assert.equal(
      await fallback.locator('#settings-tab-about').getAttribute('aria-selected'),
      'true',
    );
    await fallback.getByText('开源与许可', { exact: true }).waitFor();

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
      'PASS: shared workspace tabs drive settings at six phone sizes; labels, spacing, keyboard navigation, horizontal reveal, stable header/dock, reduced motion, unsupported-view-transition fallback and preview orientation behavior.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
