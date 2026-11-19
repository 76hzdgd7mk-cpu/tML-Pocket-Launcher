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
      reducedMotion: 'reduce',
    });
    const errors = [];
    const capture = async (name) => {
      if (!process.env.LAUNCHER_CAPTURE) return;
      const dir = path.resolve(__dirname, '../../../build/ui-previews');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, name + '.png'),
        style: '#toast { visibility: hidden !important; }',
      });
    };
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const state = {
        protocol: 1,
        ready: true,
        runtime: true,
        terraria: 'Imported Terraria resources',
        terrariaSource: 'steam',
        tml: 'v2026.10.1.0',
        busy: false,
        error: null,
        retry: false,
        message: '操作完成',
        operation: 'state',
        progress: 100,
        mods: [
          {
            id: 'ActualMod',
            title: '设备模组',
            version: '1.2',
            loaderVersion: '2026.10.1.0',
            author: '实际作者',
            description: '',
            deps: [],
            side: 0,
            size: 1048576,
            enabled: false,
          },
        ],
        packs: [],
        patches: [
          {
            id: 'mobile-touch',
            name: 'MobileJoystick 触摸适配',
            description: '原生多点触摸',
            version: '1.0.14',
            builtin: true,
            required: true,
            enabled: true,
            targetVersion: '',
            launchArguments: [],
          },
          {
            id: 'mobile-fps',
            name: '帧率显示',
            description: '实际呈现 FPS',
            version: '1.0.0',
            builtin: true,
            required: false,
            enabled: false,
            targetVersion: '',
            launchArguments: [],
          },
        ],
        preferences: { orientation: 'landscape', theme: 'dark', renderScale: 100 },
        renderers: [
          {
            identity: 'native',
            packageName: '',
            packageVersion: '',
            rendererId: 'native',
            displayName: '系统原生 OpenGL ES 3',
            description: '',
            backend: 'native',
          },
          {
            identity: 'dev.example.renderer:gl4es',
            packageName: 'dev.example.renderer',
            packageVersion: '1.2',
            rendererId: 'gl4es',
            displayName: 'GL4ES',
            description: '',
            backend: 'gl4es',
          },
        ],
        appVersion: '0.1.0',
      };
      state.mods.push({
        id: 'MobileJoystick',
        title: 'MobileJoystick',
        version: '0.1.4',
        loaderVersion: '2026.9.3.1',
        author: 'yu',
        description: '',
        deps: [],
        side: 1,
        size: 1145553,
        enabled: true,
        builtin: true,
      });
      window.nativeCalls = [];
      window.nativeFixture = state;
      const stores = {
        steam: { phase: 'signedOut', account: '', message: '尚未登录', owned: false },
        gog: { phase: 'signedOut', account: '', message: '尚未登录', owned: false },
      };
      window.nativeStores = stores;
      const send = (message) =>
        window.LauncherNative.onmessage?.({ data: JSON.stringify(message) });
      window.LauncherNative = {
        onmessage: null,
        postMessage(text) {
          const { id, method, params } = JSON.parse(text);
          window.nativeCalls.push({ method, params });
          let data = true;
          let error;
          if (method === 'state' || method === 'refresh') data = state;
          else if (method === 'files.roots')
            data = {
              granted: !!window.nativeStorageGranted,
              roots: [
                { id: 'launcher', label: '启动器文件', path: '/public/launcher' },
                ...(window.nativeStorageGranted
                  ? [{ id: 'storage', label: '内部存储', path: '/storage/emulated/0' }]
                  : []),
              ],
              restricted:
                'Android/data 与 Android/obb 受系统保护，请将文件放到 Download 或 Documents。',
            };
          else if (method === 'files.permission') {
            // The first permission round-trip is denied; shared storage must stay hidden.
            setTimeout(() => window.dispatchEvent(new Event('launcher:files-resume')), 20);
          } else if (method === 'files.list') {
            const names =
              params.kind === 'terraria-gog'
                ? ['Terraria.sh']
                : params.kind === 'mod'
                  ? ['First.tmod', 'Second.tmod']
                  : params.kind === 'image'
                    ? ['forest.png']
                    : params.kind === 'pack'
                      ? ['enabled.json']
                      : params.kind === 'export'
                        ? ['existing.json']
                        : params.kind === 'tml'
                          ? ['tModLoader.zip']
                          : ['Terraria.zip'];
            const entries = [
              ...(params.path
                ? []
                : [{ name: 'packages', path: 'packages', directory: true, size: 0, modified: 0 }]),
              ...names.map((name) => ({
                name,
                path: [params.path, name].filter(Boolean).join('/'),
                directory: false,
                size: 1048576,
                modified: 1700000000000,
              })),
            ].filter((file) =>
              file.name.toLowerCase().includes((params.query || '').toLowerCase()),
            );
            data = { entries, total: entries.length, hasMore: false };
          } else if (method === 'files.export') {
            if (params.name === 'existing.json') error = '同名文件已存在，请更换名称';
            else data = { name: params.name, path: '/public/launcher/' + params.name };
          } else if (method === 'files.image') {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 16;
            data = { data: canvas.toDataURL('image/png') };
          } else if (method === 'store.status') data = stores;
          else if (method === 'store.steam.details') {
            if (window.steamDetailsFailure) error = 'Steam 商店暂时不可用';
            else
              data = {
                appId: 105600,
                name: 'Terraria',
                description: 'Steam 官方简介：挖掘、战斗、探索、建造。',
                developers: ['Re-Logic'],
                publishers: ['Re-Logic'],
                genres: ['冒险', '独立'],
                releaseDate: '2011 年 5 月 16 日',
                headerImage: '',
                storeUrl: 'https://store.steampowered.com/app/105600/',
                cached: !!window.steamDetailsStale,
                stale: !!window.steamDetailsStale,
                fetchedAt: Date.now(),
              };
          } else if (method === 'store.steam.login') {
            stores.steam = {
              phase: 'email',
              account: '',
              message: '请输入 Steam 发到邮箱的验证码',
              owned: false,
            };
          } else if (method === 'store.steam.guard') {
            stores.steam = {
              phase: 'ready',
              account: 'FixtureSteam',
              message: '已拥有 Terraria，可以下载资源',
              owned: true,
            };
          } else if (method === 'store.steam.reconnect') {
            stores.steam = {
              phase: 'ready',
              account: 'FixtureSteam',
              message: '已拥有 Terraria，可以下载资源',
              owned: true,
            };
          } else if (method === 'store.steam.probe') {
            data = {
              reachable: true,
              message: 'Steam 连接可用 · TCP',
              attempts: [
                { route: 'WebSocket', ok: false, reason: '握手失败' },
                { route: 'TCP', ok: true },
              ],
            };
          } else if (method === 'store.gog.authorize') {
            stores.gog = {
              phase: 'ready',
              account: 'FixtureGog',
              message: '已拥有 Terraria，可以下载资源',
              owned: true,
            };
          } else if (method === 'store.gog.installers')
            data = [
              {
                id: 'linux-en',
                name: 'Terraria Linux',
                version: '1.4.4.9',
                language: 'en',
                size: 1048576,
              },
            ];
          else if (method === 'store.steam.logout')
            stores.steam = { phase: 'signedOut', account: '', message: '尚未登录', owned: false };
          else if (method === 'store.steam.download') {
            if (window.steamDownloadMode === 'deferred') {
              Object.assign(state, {
                busy: true,
                operation: method,
                progress: 23,
                message: 'Steam：下载资源 23/100 MB',
                error: null,
              });
              send({ event: 'snapshot', data: state });
              window.finishSteamDownload = (outcome = 'success') => {
                Object.assign(state, {
                  busy: false,
                  progress: outcome === 'success' ? 100 : -1,
                  error: outcome === 'cancel' ? '操作已取消' : null,
                  message: outcome === 'cancel' ? '操作已取消' : '操作完成',
                });
                send({ event: 'snapshot', data: state });
                send({ id, ok: outcome === 'success', data: true, error: state.error });
                window.finishSteamDownload = null;
              };
              return;
            }
            error = 'Steam 资源 SHA-1 校验失败';
          } else if (method === 'cancel' && window.finishSteamDownload)
            window.finishSteamDownload('cancel');
          else if (method === 'settings.save')
            state.preferences = { ...state.preferences, ...params.preferences };
          else if (method === 'patches.toggle')
            state.patches.find((patch) => patch.id === params.id).enabled = params.enabled;
          else if (method === 'mods.enable') state.mods[0].enabled = params.enabled;
          else if (method === 'releases')
            data = {
              hasMore: false,
              releases: [
                {
                  id: '456',
                  tag: 'v2026.10.1.0',
                  name: '官方稳定版',
                  preview: false,
                  size: 104857600,
                },
              ],
            };
          else if (method === 'download') error = 'SHA-256 校验失败，请重试';
          else if (method === 'logs') data = { text: '[dotnet] 实际启动日志' };
          else if (method === 'packs.save')
            state.packs.push({ name: params.name, mods: ['ActualMod'] });
          else if (method === 'import' && params.kind.startsWith('terraria-'))
            state.terrariaSource = params.kind === 'terraria-gog' ? 'gog' : 'steam';
          else if (method === 'launch') {
            if (
              state.terrariaSource !== 'gog' &&
              (stores.steam.phase !== 'ready' || !stores.steam.owned)
            )
              error = '请登录拥有 Terraria 的 Steam 账户并验证所有权';
            else state.message = '已请求启动 Android 游戏';
          }
          setTimeout(() => {
            send({ event: 'snapshot', data: state });
            send({ id, ok: !error, data, error });
          }, 5);
        },
      };
    });
    await page.goto(base);
    await page.getByText('v2026.10.1.0', { exact: true }).first().waitFor();
    assert.equal(await page.locator('#demo-toggle').count(), 0);
    assert.equal(await page.getByText(/示例稳定版本|示例资源包/).count(), 0);
    const nav = (id) => page.locator(`.main-nav [data-page="${id}"]`);
    const chooseFile = async (name) => {
      const browser = page.getByRole('dialog', { name: '选择文件', exact: true });
      await browser.locator('.file-entry').filter({ hasText: name }).click();
      await browser.getByRole('button', { name: '导入 1 个文件', exact: true }).click();
    };
    await nav('mods').click();
    await page.getByText('设备模组', { exact: false }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: '导入 .tmod', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '导入模组', exact: true }).count(), 1);
    await page.getByRole('button', { name: '导入模组', exact: true }).click();
    const modsBrowser = page.getByRole('dialog', { name: '选择文件', exact: true });
    await modsBrowser.locator('.file-entry').filter({ hasText: 'First.tmod' }).click();
    await modsBrowser.locator('.file-entry').filter({ hasText: 'Second.tmod' }).click();
    await modsBrowser.getByRole('button', { name: '导入 2 个文件', exact: true }).click();
    await modsBrowser.waitFor({ state: 'hidden' });
    assert.ok(
      await page.evaluate(() =>
        window.nativeCalls.some(
          (call) =>
            call.method === 'import' &&
            call.params.kind === 'mod' &&
            call.params.files.length === 2,
        ),
      ),
    );
    const countBeforeCancel = await page.evaluate(
      () => window.nativeCalls.filter((call) => call.method === 'import').length,
    );
    await page.getByRole('button', { name: '导入模组', exact: true }).click();
    await page
      .getByRole('dialog', { name: '选择文件', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => window.nativeCalls.filter((call) => call.method === 'import').length,
      ),
      countBeforeCancel,
    );
    assert.equal(
      await page.getByRole('switch', { name: '启用MobileJoystick', exact: true }).count(),
      0,
    );
    const builtInRow = page.locator('.native-mod-row').filter({ hasText: 'MobileJoystick' });
    assert.equal(await builtInRow.getByRole('button', { name: '删除', exact: true }).count(), 0);
    await builtInRow.getByText('内置触控', { exact: true }).waitFor();
    const modSearch = page.getByRole('searchbox', { name: '搜索已安装模组' });
    await modSearch.fill('nothing-matches');
    await page.getByText('没有匹配的模组', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await page.getByRole('button', { name: '已停用', exact: true }).click();
    assert.equal(await builtInRow.count(), 0);
    await page.getByRole('button', { name: '全部', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '全部停用', exact: true }).count(), 0);
    await page.getByRole('button', { name: '模组批量操作', exact: true }).click();
    await page.getByRole('button', { name: '全部停用', exact: true }).click();
    await page.waitForFunction(() =>
      window.nativeCalls.some((call) => call.method === 'mods.enable' && !call.params.enabled),
    );
    assert.ok(
      await page.evaluate(() =>
        window.nativeCalls
          .filter((call) => call.method === 'mods.enable')
          .every((call) => !call.params.ids.includes('MobileJoystick')),
      ),
    );
    for (const size of [
      { width: 932, height: 430 },
      { width: 800, height: 360 },
      { width: 640, height: 360 },
      { width: 480, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(size);
      const workspace = page.locator('.native-mods-workspace');
      assert.ok(
        await workspace.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        `mods workspace width at ${size.width}`,
      );
      const toolbar = await page.locator('.native-mod-tools').boundingBox();
      assert.ok(
        toolbar && toolbar.height <= (size.width >= 800 ? 48 : 100),
        `compact toolbar at ${size.width}: ${toolbar?.height}`,
      );
      const searchBox = await modSearch.boundingBox();
      assert.ok(searchBox && searchBox.height <= 44, `compact search at ${size.width}`);
      if (size.width === 932) await capture('mods-compact-landscape');
      if (size.width === 390) await capture('mods-compact-portrait');
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await nav('patches').click();
    await page.getByText('MobileJoystick 触摸适配', { exact: false }).waitFor();
    assert.equal(
      await page.getByRole('switch', { name: '启用MobileJoystick 触摸适配', exact: true }).count(),
      0,
    );
    await page.getByRole('tab', { name: /可选补丁/ }).click();
    await page.getByRole('switch', { name: '启用帧率显示', exact: true }).click();
    await page.waitForFunction(
      () => window.nativeFixture.patches.find((patch) => patch.id === 'mobile-fps').enabled,
    );
    assert.equal(await page.getByRole('button', { name: '移除', exact: true }).count(), 0);
    await nav('mods').click();
    await page.getByRole('switch', { name: '启用设备模组', exact: true }).click();
    await page.waitForFunction(() => window.nativeFixture.mods[0].enabled);
    await page.getByRole('tab', { name: /模组包/ }).click();
    await page.getByRole('textbox', { name: '模组包名称' }).fill('实际清单');
    await page.getByRole('button', { name: '保存模组包', exact: true }).click();
    await page.getByText('实际清单', { exact: true }).waitFor();
    await page.getByRole('button', { name: '导出', exact: true }).first().click();
    const saveDialog = page.getByRole('dialog', { name: '保存文件', exact: true });
    await saveDialog.getByLabel('导出文件名').fill('existing.json');
    await saveDialog.getByRole('button', { name: '保存到此目录', exact: true }).click();
    await saveDialog.getByRole('alert').filter({ hasText: '同名文件已存在' }).waitFor();
    await saveDialog.getByLabel('导出文件名').fill('my-mods.json');
    await saveDialog.getByRole('button', { name: '保存到此目录', exact: true }).click();
    await saveDialog.waitFor({ state: 'hidden' });
    await nav('games').click();
    await page
      .locator('.resource-actions')
      .getByRole('button', { name: '导入资源', exact: true })
      .click();
    await page.getByRole('button', { name: '选择 ZIP', exact: true }).click();
    const fileDialog = page.getByRole('dialog', { name: '选择文件', exact: true });
    await fileDialog.getByRole('button', { name: '授予文件访问权限', exact: true }).click();
    await page.waitForFunction(() =>
      window.nativeCalls.some((call) => call.method === 'files.permission'),
    );
    assert.equal(
      await fileDialog.getByRole('button', { name: '内部存储', exact: true }).count(),
      0,
    );
    await page.evaluate(() => {
      window.nativeStorageGranted = true;
      window.dispatchEvent(new Event('launcher:files-resume'));
    });
    await fileDialog.getByRole('combobox', { name: '存储位置', exact: true }).click();
    await page.getByRole('option', { name: '内部存储', exact: true }).click();
    await fileDialog.locator('.file-entry').filter({ hasText: 'packages' }).click();
    await fileDialog.getByRole('button', { name: '上一级目录', exact: true }).click();
    for (const size of [
      { width: 932, height: 430 },
      { width: 800, height: 360 },
      { width: 640, height: 360 },
      { width: 480, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(size);
      assert.ok(
        await fileDialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        `file browser width at ${size.width}`,
      );
      await fileDialog.getByRole('button', { name: '取消', exact: true }).scrollIntoViewIfNeeded();
      const box = await fileDialog.getByRole('button', { name: '取消', exact: true }).boundingBox();
      assert.ok(
        box && box.y >= 0 && box.y + box.height <= size.height + 1,
        `file browser confirmation at ${size.width}`,
      );
      const listBox = await fileDialog.locator('.file-list').boundingBox();
      assert.ok(
        listBox && listBox.height >= size.height * 0.5,
        `file list gets most space at ${size.width}: ${listBox?.height}`,
      );
      if (size.width === 932) await capture('file-browser-landscape');
      if (size.width === 390) await capture('file-browser-portrait');
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await fileDialog.getByLabel('搜索当前目录').fill('not-found');
    await fileDialog.locator('.file-empty').filter({ hasText: '当前目录中没有匹配项' }).waitFor();
    await fileDialog.getByLabel('搜索当前目录').fill('');
    await chooseFile('Terraria.zip');
    await page.getByRole('dialog', { name: 'Steam 资源已导入', exact: true }).waitFor();
    assert.ok(
      await page
        .getByText('启动前需要登录拥有 Terraria 的 Steam 账户。每次启动都会在线验证游戏所有权。')
        .count(),
    );
    await page.keyboard.press('Escape');
    await page.locator('.launch-button').click();
    await page.getByRole('dialog', { name: '暂时无法启动', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: '前往 Steam', exact: true }).count());
    await page.keyboard.press('Escape');
    await page
      .locator('.resource-actions')
      .getByRole('button', { name: '导入资源', exact: true })
      .click();
    await page.getByRole('button', { name: '选择 .sh', exact: true }).click();
    await chooseFile('Terraria.sh');
    await page.getByText('GOG · 无需登录验证', { exact: true }).waitFor();
    await page.locator('.launch-button').click();
    await page.waitForFunction(() => window.nativeFixture.message === '已请求启动 Android 游戏');
    await page.evaluate(() => window.dispatchEvent(new Event('launcher:game-returned')));
    await page.locator('.game-launch-screen').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      window.nativeFixture.terrariaSource = 'steam';
    });
    assert.ok(
      await page.evaluate(() =>
        window.nativeCalls.some(
          (call) => call.method === 'import' && call.params.kind === 'terraria-steam',
        ),
      ),
    );
    assert.ok(
      await page.evaluate(() =>
        window.nativeCalls.some(
          (call) => call.method === 'import' && call.params.kind === 'terraria-gog',
        ),
      ),
    );
    await page.getByRole('button', { name: '导入 ZIP', exact: true }).first().click();
    await chooseFile('tModLoader.zip');
    await page.waitForFunction(() => window.nativeCalls.some((call) => call.method === 'import'));
    await page.getByRole('button', { name: '下载版本', exact: true }).click();
    assert.equal(
      await page.locator('.drawer-footer').count(),
      0,
      'production drawers do not claim sample-only workflows',
    );
    await page.getByRole('button', { name: '下载', exact: true }).click();
    await page.getByRole('button', { name: '下载并安装', exact: true }).click();
    await page.getByRole('dialog', { name: '下载未完成', exact: true }).waitFor();
    assert.ok((await page.getByRole('dialog').innerText()).includes('SHA-256 校验失败'));
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '账户', exact: true }).click();
    await page.locator('.account-row').filter({ hasText: 'STEAM' }).getByRole('button').click();
    await page.waitForURL('**/#games/steam-login');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Steam uses a dedicated page');
    assert.equal(
      await page.locator('.game-dock').count(),
      0,
      'account pages use the available content space',
    );
    await page.getByLabel('Steam 账户名', { exact: true }).waitFor();
    await capture('steam-login-landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('steam-login-portrait');
    await page.setViewportSize({ width: 932, height: 430 });
    await page.getByLabel('Steam 账户名', { exact: true }).fill('FixtureSteam');
    await page.getByLabel('Steam 密码', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: '登录 Steam', exact: true }).click();
    await page.getByLabel('Steam Guard 验证码', { exact: true }).fill('ABCDE');
    await page.getByRole('button', { name: '提交验证码', exact: true }).click();
    await page.getByText('拥有 Terraria', { exact: true }).waitFor();
    await page.waitForURL('**/#games/steam-library');
    await page.getByText('Steam 官方简介：挖掘、战斗、探索、建造。', { exact: true }).waitFor();
    assert.equal(await page.getByText('Re-Logic', { exact: true }).count(), 2);
    await page.getByText('2011 年 5 月 16 日', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.steamDetailsStale = true;
    });
    await page.getByRole('button', { name: '刷新详情', exact: true }).click();
    await page.getByText('Steam 暂时不可用，显示已缓存的详情。', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.steamDetailsFailure = true;
    });
    await page.getByRole('button', { name: '刷新详情', exact: true }).click();
    await page.getByText('Steam 商店暂时不可用', { exact: true }).waitFor();
    assert.ok(
      await page.getByText('Steam 官方简介：挖掘、战斗、探索、建造。', { exact: true }).isVisible(),
    );
    await page.evaluate(() => {
      window.steamDetailsFailure = false;
      window.steamDetailsStale = false;
    });
    await page.getByRole('button', { name: '刷新详情', exact: true }).click();
    await capture('steam-library-landscape');
    assert.equal(await page.getByLabel('Steam 密码', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '下载 Terraria 资源', exact: true }).click();
    await page.waitForURL('**/#games/downloads');
    await page.waitForFunction(() =>
      window.nativeCalls.some((call) => call.method === 'store.steam.download'),
    );
    await page.getByRole('alert').filter({ hasText: 'Steam 资源 SHA-1 校验失败' }).waitFor();
    const statusCount = await page.evaluate(
      () => window.nativeCalls.filter((call) => call.method === 'store.status').length,
    );
    await page.waitForFunction(
      (count) => window.nativeCalls.filter((call) => call.method === 'store.status').length > count,
      statusCount,
    );
    assert.ok(
      await page.getByRole('alert').filter({ hasText: 'Steam 资源 SHA-1 校验失败' }).isVisible(),
    );
    await page.evaluate(() => {
      window.nativeStores.steam = {
        phase: 'disconnected',
        account: 'FixtureSteam',
        message: 'Steam 网络连接中断',
        owned: false,
        canReconnect: true,
        diagnostics: 'WebSocket：连接中断',
      };
    });
    await page.getByRole('button', { name: '恢复 Steam 连接', exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复 Steam 连接', exact: true }).click();
    assert.equal(await page.getByLabel('Steam 密码', { exact: true }).count(), 0);
    await page.getByText('Steam 连接诊断', { exact: true }).click();
    await page.getByText('WebSocket：连接中断', { exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复 Steam 连接', exact: true }).click();
    await page.getByText('拥有 Terraria', { exact: true }).waitFor();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.getByRole('button', { name: '登录 Steam', exact: true }).waitFor();
    await page.getByRole('button', { name: '测试 Steam 连接', exact: true }).click();
    await page.locator('.steam-diagnostics summary').click();
    await page.getByRole('status').filter({ hasText: 'Steam 连接可用 · TCP' }).waitFor();
    // Horizontal/vertical phones keep the form inside the content area; input
    // focus remains visible when the keyboard reduces viewport height.
    const sizes = [
      { width: 932, height: 430 },
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 480, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ];
    const fits = async () => {
      assert.ok(
        await page.evaluate(() => {
          const el = document.querySelector('#page-content');
          return (
            el.scrollWidth <= el.clientWidth + 1 &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
        'workspace fits without horizontal overflow',
      );
    };
    for (const size of sizes) {
      await page.setViewportSize(size);
      await fits();
    }
    await page.setViewportSize({ width: 390, height: 390 });
    await page.getByLabel('Steam 密码', { exact: true }).fill('keyboard-only-fixture');
    await page.getByLabel('Steam 密码', { exact: true }).focus();
    await page.getByLabel('Steam 密码', { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(
      await page.getByLabel('Steam 密码', { exact: true }).evaluate((input) => {
        const rect = input.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }),
    );
    await page.setViewportSize({ width: 932, height: 430 });
    // Restore without another password/Guard exchange, then exercise download
    // navigation, leaving an active task, cancellation and completion.
    await page.evaluate(() => {
      window.nativeStores.steam = {
        phase: 'ready',
        account: 'FixtureSteam',
        message: '已拥有 Terraria，可以下载资源',
        owned: true,
      };
      window.steamDownloadMode = 'deferred';
    });
    await page.waitForURL('**/#games/steam-library');
    for (const size of sizes) {
      await page.setViewportSize(size);
      await fits();
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await page.getByRole('button', { name: '下载 Terraria 资源', exact: true }).click();
    await page.waitForURL('**/#games/downloads');
    await page.waitForFunction(
      () => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '23',
    );
    await capture('steam-download-landscape');
    for (const size of sizes) {
      await page.setViewportSize(size);
      await fits();
    }
    await page.setViewportSize({ width: 932, height: 430 });
    await nav('mods').click();
    await page.locator('.topbar [data-action=tasks]').click();
    await page.waitForFunction(
      () => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === '23',
    );
    await page.getByRole('button', { name: '取消任务', exact: true }).click();
    await page.getByRole('heading', { name: '下载已取消', exact: true }).waitFor();
    await page.getByRole('button', { name: '重新下载', exact: true }).click();
    await page.waitForFunction(() => typeof window.finishSteamDownload === 'function');
    await page.evaluate(() => window.finishSteamDownload());
    await page.getByRole('heading', { name: '一切准备就绪', exact: true }).waitFor();
    await capture('steam-download-completed');
    assert.ok(page.url().endsWith('/downloads'), 'completion stays on the download result page');
    await page.evaluate(() => window.dispatchEvent(new Event('launcher:back')));
    await page.waitForFunction(() => !location.hash.includes('/'));
    await page.locator('.topbar [data-action=tasks]').click();
    await page.getByRole('heading', { name: '一切准备就绪', exact: true }).waitFor();
    await page.getByRole('button', { name: '查看已安装资源', exact: true }).click();
    await page.getByRole('tab', { name: '账户', exact: true }).click();
    await page.locator('.account-row').filter({ hasText: 'gog.com' }).getByRole('button').click();
    await page.getByRole('button', { name: '打开 GOG 官方登录', exact: true }).click();
    await page.getByRole('button', { name: '读取可下载版本', exact: true }).click();
    await page.getByLabel('Terraria Linux 资源版本', { exact: true }).selectOption('linux-en');
    await page.getByRole('button', { name: '下载 Terraria 资源', exact: true }).click();
    await page.waitForFunction(() =>
      window.nativeCalls.some(
        (call) => call.method === 'store.gog.download' && call.params.id === 'linux-en',
      ),
    );
    await page.keyboard.press('Escape');
    await nav('settings').click();
    await page.locator('#settings-tab-controls').click();
    await page.getByText('内置触控系统', { exact: true }).waitFor();
    assert.equal(await page.getByRole('slider', { name: '按键不透明度', exact: true }).count(), 0);
    await page.locator('#settings-tab-runtime').click();
    await page.getByRole('combobox', { name: '渲染器', exact: true }).click();
    await page.getByRole('option', { name: /GL4ES.*dev\.example\.renderer 1\.2/ }).click();
    await page.waitForFunction(
      () => window.nativeFixture.preferences.rendererPlugin === 'dev.example.renderer:gl4es',
    );
    assert.ok(
      await page.evaluate(() =>
        window.nativeCalls.some(
          (call) =>
            call.method === 'settings.save' &&
            call.params.preferences.rendererPlugin === 'dev.example.renderer:gl4es',
        ),
      ),
      'renderer selection is saved through the native settings bridge',
    );
    await page.getByRole('combobox', { name: '分辨率比例', exact: true }).click();
    await page.getByRole('option', { name: '75%', exact: true }).click();
    await page.waitForFunction(() => window.nativeFixture.preferences.renderScale === 75);
    await page.locator('#settings-tab-appearance').click();
    await page.getByRole('button', { name: '图片背景', exact: true }).click();
    const imageBrowser = page.getByRole('dialog', { name: '选择文件', exact: true });
    await imageBrowser.locator('.file-entry').filter({ hasText: 'forest.png' }).click();
    await imageBrowser.getByRole('button', { name: '使用此图片', exact: true }).click();
    await imageBrowser.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.nativeFixture.preferences.background === 'custom');
    assert.equal(
      await page.locator('#background-file').count(),
      0,
      'Android does not expose a web/system file chooser',
    );
    await page.locator('[data-theme-choice=light]').click();
    await page.waitForFunction(() => window.nativeFixture.preferences.theme === 'light');
    assert.equal(
      await page.evaluate(() => window.nativeFixture.preferences.renderScale),
      75,
      'UI appearance saves do not overwrite game settings',
    );
    await page.getByRole('combobox', { name: '启动器方向', exact: true }).click();
    await page.getByRole('option', { name: '竖屏', exact: true }).click();
    await page.waitForFunction(() => window.nativeFixture.preferences.orientation === 'portrait');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.launch-button').innerText(), '启动游戏');
    await page.locator('.launch-button').click();
    await page.waitForFunction(() => window.nativeCalls.some((call) => call.method === 'launch'));
    await page.evaluate(() => window.dispatchEvent(new Event('launcher:game-returned')));
    await page.locator('.game-launch-screen').waitFor({ state: 'hidden' });
    await nav('settings').click();
    await page.locator('#settings-tab-about').click();
    assert.equal(await page.locator('#demo-toggle').count(), 0);
    await page.getByRole('button', { name: '查看日志', exact: true }).click();
    await page.getByText('[dotnet] 实际启动日志', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: native bridge fixture; custom file browser at 6 phone sizes, denied/restored permissions, directories/search, mod multiselect, cancel, protected export naming, ZIP/SH imports and native background selection; dedicated Steam login/Guard/library/download navigation; keyboard viewport; progress survives navigation; download failure/cancel/retry/completion; Android Back; GOG versions; mods/packs/releases; settings and launch/logs. Fixture results do not establish real-device authentication or resource downloads.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
