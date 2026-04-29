import { resolveYucpAliasIdFromCatalogProduct } from '@yucp/shared';

export type CatalogProductAliasSource = {
  _id: string;
  canonicalSlug?: string | null;
  providerProductRef?: string | null;
};

export type SyntheticAliasMetadataSeed = {
  aliasId: string;
  catalogProductIds: string[];
  channel: string;
};

export function buildSyntheticAliasMetadataSeed(
  catalogProducts: ReadonlyArray<CatalogProductAliasSource>,
  channel: string
): SyntheticAliasMetadataSeed | undefined {
  const uniqueProducts = Array.from(
    new Map(catalogProducts.map((product) => [String(product._id), product])).values()
  ).sort((left, right) => String(left._id).localeCompare(String(right._id)));
  const aliasIds = Array.from(
    new Set(
      uniqueProducts
        .map((product) => resolveYucpAliasIdFromCatalogProduct(product))
        .filter((aliasId): aliasId is string => Boolean(aliasId))
    )
  );
  if (aliasIds.length !== 1) {
    return undefined;
  }

  return {
    aliasId: aliasIds[0],
    catalogProductIds: uniqueProducts.map((product) => String(product._id)),
    channel,
  };
}
