import { resolve } from 'node:path';
import {
  fetchWebEnvFromInfisical,
  getWebLocalEnvValues,
  resolveWebEnvValues,
  WEB_LOCAL_ENV_PATH,
  writeDotenvFile,
} from './cloudflare-web-config';

function readFlag(name: string): string | undefined {
  const prefixed = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefixed))?.slice(prefixed.length);
}

const isProd = process.argv.includes('--prod');

async function main(): Promise<void> {
  const outputPath = resolve(process.cwd(), readFlag('--output') ?? WEB_LOCAL_ENV_PATH);
  const source = await fetchWebEnvFromInfisical({
    prod: isProd,
    infisicalPath: readFlag('--path'),
    projectId: readFlag('--projectId'),
  });
  const resolved = resolveWebEnvValues(source, { prod: isProd });
  const localValues = getWebLocalEnvValues(resolved);

  if (Object.keys(localValues).length === 0) {
    throw new Error('No frontend Worker env values were returned from Infisical');
  }

  writeDotenvFile(outputPath, localValues);
  console.log(
    `export-web-worker-env: wrote ${Object.keys(localValues).length} vars to ${outputPath} from Infisical ${isProd ? 'prod' : 'dev'}`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('export-web-worker-env:', error);
    process.exit(1);
  });
}
