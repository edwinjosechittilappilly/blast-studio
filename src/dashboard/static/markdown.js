// A deliberately small Markdown subset. The parser returns data, never HTML.
export function parseInline(text) {
  const nodes = [], pattern = /(`[^`]+`|\*\*[^*]+\*\*|(?<![\p{L}\p{N}_])__[^_]+__(?![\p{L}\p{N}_])|\*[^*]+\*|(?<![\p{L}\p{N}_])_[^_]+_(?![\p{L}\p{N}_])|\[[^\]]+\]\([^)]+\))/gu;
  let last = 0, match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) });
    const token = match[0];
    if (token[0] === '[') {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token), url = parts[2];
      if (/^https?:\/\//i.test(url)) nodes.push({ type: 'link', href: url, children: parseInline(parts[1]) });
      else nodes.push({ type: 'text', text: token });
    } else if (token[0] === '`') nodes.push({ type: 'code', text: token.slice(1, -1) });
    else { const strong = token.startsWith('**') || token.startsWith('__'), n = strong ? 2 : 1; nodes.push({ type: strong ? 'strong' : 'em', children: parseInline(token.slice(n, -n)) }); }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}
export function parseMarkdown(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), result = [];
  const isBlock = line => /^\s*(?:`{3,}|~{3,}|#{1,6}\s|>|[-*+](?:\s|$)|\d+[.)](?:\s|$))/.test(line);
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    let match;
    if ((match = /^\s*(`{3,}|~{3,})/.exec(lines[i]))) {
      const fence = match[1], closing = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`), code = [];
      i++;
      while (i < lines.length && !closing.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      result.push({ type: 'pre', text: code.join('\n') });
    }
    else if ((match = /^(#{1,6})\s+(.+)$/.exec(lines[i]))) { result.push({ type: `h${match[1].length}`, children: parseInline(match[2]) }); i++; }
    else if (/^\s*>/.test(lines[i])) { const quote = []; while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, '')); result.push({ type: 'blockquote', children: parseMarkdown(quote.join('\n')) }); }
    else if (/^\s*(?:[-*+]|\d+[.)])(?:\s|$)/.test(lines[i])) { const ordered = /^\s*\d/.test(lines[i]), items = []; const re = ordered ? /^\s*\d+[.)](?:\s+(.*)|$)/ : /^\s*[-*+](?:\s+(.*)|$)/; while (i < lines.length && (match = re.exec(lines[i]))) { items.push({ type: 'li', children: parseInline(match[1] || '') }); i++; } result.push({ type: ordered ? 'ol' : 'ul', children: items }); }
    else { const paragraph = [lines[i++]]; while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) paragraph.push(lines[i++]); result.push({ type: 'p', children: parseInline(paragraph.join('\n')) }); }
  }
  return result;
}
export function renderMarkdown(text, document) {
  const fragment = document.createDocumentFragment();
  function build(node) {
    if (node.type === 'text') return document.createTextNode(node.text);
    const element = document.createElement(node.type === 'link' ? 'a' : node.type);
    if (node.type === 'link') { element.href = node.href; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    if (node.type === 'pre') { const code = document.createElement('code'); code.textContent = node.text; element.append(code); }
    else if (node.text !== undefined) element.textContent = node.text;
    for (const child of node.children || []) element.append(build(child));
    return element;
  }
  for (const node of parseMarkdown(text)) fragment.append(build(node));
  return fragment;
}
