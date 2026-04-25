import { describe, expect, it, mock } from 'bun:test';

const createConnectTokenMock = mock(() => Promise.resolve('connect-token-123'));
const createSetupSessionTokenMock = mock(() => Promise.resolve('setup-token-123'));
let mockApiUrls: {
  apiPublic?: string;
  apiInternal?: string;
  webPublic?: string;
} = {
  apiPublic: 'https://api.example.com',
  webPublic: 'https://app.example.com',
};
const getApiUrlsMock = mock(() => ({ ...mockApiUrls }));
const trackMock = mock(() => {});

mock.module('../../src/lib/internalRpc', () => ({
  createConnectToken: createConnectTokenMock,
  createSetupSessionToken: createSetupSessionTokenMock,
}));

mock.module('../../src/lib/apiUrls', () => ({
  getApiUrls: getApiUrlsMock,
}));

mock.module('../../src/lib/posthog', () => ({
  track: trackMock,
}));

import type { ChatInputCommandInteraction } from 'discord.js';
import { runSetupStart, runSetupStartUnconfigured } from '../../src/commands/setup';

function createInteraction() {
  return {
    user: {
      id: 'discord-user-123',
    },
    deferReply: mock(async () => {}),
    editReply: mock(async () => {}),
  };
}

describe('setup command', () => {
  it('refuses to build an unconfigured setup link when no frontend origin exists', async () => {
    mockApiUrls = {
      apiPublic: 'https://api.example.com',
      webPublic: undefined,
    };
    const interaction = createInteraction();

    await runSetupStartUnconfigured(
      interaction as unknown as ChatInputCommandInteraction,
      '1458860898234929315'
    );

    const [firstCall] = interaction.editReply.mock.calls;
    expect(firstCall).toBeDefined();

    const [rawPayload] = firstCall as unknown as [unknown];
    expect(JSON.stringify(rawPayload)).not.toContain('https://api.example.com/dashboard/setup');
    expect(JSON.stringify(rawPayload)).toContain('Creator Portal');
  });

  it('links unconfigured guild setup through the connect bootstrap route', async () => {
    mockApiUrls = {
      apiPublic: 'https://api.example.com',
      webPublic: 'https://app.example.com',
    };
    const interaction = createInteraction();

    await runSetupStartUnconfigured(
      interaction as unknown as ChatInputCommandInteraction,
      '1458860898234929315'
    );

    const [firstCall] = interaction.editReply.mock.calls;
    expect(firstCall).toBeDefined();

    const [rawPayload] = firstCall as unknown as [unknown];
    const payload = rawPayload as {
      components?: Array<{
        components?: Array<{
          data?: {
            url?: string;
          };
        }>;
      }>;
    };

    expect(payload.components?.[0]?.components?.[0]?.data?.url).toBe(
      'https://app.example.com/dashboard/setup?guild_id=1458860898234929315#token=connect-token-123'
    );
    expect(JSON.stringify(rawPayload)).toContain('Sign In & Open Setup Dashboard');
  });

  it('starts setup when only API_INTERNAL_URL and a frontend origin are configured', async () => {
    mockApiUrls = {
      apiInternal: 'https://api-internal.example.com',
      webPublic: 'https://app.example.com',
    };
    const interaction = createInteraction();

    await runSetupStart(
      interaction as unknown as ChatInputCommandInteraction,
      {} as never,
      'api-secret',
      {
        authUserId: 'auth-user-123',
        guildLinkId: 'guild-link-123' as never,
        guildId: '1458860898234929315',
      }
    );

    expect(createSetupSessionTokenMock).toHaveBeenCalled();
    const [firstCall] = interaction.editReply.mock.calls;
    expect(firstCall).toBeDefined();

    const [rawPayload] = firstCall as unknown as [unknown];
    const payload = rawPayload as {
      components?: Array<{
        components?: Array<{
          data?: {
            url?: string;
          };
        }>;
      }>;
    };

    expect(payload.components?.[0]?.components?.[0]?.data?.url).toBe(
      'https://app.example.com/dashboard/setup?guild_id=1458860898234929315&tenant_id=auth-user-123#s=setup-token-123'
    );
    expect(JSON.stringify(rawPayload)).toContain('Open Setup Dashboard');
    expect(JSON.stringify(rawPayload)).toContain('Review product-role mappings');
  });

  it('throws a frontend-specific configuration error when no browser origin exists', async () => {
    mockApiUrls = {
      apiInternal: 'https://api-internal.example.com',
      webPublic: undefined,
    };
    const interaction = createInteraction();

    await expect(
      runSetupStart(
        interaction as unknown as ChatInputCommandInteraction,
        {} as never,
        'api-secret',
        {
          authUserId: 'auth-user-123',
          guildLinkId: 'guild-link-123' as never,
          guildId: '1458860898234929315',
        }
      )
    ).rejects.toThrow('FRONTEND_URL or VERIFY_BASE_URL must be configured for the bot service');
  });
});
