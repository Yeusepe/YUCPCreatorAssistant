import { readFlag } from './cli-utils';
import {
  createWebDeployEnvironment,
  REPO_ROOT_DIR,
  resolveWebEnvValues,
  runWranglerDeploy,
  WEB_GENERATED_WRANGLER_CONFIG_PATH,
} from './cloudflare-web-config';

const knownFlags = new Set(['--prod']);
const passthroughArgs = process.argv.slice(2).filter((arg) => {
  if (knownFlags.has(arg)) {
    return false;
  }

  return (
    !arg.startsWith('--worker-env=') &&
    !arg.startsWith('--path=') &&
    !arg.startsWith('--projectId=')
  );
});

const isProd = process.argv.includes('--prod');

export function getWebBuildCommand(): string[] {
  return ['bun', 'run', '--filter', '@yucp/web', 'build'];
}

export async function runWebBuild(): Promise<void> {
  const proc = Bun.spawn({
    cmd: getWebBuildCommand(),
    cwd: REPO_ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`web build failed with exit code ${exitCode}`);
  }
}

async function main(): Promise<void> {
  const workerEnvName = readFlag('--worker-env');
  const resolved = resolveWebEnvValues({}, { prod: isProd });

  await runWebBuild();

  await runWranglerDeploy(
    WEB_GENERATED_WRANGLER_CONFIG_PATH,
    createWebDeployEnvironment(resolved),
    ['--keep-vars', ...passthroughArgs],
    workerEnvName
  );

  console.log(
    `deploy-web-worker: deployed apps/web to Cloudflare${workerEnvName ? ` env ${workerEnvName}` : ''} using Cloudflare-managed bindings`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('deploy-web-worker:', error);
    process.exit(1);
  });
}
