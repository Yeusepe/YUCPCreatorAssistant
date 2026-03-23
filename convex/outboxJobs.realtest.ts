import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { makeTestConvex } from './testHelpers';

describe('outbox_jobs schema compatibility', () => {
  it('accepts legacy verify_prompt_refresh jobs until migration removes them', async () => {
    const t = makeTestConvex();
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert('outbox_jobs', {
        authUserId: 'auth-outbox-legacy',
        jobType: 'verify_prompt_refresh',
        payload: {
          guildId: 'guild-legacy',
          messageId: 'message-legacy',
        },
        status: 'pending',
        idempotencyKey: 'legacy-verify-prompt-refresh',
        retryCount: 0,
        maxRetries: 5,
        createdAt: now,
        updatedAt: now,
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(stored?.jobType).toBe('verify_prompt_refresh');
  });

  it('removes legacy verify_prompt_refresh jobs via migration', async () => {
    const t = makeTestConvex();
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert('outbox_jobs', {
        authUserId: 'auth-outbox-migration',
        jobType: 'verify_prompt_refresh',
        payload: {
          guildId: 'guild-migration',
          messageId: 'message-migration',
        },
        status: 'pending',
        idempotencyKey: 'migration-verify-prompt-refresh',
        retryCount: 0,
        maxRetries: 5,
        createdAt: now,
        updatedAt: now,
      })
    );

    const result = await t.run(async (ctx) =>
      ctx.runMutation(internal.migrations.purgeLegacyOutboxVerifyPromptRefreshJobs, {})
    );
    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(result).toEqual({ deleted: 1 });
    expect(stored).toBeNull();
  });
});
