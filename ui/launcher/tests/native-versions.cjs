const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8771';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 932, height: 430 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const versions = [
        { id: 'legacy', version: 'v2026.10.1.0', active: true, available: true },
        { id: 'second', version: 'v2026.9.3.1', active: false, available: true },
        { id: 'damaged', version: 'v2025.1.0.0', active: false, available: false },
      ];
      const state = {
        protocol: 1,
        busy: false,
        message: '已就绪',
        progress: 100,
        error: null,
        retry: false,
        operation: 'state',
        ready: true,
        runtime: true,
        terraria: '1.4.4.9',
        terrariaSource: 'gog',
        tml: versions[0].version,
        installedVersions: versions,
        mods: [],
        packs: [],
        patches: [],
        preferences: { theme: 'dark', motion: false },
        appVersion: '0.1.12',
      };
      const send = (message) =>
        window.LauncherNative.onmessage?.({ data: JSON.stringify(message) });
      window.versionState = state;
      window.versionCalls = [];
      window.LauncherNative = {
        onmessage: null,
        postMessage(text) {
          const { id, method, params } = JSON.parse(text);
          window.versionCalls.push({ method, params });
          let data = true;
          if (method === 'state' || method === 'refresh') data = state;
          if (method === 'store.status')
            data = { steam: { phase: 'signedOut' }, gog: { phase: 'signedOut' } };
          if (method === 'settings.save')
            state.preferences = { ...state.preferences, ...params.preferences };
          const finish = () => {
            const error = window.versionFailure;
            if (!error && method === 'versions.select') {
              state.installedVersions.forEach((version) => {
                version.active = version.id === params.id;
              });
            }
            if (!error && method === 'versions.uninstall') {
              const wasActive = state.installedVersions.find(
                (version) => version.id === params.id,
              ).active;
              state.installedVersions = state.installedVersions.filter(
                (version) => version.id !== params.id,
              );
              if (wasActive) {
                const next = state.installedVersions.find((version) => version.available);
                if (next) next.active = true;
              }
            }
            state.tml = state.installedVersions.find((version) => version.active)?.version || null;
            Object.assign(state, { busy: false, ready: !!state.tml, error: error || null });
            send({ event: 'snapshot', data: state });
            send({ id, ok: !error, data, error });
            window.finishVersionOperation = null;
          };
          if (method.startsWith('versions.')) {
            Object.assign(state, { busy: true, operation: method });
            send({ event: 'snapshot', data: state });
            window.finishVersionOperation = finish;
            if (!window.deferVersionOperation) setTimeout(finish, 5);
          } else setTimeout(() => send({ id, ok: true, data }), 5);
        },
      };
    });
    await page.goto(base);
    const picker = page.locator('.instance-picker');
    await picker.getByText('v2026.10.1.0', { exact: true }).waitFor();
    await picker.click();
    const dialog = page.getByRole('dialog', { name: '已安装版本', exact: true });
    const row = (id) => dialog.locator(`[data-version-id="${id}"]`);
    assert.equal(await dialog.locator('.version-item').count(), 3);
    assert.ok(
      await row('legacy').getByRole('button', { name: '已选为启动版本', exact: true }).isDisabled(),
    );
    assert.ok(
      await row('damaged').getByRole('button', { name: '设为启动版本', exact: true }).isDisabled(),
    );
    await row('second').getByRole('button', { name: '设为启动版本', exact: true }).click();
    await row('second').getByRole('button', { name: '已选为启动版本', exact: true }).waitFor();
    assert.ok((await picker.textContent()).includes('v2026.9.3.1'));
    assert.equal(
      await dialog.locator('.version-item').count(),
      3,
      'selection does not delete releases',
    );

    await page.evaluate(() => {
      window.versionFailure = '游戏正在运行，请关闭游戏后切换版本';
    });
    await row('legacy').getByRole('button', { name: '设为启动版本', exact: true }).click();
    await dialog
      .getByRole('alert')
      .getByText('游戏正在运行，请关闭游戏后切换版本', { exact: true })
      .waitFor();
    assert.ok((await picker.textContent()).includes('v2026.9.3.1'));
    await page.evaluate(() => {
      window.versionFailure = null;
      window.deferVersionOperation = true;
    });
    await row('legacy').getByRole('button', { name: '设为启动版本', exact: true }).click();
    await page.waitForFunction(() => typeof window.finishVersionOperation === 'function');
    assert.equal(await dialog.locator('.version-actions button:not(:disabled)').count(), 0);
    await page.evaluate(() => {
      window.finishVersionOperation();
      window.deferVersionOperation = false;
    });
    await row('legacy').getByRole('button', { name: '已选为启动版本', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('alert').count(), 0);

    const uninstallCount = () =>
      page.evaluate(
        () => window.versionCalls.filter((call) => call.method === 'versions.uninstall').length,
      );
    const before = await uninstallCount();
    await row('second').getByRole('button', { name: '卸载', exact: true }).click();
    await row('second').getByRole('group', { name: '确认卸载 v2026.9.3.1', exact: true }).waitFor();
    await row('second').getByRole('button', { name: '取消卸载', exact: true }).click();
    assert.equal(await uninstallCount(), before, 'cancel never sends an uninstall request');
    await row('damaged').getByRole('button', { name: '卸载', exact: true }).click();
    await page.evaluate(() => {
      window.versionFailure = '无法写入版本清单：存储空间不足';
    });
    await row('damaged').getByRole('button', { name: '确认卸载', exact: true }).click();
    await dialog
      .getByRole('alert')
      .getByText('无法写入版本清单：存储空间不足', { exact: true })
      .waitFor();
    assert.equal(await row('damaged').count(), 1, 'failed uninstall remains visible for retry');
    await page.evaluate(() => {
      window.versionFailure = null;
    });
    await row('damaged').getByRole('button', { name: '确认卸载', exact: true }).click();
    await row('damaged').waitFor({ state: 'detached' });
    assert.ok(
      (await picker.textContent()).includes('v2026.10.1.0'),
      'removing an inactive version keeps selection',
    );

    for (const [width, height] of [
      [360, 800],
      [390, 844],
      [430, 932],
      [800, 360],
      [844, 390],
      [932, 430],
    ]) {
      await page.setViewportSize({ width, height });
      await row('legacy').getByRole('button', { name: '卸载', exact: true }).click();
      const confirm = row('legacy').getByRole('button', { name: '确认卸载', exact: true });
      await confirm.scrollIntoViewIfNeeded();
      const dimensions = await dialog.evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
      assert.ok(
        dimensions.scroll <= dimensions.client + 1,
        `${width}x${height}: no horizontal overflow`,
      );
      const rect = await confirm.boundingBox();
      assert.ok(
        rect &&
          rect.height >= 44 &&
          rect.x >= 0 &&
          rect.x + rect.width <= width + 1 &&
          rect.y >= 0 &&
          rect.y + rect.height <= height + 1,
        `${width}x${height}: uninstall confirmation is reachable`,
      );
      if (process.env.LAUNCHER_CAPTURE) {
        const dir = path.resolve(__dirname, '../../../build/ui-previews');
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: path.join(dir, `versions-${width}x${height}.png`),
          animations: 'disabled',
        });
      }
      await row('legacy').getByRole('button', { name: '取消卸载', exact: true }).click();
    }
    await row('legacy').getByRole('button', { name: '卸载', exact: true }).click();
    await row('legacy').getByRole('button', { name: '确认卸载', exact: true }).click();
    await row('legacy').waitFor({ state: 'detached' });
    await row('second').getByText('当前版本', { exact: true }).waitFor();
    assert.ok(
      (await picker.textContent()).includes('v2026.9.3.1'),
      'removing current version selects a remaining release',
    );
    await page.keyboard.press('Escape');
    await page.locator('.main-nav [data-page="games"]').click();
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['已安装', '添加游戏']);
    assert.equal(
      await page.locator('#screen-action button').count(),
      0,
      'game header does not duplicate import actions',
    );
    assert.equal(
      await page.locator('.dock-account').count(),
      0,
      'game page omits the duplicate account shortcut',
    );
    assert.equal(await page.locator('.native-versions').count(), 1, 'one inline version manager');
    assert.equal(await page.getByRole('button', { name: '管理版本', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '导入 ZIP', exact: true }).count(), 0);
    await page.evaluate(() => {
      window.versionState.terraria = null;
      window.versionState.ready = false;
      window.LauncherNative.onmessage({
        data: JSON.stringify({ event: 'snapshot', data: window.versionState }),
      });
    });
    await page
      .getByLabel('Terraria 资源状态', { exact: true })
      .getByText('待准备', { exact: true })
      .waitFor();
    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [480, 800],
      [640, 360],
      [800, 360],
      [932, 430],
    ]) {
      await page.setViewportSize({ width, height });
      for (const tab of ['已安装', '添加游戏']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        if (tab === '添加游戏')
          await page.locator('.native-versions').waitFor({ state: 'detached' });
        else await page.locator('.native-versions').waitFor();
        assert.ok(
          await page
            .locator('.native-games-workspace')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          `${width}: ${tab} fits the game workspace`,
        );
        assert.ok(
          await page.locator('.main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          `${width}: no main-page overflow`,
        );
        if (tab === '添加游戏') {
          assert.equal(
            await page.locator('.native-versions').count(),
            0,
            'acquisition does not repeat installed versions',
          );
          assert.equal(
            await page.getByRole('button', { name: '导入资源', exact: true }).count(),
            1,
          );
          assert.equal(
            await page.getByRole('button', { name: '导入 ZIP', exact: true }).count(),
            1,
          );
          assert.equal(
            await page.getByRole('button', { name: '下载版本', exact: true }).count(),
            1,
          );
          for (const action of await page.locator('.native-acquire-action').all()) {
            await action.scrollIntoViewIfNeeded();
            const rect = await action.boundingBox();
            assert.ok(
              rect &&
                rect.height >= 44 &&
                rect.x >= 0 &&
                rect.x + rect.width <= width + 1 &&
                rect.y >= 0 &&
                rect.y + rect.height <= height + 1,
              `${width}: acquisition action is reachable`,
            );
          }
        }
        if (process.env.LAUNCHER_CAPTURE && [390, 932].includes(width)) {
          const directory = path.resolve(__dirname, '../../../build/ui-previews');
          fs.mkdirSync(directory, { recursive: true });
          for (const theme of ['light', 'dark']) {
            await page.evaluate((theme) => {
              document.documentElement.dataset.theme = theme;
              document.querySelector('.page-scroll').scrollTop = 0;
            }, theme);
            await page.screenshot({
              path: path.join(
                directory,
                `games-cleanup-${tab === '已安装' ? 'installed' : 'add'}-${theme}-${width}.png`,
              ),
              animations: 'disabled',
              style: '#toast { visibility: hidden !important; }',
            });
          }
        }
      }
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await page.getByRole('tab', { name: '已安装', exact: true }).click();
    const manager = page.getByLabel('tML 版本管理', { exact: true });
    await manager.locator('.version-item').waitFor();
    await manager.getByRole('button', { name: '卸载', exact: true }).click();
    await manager.getByRole('button', { name: '确认卸载', exact: true }).click();
    await manager.getByText('尚未安装 tModLoader', { exact: true }).waitFor();
    await page.waitForFunction(
      () => !window.versionState.ready && window.versionState.tml === null,
    );
    assert.equal(await page.locator('.launch-button').getAttribute('data-action'), 'prepare');
    assert.ok((await picker.textContent()).includes('选择版本'));
    await picker.click();
    await dialog.getByText('尚未安装 tModLoader', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '下载版本', exact: true }).waitFor();
    await dialog.getByRole('button', { name: '导入 ZIP', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: native version selection and launch-label updates; unavailable releases; mutation guards; cancel/failed/retried uninstall; inactive/current/last release removal; game-page manager; six phone viewports. Bridge fixtures do not establish real-device gameplay.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
