import { readFileSync } from 'node:fs';
import { parse } from './parse.js';

const root = process.argv[2];
const cases = JSON.parse(readFileSync(`${root}/practice/input/cases.json`, 'utf8'));
const expected = JSON.parse(readFileSync(`${root}/practice/reference/expected.json`, 'utf8'));
const answers = new Map(expected.cases.map(c => [c.id, c]));
let matches = 0;
for (const c of cases) {
  const { html: want, group } = answers.get(c.id);
  let got;
  try { got = parse(c.markdown); } catch (error) { got = `THREW: ${error.message}`; }
  if (got === want) { matches++; continue; }
  let at = 0;
  while (at < want.length && want[at] === got[at]) at++;
  console.log(`${c.id} ${group} @${at}`);
  if (process.argv.includes('--details')) {
    console.log('WANT', JSON.stringify(want.slice(Math.max(0, at - 40), at + 100)));
    console.log('GOT ', JSON.stringify(got.slice(Math.max(0, at - 40), at + 100)));
  }
}
console.log(`match ${matches}/${cases.length} mismatch ${cases.length - matches}`);
