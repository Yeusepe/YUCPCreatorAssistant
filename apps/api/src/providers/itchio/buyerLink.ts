import { CredentialExpiredError } from '@yucp/providers/contracts';
import {
  fetchItchioCurrentUser,
  fetchItchioOwnedKeys,
  ITCHIO_PURPOSES,
} from '@yucp/providers/itchio/module';
import { api, internal } from '../../../../../convex/_generated/api';
import { decrypt, encrypt } from '../../lib/encrypt';
import type {
  BuyerLinkPlugin,
  VerifyHostedBuyerLinkIntentInput,
  VerifyHostedBuyerLinkIntentResult,
} from '../types';

const PROVIDER_LINK_EXPIRED_MESSAGE =
  'The linked itch.io account must be reconnected before it can be used.';
const PURCHASE_NOT_FOUND_MESSAGE =
  'No purchase was found for this itch.io account. If you just bought, please try again in a moment.';

interface ItchioBuyerLinkDeps {
  fetchCurrentUser?: typeof fetchItchioCurrentUser;
  fetchOwnedKeys?: typeof fetchItchioOwnedKeys;
  encryptCredential?: typeof encrypt;
  decryptCredential?: typeof decrypt;
}

async function markIntentFailed(
  input: VerifyHostedBuyerLinkIntentInput,
  result: VerifyHostedBuyerLinkIntentResult,
  mutation: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>
): Promise<VerifyHostedBuyerLinkIntentResult> {
  await mutation(internal.verificationIntents.markIntentFailed, {
    intentId: input.intentId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  });
  return result;
}

export function createItchioBuyerLinkPlugin(deps: ItchioBuyerLinkDeps = {}): BuyerLinkPlugin {
  const readCurrentUser = deps.fetchCurrentUser ?? fetchItchioCurrentUser;
  const readOwnedKeys = deps.fetchOwnedKeys ?? fetchItchioOwnedKeys;
  const encryptCredential = deps.encryptCredential ?? encrypt;
  const decryptCredential = deps.decryptCredential ?? decrypt;

  return {
    oauth: {
      providerId: 'itchio',
      mode: 'itchio',
      authUrl: 'https://itch.io/user/oauth',
      tokenUrl: '',
      responseType: 'token',
      usesPkce: false,
      scopes: ['profile:me', 'profile:owned'],
      callbackPath: '/oauth/callback/itchio',
      callbackOrigin: 'frontend',
    },

    async fetchIdentity(accessToken) {
      const currentUser = await readCurrentUser(accessToken, {});
      return {
        providerUserId: currentUser.id,
        username: currentUser.username,
        profileUrl: currentUser.profileUrl,
      };
    },

    async storeCredential(input, ctx) {
      const encryptedAccessToken = await encryptCredential(
        input.accessToken,
        ctx.encryptionSecret,
        ITCHIO_PURPOSES.buyerCredential
      );

      await ctx.convex.mutation(internal.identitySync.storeExternalAccountOAuthCredentials, {
        apiSecret: ctx.apiSecret,
        externalAccountId: input.externalAccountId,
        oauthAccessTokenEncrypted: encryptedAccessToken,
        oauthRefreshTokenEncrypted: input.refreshToken,
        oauthTokenExpiresAt: input.expiresAt,
      });
    },

    async verifyHostedIntent(input, ctx) {
      const intent = await ctx.convex.query(api.verificationIntents.getIntentRecord, {
        apiSecret: ctx.apiSecret,
        authUserId: input.authUserId,
        intentId: input.intentId,
      });

      if (!intent) {
        return {
          success: false,
          errorCode: 'not_found',
          errorMessage: 'Verification intent not found',
        };
      }
      if (intent.status !== 'pending') {
        return {
          success: false,
          errorCode: 'invalid_state',
          errorMessage: `Verification intent is ${intent.status}`,
        };
      }
      if (intent.expiresAt <= Date.now()) {
        return {
          success: false,
          errorCode: 'expired',
          errorMessage: 'Verification intent has expired',
        };
      }

      const requirement = intent.requirements.find(
        (entry: { methodKey: string; kind: string }) =>
          entry.methodKey === input.methodKey && entry.kind === 'buyer_provider_link'
      );
      if (!requirement) {
        return await markIntentFailed(
          input,
          {
            success: false,
            errorCode: 'invalid_method',
            errorMessage: 'Verification method does not support linked itch.io verification.',
          },
          ctx.convex.mutation
        );
      }

      const subjectResult = await ctx.convex.query(api.subjects.getSubjectByAuthId, {
        apiSecret: ctx.apiSecret,
        authUserId: input.authUserId,
      });
      if (!subjectResult.found || !subjectResult.subject) {
        return await markIntentFailed(
          input,
          {
            success: false,
            errorCode: 'subject_not_found',
            errorMessage: 'No linked buyer subject was found for this YUCP account.',
          },
          ctx.convex.mutation
        );
      }

      const buyerProviderLink = await ctx.convex.query(
        internal.subjects.getBuyerProviderLinkForSubject,
        {
          subjectId: subjectResult.subject._id,
          provider: 'itchio',
        }
      );
      if (!buyerProviderLink) {
        return await markIntentFailed(
          input,
          {
            success: false,
            errorCode: 'provider_link_missing',
            errorMessage: 'No linked provider account was found for this verification method.',
          },
          ctx.convex.mutation
        );
      }
      if (buyerProviderLink.status !== 'active') {
        return await markIntentFailed(
          input,
          {
            success: false,
            errorCode: 'provider_link_expired',
            errorMessage: PROVIDER_LINK_EXPIRED_MESSAGE,
          },
          ctx.convex.mutation
        );
      }

      if (
        !requirement.creatorAuthUserId ||
        !requirement.productId ||
        !requirement.providerProductRef
      ) {
        await ctx.convex.mutation(internal.verificationIntents.markIntentVerified, {
          intentId: input.intentId,
          methodKey: input.methodKey,
        });
        return { success: true };
      }

      const credentials = await ctx.convex.query(
        internal.identitySync.getExternalAccountOAuthCredentials,
        {
          externalAccountId: buyerProviderLink.externalAccountId,
        }
      );
      if (!credentials?.oauthAccessTokenEncrypted) {
        return await markIntentFailed(
          input,
          {
            success: false,
            errorCode: 'provider_link_expired',
            errorMessage: PROVIDER_LINK_EXPIRED_MESSAGE,
          },
          ctx.convex.mutation
        );
      }

      try {
        const accessToken = await decryptCredential(
          credentials.oauthAccessTokenEncrypted,
          ctx.encryptionSecret,
          ITCHIO_PURPOSES.buyerCredential
        );
        const ownedKeys = await readOwnedKeys(accessToken, {});
        const matchedOwnedKey = ownedKeys.find(
          (ownedKey) => ownedKey.gameId === requirement.providerProductRef
        );

        if (!matchedOwnedKey) {
          return await markIntentFailed(
            input,
            {
              success: false,
              errorCode: 'purchase_not_found',
              errorMessage: PURCHASE_NOT_FOUND_MESSAGE,
            },
            ctx.convex.mutation
          );
        }

        await ctx.convex.mutation(api.entitlements.grantEntitlement, {
          apiSecret: ctx.apiSecret,
          authUserId: requirement.creatorAuthUserId,
          subjectId: subjectResult.subject._id,
          productId: requirement.productId,
          evidence: {
            provider: 'itchio',
            sourceReference: matchedOwnedKey.ownedKeyId,
            rawEvidence: {
              gameId: matchedOwnedKey.gameId,
              purchaseId: matchedOwnedKey.purchaseId,
            },
          },
        });
        await ctx.convex.mutation(internal.verificationIntents.markIntentVerified, {
          intentId: input.intentId,
          methodKey: input.methodKey,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof CredentialExpiredError) {
          await ctx.convex.mutation(internal.subjects.markBuyerProviderLinkExpired, {
            linkId: buyerProviderLink.id,
          });
          return await markIntentFailed(
            input,
            {
              success: false,
              errorCode: 'provider_link_expired',
              errorMessage: PROVIDER_LINK_EXPIRED_MESSAGE,
            },
            ctx.convex.mutation
          );
        }
        throw error;
      }
    },
  };
}

export const buyerLink = createItchioBuyerLinkPlugin();
