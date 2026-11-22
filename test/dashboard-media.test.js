import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaGallery } from '../src/dashboard/ui/components/media.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.classList = { toggle: () => true }; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function setup() {
  const body = new Node('body');
  globalThis.document = { body, createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) };
  return body;
}

test('gallery distinguishes outputs and shows a video poster without a player', () => {
  setup();
  const gallery = mediaGallery('launch', [
    { file: 'assets/clip/out/1x1.mp4', alt: 'clip preview', width: 1080, height: 1080, seconds: 12 },
    { file: 'assets/clip/out/frames/1x1-1.png', alt: 'clip preview' },
  ], {});
  const view = gallery.children[0].children[0];
  assert.equal(view.attributes['aria-label'], 'View 1x1.mp4');
  assert.equal(view.children[0].children[0].src, '/media/launch/assets/clip/out/frames/1x1-1.png');
  assert.equal(view.children[2].textContent, 'Video · 1080 × 1080 · 12 s');
  assert.equal(view.children[0].children.some(node => node.tag === 'video'), false);
  assert.equal(gallery.children[0].children[1].children[0].children[0].attributes.fill, 'currentColor');
});

test('viewer names the file, retains alt text and restores focus after close', () => {
  const body = setup();
  const gallery = mediaGallery('launch', [{ file: 'assets/poster/out/image.png', alt: 'A descriptive poster.' }], {});
  const view = gallery.children[0].children[0]; view.listeners.click();
  const modal = body.children[0], [header, content, footer] = modal.children;
  assert.equal(header.children[1].textContent, 'image.png');
  assert.equal(header.children[2].tag, 'cds-modal-close-button');
  assert.equal(content.children.at(-1).textContent, 'A descriptive poster.');
  assert.equal(footer.children.length, 2);
  modal.listeners['cds-modal-closed'](); assert.equal(view.focused, true);
});
