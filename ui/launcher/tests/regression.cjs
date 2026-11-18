const { toggleDemo } = require('./demo.cjs');
const { chromium } = require('playwright');
const path = require('path');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';
const fs = require('fs');
const assert = require('assert/strict');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 840 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  const out = path.join(__dirname, '../test-results');
  fs.mkdirSync(out, { recursive: true });
  async function capture(name) {
    if (await page.locator('#toast').count())
      await page.locator('#toast:not(.show)').waitFor({ state: 'attached' });
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: path.join(out, name),
      fullPage: true,
      animations: 'disabled',
    });
  }
  for (const name of ['home', 'games', 'mods', 'patches', 'settings']) {
    await page.locator(`.main-nav [data-page="${name}"]`).click();
    assert.equal(await page.locator('h1:visible').count(), 1, 'one page title');
    await capture(`${name}-desktop.png`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name} desktop overflow`,
    );
  }
  await page.locator('.main-nav [data-page="patches"]').click();
  await page.locator('[data-action="page-help"]').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('无法关闭'));
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('[data-action="page-help"]').evaluate((el) => el === document.activeElement),
    true,
    'help returns focus',
  );
  await page.locator('[data-patch-tab="optional"]').click();
  assert.ok((await page.locator('#patch-panel').innerText()).includes('还没有可选补丁'));
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.patch-row').count(), 3, 'keyboard switches patch category');
  await page.locator('.screen-primary').click();
  await page.getByRole('dialog').waitFor();
  assert.ok((await page.getByRole('dialog').innerText()).includes('补丁'));
  await page.keyboard.press('Escape');
  await page.locator('.main-nav [data-page="games"]').click();
  await page.locator('[data-game-tab="sources"]').click();
  await capture('sources-desktop.png');
  await page.locator('[data-action="account-steam"]').click();
  await page.getByRole('dialog').waitFor();
  await capture('steam-flow.png');
  await page.locator('[data-action="account-library-steam"]').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('所有权已验证（示例）'));
  await page.locator('[data-action="start-task-terraria"]').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('38%'));
  await page.locator('[data-action="pause-task"]').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('已暂停'));
  await page.keyboard.press('Escape');
  await page.locator('.main-nav [data-page="mods"]').click();
  assert.ok((await page.locator('#task-summary').innerText()).includes('已暂停'));
  await toggleDemo(page);
  assert.equal(await page.locator('.mod-row').count(), 3);
  await page.locator('[data-action="mod-library"]').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('这个模组仍被依赖'));
  await page.keyboard.press('Escape');
  await page.locator('[data-action="mod-content"]').click();
  assert.equal(
    await page.locator('[data-action="mod-content"]').getAttribute('aria-checked'),
    'false',
  );
  await page.locator('#mod-search').fill('辅助');
  assert.equal(await page.locator('.mod-row').count(), 1);
  await page.locator('#mod-search').fill('');
  await capture('mods-sample-desktop.png');
  await page.locator('.main-nav [data-page="settings"]').click();
  await page.locator('[data-theme-choice="dark"]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await capture('settings-dark-desktop.png');
  await page.locator('[data-theme-choice="light"]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.locator('[data-background="diy"]').click();
  await page.getByRole('dialog').waitFor();
  assert.ok((await page.getByRole('dialog').innerText()).includes('自定义色调'));
  await page.locator('[data-action="apply-tint"]').click();
  assert.ok((await page.locator('body').getAttribute('class')).includes('has-background'));
  assert.equal(
    await page.locator('.game-dock').evaluate((el) => getComputedStyle(el).backdropFilter),
    'none',
    'panel blur must not form a backdrop ancestor that darkens SVG refraction',
  );
  await page.locator('[data-background="none"]').click();
  await page.locator('[data-theme-choice="dark"]').click();
  await page.locator('[data-action="glass-effects"]').click();
  assert.equal(await page.locator('html').getAttribute('data-glass'), 'off');
  assert.equal(await page.locator('.instance-picker .glass-lens').count(), 0);
  await page.locator('[data-action="glass-effects"]').click();
  assert.equal(await page.locator('html').getAttribute('data-glass'), 'on');
  assert.notEqual(
    await page
      .locator('.instance-picker .glass-lens')
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    'none',
  );
  await page.locator('[data-action="motion"]').click();
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'reduced');
  await page.locator('[data-action="motion"]').click();
  await page
    .locator('#background-file')
    .setInputFiles(path.join(__dirname, '../public/tmodloader.png'));
  await page.waitForFunction(() => document.body.classList.contains('has-background'));
  assert.ok(
    (await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundImage)).includes(
      'data:image/png;base64,',
    ),
  );
  await page.locator('[data-action="remove-background"]').click();
  assert.equal(
    await page.locator('body').evaluate((el) => el.classList.contains('has-background')),
    false,
  );
  await toggleDemo(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of ['home', 'games', 'mods', 'patches', 'settings']) {
    await page.locator(`.main-nav [data-page="${name}"]`).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name} mobile overflow`,
    );
    await capture(`${name}-mobile.png`);
  }
  await page.locator('.main-nav [data-page="games"]').click();
  await page.locator('[data-action="versions"]').first().click();
  await capture('versions-mobile.png');
  await page.locator('[data-version-filter="stable"]').click();
  assert.equal(await page.locator('.release-row:visible').count(), 1);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 932, height: 430 });
  await page.locator('.main-nav [data-page="home"]').click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'landscape overflow',
  );
  await capture('home-landscape.png');
  await page.locator('.instance-picker').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('还没有可用版本'));
  await page.keyboard.press('Escape');
  await toggleDemo(page);
  await page.locator('.instance-picker').click();
  await page.locator('[data-action="choose-instance-preview"]').click();
  assert.ok((await page.locator('.instance-picker').innerText()).includes('示例预览版本'));
  assert.ok((await page.locator('.game-overview').innerText()).includes('示例预览版本'));
  await page.locator('.launch-button').click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('未启动真实游戏'));
  await page.keyboard.press('Escape');
  await capture('home-ready-landscape.png');
  await page.locator('.main-nav [data-page="patches"]').click();
  const patchRows = await page.locator('.patch-row').evaluateAll((rows) =>
    rows.every((el) => {
      const r = el.getBoundingClientRect(),
        c = document.querySelector('#page-content').getBoundingClientRect();
      return r.top >= c.top && r.bottom <= c.bottom;
    }),
  );
  assert.equal(patchRows, true, 'all three built-in patches visible on landscape first screen');
  await capture('patches-landscape.png');
  await page.locator('[data-patch-tab="optional"]').click();
  await page.locator('[data-action="optional-patch"]').click();
  await page.locator('.main-nav [data-page="home"]').click();
  await page.locator('.main-nav [data-page="patches"]').click();
  assert.equal(
    await page.locator('[data-action="optional-patch"]').getAttribute('aria-checked'),
    'false',
    'optional patch state survives navigation',
  );
  await page.locator('[data-patch-tab="builtin"]').click();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 480, height: 800 },
    { width: 600, height: 320 },
    { width: 740, height: 360 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(viewport);
    for (const name of ['home', 'games', 'mods', 'patches', 'settings']) {
      await page.locator(`.main-nav [data-page="${name}"]`).click();
      const layout = await page.evaluate(() => {
        const content = document.querySelector('#page-content');
        const launch = document.querySelector('.launch-button').getBoundingClientRect();
        const picker = document.querySelector('.instance-picker').getBoundingClientRect();
        const dock = document.querySelector('.launch-bar').getBoundingClientRect();
        const nav = document.querySelector('.sidebar').getBoundingClientRect();
        const panel = document.querySelector('.game-dock').getBoundingClientRect();
        const main = document.querySelector('.main').getBoundingClientRect();
        const group = document.querySelector('.launch-group').getBoundingClientRect();
        const account = document
          .querySelector(innerWidth > 480 ? '.dock-account' : '.portrait-account')
          .getBoundingClientRect();
        const navTargets = [...document.querySelectorAll('.main-nav button')].every((el) => {
          const r = el.getBoundingClientRect();
          return r.height >= 48 && r.width >= 48 && r.top >= 0 && r.bottom <= innerHeight;
        });
        const title = document.querySelector('.screen-title').getBoundingClientRect();
        const actions = [...document.querySelectorAll('.topbar-actions button')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.getBoundingClientRect());
        const headerClear =
          actions.every(
            (r) =>
              r.left >= title.right && r.right <= main.right && r.width >= 48 && r.height >= 48,
          ) && actions.every((r, i) => i === 0 || r.left >= actions[i - 1].right);
        return {
          overflow: content.scrollWidth > content.clientWidth + 1,
          visible: launch.top >= 0 && launch.bottom <= innerHeight && launch.right <= innerWidth,
          pickerVisible:
            picker.left >= 0 && picker.right <= innerWidth && picker.bottom <= innerHeight,
          navClear: innerWidth > 480 || dock.bottom <= nav.top + 1,
          touch: launch.height >= 48 && launch.width >= 48 && picker.height >= 48,
          compact: group.width <= (innerWidth > 480 ? 140 : 128),
          secondary:
            innerWidth <= 480 ||
            (() => {
              const logs = document.querySelector('.launch-utility').getBoundingClientRect();
              return logs.height === 32 && logs.height < launch.height && logs.width < group.width;
            })(),
          noDuplicates:
            document.querySelectorAll('.launch-bar [data-action="instances"]').length === 1 &&
            !document.querySelector('.launch-menu, .dock-readiness, .dock-config-title'),
          dockClear: innerWidth <= 480 || (panel.left >= main.right && panel.bottom <= innerHeight),
          accountAccessible:
            account.height >= 48 && account.width >= 48 && account.bottom <= innerHeight,
          navTargets,
          headerClear,
          singleTitle: document.querySelectorAll('h1').length === 1,
        };
      });
      if (layout.overflow)
        console.log(
          await page.locator('#page-content').evaluate((root) =>
            [...root.querySelectorAll('*')]
              .filter(
                (el) => el.getBoundingClientRect().right > root.getBoundingClientRect().right + 1,
              )
              .map((el) => ({
                class: el.className,
                right: el.getBoundingClientRect().right,
                width: el.clientWidth,
              }))
              .slice(0, 20),
          ),
        );
      assert.deepEqual(
        layout,
        {
          overflow: false,
          visible: true,
          pickerVisible: true,
          navClear: true,
          touch: true,
          compact: true,
          secondary: true,
          noDuplicates: true,
          dockClear: true,
          accountAccessible: true,
          navTargets: true,
          headerClear: true,
          singleTitle: true,
        },
        `${name} ${viewport.width}x${viewport.height}`,
      );
      const original = await page.locator('.launch-bar').boundingBox();
      await page
        .locator('#page-content .page-scroll')
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert.deepEqual(
        await page.locator('.launch-bar').boundingBox(),
        original,
        'launch controls stay fixed during scroll',
      );
    }
    await page.locator('.main-nav [data-page="home"]').click();
    await capture(`home-${viewport.width}x${viewport.height}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.main-nav [data-page="home"]').click();
  await capture('home-ready-mobile.png');
  await page.goto(base + '/preview.html', { waitUntil: 'networkidle' });
  const preview = page.frameLocator('iframe');
  assert.equal(await preview.locator('html').evaluate(() => innerWidth), 932);
  await page.getByRole('button', { name: '竖屏手机' }).click();
  assert.equal(await preview.locator('html').evaluate(() => innerWidth), 390);
  await page.getByRole('button', { name: '横屏手机' }).click();
  await page.setViewportSize({ width: 1360, height: 840 });
  await capture('phone-layout-preview.png');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    'PASS: single page title and accessible header across 5 destinations / 6 phone sizes; patch categories, keyboard switching, help and import; three built-in patches visible at 932x430; authorization/task/mod/settings flows; installed profiles and fixed compact launch controls; phone preview orientations; no JavaScript errors.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
