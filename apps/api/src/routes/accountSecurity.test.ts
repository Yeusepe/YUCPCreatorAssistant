import { beforeEach, describe, expect, it, mock } from 'bun:test';

const convexQueryMock = mock(async () => null as unknown);
const convexMutationMock = mock(async () => null as unknown);

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

const { createAccountSecurityRoutes } = await import('./accountSecurity');

describe('account security routes', () => {
  beforeEach(() => {
    convexQueryMock.mockReset();
    convexMutationMock.mockReset();
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
});
