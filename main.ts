import { readFileSync, writeFileSync } from 'node:fs';
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
const html = cases.map(item => parse(item.markdown));
writeFileSync(outputPath, JSON.stringify(html));
