import { BILLING_CAPABILITY_KEYS } from './billingCapabilities';

export type CertificateBillingMetadataValue = string | number | boolean;

export type CertificateBillingMetadataRecord = Record<
  string,
  CertificateBillingMetadataValue
>;

const CERTIFICATE_BILLING_CAPABILITY_KEYS = new Set<string>(
  Object.values(BILLING_CAPABILITY_KEYS)
);

export type CertificateBillingCatalogBenefit = {
  benefitId: string;
  type: string;
  description?: string;
  metadata: CertificateBillingMetadataRecord;
  capabilityKey?: string;
  deviceCap?: number;
  signQuotaPerPeriod?: number;
  auditRetentionDays?: number;
  supportTier?: string;
  tierRank?: number;
};

export type CertificateBillingCatalogMeteredPrice = {
  priceId: string;
  meterId: string;
  meterName: string;
};

export type CertificateBillingCatalogProduct = {
  productId: string;
  slug: string;
  displayName: string;
  description?: string;
  status: 'active' | 'archived';
  sortOrder: number;
  displayBadge?: string;
  recurringInterval?: string;
  recurringPriceIds: string[];
  meteredPrices: CertificateBillingCatalogMeteredPrice[];
  benefitIds: string[];
  highlights: string[];
  metadata: CertificateBillingMetadataRecord;
};

type MetadataInput = Record<string, unknown> | null | undefined;

type BenefitLike = {
  id: string;
  type?: string;
  description?: string | null;
  metadata?: MetadataInput;
};

type ProductLike = {
  id: string;
  name: string;
  description?: string | null;
  metadata?: MetadataInput;
  isArchived?: boolean;
  recurringInterval?: string | null;
  prices?: Array<{
    id: string;
    amountType?: string | null;
    isArchived?: boolean;
    meterId?: string | null;
    meter?: { id: string; name: string } | null;
  }>;
  benefits?: BenefitLike[];
};

export const POLAR_CERTIFICATE_DOMAIN_METADATA_KEY = 'yucp_domain';
export const POLAR_CERTIFICATE_PRODUCT_SORT_METADATA_KEY = 'yucp_sort';
export const POLAR_CERTIFICATE_PRODUCT_BADGE_METADATA_KEY = 'yucp_display_badge';
export const POLAR_CERTIFICATE_PRODUCT_SLUG_METADATA_KEY = 'yucp_slug';
export const POLAR_CERTIFICATE_BENEFIT_CAPABILITY_METADATA_KEYS = [
  'capability_key',
  'feature_key',
  'flag_key',
  'key',
] as const;
export const POLAR_CERTIFICATE_BENEFIT_DEVICE_CAP_METADATA_KEY = 'device_cap';
export const POLAR_CERTIFICATE_BENEFIT_SIGN_QUOTA_METADATA_KEY = 'sign_quota_per_period';
export const POLAR_CERTIFICATE_BENEFIT_AUDIT_RETENTION_METADATA_KEY = 'audit_retention_days';
export const POLAR_CERTIFICATE_BENEFIT_SUPPORT_TIER_METADATA_KEY = 'support_tier';
export const POLAR_CERTIFICATE_BENEFIT_TIER_RANK_METADATA_KEY = 'tier_rank';
export const POLAR_CERTIFICATE_BILLING_DOMAIN = 'certificate_billing';

function isMetadataValue(value: unknown): value is CertificateBillingMetadataValue {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

export function normalizeCertificateBillingMetadata(
  metadata: MetadataInput
): CertificateBillingMetadataRecord {
  const normalized: CertificateBillingMetadataRecord = {};
  if (!metadata || typeof metadata !== 'object') {
    return normalized;
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (isMetadataValue(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function readTrimmedString(
  metadata: CertificateBillingMetadataRecord,
  key: string
): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(
  metadata: CertificateBillingMetadataRecord,
  key: string
): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readPositiveInteger(
  metadata: CertificateBillingMetadataRecord,
  key: string
): number | undefined {
  const value = readFiniteNumber(metadata, key);
  return value !== undefined && value > 0 ? Math.floor(value) : undefined;
}

function normalizeDescription(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function deriveCapabilityKey(
  metadata: CertificateBillingMetadataRecord
): string | undefined {
  for (const key of POLAR_CERTIFICATE_BENEFIT_CAPABILITY_METADATA_KEYS) {
    const value = readTrimmedString(metadata, key);
    if (value && CERTIFICATE_BILLING_CAPABILITY_KEYS.has(value)) {
      return value;
    }
  }

  return undefined;
}

export function isCertificateBillingProduct(product: {
  metadata?: MetadataInput;
}): boolean {
  const metadata = normalizeCertificateBillingMetadata(product.metadata);
  return readTrimmedString(metadata, POLAR_CERTIFICATE_DOMAIN_METADATA_KEY) ===
    POLAR_CERTIFICATE_BILLING_DOMAIN;
}

export function normalizeCertificateBillingCatalogBenefit(
  benefit: BenefitLike
): CertificateBillingCatalogBenefit {
  const metadata = normalizeCertificateBillingMetadata(benefit.metadata);

  return {
    benefitId: benefit.id,
    type: typeof benefit.type === 'string' ? benefit.type : 'unknown',
    description: normalizeDescription(benefit.description),
    metadata,
    capabilityKey: deriveCapabilityKey(metadata),
    deviceCap: readPositiveInteger(
      metadata,
      POLAR_CERTIFICATE_BENEFIT_DEVICE_CAP_METADATA_KEY
    ),
    signQuotaPerPeriod: readPositiveInteger(
      metadata,
      POLAR_CERTIFICATE_BENEFIT_SIGN_QUOTA_METADATA_KEY
    ),
    auditRetentionDays: readPositiveInteger(
      metadata,
      POLAR_CERTIFICATE_BENEFIT_AUDIT_RETENTION_METADATA_KEY
    ),
    supportTier: readTrimmedString(
      metadata,
      POLAR_CERTIFICATE_BENEFIT_SUPPORT_TIER_METADATA_KEY
    ),
    tierRank: readFiniteNumber(metadata, POLAR_CERTIFICATE_BENEFIT_TIER_RANK_METADATA_KEY),
  };
}

export function normalizeCertificateBillingCatalogProduct(
  product: ProductLike
): CertificateBillingCatalogProduct | null {
  const metadata = normalizeCertificateBillingMetadata(product.metadata);
  if (
    readTrimmedString(metadata, POLAR_CERTIFICATE_DOMAIN_METADATA_KEY) !==
    POLAR_CERTIFICATE_BILLING_DOMAIN
  ) {
    return null;
  }

  const activePrices = Array.isArray(product.prices)
    ? product.prices.filter((price) => !price.isArchived)
    : [];
  const recurringPriceIds = activePrices
    .filter((price) => price.amountType !== 'metered_unit')
    .map((price) => price.id);
  const meteredPrices = activePrices
    .filter((price) => price.amountType === 'metered_unit' && price.meterId && price.meter?.name)
    .map((price) => ({
      priceId: price.id,
      meterId: price.meterId ?? '',
      meterName: price.meter?.name ?? '',
    }))
    .filter((price) => price.meterId && price.meterName);
  const benefits = Array.isArray(product.benefits) ? product.benefits : [];
  const highlights = Array.from(
    new Set(
      benefits
        .map((benefit) => normalizeDescription(benefit.description))
        .filter((entry): entry is string => Boolean(entry))
    )
  );

  return {
    productId: product.id,
    slug:
      readTrimmedString(metadata, POLAR_CERTIFICATE_PRODUCT_SLUG_METADATA_KEY) ?? product.id,
    displayName: product.name.trim(),
    description: normalizeDescription(product.description),
    status: product.isArchived ? 'archived' : 'active',
    sortOrder:
      readFiniteNumber(metadata, POLAR_CERTIFICATE_PRODUCT_SORT_METADATA_KEY) ?? Number.MAX_SAFE_INTEGER,
    displayBadge: readTrimmedString(metadata, POLAR_CERTIFICATE_PRODUCT_BADGE_METADATA_KEY),
    recurringInterval:
      typeof product.recurringInterval === 'string' && product.recurringInterval.trim()
        ? product.recurringInterval.trim()
        : undefined,
    recurringPriceIds,
    meteredPrices,
    benefitIds: benefits.map((benefit) => benefit.id),
    highlights,
    metadata,
  };
}

export function aggregateCertificateBillingBenefitEntitlements(
  benefits: CertificateBillingCatalogBenefit[]
): {
  capabilityKeys: string[];
  deviceCap?: number;
  signQuotaPerPeriod?: number;
  auditRetentionDays?: number;
  supportTier?: string;
  tierRank?: number;
} {
  let deviceCap: number | undefined;
  let signQuotaPerPeriod: number | undefined;
  let auditRetentionDays: number | undefined;
  let supportTier: string | undefined;
  let tierRank: number | undefined;
  const capabilityKeys = new Set<string>();

  for (const benefit of benefits) {
    if (benefit.capabilityKey) {
      capabilityKeys.add(benefit.capabilityKey);
    }
    if (
      benefit.deviceCap !== undefined &&
      (deviceCap === undefined || benefit.deviceCap > deviceCap)
    ) {
      deviceCap = benefit.deviceCap;
    }
    if (
      benefit.signQuotaPerPeriod !== undefined &&
      (signQuotaPerPeriod === undefined ||
        benefit.signQuotaPerPeriod > signQuotaPerPeriod)
    ) {
      signQuotaPerPeriod = benefit.signQuotaPerPeriod;
    }
    if (
      benefit.auditRetentionDays !== undefined &&
      (auditRetentionDays === undefined ||
        benefit.auditRetentionDays > auditRetentionDays)
    ) {
      auditRetentionDays = benefit.auditRetentionDays;
    }
    if (
      benefit.tierRank !== undefined &&
      (tierRank === undefined || benefit.tierRank > tierRank)
    ) {
      tierRank = benefit.tierRank;
      supportTier = benefit.supportTier ?? supportTier;
    } else if (!supportTier && benefit.supportTier) {
      supportTier = benefit.supportTier;
    }
  }

  return {
    capabilityKeys: [...capabilityKeys].sort((left, right) => left.localeCompare(right)),
    deviceCap,
    signQuotaPerPeriod,
    auditRetentionDays,
    supportTier,
    tierRank,
  };
}
