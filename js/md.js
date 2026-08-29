// 轻量 Markdown 渲染（与安卓 MarkdownText 同规则）→ 安全 HTML
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '`') {
      const e = src.indexOf('`', i + 1);
      if (e > i) { out += '<code>' + esc(src.slice(i + 1, e)) + '</code>'; i = e + 1; continue; }
    } else if (ch === '*' && src.startsWith('**', i)) {
      const e = src.indexOf('**', i + 2);
      if (e >= 0) { out += '<b>' + inline(src.slice(i + 2, e)) + '</b>'; i = e + 2; continue; }
    } else if (ch === '*') {
      const e = src.indexOf('*', i + 1);
      const seg = e > i ? src.slice(i + 1, e) : '';
      if (e > i + 1 && !seg.includes(' ') && !seg.includes('*')) {
        out += '<i>' + inline(seg) + '</i>'; i = e + 1; continue;
      }
    }
    // 普通字符：推进到下一个标记
    let next = src.length;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '`' || src[j] === '*') { next = j; break; }
    }
    out += esc(src.slice(i, next));
    i = next;
  }
  return out;
}

export function mdToHtml(src) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ t: 'code', text: code.join('\n') });
    } else if (/^#{1,4}\s/.test(line)) {
      blocks.push({ t: 'h', level: line.match(/^#+/)[0].length, text: line.replace(/^#+\s*/, '') });
      i++;
    } else if (/^\s*&gt;|^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*&gt;|^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*&gt;?\s?/, ''));
      blocks.push({ t: 'quote', text: q.join('\n') });
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' }); i++;
    } else if (/^\s*[-*•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      blocks.push({ t: 'ul', items });
    } else if (/^\s*\d{1,2}[.、)]\s*/m.test(line) && /^\s*\d{1,2}[.、)]/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d{1,2}[.、)]/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d{1,2}[.、)]\s*/, ''));
      blocks.push({ t: 'ol', items });
    } else {
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*•]\s+|\s*\d{1,2}[.、)]|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])) {
        para.push(lines[i++]);
      }
      blocks.push({ t: 'p', text: para.join('\n') });
    }
  }
  return blocks.map((b) => {
    switch (b.t) {
      case 'code': return '<pre>' + esc(b.text) + '</pre>';
      case 'h': return '<p><b>' + inline(b.text) + '</b></p>';
      case 'quote': return '<p class="q"><i>' + inline(b.text) + '</i></p>';
      case 'hr': return '<hr>';
      case 'ul': return '<ul>' + b.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ul>';
      case 'ol': return '<ol>' + b.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ol>';
      default: return '<p>' + inline(b.text).replace(/\n/g, '<br>') + '</p>';
    }
  }).join('');
}
