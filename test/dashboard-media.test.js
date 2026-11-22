import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaGallery } from '../src/dashboard/ui/components/media.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; const values = new Set(); this.classList = { toggle: name => values.has(name) ? (values.delete(name), false) : (values.add(name), true), contains: name => values.has(name) }; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() { this.focused = true; }
  click() { return this.listeners.click?.(); }
  remove() { this.removed = true; }
}
function find(node, predicate) { if (predicate(node)) return node; for (const child of node.children) { const found = find(child, predicate); if (found) return found; } }
function tag(node, name) { return find(node, child => child.tag === name); }
function setup() {
  const body = new Node('body');
  globalThis.document = { body, createElement: name => new Node(name), createElementNS: (_, name) => new Node(name) };
  return body;
}

test('extension determines output kind and video uses a poster rather than a player', () => {
  setup();
  const gallery = mediaGallery('launch', [
    { file: 'assets/clip/out/1x1.mp4', kind: 'image', width: 1080, height: 1080, seconds: 12 },
    { file: 'assets/clip/out/frames/1x1-1.png', kind: 'video' },
  ], {});
  assert.equal(find(gallery, n => n.textContent === 'Video · 1080 × 1080 · 12 s').tag, 'span');
  assert.ok(find(gallery, n => n.textContent === 'Image'));
  assert.equal(tag(gallery, 'video'), undefined);
  assert.equal(tag(gallery, 'img').src, '/media/launch/assets/clip/out/frames/1x1-1.png');
});

test('viewer suppresses synthetic alt text but preserves real descriptions', () => {
  const body = setup();
  const gallery = mediaGallery('launch', [{ file: 'assets/poster/out/image.png', alt: 'poster preview' }, { file: 'assets/poster/out/other.png', alt: 'A descriptive poster.' }], {});
  find(gallery, n => n.attributes['aria-label'] === 'View image.png').click();
  let modal = tag(body, 'cds-modal');
  assert.equal(find(modal, n => n.textContent === 'poster preview'), undefined);
  assert.equal(find(modal, n => n.textContent === 'Copy alt text'), undefined);
  find(gallery, n => n.attributes['aria-label'] === 'View other.png').click();
  modal = body.children.at(-1);
  assert.ok(find(modal, n => n.textContent === 'A descriptive poster.'));
  assert.ok(find(modal, n => n.textContent === 'Copy alt text'));
});

test('zoom toggles the image and exposes a stable pressed control', () => {
  const body = setup();
  const gallery = mediaGallery('launch', [{ file: 'image.png', alt: 'Poster' }], {});
  tag(gallery, 'button').click();
  const modal = tag(body, 'cds-modal'), zoom = tag(modal, 'cds-icon-button'), image = tag(modal, 'img');
  assert.equal(zoom.attributes['aria-pressed'], 'false');
  assert.ok(find(zoom, n => n.textContent === 'View at 100%'));
  zoom.click(); assert.equal(zoom.attributes['aria-pressed'], 'true'); assert.ok(image.classList.contains('actual-size'));
  zoom.click(); assert.equal(zoom.attributes['aria-pressed'], 'false'); assert.equal(image.classList.contains('actual-size'), false);
});

test('download confirmation expires', () => {
  const body = setup(), original = globalThis.setTimeout; let expire;
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 5000); expire = fn; };
  try {
    const gallery = mediaGallery('launch', [{ file: 'image.png' }], {});
    tag(gallery, 'button').click();
    find(body, n => n.textContent === 'Download').click();
    const toast = tag(body, 'cds-toast-notification'); assert.equal(toast.attributes.timeout, '5000');
    expire(); assert.equal(toast.removed, true);
  } finally { globalThis.setTimeout = original; }
});
