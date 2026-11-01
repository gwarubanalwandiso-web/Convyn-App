import { spawn } from 'node:child_process';
const marketplace = process.argv.includes('--marketplace');
const definitions = [
  ['api', process.execPath, ['--env-file=.env', 'apps/api/dist/main.js']],
  ...(marketplace
    ? [
        [
          'marketplace',
          'pnpm',
          ['--filter', '@convyn/marketplace-web', 'preview'],
        ],
      ]
    : []),
  ...(marketplace
    ? ['business', 'enterprise']
    : ['customer', 'provider', 'admin', 'business', 'enterprise']
  ).map((role) => [
    role,
    'pnpm',
    [
      '--filter',
      `@convyn/${role}-web`,
      'exec',
      'next',
      'start',
      '-p',
      String(
        3000 +
          ['customer', 'provider', 'admin', 'business', 'enterprise'].indexOf(
            role,
          ),
      ),
    ],
  ]),
];
const children = [];
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH')
          console.error('Could not terminate a managed service');
      }
    }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
    }
  }, 5000);
  timer.unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
for (const [name, command, args] of definitions) {
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  children.push(child);
  let errors = '';
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => {
    errors = (errors + chunk.toString()).slice(-4000);
  });
  child.on('error', () => {
    console.error(name + ' could not start');
    process.exitCode = 1;
    shutdown();
  });
  child.on('exit', (code) => {
    if (!closing) {
      console.error(
        name + ' exited unexpectedly (code ' + code + '). ' + errors,
      );
      process.exitCode = 1;
      shutdown();
    }
  });
}
const apiPort = Number(process.env.PORT ?? 4000);
const targets = [
  `http://127.0.0.1:${apiPort}/v1/ready`,
  ...(marketplace ? [4173, 3003, 3004] : [3000, 3001, 3002, 3003, 3004]).map(
    (port) => `http://127.0.0.1:${port}`,
  ),
];
let ready = false;
for (let attempt = 0; attempt < 100 && !closing; attempt++) {
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        return (await fetch(target, { signal: AbortSignal.timeout(1000) })).ok;
      } catch {
        return false;
      }
    }),
  );
  if (results.every(Boolean)) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (ready && !closing)
  console.log(
    marketplace
      ? 'CONVYN marketplace is ready at http://localhost:4173; existing business and enterprise portals remain at ports 3003 and 3004.'
      : 'CONVYN development API and all five portals are ready. Stop this process to stop only its managed services.',
  );
else if (!closing) {
  console.error('Development stack readiness checks failed');
  process.exitCode = 1;
  shutdown();
}
