import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './public-files.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'test-results/pages');
// The only removable directory is this fixed, generated output folder.
if (dirname(output) !== resolve(root, 'test-results')) throw new Error('Invalid build directory');
await rm(output, { recursive: true, force: true });
for (const file of publicFiles) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
}
console.log(`Built ${publicFiles.length} public files in test-results/pages. Board SVG and tile JSON are excluded.`);
