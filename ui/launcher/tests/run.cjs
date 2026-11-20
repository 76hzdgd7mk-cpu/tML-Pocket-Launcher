const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const run = (args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(args.join(' ') + ' exited ' + code)),
    );
  });
(async () => {
  await run(['node_modules/typescript/lib/tsc.js', '--noEmit']);
  await run(['node_modules/vite/bin/vite.js', 'build']);
  const base = 'http://127.0.0.1:8770';
  const server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '8770',
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  let serverOutput = '';
  let failed = false;
  server.stdout.on('data', (data) => {
    serverOutput += data;
  });
  server.stderr.on('data', (data) => {
    serverOutput += data;
  });
  server.on('exit', () => {
    failed = true;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failed) throw new Error(serverOutput || 'Preview server exited');
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for Vite to bind. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Preview server failed to start: ' + serverOutput);
    const env = { ...process.env, LAUNCHER_TEST_URL: base };
    for (const suite of [
      'regression',
      'mods',
      'animate-ui',
      'primitives',
      'tml-theme',
      'settings-navigation',
      'native-bridge',
      'native-versions',
      'resource-browser',
      'launch-transition',
    ])
      await run([`tests/${suite}.cjs`], env);
  } finally {
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
