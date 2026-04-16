import {
  createTemporaryWranglerConfig,
  createWebDeployEnvironment,
  fetchWebEnvFromInfisical,
  getWebRuntimeVarValues,
  getWebSecretValues,
  resolveWebEnvValues,
  runWranglerDeploy,
  runWranglerSecretBulk,
} from './cloudflare-web-config';

function readFlag(name: string): string | undefined {
  const prefixed = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefixed))?.slice(prefixed.length);
}

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

async function main(): Promise<void> {
  const workerEnvName = readFlag('--worker-env');
  const source = await fetchWebEnvFromInfisical({
    prod: isProd,
    infisicalPath: readFlag('--path'),
    projectId: readFlag('--projectId'),
  });
  const resolved = resolveWebEnvValues(source, { prod: isProd });
  const runtimeVars = getWebRuntimeVarValues(resolved);
  const secretValues = getWebSecretValues(resolved);

  if (!runtimeVars.SITE_URL || !runtimeVars.CONVEX_SITE_URL || !runtimeVars.CONVEX_URL) {
    throw new Error(
      'SITE_URL, CONVEX_SITE_URL, and CONVEX_URL are required for Cloudflare deploys'
    );
  }
  if (!runtimeVars.API_BASE_URL || !secretValues.INTERNAL_RPC_SHARED_SECRET) {
    throw new Error(
      'API_BASE_URL and INTERNAL_RPC_SHARED_SECRET are required for Cloudflare deploys'
    );
  }

  const temporaryConfig = createTemporaryWranglerConfig(runtimeVars, workerEnvName);

  try {
    if (Object.keys(secretValues).length > 0) {
      await runWranglerSecretBulk(secretValues, temporaryConfig.path, workerEnvName);
    }

    await runWranglerDeploy(
      temporaryConfig.path,
      createWebDeployEnvironment(resolved),
      passthroughArgs,
      workerEnvName
    );
  } finally {
    temporaryConfig.cleanup();
  }

  console.log(
    `deploy-web-worker: deployed apps/web to Cloudflare${workerEnvName ? ` env ${workerEnvName}` : ''} using Infisical ${isProd ? 'prod' : 'dev'}`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('deploy-web-worker:', error);
    process.exit(1);
  });
}
