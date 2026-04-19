import { beforeEach, describe, expect, it, mock } from 'bun:test';

const convexQueryMock = mock(async () => null as unknown);
const convexMutationMock = mock(async () => null as unknown);
const loggerWarnMock = mock(() => undefined);

const apiMock = {
  accountSecurity: {
    resolveRecoveryLookupForApi: 'accountSecurity.resolveRecoveryLookupForApi',
    beginEmailRecoveryForApi: 'accountSecurity.beginEmailRecoveryForApi',
    getPendingEmailRecoveryForApi: 'accountSecurity.getPendingEmailRecoveryForApi',
    consumeEmailRecoveryForApi: 'accountSecurity.consumeEmailRecoveryForApi',
    consumeBackupCodeRecoveryForApi: 'accountSecurity.consumeBackupCodeRecoveryForApi',
  },
} as const;

mock.module('../../../../convex/_generated/api', () => ({
  api: apiMock,
  internal: apiMock,
  components: {},
}));

mock.module('../lib/convex', () => ({
  getConvexClientFromUrl: () => ({
    query: convexQueryMock,
    mutation: convexMutationMock,
  }),
}));
mock.module('../lib/logger', () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

const { BetterAuthEndpointError } = await import('../auth');
const { createAccountSecurityRoutes } = await import('./accountSecurity');

describe('account security routes', () => {
  beforeEach(() => {
    convexQueryMock.mockReset();
    convexMutationMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it('returns a generic success response and starts email recovery when allowed', async () => {
    convexQueryMock.mockImplementation(async (...args: unknown[]) => {
      const [reference] = args;
      if (reference === apiMock.accountSecurity.resolveRecoveryLookupForApi) {
        return {
          authUserId: 'auth-user-123',
          lookupEmail: 'creator@example.com',
          lookupEmailHash: 'hash_123',
          canUseBackupCode: true,
          emailDeliveryMethod: 'recovery-email-otp',
          targetEmail: 'owner@example.com',
          requiresSupport: false,
          isCreatorAccount: true,
        };
      }

      throw new Error(`Unexpected query reference: ${String(reference)}`);
    });
    convexMutationMock.mockResolvedValue({ expiresAt: Date.now() + 60_000 });

    const sendEmailOtp = mock(async () => ({
      success: true,
    }));

    const routes = createAccountSecurityRoutes(
      {
        sendEmailOtp,
        checkEmailOtp: mock(async () => ({ success: true })),
      } as never,
      {
        convexApiSecret: 'test-secret',
        convexUrl: 'https://test.convex.cloud',
      }
    );

    const response = await routes.startRecovery(
      new Request('http://localhost/api/account-recovery/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'creator@example.com',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message:
        'If that account can recover by email, a recovery code has been sent. Backup codes and support recovery remain available.',
    });
    expect(sendEmailOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      type: 'forget-password',
    });
    expect(convexMutationMock).toHaveBeenCalledWith(
      apiMock.accountSecurity.beginEmailRecoveryForApi,
      expect.objectContaining({
        authUserId: 'auth-user-123',
        lookupEmail: 'creator@example.com',
        targetEmail: 'owner@example.com',
      })
    );
  });

  it('verifies backup-code recovery and returns a constrained passkey context', async () => {
    convexMutationMock.mockImplementation(async (...args: unknown[]) => {
      const [reference] = args;
      if (reference === apiMock.accountSecurity.consumeBackupCodeRecoveryForApi) {
        return {
          success: true,
          recoveryPasskeyContext: 'recovery-passkey-context',
          expiresAt: 1_700_000_000_000,
        };
      }

      throw new Error(`Unexpected mutation reference: ${String(reference)}`);
    });

    const routes = createAccountSecurityRoutes(
      {
        sendEmailOtp: mock(async () => ({ success: true })),
        checkEmailOtp: mock(async () => ({ success: true })),
      } as never,
      {
        convexApiSecret: 'test-secret',
        convexUrl: 'https://test.convex.cloud',
      }
    );

    const response = await routes.verifyRecoveryBackupCode(
      new Request('http://localhost/api/account-recovery/verify-backup-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'creator@example.com',
          backupCode: 'ABCDE-FGHIJ',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      recoveryPasskeyContext: 'recovery-passkey-context',
      expiresAt: 1_700_000_000_000,
    });
  });

  it('logs full email-recovery errors but only returns the fallback message', async () => {
    convexQueryMock.mockResolvedValue({
      targetEmail: 'owner@example.com',
    });

    const routes = createAccountSecurityRoutes(
      {
        sendEmailOtp: mock(async () => ({ success: true })),
        checkEmailOtp: mock(async () => {
          throw new BetterAuthEndpointError(
            '/email-otp/check-verification-otp',
            400,
            { error: 'database stack trace' },
            '{"error":"database stack trace"}'
          );
        }),
      } as never,
      {
        convexApiSecret: 'test-secret',
        convexUrl: 'https://test.convex.cloud',
      }
    );

    const response = await routes.verifyRecoveryEmail(
      new Request('http://localhost/api/account-recovery/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'creator@example.com',
          otp: '123456',
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired recovery code',
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Account recovery email verification failed',
      expect.objectContaining({
        errorMessage: expect.stringContaining('Better Auth request'),
        betterAuthBodyText: '{"error":"database stack trace"}',
      })
    );
  });

  it('logs full backup-code errors but only returns the fallback message', async () => {
    convexMutationMock.mockRejectedValue(new Error('database stack trace'));

    const routes = createAccountSecurityRoutes(
      {
        sendEmailOtp: mock(async () => ({ success: true })),
        checkEmailOtp: mock(async () => ({ success: true })),
      } as never,
      {
        convexApiSecret: 'test-secret',
        convexUrl: 'https://test.convex.cloud',
      }
    );

    const response = await routes.verifyRecoveryBackupCode(
      new Request('http://localhost/api/account-recovery/verify-backup-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'creator@example.com',
          backupCode: 'ABCDE-FGHIJ',
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid backup code',
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Account recovery backup code verification failed',
      expect.objectContaining({
        errorMessage: 'database stack trace',
      })
    );
  });
});
