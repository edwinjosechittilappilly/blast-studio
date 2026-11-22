import { el, button, copyButton } from './review.js';
export const mediaUrl = (slug, path) => `/media/${encodeURIComponent(slug)}/${path.split('/').map(encodeURIComponent).join('/')}`;
function kindOf(path, kind) { return kind === 'video' || /\.(mp4|webm)$/i.test(path) ? 'video' : kind === 'document' || /\.pdf$/i.test(path) ? 'pdf' : /\.(png|jpe?g|gif|webp|svg)$/i.test(path) || kind === 'image' || kind === 'gif' ? 'image' : 'file'; }
function visual(slug, item, captions) {
  const kind = kindOf(item.file, item.kind), url = mediaUrl(slug, item.file); let node;
  if (kind === 'image') { node = el('img'); node.src = url; node.alt = item.alt || ''; }
  else if (kind === 'video') { node = el('video'); node.controls = true; node.src = url; node.setAttribute('aria-label', item.alt || 'Video'); if (captions[item.file]) { const track = el('track'); track.kind = 'captions'; track.label = 'Captions'; track.src = mediaUrl(slug, captions[item.file]); track.default = true; node.append(track); } }
  else if (kind === 'pdf') { node = el('iframe'); node.src = url; node.title = item.alt || 'PDF preview'; }
  else { node = el('p', 'Preview not available. Download the file to view it.'); }
  return node;
}
export function mediaViewer(slug, item, captions, trigger) {
  const modal = el('cds-modal'); modal.setAttribute('size', 'lg'); modal.setAttribute('aria-label', item.alt || 'Media viewer');
  const header = el('cds-modal-header'), heading = el('cds-modal-heading', item.alt || 'Media viewer'); header.append(heading); const body = el('cds-modal-body', null, 'viewer-body'); const display = visual(slug, item, captions); body.append(display);
  const footer = el('cds-modal-footer'); const close = button('Close', 'secondary'); close.addEventListener('click', () => { modal.open = false; modal.remove(); trigger.focus(); }); footer.append(close);
  if (kindOf(item.file, item.kind) === 'image') { const zoom = button('View at 100%', 'secondary'); zoom.addEventListener('click', () => { const full = display.classList.toggle('actual-size'); zoom.textContent = full ? 'Fit to window' : 'View at 100%'; }); footer.append(zoom); }
  const download = button('Download', 'primary'); download.addEventListener('click', () => { const link = el('a'); link.href = mediaUrl(slug, item.file); link.download = item.file.split('/').pop(); document.body.append(link); link.click(); link.remove(); }); footer.append(download);
  modal.append(header, body, footer); document.body.append(modal); modal.addEventListener('cds-modal-closed', () => { modal.remove(); trigger.focus(); }); modal.open = true;
}
export function mediaGallery(slug, items, captions) {
  const gallery = el('div', null, 'media-gallery');
  for (const item of items) { if (/\.vtt$/i.test(item.file)) continue; const tile = el('cds-tile', null, 'media-tile'); const kind = kindOf(item.file, item.kind); if (kind === 'image' || kind === 'video') { const thumbnail = visual(slug, item, captions); tile.append(thumbnail); } else tile.append(el('p', kind === 'pdf' ? 'PDF document' : 'File')); tile.append(el('p', item.alt || item.file)); const actions = el('div', null, 'media-actions'), view = button('View'); view.setAttribute('aria-label', `View ${item.alt || item.file}`); view.addEventListener('click', () => mediaViewer(slug, item, captions, view)); actions.append(view); if (item.alt) actions.append(copyButton('Copy alt text', item.alt)); const download = el('a', 'Download'); download.href = mediaUrl(slug, item.file); download.download = item.file.split('/').pop(); actions.append(download); tile.append(actions); gallery.append(tile); }
  return gallery;
}
