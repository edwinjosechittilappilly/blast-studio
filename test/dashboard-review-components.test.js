import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateList, hookComparison, rubricTable, scoreMeter } from '../src/dashboard/ui/components/review.js';
import { renderMarkdown } from '../src/dashboard/static/markdown.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.style = {}; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}
const document = {
  createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag),
  createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
  createDocumentFragment: () => new Node('fragment'),
};
globalThis.document = document;

test('failed gates lead and preserve their reason', () => {
  const list = gateList([{ id: 'policy', pass: true }, { id: 'specs', pass: false, message: 'Too long' }]);
  assert.match(list.children[0].children[2].textContent, /specs — Too long/);
  assert.equal(list.children[0].children[1].textContent, 'Fail');
});

test('rubric sorts scored criteria lowest first and exposes details', () => {
  const list = rubricTable([{ id: 'a', question: 'First' }, { id: 'b', question: 'Second' }], [{ criterion: 'a', score: 2 }, { criterion: 'b', score: 0, evidence: 'Quote', fix: 'Revise' }]);
  assert.equal(list.children[0].children[0].children[0].textContent, 'Second');
  assert.equal(list.children[0].children[1].textContent, 'Evidence: Quote');
  assert.equal(list.children[0].children[2].textContent, 'Fix: Revise');
});

test('score is exposed as a meter with its threshold', () => {
  const meter = scoreMeter({ total: 61.3 }, 75).children[1].children[0];
  assert.equal(meter.tag, 'meter'); assert.equal(meter.value, 61.3);
  assert.match(meter.attributes['aria-label'], /75/); assert.equal(meter.className, 'score-fail');
});

test('preferred hook is marked on the corresponding option', () => {
  const list = hookComparison(['First', 'Second'], [{ preferred: 'B', evidence: 'Clearer' }]).children[1];
  assert.equal(list.children[1].children[0].children[1].textContent, 'Preferred');
  assert.equal(list.children[1].children[0].children[2].textContent, 'Clearer');
});

test('code copy control writes only the code', async () => {
  let copied; Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  const pre = renderMarkdown('```\ncurl example\n```', document).children[0];
  await pre.children[0].listeners.click();
  assert.equal(copied, 'curl example'); assert.equal(pre.children[0].textContent, 'Copied');
});
