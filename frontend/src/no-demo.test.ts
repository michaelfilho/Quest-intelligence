import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) && !/\.test\./.test(path) ? [path] : [];
});

test('interface publicada não contém dados nem autenticação demonstrativos', () => {
  const sources = [...files(fileURLToPath(new URL('.', import.meta.url))), ...files(fileURLToPath(new URL('../../shared', import.meta.url)))];
  expect(sources.length).toBeGreaterThan(20);
  for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(/Omni Retail|fict[ií]ci|api\/v1\/|data\/demo|createDemoData|Ambiente de Demonstração/i);
});
