import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = join(__dirname, '../..');
const REPO_ROOT_DIR = join(APP_DIR, '..', '..');

describe('production server contract', () => {
  it('exposes Cloudflare worker scripts instead of the legacy Bun production server', () => {
    const packageJson = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.start).toBe('vite preview');
    expect(packageJson.scripts?.['worker:dev']).toContain('prepare-web-worker-env.ts');
    expect(packageJson.scripts?.['worker:preview']).toContain('wrangler dev');
    expect(packageJson.scripts?.['worker:deploy']).toContain('deploy-web-worker.ts');
    expect(existsSync(join(APP_DIR, 'serve.ts'))).toBe(false);
  });

  it('routes root web development through the Worker bootstrap path', () => {
    const rootPackageJson = JSON.parse(readFileSync(join(REPO_ROOT_DIR, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const prepareScriptSource = readFileSync(
      join(REPO_ROOT_DIR, 'ops', 'prepare-web-worker-env.ts'),
      'utf8'
    );

    expect(rootPackageJson.scripts?.['dev:web']).toContain('worker:dev');
    expect(rootPackageJson.scripts?.['dev:web:infisical']).toContain('worker:dev');
    expect(prepareScriptSource).toContain('process.env');
    expect(prepareScriptSource).toContain('REPO_ROOT_ENV_LOCAL_PATH');
  });

  it('uses wrangler and local worker env files for runtime configuration', () => {
    const viteConfigSource = readFileSync(join(APP_DIR, 'vite.config.ts'), 'utf8');
    const wranglerConfigSource = readFileSync(join(APP_DIR, 'wrangler.jsonc'), 'utf8');

    expect(viteConfigSource).toContain('@cloudflare/vite-plugin');
    expect(viteConfigSource).toContain('.dev.vars');
    expect(viteConfigSource).toContain('.env.local');
    expect(viteConfigSource).toContain('import.meta.env.CONVEX_SITE_URL');
    expect(viteConfigSource).not.toContain('fetchInfisicalSecrets');
    expect(wranglerConfigSource).toContain('@tanstack/react-start/server-entry');
    expect(wranglerConfigSource).toContain('nodejs_compat');
  });
});
