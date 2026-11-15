const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entities = s => s.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi, (m, n) => {
  if (n[0] !== '#') return m;
  const x = n[1]?.toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : +n.slice(1);
  return Number.isFinite(x) && x > 0 && x <= 0x10ffff ? String.fromCodePoint(x) : '�';
});

function inline(src, depth = 0) {
  if (depth > 12) return esc(src);
  let out = '', i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if ((m = /^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/.exec(rest))) { out += esc(m[1]); i += m[0].length; continue; }
    if ((m = /^\\\n/.exec(rest))) { out += '<br>'; i++; continue; }
    if ((m = /^ {2,}\n/.exec(rest))) { out += '<br>'; i += m[0].length; continue; }
    if ((m = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest))) {
      let text = m[2].replace(/\n/g, ' ');
      if (/^ .* $/.test(text) && /[^ ]/.test(text)) text = text.slice(1, -1);
      out += '<code>' + esc(text) + '</code>'; i += m[0].length; continue;
    }
    if ((m = /^&(?:#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/i.exec(rest))) { out += entities(m[0]).replace(/</g, '&lt;').replace(/>/g, '&gt;'); i += m[0].length; continue; }
    if ((m = /^<((?:https?:\/\/|mailto:)[^ <>]*)>/.exec(rest))) { const u = m[1]; out += `<a href="${esc(u)}">${esc(u.replace(/^mailto:/, ''))}</a>`; i += m[0].length; continue; }
    if ((m = /^<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/.exec(rest))) { out += `<a href="mailto:${esc(m[1])}">${esc(m[1])}</a>`; i += m[0].length; continue; }
    if ((m = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s+[^<>]*?)?\s*\/?\s*>/.exec(rest)) || (m = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    if ((m = /^!?\[([^\]]*)\]\((<[^>]*>|[^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/.exec(rest))) {
      const image = m[0][0] === '!'; const href = m[2].replace(/^<|>$/g, '').replace(/\\([()])/g, '$1');
      out += image ? `<img src="${esc(href)}" alt="${esc(m[1])}"${m[3] ? ` title="${esc(m[3])}"` : ''}>` : `<a href="${esc(href)}"${m[3] ? ` title="${esc(m[3])}"` : ''}>${inline(m[1], depth + 1)}</a>`;
      i += m[0].length; continue;
    }
    if ((m = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest))) { out += `<del>${inline(m[1], depth + 1)}</del>`; i += m[0].length; continue; }
    if ((m = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest)) || (m = /^__(?=\S)([\s\S]*?\S)__/.exec(rest))) { out += `<strong>${inline(m[1], depth + 1)}</strong>`; i += m[0].length; continue; }
    if ((m = /^\*(?=\S)([\s\S]*?\S)\*/.exec(rest)) || (m = /^_(?=\S)([\s\S]*?\S)_/.exec(rest))) { out += `<em>${inline(m[1], depth + 1)}</em>`; i += m[0].length; continue; }
    if ((m = /^https?:\/\/[^\s<>]+/.exec(rest))) { const u = m[0].replace(/[.,!?;:]+$/, ''); out += `<a href="${esc(u)}">${esc(u)}</a>`; i += u.length; continue; }
    const cp = String.fromCodePoint(src.codePointAt(i)); out += esc(cp); i += cp.length;
  }
  return out;
}

function blocks(input) {
  const lines = input.replace(/\r\n?/g, '\n').replace(/\0/g, '�').split('\n');
  const html = []; let i = 0;
  const blank = n => /^\s*$/.test(lines[n] ?? '');
  while (i < lines.length) {
    if (blank(i)) { i++; continue; }
    let m, line = lines[i];
    if ((m = /^ {0,3}(`{3,}|~{3,})\s*([^\n]*)$/.exec(line))) {
      const fence = m[1], lang = m[2].trim().split(/\s+/)[0]; let body = []; i++;
      while (i < lines.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      html.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(body.join('\n') + (body.length ? '\n' : ''))}</code></pre>\n`); continue;
    }
    if ((m = /^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line))) {
      const content = m[3].replace(/[ \t]+#+[ \t]*$/, '').trim(); const n = m[2].length;
      html.push(`<h${n}>${inline(content)}</h${n}>\n`); i++; continue;
    }
    if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) { html.push('<hr>\n'); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const q = []; while (i < lines.length && /^ {0,3}>/.test(lines[i])) q.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      html.push(`<blockquote>\n${blocks(q.join('\n')).replace(/\n$/, '')}\n</blockquote>\n`); continue;
    }
    if ((m = /^( {0,3})([*+-]|\d+[.)])[ \t]+(.*)$/.exec(line))) {
      const ordered = /^\d/.test(m[2]), start = ordered ? parseInt(m[2], 10) : 1, tag = ordered ? 'ol' : 'ul'; const items = [];
      while (i < lines.length) {
        const x = /^( {0,3})([*+-]|\d+[.)])[ \t]+(.*)$/.exec(lines[i]); if (!x || /^\d/.test(x[2]) !== ordered) break;
        let content = [x[3]]; i++;
        while (i < lines.length && (/^(?: {2,}\S|\t)/.test(lines[i]) || (blank(i) && i + 1 < lines.length && /^(?: {2,}\S|\t)/.test(lines[i + 1])))) { if (!blank(i)) content.push(lines[i].replace(/^(?: {2,}|\t)/, '')); i++; }
        const task = /^\[([ xX])\][ \t]+/.exec(content[0]); let checkbox = '';
        if (task) { checkbox = `<input${task[1].toLowerCase() === 'x' ? ' checked=""' : ''} disabled="" type="checkbox"> `; content[0] = content[0].slice(task[0].length); }
        let rendered = blocks(content.join('\n')).trimEnd();
        if (rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) rendered = rendered.slice(3, -5);
        items.push(`<li>${checkbox}${rendered}</li>`);
      }
      html.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n${items.join('\n')}\n</${tag}>\n`); continue;
    }
    if ((m = /^ {0,3}(`{3,}|~{3,})/.exec(line))) continue;
    const para = [line.trim()]; i++;
    while (i < lines.length && !blank(i) && !/^( {0,3})(#{1,6})(?:[ \t]+|$)/.test(lines[i]) && !/^ {0,3}>/.test(lines[i]) && !/^( {0,3})([*+-]|\d+[.)])[ \t]+/.test(lines[i]) && !/^ {0,3}(?:`{3,}|~{3,})/.test(lines[i])) {
      if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i])) { const n = lines[i].trim()[0] === '=' ? 1 : 2; html.push(`<h${n}>${inline(para.join('\n'))}</h${n}>\n`); i++; break; }
      para.push(lines[i++].trim());
    }
    if (!html.at(-1)?.startsWith('<h') || i === lines.length || blank(i) || !/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i] ?? '')) html.push(`<p>${inline(para.join('\n'))}</p>\n`);
  }
  return html.join('');
}

export function parse(markdown) {
  return blocks(String(markdown));
}
