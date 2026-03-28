/**
 * Certificate billing configuration.
 *
 * Polar references:
 *   Better Auth adapter  https://polar.sh/docs/integrate/sdk/adapters/better-auth
 *   Customer state       https://polar.sh/docs/integrate/customer-state
 */

export const CERTIFICATE_WORKSPACE_METADATA_KEY = 'workspace_key';

export interface CertificateBillingConfig {
  enabled: boolean;
  polarAccessToken?: string;
  polarWebhookSecret?: string;
  polarServer?: 'sandbox';
}

export function buildAuthUserWorkspaceKey(authUserId: string): string {
  return `auth-user:${authUserId}`;
}

export function buildCreatorProfileWorkspaceKey(creatorProfileId: string): string {
  return `creator-profile:${creatorProfileId}`;
}

export function resolveWorkspaceKeys(
  authUserId: string,
  creatorProfileId?: string | null
): string[] {
  const keys = [buildAuthUserWorkspaceKey(authUserId)];
  if (creatorProfileId) {
    keys.unshift(buildCreatorProfileWorkspaceKey(creatorProfileId));
  }
  return keys;
}

export function extractWorkspaceKeyFromMetadata(
  metadata: Record<string, string | number | boolean> | null | undefined,
  fallbackWorkspaceKey: string
): string {
  const candidate = metadata?.[CERTIFICATE_WORKSPACE_METADATA_KEY];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : fallbackWorkspaceKey;
}

export function getCertificateBillingConfig(): CertificateBillingConfig {
  const polarAccessToken = process.env.POLAR_ACCESS_TOKEN?.trim();
  const polarWebhookSecret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  const polarServer =
    process.env.POLAR_SERVER?.trim().toLowerCase() === 'sandbox' ? 'sandbox' : undefined;

  return {
    enabled: Boolean(polarAccessToken && polarWebhookSecret),
    polarAccessToken,
    polarWebhookSecret,
    polarServer,
  };
}
