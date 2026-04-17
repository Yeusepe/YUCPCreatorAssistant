import { describe, expect, test } from 'bun:test';
import { buildWranglerCommand } from './cli-utils';

describe('cli-utils', () => {
  test('buildWranglerCommand builds bun x wrangler commands without duplicating the tool name', () => {
    expect(buildWranglerCommand(['deploy', '--config', 'apps/web/wrangler.jsonc'])).toEqual([
      'bun',
      'x',
      'wrangler',
      'deploy',
      '--config',
      'apps/web/wrangler.jsonc',
    ]);
  });
});
