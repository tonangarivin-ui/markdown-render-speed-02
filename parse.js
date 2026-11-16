const esc = s => s.replace(/&#\d{1,7};|&#[xX][\da-fA-F]{1,6};|&[A-Za-z0-9_]+;|[&<>"']/g, c => c === '&' ? '&amp;' : ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const codeEsc = s => esc(s.replace(/&/g, '&amp;'));
const punct = c => !!c && /[\p{P}\p{S}]/u.test(c);
const space = c => !c || /\s/u.test(c);
const normalize = s => s.replace(/[\t\n ]+/g, ' ').trim().toLowerCase().toUpperCase();
// marked percent-encodes link destinations with encodeURI, then restores literal
// percent signs (which encodeURI turned into %25) back to '%'.
const uri = s => encodeURI(s).replace(/%25/g, '%');
const alt = s => s.replace(/`+([^`]*?)`+/g, '$1').replace(/[*!_~]/g, '').replace(/\n/g, ' ');
const tagName = '[A-Za-z][A-Za-z0-9-]*';
const attribute = "[A-Za-z_:][A-Za-z0-9:._-]*(?:[ \\t\\n\\r\\f]*=[ \\t\\n\\r\\f]*(?:\"[^\"]*\"|'[^']*'|[^ \\t\\n\\r\\f\"'=<>`]+))?";
const tag = `(?:<${tagName}(?:[ \\t\\n\\r\\f]+${attribute})*[ \\t\\n\\r\\f]*/?>|</${tagName}[ \\t\\n\\r\\f]*>)`;
const rawHTML = new RegExp(`^(?:<!--(?:-?>|[\\s\\S]*?-->)|<\\?[\\s\\S]*?\\?>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|${tag})`);
const completeTag = new RegExp(`^ {0,3}${tag}[ \\t]*$`);
const listMarker = /^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;

// Numeric references are regular Unicode scalar values; named references are decoded by the browser
// only when they remain in text, so retain unknown names literally.
const entity = s => s.replace(/&#(?:x[\da-f]{1,6}|\d{1,7});/gi, m => {
  const n = m.slice(2, -1), x = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : +n;
  return x && x <= 0x10ffff && !(x >= 0xd800 && x <= 0xdfff) ? String.fromCodePoint(x) : '�';
});

function destination(s) {
  if (s.startsWith('<') && s.endsWith('>') && !/[\n<>]/.test(s.slice(1, -1))) return s.slice(1, -1);
  if (/[ \t\n<>]/.test(s)) return null;
  let d = 0;
  for (let i = 0; i < s.length; i++) { if (s[i] === '\\') i++; else if (s[i] === '(') d++; else if (s[i] === ')' && --d < 0) return null; }
  return d ? null : s;
}

function linkTail(s, open) {
  let i = open + 1, url = '', title;
  while (/[ \t\n]/.test(s[i])) i++;
  let angle = false;
  if (s[i] === '<') {
    angle = true;
    const start = ++i;
    while (i < s.length && s[i] !== '\n' && (s[i] !== '>' || s[i - 1] === '\\')) i++;
    if (s[i] !== '>') return null;
    url = s.slice(start, i++);
  } else {
    const start = i; let depth = 0;
    while (i < s.length) {
      if (s[i] === '\\') { i += 2; continue; }
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { if (!depth) break; depth--; }
      else if (/[ \t\n]/.test(s[i])) break;
      i++;
    }
    if (depth) return null;
    url = s.slice(start, i);
  }
  const afterURL = i;
  while (/[ \t\n]/.test(s[i])) i++;
  if (s[i] === '"' || s[i] === "'" || s[i] === '(') {
    const delimiter = s[i++], close = delimiter === '(' ? ')' : delimiter, start = i;
    while (i < s.length && (s[i] !== close || s[i - 1] === '\\')) i++;
    if (s[i] !== close) return null;
    title = s.slice(start, i++);
    while (/[ \t\n]/.test(s[i])) i++;
  } else if (i !== afterURL) return null;
  return s[i] === ')' ? { end: i + 1, url, title, angle } : null;
}

function labelClose(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '<') { const token = rawHTML.exec(s.slice(i)) ?? /^<[A-Za-z][A-Za-z+.-]{1,31}:[^ <>]*>/.exec(s.slice(i)); if (token) { i += token[0].length - 1; continue; } }
    if (s[i] === '`') {
      let end = i; while (s[end] === '`') end++;
      const width = end - i;
      for (let j = end; j < s.length; j++) {
        if (s[j] !== '`') continue;
        let k = j; while (s[k] === '`') k++;
        if (k - j === width) { i = k - 1; break; }
        j = k - 1;
      }
    }
    if (s[i] === '[') depth++;
    else if (s[i] === ']') { if (!depth) return i; depth--; }
  }
  return -1;
}

function resolveEmphasis(raw) {
  // A rendered inline token (link, code span, <br>, entity, raw tag) is opaque to the
  // flanking rules: it acts like punctuation and never like a letter.
  const s = raw.replace(/\d+/g, '￼');
  const punct = c => c === '￼' || (!!c && /[\p{P}\p{S}]/u.test(c));
  const ds = [], opens = new Map(), closes = new Map(), used = new Set();
  for (let i = 0; i < s.length;) {
    if (s[i] !== '*' && s[i] !== '_') { i++; continue; }
    const start = i, ch = s[i]; while (s[i] === ch) i++;
    const before = s[start - 1], after = s[i];
    const left = !space(after) && (!punct(after) || space(before) || punct(before));
    const right = !space(before) && (!punct(before) || space(after) || punct(after));
    ds.push({ start, end: i, ch, n: i - start, left: i - start, right: 0, open: left && (ch === '*' || !right || punct(before)), close: right && (ch === '*' || !left || punct(after)) });
  }
  const add = (map, at, value) => map.set(at, [...(map.get(at) ?? []), value]);
  for (let c = 0; c < ds.length; c++) {
    const close = ds[c];
    while (close.close && close.n) {
      let open;
      for (let o = c - 1; o >= 0; o--) {
        const candidate = ds[o];
        if (!candidate.open || candidate.ch !== close.ch || !candidate.n) continue;
        if ((candidate.close || close.open) && (candidate.n + close.n) % 3 === 0 && (candidate.n % 3 || close.n % 3)) continue;
        open = candidate; break;
      }
      if (!open) break;
      const n = open.n >= 2 && close.n >= 2 ? 2 : 1;
      const a = open.start + open.n - n, b = close.start + close.right;
      add(opens, a, n); add(closes, b + n, n);
      for (let x = 0; x < n; x++) { used.add(a + x); used.add(b + x); }
      open.n -= n; close.n -= n; close.right += n;
    }
  }
  let out = '';
  for (let i = 0; i <= s.length; i++) {
    for (const n of closes.get(i) ?? []) out += n === 2 ? '</strong>' : '</em>';
    for (const n of opens.get(i) ?? []) out += n === 2 ? '<strong>' : '<em>';
    if (i < s.length && !used.has(i)) out += esc(s[i]);
  }
  return out;
}

function inline(source, refs = Object.create(null), depth = 0, links = {}, inLink = false) {
  if (depth > 32) return esc(source);
  const slots = [], slot = value => `${slots.push(value) - 1}`;
  let text = '', i = 0;
  const put = value => { text += slot(value); };
  while (i < source.length) {
    const rest = source.slice(i); let m;
    if ((m = /^\\\n[ \t]*/.exec(rest))) { put('<br>'); i += m[0].length; continue; }
    if ((m = /^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/.exec(rest))) { put(esc(m[1])); i += m[0].length; continue; }
    if ((m = /^ {2,}\n[ \t]*/.exec(rest))) { put('<br>'); i += m[0].length; continue; }
    if (source[i] === '`') {
      let n = 1; while (source[i + n] === '`') n++;
      let end = -1;
      for (let j = i + n; j < source.length;) {
        if (source[j] !== '`') { j++; continue; }
        let k = j; while (source[k] === '`') k++;
        if (k - j === n) { end = j; break; }
        j = k;
      }
      if (end >= 0) { let code = source.slice(i + n, end).replace(/\n/g, ' '); if (/^ .* $/.test(code) && /[^ ]/.test(code)) code = code.slice(1, -1); put(`<code>${codeEsc(code)}</code>`); i = end + n; continue; }
      text += source.slice(i, i + n); i += n; continue;
    }
    if ((m = /^&#(?:[xX][\da-fA-F]{1,6}|\d{1,7});/.exec(rest))) {
      put(esc(entity(m[0]))); i += m[0].length; continue;
    }
    if ((m = /^&[A-Za-z0-9_]+;/.exec(rest))) {
      put(m[0]); i += m[0].length; continue;
    }
    if ((m = rawHTML.exec(rest))) { put(m[0]); i += m[0].length; continue; }
    if ((m = /^<([A-Za-z][A-Za-z+.-]{1,31}:[^ <>]*)>/i.exec(rest))) { const href = uri(m[1]); put(`<a href="${esc(href)}">${esc(m[1])}</a>`); i += m[0].length; continue; }
    if ((m = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)>/.exec(rest))) { put(`<a href="mailto:${esc(m[1])}">${esc(m[1])}</a>`); i += m[0].length; continue; }
    const image = source[i] === '!' && source[i + 1] === '[';
    if (source[i] === '[' || image) {
      const begin = i + (image ? 2 : 1), close = labelClose(source, begin);
      if (close >= 0) {
        const label = source.slice(begin, close); let end = close + 1, url, title;
        if (source[end] === '(') {
          const tail = linkTail(source, end);
          if (tail && (url = tail.angle ? tail.url : destination(tail.url)) !== null) ({ end, title } = tail);
        }
        if (url == null) {
          let ref = label, explicit = false;
          if (source[end] === '[') { const r = labelClose(source, end + 1); if (r >= 0) { ref = source.slice(end + 1, r) || label; end = r + 1; explicit = true; } }
          const valid = ref.length <= 999 && !/(^|[^\\])(?:\\\\)*\[/.test(ref);
          const def = valid && refs[normalize(ref)];
          if (def) { url = def.url; title = def.title; }
          if (explicit && url == null) { text += source[i++]; continue; }
          if (!explicit) end = close + 1;
        }
        if (url != null) {
          url = uri(entity(url).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'));
          const attr = title !== undefined ? ` title="${esc(entity(title).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'))}"` : '';
          const nested = {}, body = inline(label, refs, depth + 1, nested, true);
          if (!image && nested.found) { text += source[i++]; continue; }
          if (!image) links.found = true;
          put(image ? `<img src="${esc(url)}" alt="${esc(alt(body.replace(/<img src="[^"]*" alt="([^"]*)"[^>]*>/g, '$1').replace(/<\/?(?:a|code|em|strong|del|br)\b[^>]*>/g, '')))}"${attr}>` : `<a href="${esc(url)}"${attr}>${body}</a>`);
          i = end; continue;
        }
      }
    }
    if ((m = /^(~{1,2})(?!~)(?=\S)([\s\S]*?\S)(?<!~)\1(?!~)/.exec(rest))) { put(`<del>${inline(m[2], refs, depth + 1)}</del>`); i += m[0].length; continue; }
    if ((m = /^~+/.exec(rest))) { text += m[0]; i += m[0].length; continue; }
    if (!/[A-Za-z0-9.+_-]/.test(source[i - 1] ?? '') && (m = /^(?:(mailto|xmpp):)?([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]+)(?![A-Za-z0-9_-])/i.exec(rest))) {
      let label = m[0];
      if (m[1]?.toLowerCase() === 'xmpp') label += (/^\/[A-Za-z0-9@._+-]+/.exec(rest.slice(label.length))?.[0] ?? '').replace(/[._]+$/, '');
      put(`<a href="${esc(m[1] ? label : `mailto:${label}`)}">${esc(label)}</a>`); i += label.length; continue;
    }
    if (!inLink && (m = /^(?:[Hh][Tt][Tt][Pp][Ss]?:\/\/|www\.)[^\s<>]+/.exec(rest))) { let u = m[0].replace(/&[A-Za-z0-9]+;$/, '').replace(/[?!.,;:*_~"']+$/, ''); while (u.endsWith(')') && (u.match(/\)/g)?.length ?? 0) > (u.match(/\(/g)?.length ?? 0)) u = u.slice(0, -1);  const href = u.startsWith('www.') ? `http://${u}` : u; put(`<a href="${esc(uri(href))}">${esc(u)}</a>`); i += u.length; continue; }
    text += source[i++];
  }
  return resolveEmphasis(text).replace(/￼/g, () => slots.shift());
}

function definition(lines, at) {
  if (!/^ {0,3}\[/.test(lines[at])) return null;
  let used = 0; while (at + used < lines.length && !/^\s*$/.test(lines[at + used])) used++;
  const source = lines.slice(at, at + used).join('\n');
  let i = source.match(/^ {0,3}/)[0].length + 1, label = '';
  for (; i < source.length; i++) {
    if (source[i] === '\\') { label += source[i++] + (source[i] ?? ''); continue; }
    if (source[i] === ']') break;
    if (source[i] === '[') return null;
    label += source[i];
  }
  if (!label.trim() || source.slice(i, i + 2) !== ']:') return null;
  i += 2; while (/\s/.test(source[i])) i++;
  let url = '';
  if (i === source.length) return null;
  if (source[i] === '<') {
    const start = ++i; while (i < source.length && source[i] !== '>' && source[i] !== '\n') i++;
    if (source[i] !== '>' || /[<>]/.test(source.slice(start, i))) return null;
    url = source.slice(start, i++);
  } else {
    const start = i; let depth = 0;
    while (i < source.length && !/\s/.test(source[i])) {
      if (source[i] === '\\') i += 2;
      else { if (source[i] === '(') depth++; else if (source[i] === ')' && --depth < 0) return null; i++; }
    }
    if (depth) return null;
    url = source.slice(start, i);
  }
  const urlEnd = i;
  while (/[ \t]/.test(source[i])) i++;
  const lineEnd = i;
  if (source[i] === '\n') { i++; while (/[ \t]/.test(source[i])) i++; }
  let title;
  if (i > urlEnd && (source[i] === '"' || source[i] === "'" || source[i] === '(')) {
    const open = source[i++], close = open === '(' ? ')' : open, start = i;
    while (i < source.length && (source[i] !== close || source[i - 1] === '\\')) i++;
    if (source[i] === close) { title = source.slice(start, i++); while (/[ \t]/.test(source[i])) i++; }
    if (title === undefined || (i !== source.length && source[i] !== '\n')) { if (source[lineEnd] !== '\n') return null; title = undefined; i = lineEnd; }
  } else i = lineEnd;
  if (i !== source.length && source[i] !== '\n') return null;
  return { label, url, title, used: source.slice(0, i).split('\n').length };
}

function htmlBlockStart(line, interrupt = false) {
  const special = /^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.exec(line);
  if (special) return new RegExp(`</${special[1]}\\s*>`, 'i');
  if (/^ {0,3}<!--/.test(line)) return /-->/;
  if (/^ {0,3}<\?/.test(line)) return /\?>/;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return /\]\]>/;
  if (/^ {0,3}<![A-Z]/.test(line)) return />/;
  if (/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|ol|p|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i.test(line)) return /^$/;
  if (!interrupt && completeTag.test(line)) return /^$/;
  return false;
}

function blocks(input, shared, tight = null, spacing) {
  // Expand tabs to 4-column stops in the leading whitespace prefix only, so
  // indentation decisions see 4-column tabs while code content keeps raw tabs.
  const detab = line => {
    let col = 0, i = 0;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
      if (line[i] === '\t') col += 4 - col % 4; else col++;
      i++;
    }
    return (' '.repeat(col) + line.slice(i)).replace(/^( {0,3}(?:>|[*+-]|\d{1,9}[.)]))([ \t]+)/, (_, marker, padding) => {
      let column = marker.length;
      return marker + padding.replace(/[ \t]/g, c => { const width = c === '\t' ? 4 - column % 4 : 1; column += width; return ' '.repeat(width); });
    });
  };
  const rawLines = input.replace(/\r\n?/g, '\n').replace(/\0/g, '�').split('\n');
  const lines = rawLines.map(detab);
  const refs = shared ?? Object.create(null), definitions = new Set();
  let fenced;
  for (let n = 0; n < lines.length;) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[n]);
    if (fenced) {
      if (new RegExp(`^ {0,3}${fenced[0]}{${fenced.length},}[ \\t]*$`).test(lines[n])) fenced = undefined;
      n++; continue;
    }
    if (fence && (fence[1][0] !== '`' || !lines[n].slice(fence[0].length).includes('`'))) { fenced = fence[1]; n++; continue; }
    if (n && !/^\s*$/.test(lines[n - 1]) && !definition(lines, n - 1) && !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:=+|-+)[ \t]*$|>)/.test(lines[n - 1])) { n++; continue; }
    let d = definition(lines, n), quoted = false;
    if (!d && /^ {0,3}> ?\[/.test(lines[n])) {
      const content = lines[n].replace(/^ {0,3}> ?/, '');
      d = definition([content], 0); quoted = !!d;
    }
    if (!d) { n++; continue; }
    definitions.add(n); refs[normalize(d.label)] ??= { url: d.url, title: d.title };
    if (quoted) lines[n] = '>'; else lines.splice(n, d.used, ...Array(d.used).fill(''));
    n += d.used;
  }
  const html = [], blank = n => /^\s*$/.test(lines[n] ?? ''); let i = 0;
  while (i < lines.length) {
    if (blank(i)) { if (spacing && html.length && (definitions.has(i) || lines.slice(i).some(s => /\S/.test(s)))) spacing.separated = true; i++; continue; } let line = lines[i], m;
    const endHTML = htmlBlockStart(line);
    if (endHTML !== false) { const b = [line]; i++; while (i < lines.length && !endHTML.test(b.join('\n')) && !(endHTML.source === '^$' && blank(i))) b.push(lines[i++]); html.push(b.join('\n') + (i < lines.length && (i === lines.length - 1 || lines[i] !== '') ? '\n' : '')); continue; }
    if (/^ {4}/.test(line)) { const b = []; while (i < lines.length && (/^ {4}/.test(lines[i]) || blank(i))) { b.push(/^ {4}/.test(lines[i]) ? rawLines[i].replace(/^(?: {0,3}\t| {1,4})/, '') : ''); i++; } while (b.at(-1) === '') b.pop(); html.push(`<pre><code>${codeEsc(b.join('\n'))}\n</code></pre>\n`); continue; }
    if ((m = /^( {0,3})(`{3,}(?!`)([^`]*?)|~{3,}(.*))$/.exec(line))) { const fence = /^(`+|~+)/.exec(m[2])[0], info = (m[3] ?? m[4]).trim().split(/\s+/)[0].replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'), b = [], end = lines.length - (lines.at(-1) === '' ? 1 : 0), unindent = new RegExp(`^ {0,${m[1].length}}`); i++; const closer = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`); while (i < end && !closer.test(lines[i])) { b.push(rawLines[i].replace(unindent, '')); i++; } if (i < lines.length) i++; html.push(`<pre><code${info ? ` class="language-${esc(info)}"` : ''}>${codeEsc(b.join('\n'))}${b.length ? '\n' : ''}</code></pre>\n`); continue; }
    if ((m = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)[ \t]*|[ \t]*)$/.exec(line))) {
      const body = (m[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').replace(/^#+[ \t]*$/, '');
      html.push(`<h${m[1].length}>${inline(body, refs)}</h${m[1].length}>\n`); i++; continue;
    }
    if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) { html.push('<hr>\n'); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const b = []; let paragraph = false, fence;
      const startsBlock = s => /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|`{3,}|~{3,}|[*+-][ \t]+\S|1[.)][ \t]+\S|(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$)/.test(s) || htmlBlockStart(s) !== false;
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) {
          const content = lines[i++].replace(/^ {0,3}> ?/, ''); b.push(content);
          const inner = content.replace(/^(?: {0,3}(?:> ?|(?:[*+-]|\d{1,9}[.)])[ \t]+))+/, '');
          if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(inner)) fence = undefined; paragraph = false; }
          else if ((m = /^ {0,3}(`{3,}|~{3,})/.exec(inner))) { fence = m[1]; paragraph = false; }
          else paragraph = !/^\s*$/.test(inner) && !startsBlock(inner) && !/^ {0,3}(?:=+|-+)[ \t]*$/.test(inner) && (paragraph || !/^ {4}/.test(inner));
        } else if (paragraph && !blank(i) && !startsBlock(lines[i])) b.push(lines[i++].replace(/^ +/, ''));
        else break;
      }
      html.push(`<blockquote>\n${blocks(b.join('\n'), refs)}</blockquote>\n`); continue;
    }
    const cells = s => s.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line), defs = cells(lines[i + 1]);
      if (head.length === defs.length) {
        const align = defs.map(x => /^:.*:$/.test(x) ? 'center' : /^:/.test(x) ? 'left' : /:$/.test(x) ? 'right' : '');
        const row = (xs, tag) => `<tr>\n${head.map((_, n) => `<${tag}${align[n] ? ` align="${align[n]}"` : ''}>${inline(xs[n] ?? '', refs)}</${tag}>`).join('\n')}\n</tr>`;
        const rows = []; i += 2; while (i < lines.length && !/^ *$/.test(rawLines[i] ?? '') && !/^ {0,3}(?:>|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(lines[i]) && !listMarker.test(lines[i]) && htmlBlockStart(lines[i], true) === false) rows.push(row(cells(lines[i++]), 'td'));
        html.push(`<table>\n<thead>\n${row(head, 'th')}\n</thead>\n${rows.length ? `<tbody>${rows.join('\n')}\n</tbody>` : ''}</table>\n`); continue;
      }
    }
    if ((m = listMarker.exec(line))) {
      const ordered = /^\d/.test(m[2]), tag = ordered ? 'ol' : 'ul', start = ordered ? parseInt(m[2], 10) : 1, items = [];
      let loose = false;
      while (i < lines.length) {
        const item = listMarker.exec(lines[i]);
        if (!item || /^\d/.test(item[2]) !== ordered || item[2].at(-1) !== m[2].at(-1) || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(lines[i])) break;
        const marker = item[1].length + item[2].length, pad = (item[3] ?? ' ').replace(/\t/g, '    ').length;
        const empty = !(item[4] ?? '').trim();
        const indent = empty || pad > 4 ? marker + 1 : marker + pad, body = [empty ? '' : `${pad > 4 ? ' '.repeat(pad - 1) : ''}${item[4]}`]; let sawBlank = false; i++;
        while (i < lines.length) {
          if (blank(i)) {
            if (empty && body.length === 1) { if (listMarker.test(lines[i + 1] ?? '')) { loose = true; i++; } break; }
            const next = lines[i + 1] ?? '', nextIndent = (next.match(/^ */) ?? [''])[0].length;
            if (!/^\s*$/.test(next) && !listMarker.test(next) && nextIndent < indent) break;
            if (listMarker.test(next) || nextIndent >= indent) sawBlank = true;
            if (body.at(-1) !== '' || /^ {4}/.test(body.findLast(s => /\S/.test(s)) ?? '')) body.push(''); i++; continue;
          }
          const lead = (lines[i].match(/^ */) ?? [''])[0].length;
          if (lead >= indent) body.push(lines[i].slice(indent));
          else if (listMarker.test(lines[i]) || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(lines[i])) break;
          else if (!sawBlank) body.push(lines[i]);
          else break;
          i++;
        }
        if (sawBlank && body.at(-1) === '' && listMarker.test(lines[i] ?? '')) loose = true;
        while (body.at(-1) === '') body.pop();
        if (empty && body[0] === '') body.shift();
        let first = body[0] ?? '', check = '';
        const task = /^\[([ xX])\][ \t]+/.exec(first);
        if (task) { check = `<input${task[1].toLowerCase() === 'x' ? ' checked=""' : ''} disabled="" type="checkbox"> `; body[0] = first.slice(task[0].length); }
        items.push({ check, body });
      }
      const contents = items.map(({ body }) => { const spacing = {}; const value = blocks(body.join('\n'), refs, false, spacing); if (spacing.separated) loose = true; return value; });
      const rendered = items.map(({ check, body }, n) => {
        const value = loose ? contents[n] : blocks(body.join('\n'), refs, true);
        return `<li>${loose && check ? value.replace(/^<p>/, `<p>${check}`) : check + value}</li>`;
      });
      html.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n${rendered.join('\n')}\n</${tag}>\n`); continue;
    }
    const para = [line]; i++;
    while (i < lines.length && !blank(i) && htmlBlockStart(lines[i], true) === false && !new RegExp(`^( {0,3}(?:#{1,6})(?:[ \\t]|$)| {0,3}>| {0,3}(?:[*+-]|${tight !== null ? '\\d{1,9}' : '1'}[.)])[ \\t]+\\S| {0,3}(?:\`{3,}|~{3,}))`).test(lines[i])) {
      if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i])) { const level = lines[i].trim()[0] === '=' ? 1 : 2; html.push(`<h${level}>${inline(para.join('\n').trim(), refs)}</h${level}>\n`); i++; para.length = 0; break; }
      if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(lines[i])) { html.push(`<p>${inline(para.join('\n'), refs)}</p>\n<hr>\n`); i++; para.length = 0; break; }
      para.push(tight === null ? lines[i++] : lines[i++].replace(/^ +/, ''));
    }
    if (para.length) html.push(tight ? inline(para.join('\n'), refs) : `<p>${inline(para.join('\n'), refs)}</p>\n`);
  }
  return html.join('');
}

export function parse(markdown) { return blocks(String(markdown)); }
