import { sha256Hex } from '@yucp/shared/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { makeTestConvex, seedCreatorProfile, seedSubject } from './testHelpers';

const API_SECRET = 'test-secret';

describe('gumroad external storefront backfill', () => {
  beforeEach(() => {
    process.env.CONVEX_API_SECRET = API_SECRET;
  });

  it('projects account-link backfill purchases into entitlements when the purchase fact uses Gumroad’s canonical product id', async () => {
    const t = makeTestConvex();
    const creatorAuthUserId = 'creator-external-storefront';
    const buyerAuthUserId = 'buyer-external-storefront';
    const buyerSubjectId = await seedSubject(t, {
      authUserId: buyerAuthUserId,
      primaryDiscordUserId: 'discord-external-storefront',
    });
    const buyerEmail = 'external-storefront-buyer@example.com';
    const buyerEmailHash = await sha256Hex(buyerEmail);
    const canonicalProductId = 'QAJc7ErxdAC815P5P8R89g==';
    const localProductId = 'gumroad-external-storefront-product';
    const storefrontUrl =
      'https://quaggycharr.gumroad.com/l/Fluffgan?layout=profile&recommended_by=library';

    await seedCreatorProfile(t, {
      authUserId: creatorAuthUserId,
      ownerDiscordUserId: 'discord-creator-external-storefront',
    });

    const catalogProductId = await t.run(async (ctx) => {
      return ctx.db.insert('product_catalog', {
        authUserId: creatorAuthUserId,
        productId: localProductId,
        provider: 'gumroad',
        providerProductRef: canonicalProductId,
        displayName: 'External Storefront Product',
        status: 'active',
        supportsAutoDiscovery: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const normalizedStorefrontUrl = storefrontUrl.toLowerCase().trim();
    await t.run(async (ctx) => {
      await ctx.db.insert('catalog_product_links', {
        catalogProductId,
        provider: 'gumroad',
        originalUrl: storefrontUrl,
        normalizedUrl: normalizedStorefrontUrl,
        urlHash: await sha256Hex(normalizedStorefrontUrl),
        linkKind: 'direct_product',
        status: 'active',
        submittedByAuthUserId: creatorAuthUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const syncResult = await t.mutation(api.identitySync.syncUserFromProvider, {
      apiSecret: API_SECRET,
      authUserId: buyerAuthUserId,
      provider: 'gumroad',
      providerUserId: 'gumroad-external-storefront-buyer',
      username: 'External Storefront Buyer',
      email: buyerEmail,
      discordUserId: 'discord-external-storefront',
    });

    await t.mutation(api.bindings.activateBinding, {
      apiSecret: API_SECRET,
      authUserId: buyerAuthUserId,
      subjectId: buyerSubjectId,
      externalAccountId: syncResult.externalAccountId,
      bindingType: 'verification',
    });

    await t.mutation(api.subjects.upsertBuyerProviderLink, {
      apiSecret: API_SECRET,
      subjectId: buyerSubjectId,
      provider: 'gumroad',
      externalAccountId: syncResult.externalAccountId,
      verificationMethod: 'account_link',
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('purchase_facts', {
        authUserId: creatorAuthUserId,
        provider: 'gumroad',
        externalOrderId: 'sale-external-storefront',
        buyerEmailHash,
        providerProductId: canonicalProductId,
        paymentStatus: 'paid',
        lifecycleStatus: 'active',
        purchasedAt: Date.now() - 60_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const projection = await t.mutation(
      internal.backgroundSync.projectBackfilledPurchasesForProduct,
      {
        authUserId: creatorAuthUserId,
        productId: localProductId,
        provider: 'gumroad',
        providerProductRef: canonicalProductId,
      }
    );

    expect(projection).toMatchObject({
      purchaseFactsFound: 1,
      linkedToSubject: 1,
      entitlementsGranted: 1,
      unresolved: 0,
    });

    const entitlement = await t.query(api.entitlements.getActiveEntitlement, {
      apiSecret: API_SECRET,
      authUserId: creatorAuthUserId,
      subjectId: buyerSubjectId,
      productId: localProductId,
    });

    expect(entitlement).toMatchObject({
      found: true,
      entitlement: expect.objectContaining({
        authUserId: creatorAuthUserId,
        subjectId: buyerSubjectId,
        productId: localProductId,
        sourceProvider: 'gumroad',
        sourceReference: 'gumroad:sale-external-storefront',
      }),
    });
  });
});
