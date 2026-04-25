import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const publicCreateRef = { scope: 'public', name: 'adminNotifications:create' };
const internalCreateRef = { scope: 'internal', name: 'adminNotifications:create' };

const mutationMock = mock(async (reference: unknown) => {
  if (reference === internalCreateRef) {
    throw new Error("Could not find public function for 'adminNotifications:create'");
  }
  if (reference !== publicCreateRef) {
    throw new Error(`Unexpected function reference: ${String(reference)}`);
  }
  return undefined;
});
const getConvexClientFromUrlMock = mock(() => ({
  mutation: mutationMock,
}));
const errorMock = mock((_message: string, _meta?: Record<string, unknown>) => undefined);
const infoMock = mock((_message: string, _meta?: Record<string, unknown>) => undefined);
const warnMock = mock((_message: string, _meta?: Record<string, unknown>) => undefined);

mock.module('../../../../convex/_generated/api', () => ({
  api: {
    adminNotifications: {
      create: publicCreateRef,
    },
  },
  internal: {
    adminNotifications: {
      create: internalCreateRef,
    },
  },
}));

mock.module('../lib/convex', () => ({
  getConvexClientFromUrl: getConvexClientFromUrlMock,
}));

mock.module('../lib/env', () => ({
  loadEnv: () => ({
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_API_SECRET: 'convex-api-secret',
    INTERNAL_SERVICE_AUTH_SECRET: 'internal-service-secret',
  }),
}));

mock.module('../lib/logger', () => ({
  logger: {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    debug: mock(() => undefined),
    child: mock(() => {
      throw new Error('child logger should not be called in notify route test');
    }),
  },
}));

mock.module('@yucp/shared', () => ({
  getInternalRpcSharedSecret: () => 'internal-service-secret',
  timingSafeStringEqual: (left: string, right: string) => left === right,
}));

const { handleInternalNotify } = await import('./notify');

describe('handleInternalNotify', () => {
  beforeEach(() => {
    mutationMock.mockClear();
    getConvexClientFromUrlMock.mockClear();
    errorMock.mockClear();
    infoMock.mockClear();
    warnMock.mockClear();
  });

  afterAll(() => {
    mock.restore();
  });

  it('uses the public adminNotifications.create mutation so bot notifications do not hit Convex public-surface mismatches', async () => {
    const response = await handleInternalNotify(
      new Request('https://api.example.test/api/internal/notify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-service-secret': 'internal-service-secret',
        },
        body: JSON.stringify({
          authUserId: 'auth-user-123',
          guildId: 'guild-123',
          type: 'warning',
          title: 'Role sync warning',
          message: 'One role could not be synced.',
        }),
      })
    );

    expect(response.status).toBe(204);
    expect(getConvexClientFromUrlMock).toHaveBeenCalledWith('https://convex.example.test');
    expect(mutationMock).toHaveBeenCalledTimes(1);
    expect(mutationMock).toHaveBeenCalledWith(publicCreateRef, {
      apiSecret: 'convex-api-secret',
      authUserId: 'auth-user-123',
      guildId: 'guild-123',
      type: 'warning',
      title: 'Role sync warning',
      message: 'One role could not be synced.',
    });
    expect(errorMock).not.toHaveBeenCalled();
  });
});
