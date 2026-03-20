import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_PACKAGE_JSON = resolve(__dirname, '../../package.json');
const SETUP_ROUTE_FILES = [
  resolve(__dirname, '../../src/routes/setup/jinxxy.tsx'),
  resolve(__dirname, '../../src/routes/setup/lemonsqueezy.tsx'),
  resolve(__dirname, '../../src/routes/setup/payhip.tsx'),
];

describe('Setup route runtime dependencies', () => {
  it('declares lucide-react for setup routes that import it', () => {
    const packageJson = JSON.parse(readFileSync(WEB_PACKAGE_JSON, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    const offenders = SETUP_ROUTE_FILES.filter((filePath) =>
      readFileSync(filePath, 'utf8').includes("from 'lucide-react'")
    );

    expect(offenders.length).toBeGreaterThan(0);
    expect(packageJson.dependencies?.['lucide-react'], offenders.join(', ')).toBeDefined();
  });
});
