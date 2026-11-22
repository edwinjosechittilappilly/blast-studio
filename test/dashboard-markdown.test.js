import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline } from '../src/dashboard/static/markdown.js';

test('markdown parser produces safe structured content', () => {
  const nodes = parseMarkdown('# Heading\n\nA **bold** and *italic* [link](https://example.com).\n\n- one\n- two\n\n> Quote\n\n```js\n<script>alert(1)</script>\n```');
  assert.deepEqual(nodes.map(n => n.type), ['h1', 'p', 'ul', 'blockquote', 'pre']);
  assert.equal(nodes[4].text, '<script>alert(1)</script>');
  assert.ok(nodes[1].children.some(n => n.type === 'link' && n.href === 'https://example.com'));
  assert.deepEqual(parseInline('[bad](javascript:alert)'), [{ type: 'text', text: '[bad](javascript:alert)' }]);
});
