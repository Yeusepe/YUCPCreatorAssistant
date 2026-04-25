export type BuyerProviderLinkStatus = 'active' | 'expired' | 'revoked';

export interface BuyerProviderLinkProviderDisplay {
  label: string;
  icon: string | null;
  color: string | null;
  description: string;
}

export interface BuyerProviderLinkRecord {
  id: string;
  ownerAuthUserId: string;
  provider: string;
  label: string;
  status: BuyerProviderLinkStatus;
  providerUserId: string;
  providerUsername?: string | null;
  verificationMethod?: string | null;
  linkedAt: number;
  lastValidatedAt?: number | null;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt: number;
  providerDisplay?: BuyerProviderLinkProviderDisplay;
}

export interface BuyerProviderLinkSummary {
  id: string;
  provider: string;
  label: string;
  status: Exclude<BuyerProviderLinkStatus, 'revoked'>;
  providerUserId: string;
  providerUsername?: string | null;
  verificationMethod?: string | null;
  linkedAt: number;
  lastValidatedAt?: number | null;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BuyerProviderLinkAccountConnection extends BuyerProviderLinkSummary {
  connectionType: 'verification';
  webhookConfigured: false;
  hasApiKey: false;
  hasAccessToken: false;
  providerDisplay?: BuyerProviderLinkProviderDisplay;
}

export interface BuyerProviderLinkSurfaceCase {
  name: string;
  status: BuyerProviderLinkStatus;
  expectVisible: boolean;
  expectedActiveCount: number;
  expectedExpiredCount: number;
}

export const BUYER_PROVIDER_LINK_SURFACE_MATRIX: readonly BuyerProviderLinkSurfaceCase[] = [
  {
    name: 'active link stays visible as an active account',
    status: 'active',
    expectVisible: true,
    expectedActiveCount: 1,
    expectedExpiredCount: 0,
  },
  {
    name: 'expired link stays visible as a degraded account',
    status: 'expired',
    expectVisible: true,
    expectedActiveCount: 0,
    expectedExpiredCount: 1,
  },
  {
    name: 'revoked link is hidden from read surfaces',
    status: 'revoked',
    expectVisible: false,
    expectedActiveCount: 0,
    expectedExpiredCount: 0,
  },
] as const;

const DEFAULT_PROVIDER_DISPLAY: BuyerProviderLinkProviderDisplay = {
  label: 'itch.io',
  icon: 'Itchio.png',
  color: '#fa5c5c',
  description: 'Linked provider',
};

export function createBuyerProviderLinkRecord(
  overrides: Partial<BuyerProviderLinkRecord> = {}
): BuyerProviderLinkRecord {
  const status = overrides.status ?? 'active';
  const hasProviderUsername = Object.hasOwn(overrides, 'providerUsername');
  const hasVerificationMethod = Object.hasOwn(overrides, 'verificationMethod');
  const hasLastValidatedAt = Object.hasOwn(overrides, 'lastValidatedAt');
  const hasExpiresAt = Object.hasOwn(overrides, 'expiresAt');

  return {
    id: overrides.id ?? `buyer-link-${status}-1`,
    ownerAuthUserId: overrides.ownerAuthUserId ?? 'buyer_auth_user_B',
    provider: overrides.provider ?? 'itchio',
    label: overrides.label ?? 'itch.io account',
    status,
    providerUserId: overrides.providerUserId ?? 'buyer_b_user_id',
    providerUsername: hasProviderUsername ? overrides.providerUsername : 'buyer-b',
    verificationMethod: hasVerificationMethod ? overrides.verificationMethod : 'account_link',
    linkedAt: overrides.linkedAt ?? 1,
    lastValidatedAt: hasLastValidatedAt ? overrides.lastValidatedAt : 2,
    expiresAt: hasExpiresAt ? overrides.expiresAt : status === 'expired' ? 2 : null,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 2,
    providerDisplay: overrides.providerDisplay ?? DEFAULT_PROVIDER_DISPLAY,
  };
}

function toBuyerProviderLinkSummary(record: BuyerProviderLinkRecord): BuyerProviderLinkSummary {
  if (record.status === 'revoked') {
    throw new Error('Revoked buyer-provider links should not be mapped to visible summaries');
  }

  return {
    id: record.id,
    provider: record.provider,
    label: record.label,
    status: record.status,
    providerUserId: record.providerUserId,
    providerUsername: record.providerUsername ?? null,
    verificationMethod: record.verificationMethod ?? null,
    linkedAt: record.linkedAt,
    lastValidatedAt: record.lastValidatedAt ?? null,
    expiresAt: record.expiresAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function cloneRecord(record: BuyerProviderLinkRecord): BuyerProviderLinkRecord {
  return {
    ...record,
    providerDisplay: record.providerDisplay ? { ...record.providerDisplay } : undefined,
  };
}

export function createBuyerProviderLinkStore(initialRecords: readonly BuyerProviderLinkRecord[]) {
  const records = initialRecords.map(cloneRecord);

  return {
    listBuyerProviderLinks(authUserId: string): BuyerProviderLinkSummary[] {
      return records
        .filter((record) => record.ownerAuthUserId === authUserId && record.status !== 'revoked')
        .map(toBuyerProviderLinkSummary);
    },

    listAccountConnections(authUserId: string): BuyerProviderLinkAccountConnection[] {
      return this.listBuyerProviderLinks(authUserId).map((record) => ({
        ...record,
        connectionType: 'verification',
        webhookConfigured: false,
        hasApiKey: false,
        hasAccessToken: false,
        providerDisplay:
          records.find((candidate) => candidate.id === record.id)?.providerDisplay ?? undefined,
      }));
    },

    revoke(authUserId: string, linkId: string): boolean {
      const record = records.find((candidate) => candidate.id === linkId);
      if (!record || record.ownerAuthUserId !== authUserId || record.status === 'revoked') {
        return false;
      }

      record.status = 'revoked';
      record.updatedAt += 1;
      record.expiresAt ??= record.updatedAt;
      return true;
    },

    snapshot(): BuyerProviderLinkRecord[] {
      return records.map(cloneRecord);
    },
  };
}
