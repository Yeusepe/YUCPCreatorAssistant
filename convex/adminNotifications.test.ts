import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import { makeTestConvex } from './testHelpers';

describe('adminNotifications', () => {
  beforeEach(() => {
    process.env.CONVEX_API_SECRET = 'test-convex-api-secret';
  });

  it('creates dashboard notifications through the public Convex API surface used by the API server', async () => {
    const t = makeTestConvex({ injectActor: false });

    await t.mutation(api.adminNotifications.create, {
      apiSecret: 'test-convex-api-secret',
      authUserId: 'auth-user-123',
      guildId: 'guild-123',
      type: 'error',
      title: 'Role sync failed',
      message: 'Discord rejected the role update.',
    });

    const stored = await t.run(async (ctx) => {
      return await ctx.db
        .query('admin_notifications')
        .withIndex('by_auth_user_unseen', (q) =>
          q.eq('authUserId', 'auth-user-123').eq('seenAt', undefined)
        )
        .first();
    });

    expect(stored).toMatchObject({
      authUserId: 'auth-user-123',
      guildId: 'guild-123',
      type: 'error',
      title: 'Role sync failed',
      message: 'Discord rejected the role update.',
    });
    expect(stored?.expiresAt).toBeGreaterThan(stored?.createdAt ?? 0);
  });
});
