import { describe, expect, it } from 'bun:test';
import { CONVEX_ENV_VARS } from './sync-convex-env';

describe('sync-convex-env', () => {
  it('syncs API_BASE_URL to Convex so live provider product fetches do not fall back to SITE_URL', () => {
    expect(CONVEX_ENV_VARS).toContain('API_BASE_URL');
  });
});
