import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  ['  ~~~x\n  a\n  ~~~', '<pre><code class="language-x">  a\n</code></pre>\n'],
  ['  ```x\n\ta\n  ```', '<pre><code class="language-x">a\n</code></pre>\n'],
  ['*a **b**c*', '<p>*a <strong>b</strong>c*</p>\n'],
  ['**a *b*c***', '<p><strong>a <em>b</em>c*</strong></p>\n'],
  ['[a _b `` c ` d ``_](<https://e.dev/u v>)', '<p>[a _b <code>c ` d</code>_](&lt;<a href="https://e.dev/u">https://e.dev/u</a> v&gt;)</p>\n'],
  ['a <a href="x"> b\n\na@b.com', '<p>a <a href="x"> b</p>\n<p>a@b.com</p>\n'],
  ['[a]\n\n```\n[a]: /url', '<p>[a]</p>\n<pre><code>[a]: /url\n</code></pre>\n'],
  ['> a\n>     b', '<blockquote>\n<p>a\n    b</p>\n</blockquote>\n'],
  ['- a\n\n  b\nc', '<ul>\n<li><p>a</p>\n<p>b\nc</p>\n</li>\n</ul>\n'],
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
  writeFileSync(`${dir}/cases.json`, JSON.stringify([{ id: 'valid', markdown: 'Valid' }]));
  rmSync(`${dir}/html.json`);
  mkdirSync(`${dir}/html.json`);
  writeFileSync(`${dir}/html.json/keep`, saved);
  assert.notEqual(run().status, 0);
  assert.equal(readFileSync(`${dir}/html.json/keep`, 'utf8'), saved);
  assert.deepEqual(readdirSync(dir).sort(), ['cases.json', 'html.json']);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Parser regressions and entry input validation passed');
