import { v } from 'convex/values';
import {
  COMMERCE_PROVIDER_KEYS,
  LICENSE_PROVIDER_KEYS,
  PROVIDER_KEYS,
  WEBHOOK_PROVIDER_KEYS,
} from '../../packages/shared/src/providers';

function literalUnion<T extends readonly string[]>(values: T) {
  return v.union(...(values.map((value) => v.literal(value)) as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]]));
}

/** All providers — matches the shared provider registry. */
export const ProviderV = literalUnion(PROVIDER_KEYS);

/** Providers with purchasable catalog products (license-bearing). */
export const LicenseProviderV = literalUnion(LICENSE_PROVIDER_KEYS as readonly string[]);

/** Providers that send webhooks. */
export const WebhookProviderV = literalUnion(WEBHOOK_PROVIDER_KEYS as readonly string[]);

/** Providers that can have provider_customers rows. */
export const CustomerProviderV = literalUnion(COMMERCE_PROVIDER_KEYS as readonly string[]);

/** Verification session methods (discord_role is a method, not a provider key). */
export const VerificationMethodV = v.union(
  ...([
    ...PROVIDER_KEYS.map((value) => v.literal(value)),
    v.literal('discord_role'),
  ] as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]])
);

/** Backward-compatible alias used throughout the current codebase. */
export const VerificationModeV = VerificationMethodV;
