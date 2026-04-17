import { describe, expect, test } from 'bun:test';
import { getWebVersionUploadArgs } from './upload-web-worker-version';

describe('upload-web-worker-version', () => {
  test('builds a Wrangler versions upload command without duplicating the tool name', () => {
    expect(getWebVersionUploadArgs(['--dry-run'])).toEqual([
      'versions',
      'upload',
      '--config',
      expect.stringContaining('apps\\web\\dist\\server\\wrangler.json'),
      '--dry-run',
    ]);
  });
});
