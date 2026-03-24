"use node";

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { RELEASE_ARTIFACT_KEYS, RELEASE_CHANNELS, RELEASE_PLATFORMS } from './lib/releaseArtifactKeys';
import {
  bytesToBase64,
  deriveEnvelopeKeyBytes,
  encryptArtifactEnvelope,
  sha256HexBytes,
} from './lib/releaseArtifactEnvelope';

const COUPLING_RUNTIME_METADATA_VERSION = 1;
const COUPLING_RUNTIME_CONTENT_TYPE = 'application/octet-stream';
const COUPLING_RUNTIME_ENVELOPE_CIPHER = 'aes-256-gcm';

function getDefaultRuntimePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(
    here,
    '..',
    'Verify',
    'Native',
    'yucp_watermark',
    'out',
    'win-x64',
    'Release',
    'yucp_watermark.dll'
  );
}

function getEnvelopeSecret(): string {
  return (
    process.env.YUCP_RELEASE_ENVELOPE_SECRET?.trim() ||
    process.env.YUCP_WATERMARK_ENVELOPE_SECRET?.trim() ||
    process.env.YUCP_ROOT_PRIVATE_KEY?.trim() ||
    ''
  );
}

function buildEnvelopePurpose(args: {
  artifactKey: string;
  channel: string;
  platform: string;
  version: string;
  plaintextSha256: string;
}): string {
  return [
    'signed-release-artifact',
    args.artifactKey,
    args.channel,
    args.platform,
    args.version,
    args.plaintextSha256,
  ].join('|');
}

export const publishRuntimeFromLocalSource = internalAction({
  args: {
    version: v.string(),
    channel: v.optional(v.string()),
    platform: v.optional(v.string()),
    deliveryName: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    codeSigningSubject: v.optional(v.string()),
    codeSigningThumbprint: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    artifactId: v.optional(v.id('signed_release_artifacts')),
    plaintextSha256: v.optional(v.string()),
    ciphertextSha256: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    artifactId?: Id<'signed_release_artifacts'>;
    plaintextSha256?: string;
    ciphertextSha256?: string;
    sourcePath?: string;
    error?: string;
  }> => {
    const sourcePath = (args.sourcePath || '').trim() || getDefaultRuntimePath();
    if (!existsSync(sourcePath)) {
      return {
        success: false,
        error: `Coupling runtime source not found: ${sourcePath}`,
      };
    }

    const envelopeSecret = getEnvelopeSecret();
    if (!envelopeSecret) {
      throw new Error('YUCP_RELEASE_ENVELOPE_SECRET or YUCP_ROOT_PRIVATE_KEY must be configured');
    }

    const artifactKey = RELEASE_ARTIFACT_KEYS.couplingRuntime;
    const channel = (args.channel || '').trim() || RELEASE_CHANNELS.stable;
    const platform = (args.platform || '').trim() || RELEASE_PLATFORMS.winX64;
    const deliveryName = (args.deliveryName || '').trim() || 'runtime.bin';
    const plaintext = new Uint8Array(readFileSync(sourcePath));
    const plaintextSha256 = await sha256HexBytes(plaintext);
    const envelopeKey = await deriveEnvelopeKeyBytes(
      envelopeSecret,
      buildEnvelopePurpose({
        artifactKey,
        channel,
        platform,
        version: args.version,
        plaintextSha256,
      })
    );
    const encrypted = await encryptArtifactEnvelope(plaintext, envelopeKey);
    const ciphertextBuffer = Uint8Array.from(encrypted.ciphertext).buffer;
    const storageId = await ctx.storage.store(
      new Blob([ciphertextBuffer], { type: COUPLING_RUNTIME_CONTENT_TYPE })
    );

    const artifactId = await ctx.runMutation(internal.releaseArtifacts.publishArtifact, {
      artifactKey,
      channel,
      platform,
      version: args.version,
      metadataVersion: COUPLING_RUNTIME_METADATA_VERSION,
      storageId,
      contentType: COUPLING_RUNTIME_CONTENT_TYPE,
      deliveryName,
      envelopeCipher: COUPLING_RUNTIME_ENVELOPE_CIPHER,
      envelopeIvBase64: encrypted.ivBase64,
      ciphertextSha256: encrypted.ciphertextSha256,
      ciphertextSize: encrypted.ciphertext.byteLength,
      plaintextSha256: encrypted.plaintextSha256,
      plaintextSize: plaintext.byteLength,
      codeSigningSubject: args.codeSigningSubject,
      codeSigningThumbprint: args.codeSigningThumbprint,
    });

    await ctx.runMutation(internal.releaseArtifacts.recordArtifactPublishedAudit, {
      artifactKey,
      channel,
      platform,
      version: args.version,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
    });

    return {
      success: true,
      artifactId,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
      sourcePath,
    };
  },
});

export const getActiveRuntimeManifestData = internalAction({
  args: {
    channel: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    artifactKey: v.optional(v.string()),
    channel: v.optional(v.string()),
    platform: v.optional(v.string()),
    version: v.optional(v.string()),
    metadataVersion: v.optional(v.number()),
    deliveryName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    envelopeCipher: v.optional(v.string()),
    envelopeIvBase64: v.optional(v.string()),
    envelopeKeyBase64: v.optional(v.string()),
    ciphertextSha256: v.optional(v.string()),
    ciphertextSize: v.optional(v.number()),
    plaintextSha256: v.optional(v.string()),
    plaintextSize: v.optional(v.number()),
    codeSigningSubject: v.optional(v.string()),
    codeSigningThumbprint: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    artifactKey?: string;
    channel?: string;
    platform?: string;
    version?: string;
    metadataVersion?: number;
    deliveryName?: string;
    contentType?: string;
    envelopeCipher?: string;
    envelopeIvBase64?: string;
    envelopeKeyBase64?: string;
    ciphertextSha256?: string;
    ciphertextSize?: number;
    plaintextSha256?: string;
    plaintextSize?: number;
    codeSigningSubject?: string;
    codeSigningThumbprint?: string;
    error?: string;
  }> => {
    const channel = (args.channel || '').trim() || RELEASE_CHANNELS.stable;
    const platform = (args.platform || '').trim() || RELEASE_PLATFORMS.winX64;
    const artifact = await ctx.runQuery(internal.releaseArtifacts.getActiveArtifact, {
      artifactKey: RELEASE_ARTIFACT_KEYS.couplingRuntime,
      channel,
      platform,
    });
    if (!artifact) {
      return {
        success: false,
        error: 'Coupling runtime is not configured on the server',
      };
    }

    const envelopeSecret = getEnvelopeSecret();
    if (!envelopeSecret) {
      throw new Error('YUCP_RELEASE_ENVELOPE_SECRET or YUCP_ROOT_PRIVATE_KEY must be configured');
    }

    const envelopeKey = await deriveEnvelopeKeyBytes(
      envelopeSecret,
      buildEnvelopePurpose({
        artifactKey: artifact.artifactKey,
        channel: artifact.channel,
        platform: artifact.platform,
        version: artifact.version,
        plaintextSha256: artifact.plaintextSha256,
      })
    );

    return {
      success: true,
      artifactKey: artifact.artifactKey,
      channel: artifact.channel,
      platform: artifact.platform,
      version: artifact.version,
      metadataVersion: artifact.metadataVersion,
      deliveryName: artifact.deliveryName,
      contentType: artifact.contentType,
      envelopeCipher: artifact.envelopeCipher,
      envelopeIvBase64: artifact.envelopeIvBase64,
      envelopeKeyBase64: bytesToBase64(envelopeKey),
      ciphertextSha256: artifact.ciphertextSha256,
      ciphertextSize: artifact.ciphertextSize,
      plaintextSha256: artifact.plaintextSha256,
      plaintextSize: artifact.plaintextSize,
      codeSigningSubject: artifact.codeSigningSubject,
      codeSigningThumbprint: artifact.codeSigningThumbprint,
    };
  },
});
