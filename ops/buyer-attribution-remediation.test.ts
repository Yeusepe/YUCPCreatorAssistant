import { describe, expect, test } from 'bun:test';
import {
  buildBuyerAttributionRemediationCommand,
  parseBuyerAttributionRemediationOptions,
} from './buyer-attribution-remediation';

describe('buyer-attribution-remediation', () => {
  test('builds a dry-run detection command by default', () => {
    const options = parseBuyerAttributionRemediationOptions([]);
    expect(buildBuyerAttributionRemediationCommand(options)).toEqual([
      'bun',
      'x',
      'convex',
      'run',
      '--typecheck',
      'enable',
      'migrations:listBuyerAttributionRemediationCandidates',
      '{"limit":50}',
    ]);
  });

  test('builds an explicit repair command for selected bindings', () => {
    const options = parseBuyerAttributionRemediationOptions([
      '--apply',
      '--bindingId',
      'k123',
      '--bindingId',
      'k456',
      '--limit',
      '10',
    ]);
    expect(buildBuyerAttributionRemediationCommand(options)).toEqual([
      'bun',
      'x',
      'convex',
      'run',
      '--typecheck',
      'enable',
      'migrations:repairBuyerAttributionCandidates',
      '{"bindingIds":["k123","k456"]}',
    ]);
  });

  test('rejects production mode and apply-without-selection', () => {
    expect(() => parseBuyerAttributionRemediationOptions(['--prod'])).toThrow(
      '--prod is intentionally unsupported'
    );
    expect(() => parseBuyerAttributionRemediationOptions(['--apply'])).toThrow(
      'At least one --bindingId is required'
    );
  });
});
