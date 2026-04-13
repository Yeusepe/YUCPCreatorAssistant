/**
 * Publish the per-user coupling runtime package ZIP to Convex.
 *
 * Usage:
 *   bun run convex:publish:coupling-runtime-package
 *   bun run convex:publish:coupling-runtime-package -- --version 2026.03.27.010000
 *   bun run convex:publish:coupling-runtime-package -- --storageId kg2abc123...
 *   bun run convex:publish:coupling-runtime-package -- --sourcePath E:\path\to\runtime-package.zip
 *   bun run convex:publish:coupling-runtime-package -- --prod --push
 */

import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_COUPLING_RUNTIME_PACKAGE_DELIVERY_NAME } from '../convex/lib/couplingRuntimePackageConfig';

type PublishOptions = {
  version?: string;
  sourcePath?: string;
  storageId?: string;
  deliveryName?: string;
  channel?: string;
  platform?: string;
  codeSigningSubject?: string;
  codeSigningThumbprint?: string;
  prod: boolean;
  push: boolean;
  keepSourceUpload: boolean;
};

const DEFAULT_RUNTIME_BUILD_PATH_SEGMENTS = [
  'Verify',
  'Native',
  'coupling-runtime-com',
  'out',
  'win-x64',
  'Release',
] as const;

const DEFAULT_RUNTIME_INSTALLER_PATH_SEGMENTS = [
  'Verify',
  'Native',
  'coupling-runtime-installer',
] as const;

function getDefaultRuntimeBuildPath(): string {
  return resolve(process.cwd(), ...DEFAULT_RUNTIME_BUILD_PATH_SEGMENTS);
}

function getDefaultRuntimeInstallerPath(): string {
  return resolve(process.cwd(), ...DEFAULT_RUNTIME_INSTALLER_PATH_SEGMENTS);
}

function formatVersionFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}.${month}.${day}.${hour}${minute}${second}`;
}

function printUsage(): void {
  console.log(`publish-coupling-runtime-package

Usage:
  bun run convex:publish:coupling-runtime-package
  bun run convex:publish:coupling-runtime-package -- --version 2026.03.27.010000
  bun run convex:publish:coupling-runtime-package -- --storageId kg2abc123...
  bun run convex:publish:coupling-runtime-package -- --sourcePath E:\\path\\to\\runtime-package.zip
  bun run convex:publish:coupling-runtime-package -- --prod --push

Options:
  --version <value>                Override the published artifact version.
  --sourcePath <path>              Override the default local ZIP path.
  --storageId <id>                 Reuse a file already uploaded to Convex Storage.
  --deliveryName <value>           Override the delivered filename.
  --channel <value>                Override the release channel.
  --platform <value>               Override the release platform.
  --codeSigningSubject <value>     Record a signing subject in artifact metadata.
  --codeSigningThumbprint <value>  Record a signing thumbprint in artifact metadata.
  --keepSourceUpload               Keep the temporary plaintext storage upload after activation.
  --prod                           Run against the default production deployment.
  --push                           Push code before running admin functions.
  --help                           Show this message.

Defaults:
  build path     ${getDefaultRuntimeBuildPath()}
  installer path ${getDefaultRuntimeInstallerPath()}
  deliveryName   ${DEFAULT_COUPLING_RUNTIME_PACKAGE_DELIVERY_NAME}
`);
}

function buildConvexRunArgs(
  options: PublishOptions,
  functionName: string,
  payload?: unknown,
  includePush = false
): string[] {
  const args = ['bun', 'x', 'convex', 'run', '--typecheck', 'enable'];
  if (options.prod) {
    args.push('--prod');
  }
  if (includePush && options.push) {
    args.push('--push');
  }
  args.push(functionName);
  if (payload !== undefined) {
    args.push(JSON.stringify(payload));
  }
  return args;
}

async function runConvexForString(options: PublishOptions, functionName: string): Promise<string> {
  const proc = Bun.spawn({
    cmd: buildConvexRunArgs(options, functionName, undefined, true),
    env: process.env,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const [stdoutText, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`${functionName} failed with exit code ${exitCode}`);
  }

  const lines = stdoutText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1) ?? '';
  const value = lastLine.replace(/^['"]|['"]$/g, '');
  if (!value) {
    throw new Error(`${functionName} returned an empty value`);
  }
  return value;
}

/**
 * Generate a valid XGQW1-format pixelseal pack file and return its bytes.
 *
 * Format:
 *   [0..7]   magic XGQW1\0\0\0
 *   [8..11]  version u32 LE = 1
 *   [12..15] blob_len u32 LE
 *   [16..47] 32 reserved zero bytes
 *   [48..]   CSPRNG blob
 *
 * The SHA-256 of the full file becomes the carrier PRNG seed in xg_0117.
 * A fresh pack is generated per publish so carrier positions rotate with
 * each release. The pack SHA-256 is recorded in coupling_trace_records
 * (packVersion field) to allow forensic recovery.
 */
function generatePackFileBytes(blobSize = 4096): Buffer {
  if (blobSize < 16 || blobSize > 32 * 1024 * 1024) {
    throw new Error(`Pack blob size must be 16..33554432, got ${blobSize}`);
  }
  const total = 48 + blobSize;
  const buf = Buffer.alloc(total, 0);

  buf.write('XGQW1', 0, 'ascii'); // magic [0..4]; [5..7] = 0
  buf.writeUInt32LE(1, 8); // version
  buf.writeUInt32LE(blobSize, 12); // blob_len
  // [16..47] = 0 (reserved)
  const blob = randomBytes(blobSize);
  blob.copy(buf, 48);
  blob.fill(0); // zero after use
  return buf;
}

function buildRuntimePackageZip(): string {
  const buildPath = getDefaultRuntimeBuildPath();
  const installerPath = getDefaultRuntimeInstallerPath();
  if (!existsSync(buildPath)) {
    throw new Error(`Coupling runtime build output not found: ${buildPath}`);
  }
  if (!existsSync(installerPath)) {
    throw new Error(`Coupling runtime installer scripts not found: ${installerPath}`);
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'yucp-runtime-package-'));
  const stageRoot = join(tempRoot, 'stage');
  const buildStage = join(stageRoot, 'build');
  const installerStage = join(stageRoot, 'installer');
  const zipPath = join(tempRoot, DEFAULT_COUPLING_RUNTIME_PACKAGE_DELIVERY_NAME);

  cpSync(buildPath, buildStage, { recursive: true });

  // Generate a fresh pack file for this release; goes alongside yucp_coupling.dll
  // so xw_pack_scan can locate it. A new file is generated per publish to rotate
  // the carrier PRNG seed across releases.
  const packBytes = generatePackFileBytes();
  writeFileSync(join(buildStage, 'xg_0300.dat'), packBytes);
  packBytes.fill(0); // zero after use

  cpSync(installerPath, installerStage, {
    recursive: true,
    filter: (source) => {
      const lower = source.toLowerCase();
      return (
        !lower.endsWith('.pdb') &&
        !lower.includes('\\out\\') &&
        !lower.endsWith('\\test.ps1') &&
        !lower.endsWith('/test.ps1')
      );
    },
  });
  writeFileSync(
    join(stageRoot, 'runtime-package-manifest.json'),
    JSON.stringify(
      {
        version: 1,
        buildDir: 'build',
        installScriptPath: 'installer/install.ps1',
        repairScriptPath: 'installer/repair.ps1',
      },
      null,
      2
    )
  );

  // Use ZipFile::CreateFromDirectory rather than Compress-Archive. Compress-Archive with
  // wildcards produces incomplete archives when stdout/stderr are piped (missing entries
  // beyond the first top-level directory). ZipFile is deterministic regardless of console state.
  const escapedStage = stageRoot.replace(/'/g, "''");
  const escapedZip = zipPath.replace(/'/g, "''");
  const command = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `[System.IO.Compression.ZipFile]::CreateFromDirectory('${escapedStage}', '${escapedZip}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`,
  ].join('; ');
  const proc = Bun.spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-Command', command], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      `ZIP creation failed: ${
        Buffer.from(proc.stderr).toString('utf8').trim() || `exit ${proc.exitCode}`
      }`
    );
  }

  return zipPath;
}

async function uploadRuntimePackageIfNeeded(
  options: PublishOptions,
  sourcePath: string
): Promise<string> {
  if (options.storageId) {
    return options.storageId;
  }

  const uploadUrl = await runConvexForString(
    options,
    'couplingRuntimeUpload:generateRuntimePackageUploadUrl'
  );
  if (!/^https?:\/\//i.test(uploadUrl)) {
    throw new Error(`Unexpected upload URL returned by Convex: ${uploadUrl}`);
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: Bun.file(sourcePath),
  });
  if (!response.ok) {
    throw new Error(
      `Convex Storage upload failed with ${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  const result = (await response.json()) as { storageId?: string };
  const storageId = result.storageId?.trim();
  if (!storageId) {
    throw new Error('Convex Storage upload did not return a storageId');
  }
  return storageId;
}

async function activateRuntimePackage(
  options: PublishOptions,
  storageId: string,
  sourcePath: string,
  includePush: boolean
): Promise<void> {
  const payload = {
    storageId,
    version: options.version,
    deliveryName: options.deliveryName,
    deleteSourceAfterPublish: !options.keepSourceUpload,
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.codeSigningSubject ? { codeSigningSubject: options.codeSigningSubject } : {}),
    ...(options.codeSigningThumbprint
      ? { codeSigningThumbprint: options.codeSigningThumbprint }
      : {}),
  };

  const proc = Bun.spawn({
    cmd: buildConvexRunArgs(
      options,
      'couplingRuntime:publishUploadedRuntimePackage',
      payload,
      includePush
    ),
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      `couplingRuntime:publishUploadedRuntimePackage failed with exit code ${exitCode}`
    );
  }

  console.log(`[publish-coupling-runtime-package] activated storageId=${storageId}`);
  console.log(`[publish-coupling-runtime-package] sourcePath=${sourcePath}`);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      sourcePath: { type: 'string' },
      storageId: { type: 'string' },
      deliveryName: { type: 'string' },
      channel: { type: 'string' },
      platform: { type: 'string' },
      codeSigningSubject: { type: 'string' },
      codeSigningThumbprint: { type: 'string' },
      prod: { type: 'boolean', default: false },
      push: { type: 'boolean', default: false },
      keepSourceUpload: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const usingExistingStorageId = Boolean(values.storageId?.trim());
  const builtSourcePath =
    !usingExistingStorageId && !values.sourcePath?.trim() ? buildRuntimePackageZip() : '';
  const sourcePath = values.sourcePath?.trim() || builtSourcePath;
  if (!usingExistingStorageId && !existsSync(sourcePath)) {
    throw new Error(`Coupling runtime package source not found: ${sourcePath}`);
  }

  const version =
    values.version?.trim() ||
    formatVersionFromDate(usingExistingStorageId ? new Date() : statSync(sourcePath).mtime);

  const options: PublishOptions = {
    version,
    sourcePath,
    storageId: values.storageId?.trim(),
    deliveryName: values.deliveryName?.trim() || DEFAULT_COUPLING_RUNTIME_PACKAGE_DELIVERY_NAME,
    channel: values.channel?.trim(),
    platform: values.platform?.trim(),
    codeSigningSubject: values.codeSigningSubject?.trim(),
    codeSigningThumbprint: values.codeSigningThumbprint?.trim(),
    prod: values.prod,
    push: values.push,
    keepSourceUpload: values.keepSourceUpload,
  };

  try {
    console.log(`[publish-coupling-runtime-package] version=${version}`);
    console.log(
      `[publish-coupling-runtime-package] deployment=${options.prod ? 'prod' : 'current'}`
    );
    const storageId = await uploadRuntimePackageIfNeeded(options, sourcePath);
    await activateRuntimePackage(
      options,
      storageId,
      sourcePath,
      usingExistingStorageId && options.push
    );
  } finally {
    if (builtSourcePath) {
      rmSync(resolve(builtSourcePath, '..'), { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  await main();
}
