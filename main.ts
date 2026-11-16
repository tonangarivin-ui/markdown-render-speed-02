import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const inputPath = join(inputDir, 'cases.json');
const outputPath = join(outputDir, 'html.json');

// The harness requires one rendered HTML string for every input case, in order.
let cases: { id: string; markdown: string }[];
try {
  cases = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (error) {
  throw new Error(`Cannot read input cases at ${inputPath}`, { cause: error });
}
if (!Array.isArray(cases) || cases.some(item => !item || typeof item.id !== 'string' || typeof item.markdown !== 'string')) {
  throw new Error(`Invalid input cases at ${inputPath}: expected an array of { id, markdown } strings`);
}
const html = cases.map(item => parse(item.markdown));
// Stage on the same filesystem so publication cannot leave a partial JSON file.
const stagingDir = mkdtempSync(join(outputDir, '.html-'));
try {
  const stagedPath = join(stagingDir, 'html.json');
  writeFileSync(stagedPath, JSON.stringify(html));
  renameSync(stagedPath, outputPath);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
