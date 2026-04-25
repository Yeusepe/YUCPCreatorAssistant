import { strToU8, zipSync } from 'fflate';
import { sha256Hex } from './crypto';

const UNITYPACKAGE_EXTENSION = '.unitypackage';
const ZIP_EXTENSION = '.zip';
const RESERVED_METADATA_KEYS = new Set([
  'headers',
  'name',
  'url',
  'version',
  'zipSHA256',
  'yucpArtifactKey',
]);

export type PrepareBackstageArtifactInput = {
  packageId: string;
  version: string;
  displayName?: string;
  description?: string;
  unityVersion?: string;
  metadata?: unknown;
  deliveryName?: string;
  sourceBytes: Uint8Array;
  sourceFileName: string;
};

export type PreparedBackstageArtifact = {
  bytes: Uint8Array;
  contentType: 'application/zip';
  deliveryName: string;
  metadata: Record<string, unknown>;
  sourceKind: 'unitypackage' | 'zip';
  zipSha256: string;
};

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeDeliveryNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function defaultWrappedDeliveryName(packageId: string, version: string): string {
  const normalized = sanitizeDeliveryNameSegment(packageId) || 'backstage-package';
  return `${normalized}-${version}.zip`;
}

function toZipDeliveryName(
  deliveryName: string | undefined,
  packageId: string,
  version: string
): string {
  const normalized = trimOptional(deliveryName);
  if (!normalized) {
    return defaultWrappedDeliveryName(packageId, version);
  }
  if (normalized.toLowerCase().endsWith(ZIP_EXTENSION)) {
    return normalized;
  }
  if (normalized.includes('.')) {
    return `${normalized.replace(/\.[^.]+$/u, '')}${ZIP_EXTENSION}`;
  }
  return `${normalized}${ZIP_EXTENSION}`;
}

function toInstallerSymbolSuffix(packageId: string): string {
  const normalized = packageId.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const shortCode = Array.from(packageId).reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261
  );
  return `${normalized || 'BackstagePackage'}_${shortCode.toString(16)}`;
}

function normalizeManifestMetadata(input: {
  description?: string;
  metadata?: unknown;
  unityVersion?: string;
}): Record<string, unknown> {
  const metadata = isRecord(input.metadata) ? { ...input.metadata } : {};
  for (const reservedKey of RESERVED_METADATA_KEYS) {
    delete metadata[reservedKey];
  }

  const normalizedDependencies = isRecord(metadata.dependencies)
    ? Object.fromEntries(
        Object.entries(metadata.dependencies)
          .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : value])
          .filter(
            (entry): entry is [string, string] =>
              Boolean(entry[0]) && typeof entry[1] === 'string' && Boolean(entry[1])
          )
      )
    : undefined;
  if (normalizedDependencies && Object.keys(normalizedDependencies).length > 0) {
    metadata.dependencies = normalizedDependencies;
  } else {
    delete metadata.dependencies;
  }

  const description = trimOptional(input.description);
  if (description) {
    metadata.description = description;
  }
  const unityVersion = trimOptional(input.unityVersion);
  if (unityVersion) {
    metadata.unity = unityVersion;
  }

  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

function buildInstallerScript(symbolSuffix: string): string {
  const className = `YucpBackstageEmbeddedUnitypackageInstaller_${symbolSuffix}`;
  return `using System;
using System.IO;
using UnityEditor;
using UnityEditor.PackageManager;

namespace Yucp.Backstage.Generated
{
    [Serializable]
    internal sealed class BackstagePayloadManifest
    {
        public string packageId = "";
        public string version = "";
        public string displayName = "";
        public string payloadFileName = "";
        public string payloadSha256 = "";
    }

    [InitializeOnLoad]
    internal static class ${className}
    {
        private const string ManifestRelativePath = "BackstagePayload~/backstage-payload.json";
        private const string PayloadRelativePath = "BackstagePayload~/payload.unitypackage";
        private const string ImportStatePrefix = "yucp.backstage.imported.";

        static ${className}()
        {
            EditorApplication.delayCall += MaybeImportPayload;
        }

        private static void MaybeImportPayload()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += MaybeImportPayload;
                return;
            }

            var packageInfo = PackageInfo.FindForAssembly(typeof(${className}).Assembly);
            if (packageInfo == null || string.IsNullOrWhiteSpace(packageInfo.resolvedPath))
            {
                return;
            }

            var manifestPath = Path.Combine(packageInfo.resolvedPath, ManifestRelativePath);
            var payloadPath = Path.Combine(packageInfo.resolvedPath, PayloadRelativePath);
            if (!File.Exists(manifestPath) || !File.Exists(payloadPath))
            {
                return;
            }

            var manifest = JsonUtility.FromJson<BackstagePayloadManifest>(File.ReadAllText(manifestPath));
            if (manifest == null || string.IsNullOrWhiteSpace(manifest.packageId) || string.IsNullOrWhiteSpace(manifest.payloadSha256))
            {
                return;
            }

            var importKey = ImportStatePrefix + manifest.packageId + "@" + manifest.version + ":" + manifest.payloadSha256;
            if (EditorPrefs.GetBool(importKey, false))
            {
                return;
            }

            var displayLabel = string.IsNullOrWhiteSpace(manifest.displayName) ? manifest.packageId : manifest.displayName;
            try
            {
                AssetDatabase.ImportPackage(payloadPath, false);
                EditorPrefs.SetBool(importKey, true);
                UnityEngine.Debug.Log("[YUCP Backstage] Imported " + displayLabel + " from Backstage Repos.");
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError("[YUCP Backstage] Failed to import " + displayLabel + ": " + ex.Message);
            }
        }
    }
}
`;
}

function buildInstallerAssemblyDefinition(symbolSuffix: string): string {
  return JSON.stringify(
    {
      name: `Yucp.Backstage.PackageInstaller.${symbolSuffix}`,
      includePlatforms: ['Editor'],
    },
    null,
    2
  );
}

function buildWrappedUnitypackageArtifact(input: {
  packageId: string;
  version: string;
  displayName: string;
  deliveryName?: string;
  metadata: Record<string, unknown>;
  sourceBytes: Uint8Array;
  sourceFileName: string;
}): Omit<PreparedBackstageArtifact, 'zipSha256'> {
  const symbolSuffix = toInstallerSymbolSuffix(input.packageId);
  const payloadMetadata = {
    packageId: input.packageId,
    version: input.version,
    displayName: input.displayName,
    payloadFileName: input.sourceFileName,
  };
  const files = {
    'package.json': strToU8(
      JSON.stringify(
        {
          name: input.packageId,
          version: input.version,
          displayName: input.displayName,
          ...input.metadata,
        },
        null,
        2
      )
    ),
    'Editor/Yucp.Backstage.PackageInstaller.asmdef': strToU8(
      buildInstallerAssemblyDefinition(symbolSuffix)
    ),
    'Editor/YucpBackstageEmbeddedUnitypackageInstaller.cs': strToU8(
      buildInstallerScript(symbolSuffix)
    ),
    'BackstagePayload~/payload.unitypackage': input.sourceBytes,
    'BackstagePayload~/backstage-payload.json': strToU8(JSON.stringify(payloadMetadata, null, 2)),
  };
  return {
    bytes: zipSync(files, { level: 6 }),
    contentType: 'application/zip',
    deliveryName: toZipDeliveryName(input.deliveryName, input.packageId, input.version),
    metadata: input.metadata,
    sourceKind: 'unitypackage',
  };
}

export async function prepareBackstageArtifactForPublish(
  input: PrepareBackstageArtifactInput
): Promise<PreparedBackstageArtifact> {
  const sourceFileName = trimOptional(input.sourceFileName);
  if (!sourceFileName) {
    throw new Error('sourceFileName is required');
  }

  const metadata = normalizeManifestMetadata({
    description: input.description,
    metadata: input.metadata,
    unityVersion: input.unityVersion,
  });
  const displayName = trimOptional(input.displayName) ?? input.packageId;
  const sourceKind = sourceFileName.toLowerCase().endsWith(UNITYPACKAGE_EXTENSION)
    ? 'unitypackage'
    : sourceFileName.toLowerCase().endsWith(ZIP_EXTENSION)
      ? 'zip'
      : null;
  if (!sourceKind) {
    throw new Error('Backstage artifacts must be .unitypackage files or .zip files.');
  }

  const preparedArtifact =
    sourceKind === 'unitypackage'
      ? buildWrappedUnitypackageArtifact({
          packageId: input.packageId,
          version: input.version,
          displayName,
          deliveryName: input.deliveryName,
          metadata,
          sourceBytes: input.sourceBytes,
          sourceFileName,
        })
      : {
          bytes: input.sourceBytes,
          contentType: 'application/zip' as const,
          deliveryName: trimOptional(input.deliveryName) ?? sourceFileName,
          metadata,
          sourceKind: 'zip' as const,
        };

  const zipSha256 = await sha256Hex(preparedArtifact.bytes);
  if (sourceKind === 'unitypackage') {
    const payloadManifest = JSON.parse(
      new TextDecoder().decode(
        zipSync(
          {},
          { level: 0 }
        )
      )
    );
    void payloadManifest;
  }
  return {
    ...preparedArtifact,
    bytes: sourceKind === 'unitypackage'
      ? zipSync(
          {
            ...unzipFilesWithPayloadHash(preparedArtifact.bytes, input.packageId, input.version, displayName, sourceFileName, metadata, input.sourceBytes, input.deliveryName, zipSha256),
          },
          { level: 6 }
        )
      : preparedArtifact.bytes,
    zipSha256: sourceKind === 'unitypackage'
      ? await sha256Hex(
          zipSync(
            unzipFilesWithPayloadHash(
              preparedArtifact.bytes,
              input.packageId,
              input.version,
              displayName,
              sourceFileName,
              metadata,
              input.sourceBytes,
              input.deliveryName,
              zipSha256
            ),
            { level: 6 }
          )
        )
      : zipSha256,
  };
}

function unzipFilesWithPayloadHash(
  _bytes: Uint8Array,
  packageId: string,
  version: string,
  displayName: string,
  sourceFileName: string,
  metadata: Record<string, unknown>,
  sourceBytes: Uint8Array,
  deliveryName: string | undefined,
  payloadSha256: string
): Record<string, Uint8Array> {
  const symbolSuffix = toInstallerSymbolSuffix(packageId);
  return {
    'package.json': strToU8(
      JSON.stringify(
        {
          name: packageId,
          version,
          displayName,
          ...metadata,
        },
        null,
        2
      )
    ),
    'Editor/Yucp.Backstage.PackageInstaller.asmdef': strToU8(
      buildInstallerAssemblyDefinition(symbolSuffix)
    ),
    'Editor/YucpBackstageEmbeddedUnitypackageInstaller.cs': strToU8(
      buildInstallerScript(symbolSuffix)
    ),
    'BackstagePayload~/payload.unitypackage': sourceBytes,
    'BackstagePayload~/backstage-payload.json': strToU8(
      JSON.stringify(
        {
          packageId,
          version,
          displayName,
          payloadFileName: sourceFileName,
          payloadSha256,
          deliveryName: toZipDeliveryName(deliveryName, packageId, version),
        },
        null,
        2
      )
    ),
  };
}
