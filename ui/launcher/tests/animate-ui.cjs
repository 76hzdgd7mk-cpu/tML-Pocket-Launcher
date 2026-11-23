const { toggleDemo } = require('./demo.cjs');
const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  const errors = [];
  try {
    const page = await browser.newPage({
      locale: 'zh-CN',
      viewport: { width: 932, height: 430 },
      reducedMotion: 'no-preference',
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        (message.type() === 'error' || message.type() === 'warning') &&
        !message.text().startsWith('You have Reduced Motion enabled')
      )
        errors.push(message.text());
    });
    const action = (id) => page.locator(`[data-action="${id}"]`);
    const nav = (id) => page.locator(`.main-nav [data-page="${id}"]`);
    const settled = async () => {
      await page.waitForFunction(
        () =>
          !document.activeViewTransition &&
          !document.querySelector('.page-content[inert]') &&
          !document.querySelector('[role=tabpanel][inert]'),
      );
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
      await page.waitForTimeout(50);
    };
    const screenshot = async (name) => {
      await settled();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: path.join(__dirname, '../test-results', name),
        animations: 'disabled',
      });
    };
    await page.goto(base);
    await page.locator('.workspace-tools').waitFor();
    assert.equal(await page.locator('.workspace-tools button').count(), 4);
    await page.locator('[data-slot="motion-highlight"]').waitFor();
    assert.equal(
      await page.locator('[data-slot="motion-highlight"]').count(),
      1,
      'Animate UI renders the shared navigation highlight',
    );
    assert.equal(
      (await page.locator('[data-slot=button]').count()) > 15,
      true,
      'official Animate UI buttons rendered',
    );
    await action('extra-shortcuts').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page.locator('[data-slot="dialog-content"]').count(),
      1,
      'official Dialog Content rendered',
    );
    assert.equal(await page.getByRole('dialog').getAttribute('data-side'), 'right');
    assert.equal(await page.locator('.app-shell').evaluate((el) => el.inert), true);
    await action('extra-pick-browse').click();
    assert.ok((await page.locator('#shortcut-count').innerText()).includes('已满'));
    await action('extra-pick-storage').click();
    assert.equal(await action('extra-save-shortcuts').isDisabled(), true);
    await action('extra-pick-browse').click();
    await page.keyboard.press('Escape');
    assert.equal(await action('extra-tool-storage').count(), 1, 'cancel discards shortcut draft');
    assert.equal(
      await action('extra-shortcuts').evaluate((el) => el === document.activeElement),
      true,
    );
    await action('extra-shortcuts').click();
    await action('extra-pick-storage').click();
    await action('extra-pick-browse').click();
    await action('extra-save-shortcuts').click();
    await page.reload();
    assert.equal(
      await action('extra-tool-browse').count(),
      1,
      'same preference key survives React migration',
    );
    assert.ok((await page.locator('#home-activity').innerText()).includes('从这里继续'));
    await action('extra-tool-browse').click();
    await page.locator('#catalog-search').waitFor();
    await settled();
    assert.equal(
      await page.getByRole('tab', { name: '下载模组', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.locator('#catalog-search').fill('作者 B');
    assert.equal(
      await page.locator('#catalog-search').evaluate((el) => el === document.activeElement),
      true,
      'React search update preserves input',
    );
    assert.equal(await page.locator('.catalog-row').count(), 1);
    await page.locator('#catalog-search').fill('');

    for (let attempt = 0; attempt < 5; attempt++) {
      await action('mw-incompatible-preview').click();
      await page.getByRole('dialog', { name: '需要匹配的 tML 版本', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await action('mw-plan-adventure').click();
      await page.getByRole('dialog', { name: '下载模组与依赖', exact: true }).waitFor();
      assert.equal(await page.locator('.mod-plan>div').count(), 2);
      await page.keyboard.press('Escape');
    }

    await nav('settings').click();
    await action('motion').click();
    assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced');
    await page.locator('[data-theme-choice=light]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(
      await action('motion').getAttribute('data-state'),
      'unchecked',
      'Animate UI Switch reflects preference',
    );
    await nav('home').click();
    await settled();
    assert.equal(
      await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length,
      ),
      0,
      'reduced UI is settled',
    );
    await nav('settings').click();
    await action('motion').click();
    await page.locator('[data-theme-choice=dark]').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await nav('home').click();
    await settled();
    assert.equal(
      await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length,
      ),
      0,
      'system motion preference honored',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await nav('games').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-input'), 'keyboard');
    assert.equal(await nav('games').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.topbar-actions').evaluate((el) => el.inert), false);
    await action('page-help').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await settled();
    assert.equal(
      await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length,
      ),
      0,
      'keyboard modal opens immediately',
    );
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
        true,
        'Radix focus trap',
      );
    }
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
      true,
    );
    await page.keyboard.press('Escape');
    assert.equal(await action('page-help').evaluate((el) => el === document.activeElement), true);
    await page.locator('.topbar [data-action=tasks]').click();
    await page.getByRole('dialog').waitFor();
    await action('close').click();
    assert.equal(await page.locator('.app-shell').evaluate((el) => el.inert), false);
    assert.equal(
      await page.getByRole('dialog').count(),
      0,
      'closing content leaves accessibility tree',
    );
    await page.locator('.topbar [data-action=tasks]').click();
    await settled();
    assert.equal(await page.getByRole('dialog').count(), 1, 'rapid reopen preserves new sheet');
    await page.keyboard.press('Escape');

    await nav('home').click();
    await action('versions').click();
    await action('select-release-stable').click();
    await action('start-task-tml').click();
    assert.equal(await page.locator('.overview-stats [data-action=tasks] strong').innerText(), '1');
    await action('pause-task').click();
    await page.keyboard.press('Escape');
    await action('extra-activity').click();
    await action('extra-filter-任务').click();
    assert.equal(await page.locator('.activity-list li').count(), 2);
    await page.keyboard.press('Escape');
    await page.locator('.topbar [data-action=tasks]').click();
    await action('cancel-task').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.overview-stats [data-action=tasks] strong').innerText(), '0');
    await toggleDemo(page);
    assert.equal(await action('extra-updates').locator('strong').innerText(), '2');
    await action('extra-updates').click();
    await page.locator('#catalog-search').waitFor();
    await settled();
    assert.equal(
      await page.locator('.catalog-row').count(),
      2,
      'live counts link to correct filtered list',
    );
    await nav('home').click();
    await action('extra-activity').click();
    await action('extra-clear-activity').click();
    await action('extra-confirm-clear').click();
    assert.equal(await page.locator('.activity-list li').count(), 0);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 844 });
    await nav('settings').click();
    await settled();
    await page.locator('#page-content .page-scroll').evaluate((el) => (el.scrollTop = 220));
    const scroll = await page.locator('#page-content .page-scroll').evaluate((el) => el.scrollTop);
    await nav('home').click();
    await nav('settings').click();
    await settled();
    assert.equal(
      await page.locator('#page-content .page-scroll').evaluate((el) => el.scrollTop),
      scroll,
    );
    await nav('home').click();
    await page.locator('#page-content .page-scroll').evaluate((el) => (el.scrollTop = 0));
    await screenshot('animate-home-portrait.png');
    await action('extra-shortcuts').click();
    await screenshot('animate-shortcuts-portrait.png');
    await page.keyboard.press('Escape');
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 480, height: 800 },
      { width: 600, height: 320 },
      { width: 740, height: 360 },
      { width: 932, height: 430 },
    ]) {
      await page.setViewportSize(viewport);
      await settled();
      await nav('patches').click();
      await settled();
      await page.getByRole('tab', { name: /可选补丁/ }).click();
      await settled();
      assert.equal(
        await page
          .locator('.switch')
          .evaluate((el) => el.offsetWidth >= 48 && el.offsetHeight >= 48),
        true,
        'switch touch area ' + viewport.width,
      );
      await nav('home').click();
      await settled();
      await action('extra-shortcuts').click();
      await settled();
      assert.equal(
        await page.getByRole('dialog').getAttribute('data-side'),
        viewport.width <= 480 ? 'bottom' : 'right',
      );
      assert.equal(
        await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        'sheet fits ' + viewport.width,
      );
      await page.keyboard.press('Escape');
    }
    await page.locator('#page-content .page-scroll').evaluate((el) => (el.scrollTop = 0));
    await screenshot('animate-home-landscape.png');
    await page.evaluate(() => localStorage.setItem('tml-launcher-ui-v1', '{broken'));
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await action('extra-tool-storage').count(), 1);
    const touch = await browser.newPage({
      locale: 'zh-CN',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    touch.on('pageerror', (error) => errors.push(error.message));
    await touch.goto(base + '/?tab=browse#mods');
    await touch.locator('#catalog-search').waitFor();
    assert.equal(
      await touch.locator('#catalog-search').evaluate((el) => getComputedStyle(el).fontSize),
      '16px',
    );
    await touch.locator('[data-action=mw-filters]').tap();
    await touch.getByRole('dialog').waitFor();
    assert.equal(await touch.getByRole('dialog').count(), 1);
    await touch.close();
    const source = fs.readFileSync(path.join(__dirname, '../src/components/ui.tsx'), 'utf8');
    assert.ok(
      source.includes('@animate-ui/react/primitives/radix-ui/tabs') &&
        source.includes('@animate-ui/react/primitives/radix-ui/switch'),
    );
    assert.deepEqual(errors, [], 'no runtime errors, warnings or failed resource loads');
    console.log(
      'PASS: real Animate UI controls and shared highlight; responsive sheets; keyboard focus trap/restore; rapid reopen; system/user reduced motion; shortcut save/cancel/persistence; search focus; task and overview state; session activity; scroll retention; corruption recovery; touch input; 6 phone sizes.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
