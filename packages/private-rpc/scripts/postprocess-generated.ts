import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generatedPath = resolve(import.meta.dir, '../src/generated.ts');
const source = readFileSync(generatedPath, 'utf8');
const tsNoCheckBanner = '// @ts-nocheck';

function detectLineEnding(input: string): '\r\n' | '\n' {
  return input.match(/\r?\n/u)?.[0] === '\r\n' ? '\r\n' : '\n';
}

if (!source.startsWith(tsNoCheckBanner)) {
  writeFileSync(generatedPath, `${tsNoCheckBanner}${detectLineEnding(source)}${source}`);
}
