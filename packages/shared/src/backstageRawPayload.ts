import { unzipSync } from 'fflate';
import { detectBackstageVpmDeliverySourceKind } from './backstageVpmDelivery';

export type BackstageRawPayload = {
  bytes: Uint8Array;
  contentType: 'application/octet-stream' | 'application/zip';
  deliveryName: string;
};

export function normalizeBackstageRawPayload(input: {
  sourceBytes: Uint8Array;
  contentType?: string;
  deliveryName: string;
  packageId: string;
  version: string;
}): BackstageRawPayload {
  const sourceKind = detectBackstageVpmDeliverySourceKind({
    deliveryName: input.deliveryName,
    contentType: input.contentType,
    bytes: input.sourceBytes,
  });
  if (sourceKind === 'unitypackage') {
    return {
      bytes: input.sourceBytes,
      contentType: 'application/octet-stream',
      deliveryName: input.deliveryName,
    };
  }

  const archive = unzipSync(input.sourceBytes);
  const payloadBytes = archive['BackstagePayload~/payload.unitypackage'];
  if (!payloadBytes) {
    return {
      bytes: input.sourceBytes,
      contentType: 'application/zip',
      deliveryName: input.deliveryName,
    };
  }

  const manifestBytes = archive['BackstagePayload~/backstage-payload.json'];
  const manifest = manifestBytes
    ? (JSON.parse(new TextDecoder().decode(manifestBytes)) as { payloadFileName?: string })
    : null;
  return {
    bytes: payloadBytes,
    contentType: 'application/octet-stream',
    deliveryName:
      manifest?.payloadFileName?.trim() || `${input.packageId}-${input.version}.unitypackage`,
  };
}
