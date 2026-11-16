import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from './parse.js';

for (const [markdown, html] of [
  ['```\na\n\n```', '<pre><code>a\n</code></pre>\n'],
  ['- a\n- ```\n  b\n\n\n  ```\n- c\n', '<ul>\n<li>a</li>\n<li><pre><code>b\n\n</code></pre>\n</li>\n<li>c</li>\n</ul>\n'],
  ['>\n> foo\n>  \n', '<blockquote>\n<p>foo\n </p>\n</blockquote>\n'],
  ['> foo\n    - bar', '<blockquote>\n<p>foo\n- bar</p>\n</blockquote>\n'],
  ['[x ``a` b`` y](url)', '<p>[x <code>a` b</code> y](url)</p>\n'],
  ['~~we ~~render~~ less~~', '<p><del>we <del>render</del> less</del></p>\n'],
  ['https://a.test)](b)', '<p><a href="https://a.test)%5D(b)">https://a.test)](b)</a></p>\n'],
  ['_used first@sprout.example.com_', '<p><em>used <a href="mailto:first@sprout.example.com">first@sprout.example.com</a></em></p>\n'],
]) assert.equal(parse(markdown), html, markdown);

const dir = mkdtempSync(new URL('./.regression-', import.meta.url));
try {
  const env = { ...process.env, MAKEFUN_INPUT_DIR: dir, MAKEFUN_OUTPUT_DIR: dir };
  const run = () => spawnSync(process.execPath, ['main.ts'], { env, encoding: 'utf8' });
  writeFileSync(`${dir}/cases.json`, JSON.stringify([{ id: 'first', markdown: '# First' }, { id: 'second', markdown: 'Second' }]));
  assert.equal(run().status, 0);
  const saved = readFileSync(`${dir}/html.json`, 'utf8');
  assert.deepEqual(JSON.parse(saved), ['<h1>First</h1>\n', '<p>Second</p>\n']);
  for (const invalid of [{}, [null], [{ id: 'bad', markdown: 1 }]]) {
    writeFileSync(`${dir}/cases.json`, JSON.stringify(invalid));
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid input cases/);
    assert.equal(readFileSync(`${dir}/html.json`, 'utf8'), saved);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Parser regressions and entry input validation passed');
