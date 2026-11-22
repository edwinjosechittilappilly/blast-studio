import { el, button, copyText } from './review.js';
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
  for (const item of items) {
    if (/\.vtt$/i.test(item.file)) continue;
    const tile = el('cds-tile', null, 'media-tile'), kind = kindOf(item.file, item.kind);
    if (kind === 'image' || kind === 'video') tile.append(visual(slug, item, captions)); else tile.append(el('p', kind === 'pdf' ? 'PDF document' : 'File'));
    tile.append(el('p', item.alt || item.file));
    const actions = el('div', null, 'media-actions'), view = button('View'), overflow = el('cds-overflow-menu'), menu = el('cds-menu');
    view.setAttribute('aria-label', `View ${item.alt || item.file}`); view.addEventListener('click', () => mediaViewer(slug, item, captions, view));
    overflow.setAttribute('label', `More actions for ${item.alt || item.file}`); overflow.setAttribute('enable-v12-overflowmenu', '');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('slot', 'icon'); icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('width', '16'); icon.setAttribute('height', '16'); icon.setAttribute('aria-hidden', 'true');
    for (const y of [3, 8, 13]) { const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('cx', '8'); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '1.2'); icon.append(dot); } overflow.append(icon);
    const download = el('cds-menu-item'); download.setAttribute('label', 'Download'); download.addEventListener('click', () => { const link = el('a'); link.href = mediaUrl(slug, item.file); link.download = item.file.split('/').pop(); document.body.append(link); link.click(); link.remove(); }); menu.append(download);
    if (item.alt) { const copy = el('cds-menu-item'); copy.setAttribute('label', 'Copy alt text'); copy.addEventListener('click', async () => { const ok = await copyText(item.alt); const notice = el('cds-toast-notification', null, 'job-toast'); notice.setAttribute('kind', ok ? 'success' : 'error'); const title = el('span', ok ? 'Alt text copied' : 'Copy failed'); title.slot = 'title'; notice.append(title); notice.addEventListener('cds-notification-closed', () => notice.remove()); document.body.append(notice); }); menu.append(copy); }
    overflow.append(menu); actions.append(view, overflow); tile.append(actions); gallery.append(tile);
  }
  return gallery;
}
