import { describe, expect, test } from 'bun:test';
import { getWebBuildCommand } from './deploy-web-worker';

describe('deploy-web-worker', () => {
  test('uses the web build as the deploy prerequisite', () => {
    expect(getWebBuildCommand()).toEqual(['bun', 'run', '--filter', '@yucp/web', 'build']);
  });
});
