/**
 * Detection-first remediation helper for buyer account attribution corruption.
 *
 * Usage:
 *   bun run ops:buyer-attribution-remediation
 *   bun run ops:buyer-attribution-remediation -- --limit 100
 *   bun run ops:buyer-attribution-remediation -- --apply --bindingId k123 --bindingId k456
 */

import { parseArgs } from 'node:util';
import { buildBunToolCommand } from './cli-utils';

const DEFAULT_BUYER_ATTRIBUTION_REPORT_LIMIT = 50;

export type BuyerAttributionRemediationOptions = {
  apply: boolean;
  bindingIds: string[];
  help: boolean;
  limit: number;
};

function printUsage(): void {
  console.log(
    [
      'buyer-attribution-remediation',
      '',
      'Usage:',
      '  bun run ops:buyer-attribution-remediation',
      '  bun run ops:buyer-attribution-remediation -- --limit 100',
      '  bun run ops:buyer-attribution-remediation -- --apply --bindingId k123 --bindingId k456',
      '',
      'Options:',
      '  --limit <number>     Max remediation candidates to report in detection mode. Default: 50.',
      '  --apply              Execute the explicit repair mutation for selected bindings.',
      '  --bindingId <id>     Binding ID to repair. Repeat for multiple bindings.',
      '  --help               Show this message.',
      '',
      'Safety:',
      '  This tool intentionally refuses --prod. Run it only against a reviewed non-prod deployment first.',
      '  Detection mode is the default. No data is mutated unless --apply is set with explicit --bindingId values.',
    ].join('\n')
  );
}

export function parseBuyerAttributionRemediationOptions(
  argv: readonly string[]
): BuyerAttributionRemediationOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      apply: { type: 'boolean', default: false },
      bindingId: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h', default: false },
      limit: { type: 'string' },
      prod: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.prod) {
    throw new Error('--prod is intentionally unsupported for buyer attribution remediation');
  }

  const limit = values.limit
    ? Number.parseInt(values.limit, 10)
    : DEFAULT_BUYER_ATTRIBUTION_REPORT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${values.limit}`);
  }

  const bindingIds = (values.bindingId ?? []).map((value) => value.trim()).filter(Boolean);
  if (values.apply && bindingIds.length === 0) {
    throw new Error('At least one --bindingId is required when --apply is set');
  }

  return {
    apply: values.apply,
    bindingIds,
    help: values.help,
    limit,
  };
}

export function buildBuyerAttributionRemediationCommand(
  options: BuyerAttributionRemediationOptions
): string[] {
  if (options.apply) {
    return buildBunToolCommand('convex', [
      'run',
      '--typecheck',
      'enable',
      'migrations:repairBuyerAttributionCandidates',
      JSON.stringify({
        bindingIds: options.bindingIds,
      }),
    ]);
  }

  return buildBunToolCommand('convex', [
    'run',
    '--typecheck',
    'enable',
    'migrations:listBuyerAttributionRemediationCandidates',
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

async function runBuyerAttributionRemediation(
  options: BuyerAttributionRemediationOptions
): Promise<unknown> {
  const proc = Bun.spawn({
    cmd: buildBuyerAttributionRemediationCommand(options),
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
    throw new Error(
      stderr.trim() || `Convex remediation command failed with exit code ${exitCode}`
    );
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
  const options = parseBuyerAttributionRemediationOptions(argv);
  if (options.help) {
    printUsage();
    return;
  }

  const result = await runBuyerAttributionRemediation(options);
  if (options.apply) {
    console.log('[buyer-attribution-remediation] applied explicit repair selection');
  } else {
    console.log('[buyer-attribution-remediation] generated dry-run remediation report');
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[buyer-attribution-remediation]', error);
    process.exit(1);
  });
}
