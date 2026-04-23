import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTERNAL_INTEGRATION_GATE_STEPS } from './production-regression-loop';

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

for (const step of EXTERNAL_INTEGRATION_GATE_STEPS) {
  const cwd =
    step.cwdRelativeToRepoRoot === '.'
      ? repoRoot
      : join(repoRoot, ...step.cwdRelativeToRepoRoot.split('/'));
  runStep(step.description, cwd, step.args);
}

runStep('API internal RPC normalization tests', join(repoRoot, 'apps', 'api'), [
  'test',
  './src/internalRpc/router.test.ts',
]);
