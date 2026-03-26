import { deriveEnvelopeKeyBytes } from './releaseArtifactEnvelope';

export type CouplingRuntimeEnvelopeInput = {
  artifactKey: string;
  channel: string;
  platform: string;
  version: string;
  plaintextSha256: string;
};

export function getCouplingRuntimeEnvelopeSecret(): string {
  return (
    process.env.YUCP_RELEASE_ENVELOPE_SECRET?.trim() ||
    process.env.YUCP_COUPLING_ENVELOPE_SECRET?.trim() ||
    process.env.YUCP_ROOT_PRIVATE_KEY?.trim() ||
    ''
  );
}

export function buildCouplingRuntimeEnvelopePurpose(
  args: CouplingRuntimeEnvelopeInput
): string {
  return [
    'signed-release-artifact',
    args.artifactKey,
    args.channel,
    args.platform,
    args.version,
    args.plaintextSha256,
  ].join('|');
}

export async function deriveCouplingRuntimeEnvelopeKeyBytes(
  args: CouplingRuntimeEnvelopeInput
): Promise<Uint8Array> {
  const envelopeSecret = getCouplingRuntimeEnvelopeSecret();
  if (!envelopeSecret) {
    throw new Error('YUCP_RELEASE_ENVELOPE_SECRET or YUCP_ROOT_PRIVATE_KEY must be configured');
  }

  return await deriveEnvelopeKeyBytes(
    envelopeSecret,
    buildCouplingRuntimeEnvelopePurpose(args)
  );
}
