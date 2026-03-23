import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { makeTestConvex } from './testHelpers';

describe('guild_links schema compatibility', () => {
  it('accepts legacy verifyPromptMessage metadata on guild links', async () => {
    const t = makeTestConvex();
    const now = Date.now();
    const legacyGuildLink = {
      authUserId: 'auth-guild-link-legacy',
      discordGuildId: 'guild-legacy',
      installedByAuthUserId: 'auth-guild-link-legacy',
      botPresent: true,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
      verifyPromptMessage: {
        channelId: 'channel-legacy',
        messageId: 'message-legacy',
        updatedAt: now,
      },
    };

    const id = await t.run(async (ctx) => ctx.db.insert('guild_links', legacyGuildLink));
    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(stored).toEqual(
      expect.objectContaining({
        verifyPromptMessage: legacyGuildLink.verifyPromptMessage,
      })
    );
  });

  it('removes legacy verifyPromptMessage metadata via migration', async () => {
    const t = makeTestConvex();
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert('guild_links', {
        authUserId: 'auth-guild-link-migration',
        discordGuildId: 'guild-migration',
        installedByAuthUserId: 'auth-guild-link-migration',
        botPresent: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        verifyPromptMessage: {
          channelId: 'channel-migration',
          messageId: 'message-migration',
          updatedAt: now,
        },
      })
    );

    const result = await t.run(async (ctx) =>
      ctx.runMutation(internal.migrations.purgeGuildLinkVerifyPromptMessages, {})
    );
    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(result).toEqual({ updated: 1 });
    expect(stored?.verifyPromptMessage).toBeUndefined();
  });
});
