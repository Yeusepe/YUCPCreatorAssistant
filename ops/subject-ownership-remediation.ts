/**
 * Detection-first remediation helper for subject auth ownership corruption.
 *
 * Usage:
 *   bun run ops:subject-ownership-remediation
 *   bun run ops:subject-ownership-remediation -- --limit 100
 *   bun run ops:subject-ownership-remediation -- --apply --subjectId k123 --subjectId k456
 */

import { parseArgs } from 'node:util';
import { buildBunToolCommand } from './cli-utils';

const DEFAULT_SUBJECT_OWNERSHIP_REPORT_LIMIT = 50;

export type SubjectOwnershipRemediationOptions = {
  apply: boolean;
  subjectIds: string[];
  help: boolean;
  limit: number;
};

function printUsage(): void {
  console.log(
    [
      'subject-ownership-remediation',
      '',
      'Usage:',
      '  bun run ops:subject-ownership-remediation',
      '  bun run ops:subject-ownership-remediation -- --limit 100',
      '  bun run ops:subject-ownership-remediation -- --apply --subjectId k123 --subjectId k456',
      '',
      'Options:',
      '  --limit <number>     Max ownership candidates to report in detection mode. Default: 50.',
      '  --apply              Execute the explicit repair mutation for selected subjects.',
      '  --subjectId <id>     Subject ID to repair. Repeat for multiple subjects.',
      '  --help               Show this message.',
      '',
      'Safety:',
      '  This tool intentionally refuses --prod. Run it only against a reviewed non-prod deployment first.',
      '  Detection mode is the default. No data is mutated unless --apply is set with explicit --subjectId values.',
    ].join('\n')
  );
}

export function parseSubjectOwnershipRemediationOptions(
  argv: readonly string[]
): SubjectOwnershipRemediationOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      apply: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      limit: { type: 'string' },
      prod: { type: 'boolean', default: false },
      subjectId: { type: 'string', multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.prod) {
    throw new Error('--prod is intentionally unsupported for subject ownership remediation');
  }

  const limit = values.limit
    ? Number.parseInt(values.limit, 10)
    : DEFAULT_SUBJECT_OWNERSHIP_REPORT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${values.limit}`);
  }

  const subjectIds = (values.subjectId ?? []).map((value) => value.trim()).filter(Boolean);
  if (values.apply && subjectIds.length === 0) {
    throw new Error('At least one --subjectId is required when --apply is set');
  }

  return {
    apply: values.apply,
    subjectIds,
    help: values.help,
    limit,
  };
}

export function buildSubjectOwnershipRemediationCommand(
  options: SubjectOwnershipRemediationOptions
): string[] {
  if (options.apply) {
    return buildBunToolCommand('convex', [
      'run',
      '--typecheck',
      'enable',
      'migrations:repairSubjectOwnershipCandidates',
      JSON.stringify({
        subjectIds: options.subjectIds,
      }),
    ]);
  }

  return buildBunToolCommand('convex', [
    'run',
    '--typecheck',
    'enable',
    'migrations:listSubjectOwnershipRemediationCandidates',
    JSON.stringify({
      limit: options.limit,
    }),
  ]);
}

async function readProcessOutput(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return '';
  }
  return await new Response(stream).text();
}

async function runSubjectOwnershipRemediation(
  options: SubjectOwnershipRemediationOptions
): Promise<unknown> {
  const proc = Bun.spawn({
    cmd: buildSubjectOwnershipRemediationCommand(options),
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readProcessOutput(proc.stdout),
    readProcessOutput(proc.stderr),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `Convex remediation command failed with exit code ${exitCode}`);
  }

  const lastLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!lastLine) {
    throw new Error('Convex remediation command returned no JSON payload');
  }

  return JSON.parse(lastLine);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseSubjectOwnershipRemediationOptions(argv);
  if (options.help) {
    printUsage();
    return;
  }

  const result = await runSubjectOwnershipRemediation(options);
  if (options.apply) {
    console.log('[subject-ownership-remediation] applied explicit repair selection');
  } else {
    console.log('[subject-ownership-remediation] generated dry-run remediation report');
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[subject-ownership-remediation]', error);
    process.exit(1);
  });
}
