const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { toggleDemo } = require('./demo.cjs');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  const page = await browser.newPage({
    locale: 'zh-CN',
    viewport: { width: 932, height: 430 },
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      errors.push(`${message.text()} (${message.location().url})`);
  });
  const action = (id) => page.locator(`[data-action="${id}"]`);
  const nav = (id) => page.locator(`.main-nav [data-page="${id}"]`);
  const settled = () =>
    page.waitForFunction(
      () => !document.activeViewTransition && !document.querySelector('#page-content[inert]'),
    );
  const out = path.join(__dirname, '../test-results');
  fs.mkdirSync(out, { recursive: true });
  const capture = (name) => page.screenshot({ path: path.join(out, name), animations: 'disabled' });
  try {
    await page.goto(base);
    assert.equal(
      await page.locator('.launch-button').evaluate((el) => getComputedStyle(el).filter),
      'none',
      'refraction never filters foreground text',
    );
    const launch = page.locator('.launch-button');
    assert.equal(await launch.getAttribute('data-slot'), 'ripple-button');
    await launch.click({ position: { x: 20, y: 24 } });
    await page.locator('.main-nav [data-page="games"][aria-current="page"]').waitFor();
    assert.equal(
      await nav('games').getAttribute('aria-current'),
      'page',
      'prepare action still opens resource management',
    );
    const ripple = launch.locator('.launch-ripple');
    const wave = await ripple.evaluate(
      (el) =>
        new Promise((resolve) => {
          const frames = [];
          const sample = () => {
            const style = getComputedStyle(el);
            frames.push({
              scale: new DOMMatrixReadOnly(style.transform).a,
              opacity: Number(style.opacity),
            });
            if (frames.length < 12) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }),
    );
    assert.ok(wave.at(-1).scale > wave[0].scale, 'ripple visibly expands');
    assert.ok(wave.at(-1).opacity < wave[0].opacity, 'ripple fades while expanding');
    assert.equal(await ripple.getAttribute('aria-hidden'), 'true');
    await ripple.waitFor({ state: 'detached' });
    await toggleDemo(page);
    await launch.click();
    await page.getByRole('dialog', { name: '游戏启动流程', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await toggleDemo(page);
    await nav('home').click();
    await settled();
    const pressTarget = action('extra-shortcuts');
    const box = await pressTarget.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-action="extra-shortcuts"]');
      return new DOMMatrixReadOnly(getComputedStyle(button).transform).a < 0.995;
    });
    await page.mouse.up();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');

    const logs = page.locator('.launch-utility');
    await logs.click();
    await page.getByRole('dialog', { name: '诊断日志', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await logs.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: '诊断日志', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await action('environment').click();
    await page.getByRole('dialog', { name: '运行环境检查', exact: true }).waitFor();
    await page.keyboard.press('Escape');

    await nav('mods').click();
    await page.getByRole('tab', { name: '下载模组', exact: true }).click();
    await page.locator('#catalog-search').waitFor();
    const indicator = page.locator('[data-slot="tabs-indicator"]');
    await indicator.waitFor();
    const underline = await indicator.evaluate((el) => {
      const style = getComputedStyle(el, '::after');
      return { color: style.backgroundColor, height: style.height };
    });
    assert.notEqual(underline.color, 'rgba(0, 0, 0, 0)', 'active category has a visible underline');
    assert.equal(underline.height, '2px', 'underline matches the reference tab indicator');
    await action('mw-filters').click();
    const side = page.getByRole('combobox', { name: '运行侧', exact: true });
    await side.click();
    await page.getByRole('listbox').waitFor();
    await capture('primitive-mod-select.png');
    await page.getByRole('option', { name: '仅客户端', exact: true }).click();
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    assert.equal(await side.innerText(), '仅客户端');
    await side.focus();
    await page.keyboard.press('ArrowDown');
    await page.getByRole('listbox').waitFor();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.activeElement?.textContent === '全部');
    await page.keyboard.press('Enter');
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    assert.equal(await side.innerText(), '全部');
    await action('mw-apply-filters').click();

    await nav('settings').click();
    await settled();
    await nav('home').click();
    await action('page-help').hover();
    await page.getByRole('tooltip').waitFor();
    assert.equal(await page.getByRole('tooltip').innerText(), '首页使用说明');
    await page.mouse.move(0, 0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    assert.equal(
      await pressTarget.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a),
      1,
      'reduced motion suppresses press scaling',
    );
    await page.mouse.up();
    await page.keyboard.press('Escape');

    await launch.focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await nav('games').getAttribute('aria-current'),
      'page',
      'ripple button preserves keyboard activation',
    );
    await launch.locator('.launch-ripple').waitFor({ state: 'detached' });
    assert.equal(
      await launch.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a),
      1,
      'reduced motion keeps the launch button still',
    );
    await nav('home').click();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [320, 390, 480]) {
      await page.setViewportSize({ width, height: 844 });
      await nav('home').click();
      const capsule = page.locator('[data-slot="bottom-navigation"]');
      const bounds = await capsule.boundingBox();
      assert.ok(
        bounds.width <= 420 &&
          bounds.height === 60 &&
          bounds.x >= 8 &&
          bounds.x + bounds.width <= width - 8,
        'navigation fits ' + width,
      );
      assert.equal(await capsule.getByRole('button').count(), 5);
      assert.equal(
        await capsule.getByRole('button', { name: '模组', exact: true }).count(),
        1,
        'visible labels name the icons',
      );
      const layout = await capsule.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        border: getComputedStyle(el).borderTopWidth,
        items: [...el.querySelectorAll('.nav-item')].map((item) => {
          const button = item.getBoundingClientRect();
          const icon = item.querySelector('svg').getBoundingClientRect();
          const label = item.querySelector('.navigation-label').getBoundingClientRect();
          return {
            touchTarget: button.width >= 48 && button.height >= 48,
            stackedLabel: label.width > 0 && label.height > 0 && label.top >= icon.bottom,
          };
        }),
      }));
      assert.equal(layout.background, 'rgba(0, 0, 0, 0)');
      assert.equal(layout.border, '0px');
      assert.ok(
        layout.items.every((item) => item.touchTarget && item.stackedLabel),
        'all five destinations keep icon-above-label layout and touch targets',
      );
      await nav('mods').click();
      const movement = await page.locator('.nav-lens').evaluate(
        (el) =>
          new Promise((resolve) => {
            const values = [];
            const sample = () => {
              values.push(Math.round(el.getBoundingClientRect().left));
              if (values.length < 25) requestAnimationFrame(sample);
              else resolve(values);
            };
            requestAnimationFrame(sample);
          }),
      );
      assert.ok(new Set(movement).size > 2, 'navigation highlight visibly travels on a spring');
      assert.equal(await nav('mods').getAttribute('aria-current'), 'page');
      assert.equal(await capsule.locator('[aria-current="page"]').count(), 1);
      const selection = await page.locator('.nav-lens').evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        border: getComputedStyle(el).borderTopWidth,
        radius: getComputedStyle(el).borderRadius,
      }));
      assert.equal(selection.background, 'rgb(229, 231, 231)');
      assert.equal(selection.border, '0px');
      assert.equal(selection.radius, '999px');
      await capture(`bottom-navigation-${width}.png`);
    }
    await page.goto(base + '/preview.html?page=home&orientation=portrait');
    assert.equal(
      await page.locator('[data-orientation="portrait"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.frameLocator('iframe').locator('[data-slot="bottom-navigation"]').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: official launch RippleButton grows/fades/cleans up and preserves prepare/demo/keyboard actions; compact logs pointer/keyboard/focus restoration; Home environment check; visible button press and switch stretch/glide; tab highlight; Select inside Dialog pointer/keyboard; Tooltip; reduced motion; BottomNavigation with always-visible stacked labels, neutral selection capsule and live spring motion at 320/390/480px; portrait preview URL.',
    );
  } catch (error) {
    await capture('primitives-failure.png').catch(() => {});
    console.error('Runtime messages:', errors);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
