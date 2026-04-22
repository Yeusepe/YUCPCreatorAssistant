import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

const handlerVerifyMock = mock(async () => ({
  success: true,
  provider: 'gumroad',
  entitlementIds: ['ent_123'],
}));

const getHandlerMock = mock(() => ({
  verify: handlerVerifyMock,
}));

const queryMock = mock(
  async (): Promise<{ _id: string; authUserId: string | null }> => ({
    _id: 'buyer_subject_456',
    authUserId: 'buyer_auth_user_456',
  })
);

mock.module('../../../../convex/_generated/api', () => ({
  api: {},
  internal: {
    subjects: {
      getSubjectIdentityById: 'internal.subjects.getSubjectIdentityById',
    },
  },
  components: {},
}));

mock.module('../lib/convex', () => ({
  getConvexClientFromUrl: () => ({
    query: queryMock,
  }),
}));

const licenseHandlersModule = await import('./licenseHandlers/index');
spyOn(licenseHandlersModule, 'getHandler').mockImplementation(getHandlerMock);

const { handleCompleteLicense } = await import('./completeLicense');

afterAll(() => {
  mock.restore();
});

describe('handleCompleteLicense', () => {
  beforeEach(() => {
    handlerVerifyMock.mockClear();
    getHandlerMock.mockClear();
    queryMock.mockClear();
  });

  it('resolves buyer identity from the buyer subject before delegating the write path', async () => {
    const result = await handleCompleteLicense(
      {
        convexUrl: 'https://convex.example',
        convexApiSecret: 'convex-secret',
      } as never,
      {
        licenseKey: 'license_123',
        provider: 'gumroad',
        productId: 'product_123',
        authUserId: 'creator_auth_user_123',
        subjectId: 'buyer_subject_456',
      }
    );

    expect(result.success).toBe(true);
    expect(queryMock).toHaveBeenCalledWith('internal.subjects.getSubjectIdentityById', {
      subjectId: 'buyer_subject_456',
    });
    expect(handlerVerifyMock).toHaveBeenCalledWith(
      {
        licenseKey: 'license_123',
        provider: 'gumroad',
        productId: 'product_123',
        creatorAuthUserId: 'creator_auth_user_123',
        buyerAuthUserId: 'buyer_auth_user_456',
        buyerSubjectId: 'buyer_subject_456',
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('rejects legacy completion when the buyer subject is not linked to a YUCP account', async () => {
    queryMock.mockImplementationOnce(async () => ({
      _id: 'buyer_subject_456',
      authUserId: null,
    }));

    const result = await handleCompleteLicense(
      {
        convexUrl: 'https://convex.example',
        convexApiSecret: 'convex-secret',
      } as never,
      {
        licenseKey: 'license_123',
        provider: 'gumroad',
        productId: 'product_123',
        authUserId: 'creator_auth_user_123',
        subjectId: 'buyer_subject_456',
      }
    );

    expect(result).toEqual({
      success: false,
      error: 'Verification subject must be linked to a YUCP account before completion',
    });
    expect(handlerVerifyMock).not.toHaveBeenCalled();
  });
});
