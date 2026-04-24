import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { ConvexHttpClient } from 'convex/browser';
import type { ButtonInteraction } from 'discord.js';
import { handleInteraction } from '../../src/handlers/interactions';
import { mockButton } from '../helpers/mockInteraction';

const previousAutomaticSetupFlag = process.env.YUCP_ENABLE_AUTOMATIC_SETUP;

afterEach(() => {
  process.env.YUCP_ENABLE_AUTOMATIC_SETUP = previousAutomaticSetupFlag;
});

describe('autosetup feature flag', () => {
  it('rejects legacy autosetup component interactions when the feature is disabled', async () => {
    process.env.YUCP_ENABLE_AUTOMATIC_SETUP = 'false';

    const interaction = mockButton({
      isAdmin: true,
      customId: 'creator_autosetup:create_verify:user-123:auth-123',
    });

    await handleInteraction(interaction as unknown as ButtonInteraction, {
      apiSecret: 'api-secret',
      convex: {
        query: mock(async () => {
          throw new Error('legacy autosetup interactions should be blocked before any query');
        }),
        mutation: mock(async () => {
          throw new Error('legacy autosetup interactions should be blocked before any mutation');
        }),
      } as unknown as ConvexHttpClient,
    });

    expect(interaction.reply.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        content: expect.stringMatching(/automatic setup is currently disabled/i),
      })
    );
  });
});
