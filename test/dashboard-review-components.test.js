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

test('preferred hook uses its text, combines evidence, and retains unmatched comparisons', () => {
  const first = 'Set up agents on a new machine', second = 'Install your tools with one command';
  const section = hookComparison([first, second], [
    { preferred: second, evidence: 'Clearer' }, { preferred: second, evidence: 'More specific' },
    { preferred: null, evidence: 'No preference' }, { preferred: 'A different hook', evidence: 'Unmatched' },
  ]);
  const content = section.children[1].children[1].children[0];
  assert.equal(content.children.filter(child => child.textContent === 'Preferred').length, 1);
  assert.deepEqual(content.children.slice(2).map(child => child.textContent), ['Clearer', 'More specific']);
  assert.deepEqual(section.children.slice(2).map(child => child.textContent), ['No preferred hook — No preference', 'Preferred: A different hook — Unmatched']);
  assert.equal(hookComparison([], [{ preferred: null, evidence: 'No hooks' }]).children[2].textContent, 'No preferred hook — No hooks');
});

test('rubric scores carry distinct status classes and readable values', () => {
  const criteria = ['a', 'b', 'c', 'd'].map(id => ({ id, question: id }));
  const scores = [{ criterion: 'a', score: 0 }, { criterion: 'b', score: 1 }, { criterion: 'c', score: 2 }];
  const pills = rubricTable(criteria, scores).children.map(row => row.children[0].children[1]);
  assert.deepEqual(pills.map(p => p.textContent), ['0 / 2', '1 / 2', '2 / 2', 'N/A']);
  assert.deepEqual(pills.map(p => p.className), ['rubric-score rubric-score-s0', 'rubric-score rubric-score-s1', 'rubric-score rubric-score-s2', 'rubric-score rubric-score-na']);
});

test('code copy control writes only the code', async () => {
  let copied; Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  const pre = renderMarkdown('```\ncurl example\n```', document).children[0];
  await pre.children[0].listeners.click();
  assert.equal(copied, 'curl example'); assert.equal(pre.children[0].textContent, 'Copied');
});
