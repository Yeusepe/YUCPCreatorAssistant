import { describe, expect, test } from 'bun:test';
import {
  buildSubjectOwnershipRemediationCommand,
  parseSubjectOwnershipRemediationOptions,
} from './subject-ownership-remediation';

describe('subject-ownership-remediation', () => {
  test('builds a dry-run detection command by default', () => {
    const options = parseSubjectOwnershipRemediationOptions([]);
    expect(buildSubjectOwnershipRemediationCommand(options)).toEqual([
      'bun',
      'x',
      'convex',
      'run',
      '--typecheck',
      'enable',
      'migrations:listSubjectOwnershipRemediationCandidates',
      '{"limit":50}',
    ]);
  });

  test('builds an explicit repair command for selected subjects', () => {
    const options = parseSubjectOwnershipRemediationOptions([
      '--apply',
      '--subjectId',
      'k123',
      '--subjectId',
      'k456',
      '--limit',
      '10',
    ]);
    expect(buildSubjectOwnershipRemediationCommand(options)).toEqual([
      'bun',
      'x',
      'convex',
      'run',
      '--typecheck',
      'enable',
      'migrations:repairSubjectOwnershipCandidates',
      '{"subjectIds":["k123","k456"]}',
    ]);
  });

  test('rejects production mode and apply-without-selection', () => {
    expect(() => parseSubjectOwnershipRemediationOptions(['--prod'])).toThrow(
      '--prod is intentionally unsupported'
    );
    expect(() => parseSubjectOwnershipRemediationOptions(['--apply'])).toThrow(
      'At least one --subjectId is required'
    );
  });
});
