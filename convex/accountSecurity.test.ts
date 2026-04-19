import type { GenericActionCtx, GenericMutationCtx, UserIdentity } from 'convex/server';
import { sha256Hex } from '@yucp/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import betterAuthSchema from './betterAuth/schema';
import { makeTestConvex } from './testHelpers';

type ComponentMutationCtx = GenericMutationCtx<DataModel> &
  Pick<GenericActionCtx<DataModel>, 'storage'>;

type ComponentAwareTestConvex = ReturnType<typeof makeTestConvex> & {
  runInComponent: <Output>(
    componentPath: string,
    handler: (ctx: ComponentMutationCtx) => Promise<Output>
  ) => Promise<Output>;
};

async function createAuthedUser(
  t: ComponentAwareTestConvex,
  args: {
    email: string;
    name: string;
  }
) {
  const now = Date.now();
  const { authUserId, sessionId } = await t.runInComponent('betterAuth', async (ctx) => {
    const userId = await ctx.db.insert('user', {
      name: args.name,
      email: args.email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    const createdSessionId = await ctx.db.insert('session', {
      expiresAt: now + 60_000,
      token: `session-token-${args.email}`,
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: 'vitest',
      userId,
    });

    return { authUserId: userId, sessionId: createdSessionId };
  });

  const authed = t.withIdentity({
    subject: authUserId,
    sessionId,
  } as Partial<UserIdentity> & { sessionId: string });

  return { authUserId, sessionId, authed };
}

describe('accountSecurity', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret';
    process.env.ENCRYPTION_SECRET = 'test-encryption-secret';
    process.env.ACCOUNT_RECOVERY_CONTEXT_SECRET = 'test-recovery-context-secret';
  });

  it(
    'reads security overview without writing query state and resolves the Better Auth user by _id',
    async () => {
    const t = makeTestConvex() as ComponentAwareTestConvex;
    t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob('./betterAuth/**/*.ts'));

    const { authUserId, authed } = await createAuthedUser(t, {
      email: 'recover@example.com',
      name: 'Recovery User',
    });

    const overview = await authed.query(api.accountSecurity.getSecurityOverview, {});

    expect(overview.primaryEmail).toBe('recover@example.com');
    expect(overview.primaryEmailVerified).toBe(true);
    expect(overview.hasPasskey).toBe(false);
    expect(overview.hasBackupCodes).toBe(false);
    expect(overview.hasVerifiedRecoveryEmail).toBe(false);

    const state = await t.run(async (ctx) => {
      return await ctx.db
        .query('account_security_state')
        .withIndex('by_auth_user', (q) => q.eq('authUserId', authUserId))
        .first();
    });

    expect(state).toBeNull();
    },
    20_000
  );

  it(
    'requires a matching enrollment challenge before verifying a recovery contact',
    async () => {
    const t = makeTestConvex() as ComponentAwareTestConvex;
    t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob('./betterAuth/**/*.ts'));

    const { authed } = await createAuthedUser(t, {
      email: 'owner@example.com',
      name: 'Owner',
    });

    const prepared = await authed.mutation(api.accountSecurity.prepareRecoveryContactEnrollment, {
      email: 'recovery@example.com',
    });

    await expect(
      authed.mutation(api.accountSecurity.verifyRecoveryContactEnrollment, {
        email: prepared.email,
      })
    ).rejects.toThrow('Recovery email verification proof is required');

    await expect(
      authed.mutation(api.accountSecurity.verifyRecoveryContactEnrollment, {
        email: prepared.email,
        challengeToken: 'wrong-challenge',
      })
    ).rejects.toThrow('Recovery email verification failed');

    const overview = await authed.mutation(api.accountSecurity.verifyRecoveryContactEnrollment, {
      email: prepared.email,
      challengeToken: prepared.challengeToken,
    });

    expect(overview.hasVerifiedRecoveryEmail).toBe(true);

    const storedContact = await t.run(async (ctx) => {
      return await ctx.db
        .query('account_recovery_contacts')
        .withIndex('by_email_hash', (q) => q.eq('emailHash', prepared.emailHash))
        .first();
    });

    expect(storedContact?.status).toBe('verified');
    expect(storedContact?.enrollmentChallenge).toBeUndefined();
    expect(storedContact?.verifiedAt).toBeTypeOf('number');
    },
    20_000
  );

  it(
    'rejects recovery emails already used by another account or primary login',
    async () => {
    const t = makeTestConvex() as ComponentAwareTestConvex;
    t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob('./betterAuth/**/*.ts'));

    const { authUserId: firstAuthUserId } = await createAuthedUser(t, {
      email: 'primary@example.com',
      name: 'Primary Owner',
    });
    const { authed: secondAuthed } = await createAuthedUser(t, {
      email: 'second@example.com',
      name: 'Second Owner',
    });

    const now = Date.now();
    const sharedRecoveryEmailHash = await sha256Hex('shared-recovery@example.com');
    await t.run(async (ctx) => {
      await ctx.db.insert('account_recovery_contacts', {
        authUserId: firstAuthUserId,
        kind: 'recovery_email',
        emailHash: sharedRecoveryEmailHash,
        emailEncrypted: 'ciphertext',
        enrollmentChallenge: 'challenge',
        status: 'pending',
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      secondAuthed.mutation(api.accountSecurity.prepareRecoveryContactEnrollment, {
        email: 'primary@example.com',
      })
    ).rejects.toThrow('Recovery email is already in use');

    await expect(
      secondAuthed.mutation(api.accountSecurity.prepareRecoveryContactEnrollment, {
        email: 'shared-recovery@example.com',
      })
    ).rejects.toThrow('Recovery email is already in use');
    },
    20_000
  );

  it(
    'does not complete expired or already-finished recovery sessions',
    async () => {
    const t = makeTestConvex() as ComponentAwareTestConvex;
    t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob('./betterAuth/**/*.ts'));

    const { authUserId } = await createAuthedUser(t, {
      email: 'recovering@example.com',
      name: 'Recovering User',
    });

    const completedAt = Date.now();
    const sessionIds = await t.run(async (ctx) => {
      const expiredSessionId = await ctx.db.insert('account_recovery_sessions', {
        authUserId,
        deliveryMethod: 'backup-code',
        challengeType: 'backup-code',
        status: 'verified',
        contextNonce: 'expired-nonce',
        expiresAt: completedAt - 1,
        verifiedAt: completedAt - 100,
        attempts: 0,
        createdAt: completedAt - 200,
        updatedAt: completedAt - 100,
      });
      const completedSessionId = await ctx.db.insert('account_recovery_sessions', {
        authUserId,
        deliveryMethod: 'backup-code',
        challengeType: 'backup-code',
        status: 'completed',
        contextNonce: 'completed-nonce',
        expiresAt: completedAt + 60_000,
        verifiedAt: completedAt - 100,
        completedAt: completedAt - 50,
        attempts: 0,
        createdAt: completedAt - 200,
        updatedAt: completedAt - 50,
      });

      return { expiredSessionId, completedSessionId };
    });

    await expect(
      t.mutation(internal.accountSecurity.completeRecoveryPasskeyEnrollment, {
        authUserId,
        contextNonce: 'expired-nonce',
        method: 'backup-code',
        completedAt,
      })
    ).resolves.toEqual({ completed: false });

    await expect(
      t.mutation(internal.accountSecurity.completeRecoveryPasskeyEnrollment, {
        authUserId,
        contextNonce: 'completed-nonce',
        method: 'backup-code',
        completedAt,
      })
    ).resolves.toEqual({ completed: false });

    const sessions = await t.run(async (ctx) => {
      return {
        expired: await ctx.db.get(sessionIds.expiredSessionId),
        completed: await ctx.db.get(sessionIds.completedSessionId),
      };
    });

    expect(sessions.expired?.status).toBe('verified');
    expect(sessions.completed?.status).toBe('completed');
    },
    20_000
  );
});
