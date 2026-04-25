import { afterAll, describe, expect, it, mock } from 'bun:test';
import type { ConvexServerClient } from './convex';

const apiMock = {
  subjects: {
    ensureAuthUserIdForSubject: 'subjects.ensureAuthUserIdForSubject',
  },
} as const;

const internalMock = {
  subjects: {
    getSubjectIdentityById: 'internal.subjects.getSubjectIdentityById',
    ensureAuthUserIdForSubject: 'internal.subjects.ensureAuthUserIdForSubject',
  },
} as const;

mock.module('../../../../convex/_generated/api', () => ({
  api: apiMock,
  internal: internalMock,
  components: {},
}));

const { ensureSubjectAuthUserId } = await import('./subjectIdentity');

afterAll(() => {
  mock.restore();
});

describe('ensureSubjectAuthUserId', () => {
  it('calls the public service mutation so the API server can materialize buyer auth users over HTTP', async () => {
    const mutationMock = mock(async () => 'buyer-auth-user');
    const convex = {
      mutation: mutationMock,
      query: mock(async () => null),
      action: mock(async () => null),
    } as ConvexServerClient;

    const result = await ensureSubjectAuthUserId(convex, 'convex-secret', 'subject-123');

    expect(result).toBe('buyer-auth-user');
    expect(mutationMock).toHaveBeenCalledWith(apiMock.subjects.ensureAuthUserIdForSubject, {
      apiSecret: 'convex-secret',
      subjectId: 'subject-123',
    });
  });
});
