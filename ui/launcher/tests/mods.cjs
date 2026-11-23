const { toggleDemo } = require('./demo.cjs');
const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8769';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  const errors = [];
  try {
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 932, height: 430 } });
    page.on('pageerror', (e) => errors.push(e.message));
    const action = (name) => page.locator(`[data-action="${name}"]`);
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    const settle = () =>
      page.waitForFunction(() => !document.querySelector('[role=tabpanel][inert]'));
    const close = () => page.keyboard.press('Escape');
    const openInstalled = async () => {
      await page.locator('#mod-tab-installed').click();
      await settle();
      await page.locator('#mod-search').waitFor();
    };
    const screenshot = async (name) => {
      await page.locator('#toast:not(.show)').waitFor({ state: 'attached' });
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: path.join(__dirname, '../test-results', name),
        animations: 'disabled',
      });
    };
    await page.goto(base + '/#mods');
    await tab('下载模组').click();
    await settle();
    await page.locator('#catalog-search').waitFor();
    assert.equal(await page.locator('.catalog-row').count(), 5);
    await page.locator('#catalog-search').fill('作者 B');
    assert.equal(await page.locator('.catalog-row').count(), 1);
    await page.locator('#catalog-search').fill('');
    await action('mw-filters').click();
    await settle();
    await page.getByRole('combobox', { name: '运行侧', exact: true }).click();
    await page.getByRole('option', { name: '仅客户端', exact: true }).click();
    await action('mw-apply-filters').click();
    await settle();
    assert.equal(await page.locator('.catalog-row').count(), 1);
    await action('mw-filters').click();
    await settle();
    await action('mw-reset-filter-dialog').click();
    await settle();
    await action('mw-apply-filters').click();
    await settle();
    await action('mw-incompatible-preview').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('需要预览配置'));
    assert.equal(await action('mw-start-download').count(), 0);
    await close();
    await action('mw-plan-adventure').click();
    await settle();
    assert.equal(await page.locator('.mod-plan>div').count(), 2, 'download includes library');
    await action('mw-start-download').click();
    await settle();
    await action('mw-pause-download').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('已暂停'));
    assert.equal(
      await action('mw-finish-download').isDisabled(),
      true,
      'paused task cannot install',
    );
    await close();
    await page.locator('.main-nav [data-page="home"]').click();
    await settle();
    await page.locator('.topbar [data-action="tasks"]').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('2 项模组与依赖'));
    await action('mw-cancel-download').click();
    await settle();
    await page.locator('.main-nav [data-page="mods"]').click();
    await settle();
    await openInstalled();
    assert.equal(await page.locator('.mod-row').count(), 0, 'cancel does not install');
    await tab('下载模组').click();
    await settle();
    await page.locator('#catalog-search').waitFor();
    await action('mw-plan-adventure').click();
    await settle();
    await action('mw-start-download').click();
    await settle();
    await action('mw-finish-download').click();
    await settle();
    await openInstalled();
    assert.equal(await page.locator('.mod-row').count(), 2);
    assert.equal(
      await action('mod-adventure').getAttribute('aria-checked'),
      'false',
      'new installs disabled',
    );
    await action('mod-adventure').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('同时启用依赖'));
    await action('mw-apply-enable').click();
    await settle();
    assert.equal(await action('mod-library').getAttribute('aria-checked'), 'true');
    await action('mod-library').click();
    await settle();
    await close();
    assert.equal(
      await action('mod-library').getAttribute('aria-checked'),
      'true',
      'cancel dependency disable preserves list',
    );
    await action('mod-library').click();
    await settle();
    await action('mw-apply-enable').click();
    await settle();
    assert.equal(await action('mod-adventure').getAttribute('aria-checked'), 'false');
    await action('mod-detail-library').click();
    await settle();
    await action('mw-delete-library').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('仍被依赖'));
    await close();
    await action('mod-detail-adventure').click();
    await settle();
    await action('mw-delete-adventure').click();
    await settle();
    await action('mw-confirm-delete').click();
    await settle();
    assert.equal(await page.locator('.mod-row').count(), 1);
    await page.locator('.main-nav [data-page="games"]').click();
    await settle();
    await page.locator('[data-game-tab="sources"]').click();
    await settle();
    await action('account-steam').click();
    await settle();
    await action('account-library-steam').click();
    await settle();
    await action('start-task-terraria').click();
    await settle();
    await close();
    await page.locator('.main-nav [data-page="mods"]').click();
    await settle();
    await tab('下载模组').click();
    await settle();
    await page.locator('#catalog-search').waitFor();
    await action('mw-plan-content').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('已有下载任务'));
    await close();
    await page.locator('.topbar [data-action="tasks"]').click();
    await settle();
    assert.ok(
      (await page.getByRole('dialog').innerText()).includes('Terraria 资源'),
      'mod download does not replace another task',
    );
    await close();

    await page.reload();
    await toggleDemo(page);
    await settle();
    await action('mod-content').click();
    await settle();
    await tab('下载模组').click();
    await settle();
    await page.locator('#catalog-search').waitFor();
    await action('mw-update-all').click();
    await settle();
    assert.equal(await page.locator('.mod-plan>div').count(), 2);
    await action('mw-start-download').click();
    await settle();
    await action('mw-finish-download').click();
    await settle();
    await openInstalled();
    assert.equal(
      await action('mod-content').getAttribute('aria-checked'),
      'false',
      'update preserves disabled state',
    );
    assert.equal(
      await action('mod-library').getAttribute('aria-checked'),
      'true',
      'update preserves enabled state',
    );
    assert.ok((await page.locator('#mods-list').innerText()).includes('1.3.0'));
    await tab('模组包').click();
    await settle();
    await action('mw-save-pack').click();
    await settle();
    await page.getByLabel('模组包名称').fill('测试组合');
    await action('mw-confirm-save-pack').click();
    await settle();
    assert.equal(await page.locator('.pack-row').count(), 1);
    await page.locator('.pack-row').click();
    await settle();
    const downloadPromise = page.waitForEvent('download');
    await action('mw-pack-export').click();
    await settle();
    assert.equal((await downloadPromise).suggestedFilename(), 'mod-list.json');
    await close();
    await openInstalled();
    await action('mw-local-menu').click();
    await settle();
    await action('mw-disable-all').click();
    await settle();
    await action('mw-apply-enable').click();
    await settle();
    assert.equal(await page.locator('.mod-row [aria-checked="true"]').count(), 0);
    await tab('模组包').click();
    await settle();
    await page.locator('.pack-row').click();
    await settle();
    await action('mw-pack-apply').click();
    await settle();
    await openInstalled();
    assert.equal(await page.locator('.mod-row [aria-checked="true"]').count(), 2);
    await action('mod-detail-helper').click();
    await settle();
    await action('mw-config-helper').click();
    await settle();
    await page.getByLabel('模组配置 JSON').fill('{broken');
    await action('mw-save-config').click();
    await settle();
    assert.equal(await page.getByRole('dialog').count(), 1, 'invalid JSON keeps editor');
    await page.getByLabel('模组配置 JSON').fill('{"scale":1}');
    await action('mw-save-config').click();
    await settle();
    await tab('模组包').click();
    await settle();
    await page.locator('#modpack-file').setInputFiles({
      name: 'list.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'tml-mobile-mod-list',
          version: 1,
          name: '缺失条目测试',
          profile: 'stable',
          mods: ['UnknownMod'],
        }),
      ),
    });
    await page.waitForFunction(() => document.querySelectorAll('.pack-row').length === 2);
    await page.getByRole('button', { name: /缺失条目测试/ }).click();
    await settle();
    await action('mw-pack-apply').click();
    await settle();
    assert.ok((await page.getByRole('dialog').innerText()).includes('清单依赖无法解析'));
    await close();
    await page.locator('#modpack-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"mods":"invalid"}'),
    });
    await page.waitForFunction(() =>
      document.querySelector('#toast').textContent.includes('无法读取清单'),
    );
    assert.equal(await page.locator('.pack-row').count(), 2);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 480, height: 800 },
      { width: 600, height: 320 },
      { width: 740, height: 360 },
      { width: 932, height: 430 },
    ]) {
      await page.setViewportSize(viewport);
      for (const name of ['已安装', '下载模组', '模组包']) {
        await page.getByRole('tab', { name: new RegExp('^' + name) }).click();
        await settle();
        await page.waitForFunction(() => !document.querySelector('[role=tabpanel][inert]'));
        await page.waitForTimeout(350);
        await page.evaluate(() =>
          Promise.all(
            document.getAnimations().map((animation) => animation.finished.catch(() => {})),
          ),
        );
        const fit = await page.locator('#page-content').evaluate((root) => {
          const r = root.getBoundingClientRect();
          return {
            overflow: root.scrollWidth > root.clientWidth + 1,
            launch:
              document.querySelector('.launch-button').getBoundingClientRect().bottom <=
              innerHeight,
            targets:
              [...root.querySelectorAll('.catalog-install,.pack-row,.mod-row>.icon-button')].every(
                (el) =>
                  el.getBoundingClientRect().width >= 48 && el.getBoundingClientRect().height >= 48,
              ) &&
              [...root.querySelectorAll('[role="tab"]')].every((el) => {
                const box = el.getBoundingClientRect();
                const gap = parseFloat(getComputedStyle(el.closest('.tabbar')).gap) || 0;
                const midY = box.top + box.height / 2;
                const reach = (x) =>
                  document.elementFromPoint(x, midY)?.closest('[role="tab"]') === el;
                const prev = el.previousElementSibling?.getAttribute('role') === 'tab';
                const next = el.nextElementSibling?.getAttribute('role') === 'tab';
                return (
                  box.height >= 40 &&
                  box.width + gap >= 48 &&
                  box.right <= r.right &&
                  box.left >= r.left &&
                  (!prev || reach(box.left - 6)) &&
                  (!next || reach(box.right + 6))
                );
              }),
          };
        });
        assert.deepEqual(
          fit,
          { overflow: false, launch: true, targets: true },
          name + ' ' + viewport.width,
        );
      }
      await tab('下载模组').click();
      await settle();
      await page.locator('#catalog-search').waitFor();
      await screenshot(`mod-browser-${viewport.width}x${viewport.height}.png`);
    }
    await page.goto(base + '/preview.html?page=mods&tab=browse');
    await page.frameLocator('iframe').locator('#catalog-search').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: mod catalog search/filter/compatibility; recursive dependency download, pause, cancel and installation; update preserves enabled state; dependency enable/disable and delete guards; packs apply/export/import/missing entries; JSON validation; all 3 tabs fit 6 phone sizes; no JS errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
