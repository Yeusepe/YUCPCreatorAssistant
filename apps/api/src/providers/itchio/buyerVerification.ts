import { CredentialExpiredError } from '@yucp/providers/contracts';
import { ITCHIO_PURPOSES, verifyItchioDownloadKey } from '@yucp/providers/itchio/module';
import { api } from '../../../../../convex/_generated/api';
import { decrypt } from '../../lib/encrypt';
import {
  createManualLicenseCapability,
  resolveBuyerVerificationStoreContext,
} from '../../verification/buyerVerificationHelpers';
import type { BuyerVerificationAdapter } from '../types';

export const buyerVerification: BuyerVerificationAdapter = {
  providerId: 'itchio',
  describeCapability(methodKind) {
    if (methodKind !== 'manual_license') {
      return null;
    }
    return createManualLicenseCapability('itchio');
  },
  async verify(input, ctx) {
    if (input.methodKind !== 'manual_license') {
      return {
        success: false,
        errorCode: 'unsupported_method',
        errorMessage: 'This verification method is not supported for itch.io.',
      };
    }

    const storeContext = await resolveBuyerVerificationStoreContext(
      {
        providerId: 'itchio',
        packageId: input.packageId,
        providerProductRef: input.providerProductRef,
      },
      ctx
    );
    if (!storeContext.ok) {
      return storeContext.result;
    }

    const connection = await ctx.convex.query(api.providerConnections.getConnectionForBackfill, {
      apiSecret: ctx.apiSecret,
      authUserId: storeContext.creatorAuthUserId,
      provider: 'itchio',
    });

    const encryptedAccessToken = connection?.credentials.oauth_access_token;
    if (!encryptedAccessToken) {
      return {
        success: false,
        errorCode: 'creator_store_unavailable',
        errorMessage:
          'The creator has not connected itch.io for this product yet. Ask them to reconnect the store and try again.',
      };
    }

    try {
      const accessToken = await decrypt(
        encryptedAccessToken,
        ctx.encryptionSecret,
        ITCHIO_PURPOSES.credential
      );
      const result = await verifyItchioDownloadKey(
        input.licenseKey,
        input.providerProductRef,
        accessToken,
        {}
      );

      if (!result.valid) {
        return {
          success: false,
          errorCode: 'invalid_proof',
          errorMessage: result.error ?? 'Download key verification failed',
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof CredentialExpiredError) {
        return {
          success: false,
          errorCode: 'creator_store_unavailable',
          errorMessage:
            'The creator itch.io connection has expired. Ask them to reconnect the store and try again.',
        };
      }
      throw error;
    }
  },
};
