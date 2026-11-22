import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, renderMarkdown } from '../src/dashboard/static/markdown.js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('markdown parser produces safe structured content', () => {
  const nodes = parseMarkdown('# Heading\n\nA **bold** and *italic* [link](https://example.com).\n\n- one\n- two\n\n> Quote\n\n```js\n<script>alert(1)</script>\n```');
  assert.deepEqual(nodes.map(n => n.type), ['h1', 'p', 'ul', 'blockquote', 'pre']);
  assert.equal(nodes[4].text, '<script>alert(1)</script>');
  assert.ok(nodes[1].children.some(n => n.type === 'link' && n.href === 'https://example.com'));
  assert.deepEqual(parseInline('[bad](javascript:alert)'), [{ type: 'text', text: '[bad](javascript:alert)' }]);
});

test('word-internal underscores stay literal', () => {
  assert.deepEqual(parseInline('build_in_public and a_b_c'), [{ type: 'text', text: 'build_in_public and a_b_c' }]);
  assert.equal(parseInline('_emphasis_')[0].type, 'em');
});

test('markdown DOM rendering creates only safe links and text', () => {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; }
    append(child) { this.children.push(child); }
  }
  const document = { createDocumentFragment: () => new Node('fragment'), createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { text }) };
  const fragment = renderMarkdown('[safe](https://example.com) <script>alert(1)</script> [bad](javascript:alert)', document);
  const paragraph = fragment.children[0], link = paragraph.children[0];
  assert.equal(link.tag, 'a'); assert.equal(link.href, 'https://example.com'); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/);
  assert.ok(paragraph.children.every(node => node.tag !== 'script'));
  assert.match(paragraph.children.map(node => node.text ?? '').join(''), /<script>/);
});

test('built dashboard assets contain no external HTTPS references', () => {
  execFileSync(process.execPath, ['src/dashboard/ui/build.mjs']);
  for (const file of ['src/dashboard/build/app.css', 'src/dashboard/build/app.js']) assert.doesNotMatch(readFileSync(file, 'utf8'), /https:\/\//);
});
