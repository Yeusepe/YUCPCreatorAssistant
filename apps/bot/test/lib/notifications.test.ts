import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const warnMock = mock((_message: string, _meta?: Record<string, unknown>) => undefined);

mock.module('@yucp/shared', () => ({
  createLogger: () => ({
    debug: mock(() => undefined),
    info: mock(() => undefined),
    warn: warnMock,
    error: mock(() => undefined),
    child: mock(() => {
      throw new Error('child logger should not be called in notifications helper test');
    }),
  }),
  getInternalRpcSharedSecret: () => 'internal-service-secret',
}));

mock.module('../../src/lib/apiUrls', () => ({
  getApiUrls: () => ({
    apiInternal: 'https://api-internal.example.test/',
    apiPublic: 'https://api-public.example.test/',
    webPublic: 'https://app.example.test/',
  }),
}));

const { sendDashboardNotification } = await import('../../src/lib/notifications');

describe('sendDashboardNotification', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    warnMock.mockClear();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it('posts dashboard notifications to the internal API notify route with the shared secret header', async () => {
    const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      status: 204,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    sendDashboardNotification({
      authUserId: 'auth-user-123',
      guildId: 'guild-123',
      type: 'success',
      title: 'Verification complete',
      message: 'The member now has access.',
    });

    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-internal.example.test/api/internal/notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Secret': 'internal-service-secret',
        },
        body: JSON.stringify({
          authUserId: 'auth-user-123',
          guildId: 'guild-123',
          type: 'success',
          title: 'Verification complete',
          message: 'The member now has access.',
        }),
      }
    );
    expect(warnMock).not.toHaveBeenCalled();
  });
});
