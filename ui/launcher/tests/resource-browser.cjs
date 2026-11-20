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
      viewport: { width: 740, height: 430 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const state = {
        protocol: 1,
        ready: true,
        runtime: true,
        terraria: '1.4.4.9',
        terrariaSource: 'gog',
        tml: 'v2026.10.1.0',
        installedVersions: [
          { id: 'legacy', version: 'v2026.10.1.0', active: true, available: true },
        ],
        busy: false,
        error: null,
        retry: false,
        message: '已就绪',
        operation: 'state',
        progress: 100,
        mods: [],
        patches: [],
        packs: [
          { name: '冒险清单', mods: ['Adventure'] },
          { name: '大型生存整合清单', mods: ['Adventure', 'Survival', 'Map'] },
        ],
        preferences: { theme: 'light', motion: false },
        appVersion: '0.1.12',
      };
      const release = (id, tag, name, preview = false) => ({
        id,
        tag,
        name,
        preview,
        size: 104857600,
      });
      const first = [
        release('400', 'v2026.11.1.0', '2026.11 预览版', true),
        release('300', 'v2026.10.1.0', '2026.10 稳定版'),
      ];
      const second = [
        first[1],
        release('200', 'v2026.9.3.1', '2026.9 稳定版'),
        release('100', 'v2025.12.3.0', '较早的稳定版本与较长的发行名称'),
      ];
      window.resourceCalls = [];
      window.resourceFixture = state;
      const send = (message) =>
        window.LauncherNative.onmessage?.({ data: JSON.stringify(message) });
      window.LauncherNative = {
        onmessage: null,
        postMessage(text) {
          const { id, method, params = {} } = JSON.parse(text);
          window.resourceCalls.push({ method, params });
          let data = true;
          let error;
          if (method === 'state' || method === 'refresh') data = state;
          else if (method === 'store.status')
            data = { steam: { phase: 'signedOut' }, gog: { phase: 'signedOut' } };
          else if (method === 'releases') {
            if (window.failReleases) error = '网络中断，无法读取版本';
            else
              data = { releases: params.page === 1 ? first : second, hasMore: params.page === 1 };
          } else if (method === 'workshop.details') {
            if (window.failWorkshop) error = '该工坊项目不可用';
            else
              data = {
                title: '真实协议测试模组',
                description: '工坊详情显示为文本。\n[测试说明] 支持公开下载。',
                file_url: window.noWorkshopFile ? '' : 'https://example.invalid/workshop.tmod',
              };
          } else if (method === 'workshop.download' || method === 'download') {
            Object.assign(state, {
              busy: true,
              error: null,
              operation: method,
              message: '正在下载资源',
              progress: 35,
            });
            send({ event: 'snapshot', data: state });
            window.finishResourceDownload = () => {
              Object.assign(state, { busy: false, message: '安装完成', progress: 100 });
              send({ event: 'snapshot', data: state });
              send({ id, ok: true, data: true });
              window.finishResourceDownload = null;
            };
            return;
          } else if (method === 'packs.save') {
            state.packs.push({ name: params.name, mods: ['Adventure'] });
          } else if (method === 'packs.delete') {
            state.packs = state.packs.filter((pack) => pack.name !== params.name);
          } else if (method === 'files.roots') {
            data = {
              granted: false,
              roots: [{ id: 'launcher', label: '启动器文件', path: '/launcher' }],
              restricted: '',
            };
          } else if (method === 'files.list') {
            data = { entries: [], total: 0, hasMore: false };
          } else if (method === 'files.export') {
            data = { name: params.name, path: '/launcher/' + params.name };
          }
          setTimeout(() => {
            send({ event: 'snapshot', data: state });
            send({ id, ok: !error, data, error });
          }, 5);
        },
      };
    });
    const capture = async (name) => {
      if (!process.env.LAUNCHER_CAPTURE) return;
      const directory = path.resolve(__dirname, '../../../build/ui-previews');
      fs.mkdirSync(directory, { recursive: true });
      await page.locator('.page-scroll').evaluate((node) => {
        node.scrollTop = 0;
      });
      await page.screenshot({
        path: path.join(directory, name + '.png'),
        animations: 'disabled',
        style: '#toast { visibility: hidden !important; }',
      });
    };
    const category = (name) => page.locator(`[data-resource-page="resource-${name}"]`);
    const cards = page.locator('.release-row');
    const filter = page.locator('.resource-browser-filters');
    const openFilters = async () => {
      if (!(await filter.getAttribute('open')) && !(await filter.evaluate((node) => node.open)))
        await filter.locator('summary').click();
    };
    const callCount = (method) =>
      page.evaluate(
        (name) => window.resourceCalls.filter((call) => call.method === name).length,
        method,
      );
    await page.goto(base + '/#games/resource-versions');
    await cards.nth(1).waitFor();
    await page.getByRole('searchbox', { name: '搜索游戏版本', exact: true }).waitFor();
    assert.equal(await category('versions').getAttribute('aria-current'), 'page');
    await page.getByRole('button', { name: '稳定版', exact: true }).click();
    assert.equal(await cards.count(), 1);
    await page.getByRole('button', { name: '预览版', exact: true }).click();
    assert.equal(await cards.count(), 1);
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索游戏版本', exact: true }).fill('不匹配');
    await page.getByText('没有匹配的版本', { exact: true }).waitFor();
    await page.getByRole('button', { name: '重置筛选', exact: true }).first().click();
    await page.evaluate(() => {
      window.failReleases = true;
    });
    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await page.getByRole('alert').getByText('网络中断，无法读取版本', { exact: true }).waitFor();
    assert.equal(await cards.count(), 2, 'paging errors keep loaded releases');
    await page.evaluate(() => {
      window.failReleases = false;
    });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await cards.nth(3).waitFor();
    assert.equal(await cards.count(), 4, 'overlapping pages are deduplicated');
    assert.equal(await page.getByRole('button', { name: '加载更多', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: '排序方式', exact: true }).click();
    await page.getByRole('option', { name: '发行较早优先', exact: true }).click();
    assert.ok((await cards.first().innerText()).includes('较早的稳定版本'));
    await page.evaluate(() => {
      window.failReleases = true;
    });
    await page.getByRole('button', { name: '刷新版本列表', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await cards.count(), 4, 'refresh errors retain current results');
    await page.evaluate(() => {
      window.failReleases = false;
    });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.release-row').length === 2);
    assert.deepEqual(
      await page.evaluate(() =>
        window.resourceCalls
          .filter((call) => call.method === 'releases')
          .map((call) => call.params.page),
      ),
      [1, 2, 2, 1, 1],
    );
    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await cards.nth(3).waitFor();
    await page.getByRole('button', { name: '重置筛选', exact: true }).click();

    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [480, 800],
      [640, 360],
      [740, 430],
      [759, 430],
      [760, 430],
      [800, 360],
      [932, 430],
      [1200, 650],
    ]) {
      await page.setViewportSize({ width, height });
      await openFilters();
      const search = page.getByRole('searchbox', { name: '搜索游戏版本', exact: true });
      await search.scrollIntoViewIfNeeded();
      assert.ok(await search.isVisible(), `${width}: filters remain reachable across breakpoint`);
      for (const selector of [
        '.main',
        '.page-content',
        '.resource-browser',
        '.resource-browser-filters',
        '.resource-browser-results',
      ]) {
        assert.ok(
          await page.locator(selector).evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          `${width}: ${selector} has no horizontal overflow`,
        );
      }
      const download = cards.first().getByRole('button', { name: '下载', exact: true });
      await download.scrollIntoViewIfNeeded();
      const rect = await download.boundingBox();
      assert.ok(
        rect &&
          rect.height >= 44 &&
          rect.x >= 0 &&
          rect.x + rect.width <= width + 1 &&
          rect.y >= 0 &&
          rect.y + rect.height <= height + 1,
        `${width}: download target is reachable and at least 44px`,
      );
      await capture(`resource-versions-light-${width}x${height}`);
      if (width === 390) {
        await filter.locator('summary').click();
        assert.equal(await filter.evaluate((node) => node.open), false);
        await capture('resource-versions-portrait-collapsed');
      }
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await capture('resource-versions-dark-landscape');
    await page.getByRole('button', { name: '管理已安装版本', exact: true }).click();
    const manager = page.getByRole('dialog', { name: '已安装版本', exact: true });
    await manager.getByText('v2026.10.1.0', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await cards.first().getByRole('button', { name: '下载', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await callCount('download'), 0, 'cancel never starts an installation');

    await category('mods').click();
    await page.getByRole('searchbox', { name: '搜索创意工坊', exact: true }).fill('灾厄 & 地图');
    await page.getByRole('button', { name: '浏览创意工坊', exact: true }).click();
    await page.waitForFunction(() =>
      window.resourceCalls.some((call) => call.method === 'openExternal'),
    );
    const external = await page.evaluate(
      () => window.resourceCalls.find((call) => call.method === 'openExternal').params.url,
    );
    assert.equal(new URL(external).searchParams.get('searchtext'), '灾厄 & 地图');
    const project = page.getByRole('textbox', { name: '创意工坊项目编号', exact: true });
    await project.fill('abc');
    assert.ok(await page.getByRole('button', { name: '查询模组', exact: true }).isDisabled());
    await project.fill('12345');
    await page.evaluate(() => {
      window.failWorkshop = true;
    });
    await page.getByRole('button', { name: '查询模组', exact: true }).click();
    await page.getByRole('alert').getByText('该工坊项目不可用', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.failWorkshop = false;
      window.noWorkshopFile = true;
    });
    await page.getByRole('button', { name: '查询模组', exact: true }).click();
    await page.getByRole('heading', { name: '真实协议测试模组', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: '下载并安装', exact: true }).isDisabled());
    await page.evaluate(() => {
      window.noWorkshopFile = false;
    });
    await page.getByRole('button', { name: '查询模组', exact: true }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector('.resource-workshop-card .resource-pack-actions button:last-child')
          .disabled,
    );
    await project.fill('99999');
    await capture('resource-mods-dark-landscape');
    await page.getByRole('button', { name: '下载并安装', exact: true }).click();
    const windowDialog = page.getByRole('dialog', { name: '下载与安装', exact: true });
    await windowDialog.waitFor();
    assert.ok(page.url().endsWith('/resource-mods'), 'download opens a foreground window');
    await page.waitForFunction(() => typeof window.finishResourceDownload === 'function');
    assert.equal(
      await page.evaluate(
        () => window.resourceCalls.find((call) => call.method === 'workshop.download').params.id,
      ),
      '12345',
      'download uses the queried item, not edited input',
    );
    await windowDialog.getByRole('button', { name: '最小化', exact: true }).last().click();
    await page.locator('.topbar [data-action="tasks"]').click();
    await page.waitForURL('**/downloads');
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.waitForURL('**/resource-mods');
    await page.evaluate(() => window.finishResourceDownload());
    await page.waitForFunction(() =>
      document.querySelector('#toast')?.textContent.includes('已下载'),
    );
    assert.equal(await page.getByRole('dialog').count(), 0, 'background completion keeps focus');
    await page.locator('.topbar [data-action="tasks"]').click();
    await page.getByRole('button', { name: '查看已安装资源', exact: true }).click();
    await page.waitForURL('**/#mods');
    assert.equal(await page.getByRole('tab', { name: '下载模组', exact: true }).count(), 0);
    await page.getByRole('button', { name: '添加模组', exact: true }).click();
    await page.getByRole('button', { name: '下载模组', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索创意工坊', exact: true }).waitFor();
    await page.getByRole('button', { name: '打开下载任务', exact: true }).click();
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.locator('.main-nav [data-page="games"]').click();
    await page.getByRole('tab', { name: '添加游戏', exact: true }).click();
    await page.getByRole('button', { name: '下载版本', exact: true }).click();
    await category('packs').click();
    assert.equal(await page.locator('.resource-pack-card').count(), 2);
    await page.getByRole('searchbox', { name: '搜索模组包', exact: true }).fill('没有');
    await page.getByText('没有匹配的模组包', { exact: true }).waitFor();
    await page.getByRole('button', { name: '重置筛选', exact: true }).first().click();
    await page.getByRole('combobox', { name: '模组包排序', exact: true }).click();
    await page.getByRole('option', { name: '模组数量', exact: true }).click();
    assert.ok(
      (await page.locator('.resource-pack-card').first().innerText()).includes('大型生存整合清单'),
    );
    await page.getByRole('textbox', { name: '模组包名称', exact: true }).fill('新的清单');
    await page.getByRole('button', { name: '保存模组包', exact: true }).click();
    const pack = page.locator('.resource-pack-card').filter({ hasText: '新的清单' });
    await pack.waitFor();
    await pack.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await callCount('packs.apply'), 0);
    await pack.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '应用', exact: true }).click();
    await page.waitForFunction(() =>
      window.resourceCalls.some((call) => call.method === 'packs.apply'),
    );
    await pack.getByRole('button', { name: '导出', exact: true }).click();
    const save = page.getByRole('dialog', { name: '保存文件', exact: true });
    await save.getByRole('button', { name: '保存到此目录', exact: true }).click();
    await save.waitFor({ state: 'hidden' });
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(window.resourceCalls.find((call) => call.method === 'files.export').params.text),
      ),
      ['Adventure'],
    );
    await pack.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await callCount('packs.delete'), 0);
    await pack.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除清单', exact: true }).click();
    await pack.waitFor({ state: 'detached' });
    await capture('resource-packs-dark-landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await openFilters();
    await page.getByRole('textbox', { name: '模组包名称', exact: true }).scrollIntoViewIfNeeded();
    await capture('resource-packs-portrait-filters');
    await page.evaluate(() => window.dispatchEvent(new Event('launcher:back')));
    await page.waitForURL('**/#games');
    await page.goto(base + '/?tab=browse#mods');
    await page.waitForURL((url) => url.hash === '#mods/resource-mods');
    await openFilters();
    await page.getByRole('searchbox', { name: '搜索创意工坊', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await page.waitForURL((url) => url.hash === '#mods');
    assert.equal(
      await page.getByRole('tab').count(),
      2,
      'legacy browse link returns to two local-management tabs',
    );
    assert.equal(await page.getByRole('button', { name: '添加模组', exact: true }).count(), 1);
    assert.equal(
      await page.locator('.resource-browser').count(),
      0,
      'Workshop has one dedicated workspace',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: resource categories; channel/search/sort/empty states; paging dedupe and failed/retried refresh; ten responsive sizes and filter access; Workshop search/details/download window and task Back; mod-pack save/apply/export/delete. Native bridge fixtures do not establish real network downloads or device gameplay.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
