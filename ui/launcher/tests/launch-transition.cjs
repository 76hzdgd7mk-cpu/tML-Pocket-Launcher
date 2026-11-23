const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.LAUNCHER_TEST_URL || 'http://127.0.0.1:8771';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });
  try {
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 914, height: 411 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const state = {
        protocol: 1,
        busy: false,
        message: '已就绪',
        progress: -1,
        error: null,
        retry: false,
        operation: 'state',
        ready: true,
        runtime: true,
        terraria: '1.4.4.9',
        terrariaSource: 'gog',
        tml: '2026.09.3.1',
        mods: [],
        packs: [],
        patches: [],
        preferences: { theme: 'dark', motion: true },
        appVersion: '0.1.8',
      };
      const send = (message) =>
        window.LauncherNative.onmessage?.({ data: JSON.stringify(message) });
      let pending;
      window.launchCount = 0;
      window.launchStage = (stage, message) => {
        Object.assign(state, {
          busy: true,
          operation: 'launch.check',
          launchStage: stage,
          message,
        });
        send({ event: 'snapshot', data: state });
      };
      window.finishLaunch = (error) => {
        Object.assign(state, { busy: false, error: error || null });
        send({ event: 'snapshot', data: state });
        send({ id: pending, ok: !error, error, data: { handedOff: true } });
      };
      window.LauncherNative = {
        onmessage: null,
        postMessage(text) {
          const { id, method } = JSON.parse(text);
          if (method === 'launch') {
            pending = id;
            window.launchCount++;
            return;
          }
          const data =
            method === 'state'
              ? state
              : method === 'logs'
                ? { text: '[游戏] 实际测试日志' }
                : method === 'store.status'
                  ? { steam: { phase: 'signedOut' }, gog: { phase: 'signedOut' } }
                  : true;
          setTimeout(() => send({ id, ok: true, data }), 5);
        },
      };
    });
    await page.goto(base);
    await page.locator('.launch-button').getByText('启动游戏').waitFor();
    await page.evaluate(() => {
      document.querySelector('.launch-button').click();
      document.querySelector('.launch-button').click();
    });
    await page.getByRole('dialog', { name: '准备出发', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.launchCount), 1, 'duplicate starts blocked');
    await page.evaluate(() => window.launchStage('ownership', '正在验证 Steam 所有权…'));
    await page
      .locator('.game-launch-status')
      .getByText('正在验证 Steam 所有权…', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: '查看日志', exact: true }).click();
    await page.getByText('[游戏] 实际测试日志', { exact: false }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.game-launch-log').count(), 0);
    await page.evaluate(() => window.launchStage('mods', '正在检查模组与补丁…'));
    for (const [width, height] of [
      [914, 411],
      [800, 360],
      [640, 360],
      [390, 844],
      [320, 640],
    ]) {
      await page.setViewportSize({ width, height });
      const positions = await page.evaluate(() => {
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        return {
          description: rect('#game-launch-description'),
          status: rect('.game-launch-status'),
          footer: rect('.game-launch-bottom'),
          scroll: document.querySelector('.game-launch-screen').scrollHeight,
        };
      });
      assert.ok(
        positions.description.bottom + 6 <= positions.status.top,
        `description/status at ${width}x${height}`,
      );
      assert.ok(
        positions.status.bottom + 6 <= positions.footer.top,
        `status/footer at ${width}x${height}`,
      );
      assert.ok(positions.footer.bottom <= height + 1, `footer visible at ${width}x${height}`);
      assert.ok(positions.scroll <= height + 1, `no clipped content at ${width}x${height}`);
    }
    await page.evaluate(() => window.finishLaunch('模组缺少必需依赖'));
    await page.getByRole('dialog', { name: '暂时无法启动', exact: true }).waitFor();
    await page.getByRole('button', { name: '重新尝试', exact: true }).click();
    assert.equal(await page.evaluate(() => window.launchCount), 2);
    await page.evaluate(() => window.finishLaunch('请登录拥有 Terraria 的 Steam 账户'));
    await page.getByRole('button', { name: '前往 Steam', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回启动器', exact: true }).click();
    await page.locator('.game-launch-screen').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.launch-button').isEnabled(), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.launch-button').click();
    await page.getByRole('dialog', { name: '准备出发', exact: true }).waitFor();
    assert.equal(
      await page
        .locator('.game-launch-orbit.outer')
        .evaluate((node) => getComputedStyle(node).animationName),
      'none',
    );
    await page.evaluate(() => window.finishLaunch());
    await page.getByText('正在进入游戏…', { exact: true }).waitFor();
    assert.ok(
      await page.locator('.game-launch-screen').isVisible(),
      'RPC handoff is not game-frame success',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('launcher:game-returned')));
    await page.locator('.game-launch-screen').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.launch-button').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: launch overlay stages; duplicate prevention; logs during validation; five layouts without overlap; retry and Steam error; reduced motion; honest handoff and Activity return.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
