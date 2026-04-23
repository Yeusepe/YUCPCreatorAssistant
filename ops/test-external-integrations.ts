import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function runStep(description: string, cwd: string, args: string[]) {
  console.log(`\n[external-integrations] ${description}`);
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runStep('provider runtime, smoke contract, and bot degraded-state tests', repoRoot, [
  'test',
  './ops/provider-live-smoke.test.ts',
  './packages/providers/test/gumroad/module.test.ts',
  './packages/providers/test/jinxxy/module.test.ts',
  './packages/providers/test/lemonsqueezy/module.test.ts',
  './packages/providers/test/vrchat/module.test.ts',
  './apps/bot/test/lib/setupCatalog.test.ts',
]);

runStep('API ownership and route boundary tests', join(repoRoot, 'apps', 'api'), [
  'test',
  './src/routes/providerPlatform.test.ts',
  './src/routes/connectUserVerification.readSurface.test.ts',
]);

runStep('API internal RPC normalization tests', join(repoRoot, 'apps', 'api'), [
  'test',
  './src/internalRpc/router.test.ts',
]);

runStep('web degraded-state consumer tests', join(repoRoot, 'apps', 'web'), [
  'x',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  './test/unit/account-connections.test.tsx',
  './test/unit/dashboard-connected-platforms.test.tsx',
  './test/unit/store-integrations-status-label.test.tsx',
]);
