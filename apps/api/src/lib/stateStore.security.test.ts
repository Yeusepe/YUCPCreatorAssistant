import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dir, '../../../../');
const stateStoreModuleUrl = pathToFileURL(resolve(import.meta.dir, './stateStore.ts')).href;

function runStateStoreScript(script: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['-e', script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('state store security', () => {
  it('fails closed in production when no distributed state store is configured', () => {
    const script = `
      const stateStore = await import(${JSON.stringify(stateStoreModuleUrl)});
      try {
        stateStore.getStateStore();
        console.error('expected getStateStore to throw');
        process.exit(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('distributed state store')) {
          console.error(message);
          process.exit(1);
        }
      }
    `;

    const result = runStateStoreScript(script, {
      NODE_ENV: 'production',
      DRAGONFLY_URI: '',
      REDIS_URL: '',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('expected getStateStore to throw');
  });

  it('keeps the in-memory fallback outside production when Redis is intentionally absent', () => {
    const script = `
      const stateStore = await import(${JSON.stringify(stateStoreModuleUrl)});
      const store = stateStore.getStateStore();
      if (!(store instanceof stateStore.InMemoryStateStore)) {
        console.error('expected in-memory fallback');
        process.exit(1);
      }
    `;

    const result = runStateStoreScript(script, {
      NODE_ENV: 'development',
      DRAGONFLY_URI: '',
      REDIS_URL: '',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('expected in-memory fallback');
  });
});
