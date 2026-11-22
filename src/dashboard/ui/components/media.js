import { el, button } from './review.js';
import { copyText } from '../../static/clipboard.js';
import zoomIn from '@carbon/icons/es/zoom--in/16.js';
if (typeof window !== 'undefined') import('@carbon/web-components/es/components/icon-button/index.js');
export const mediaUrl = (slug, path) => `/media/${encodeURIComponent(slug)}/${path.split('/').map(encodeURIComponent).join('/')}`;
function kindOf(path, kind) { return /\.(mp4|webm)$/i.test(path) ? 'video' : /\.pdf$/i.test(path) ? 'pdf' : /\.(png|jpe?g|gif|webp|svg)$/i.test(path) ? 'image' : kind === 'video' ? 'video' : kind === 'document' ? 'pdf' : kind === 'image' || kind === 'gif' ? 'image' : 'file'; }
function filename(item) { return item.file.split('/').pop(); }
function altText(item) { const match = /^assets\/([^/]+)\//.exec(item.file); return match && item.alt === `${match[1]} preview` ? '' : item.alt || ''; }
function details(item, kind) {
  const parts = [kind === 'pdf' ? 'PDF' : kind[0].toUpperCase() + kind.slice(1)];
  if (item.width && item.height) parts.push(`${item.width} × ${item.height}`);
  if (item.seconds != null) parts.push(`${item.seconds} s`);
  if (!item.width && item.bytes != null) parts.push(`${(item.bytes / 1024).toFixed(1)} KB`);
  return parts.join(' · ');
}
function notify(text, failed = false) {
  const notice = el('cds-toast-notification', null, 'job-toast media-toast');
  notice.setAttribute('kind', failed ? 'error' : 'success'); notice.setAttribute('timeout', '5000');
  const title = el('span', text); title.slot = 'title'; notice.append(title);
  notice.addEventListener('cds-notification-closed', () => notice.remove());
  document.body.append(notice); setTimeout(() => notice.remove(), 5000);
}
function downloadFile(slug, item) {
  const link = el('a'); link.href = mediaUrl(slug, item.file); link.download = filename(item);
  document.body.append(link); link.click(); link.remove(); notify('Download started');
}
async function copyAlt(item) {
  const ok = await copyText(item.alt); notify(ok ? 'Alt text copied' : 'Copy failed', !ok);
}
function visual(slug, item, captions) {
  const kind = kindOf(item.file, item.kind), url = mediaUrl(slug, item.file); let node;
  if (kind === 'image') { node = el('img'); node.src = url; node.alt = item.alt || ''; }
  else if (kind === 'video') { node = el('video'); node.controls = true; node.src = url; node.setAttribute('aria-label', item.alt || filename(item)); if (captions[item.file]) { const track = el('track'); track.kind = 'captions'; track.label = 'Captions'; track.src = mediaUrl(slug, captions[item.file]); track.default = true; node.append(track); } }
  else if (kind === 'pdf') { node = el('iframe'); node.src = url; node.title = filename(item); }
  else { node = el('p', 'Preview not available. Download the file to view it.'); }
  return node;
}
export function mediaViewer(slug, item, captions, trigger) {
  const kind = kindOf(item.file, item.kind), name = filename(item);
  const modal = el('cds-modal'); modal.setAttribute('size', 'lg'); modal.setAttribute('aria-label', name);
  const asset = /^assets\/([^/]+)\//.exec(item.file)?.[1];
  const header = el('cds-modal-header'), label = el('cds-modal-label', [asset, details(item, kind)].filter(Boolean).join(' · ')), heading = el('cds-modal-heading', name, 'viewer-heading'), close = el('cds-modal-close-button');
  header.append(label, heading, close);
  const body = el('cds-modal-body', null, 'viewer-body'), display = visual(slug, item, captions);
  if (kind === 'image') {
    const toolbar = el('div', null, 'viewer-toolbar'), zoom = el('cds-icon-button', null, 'viewer-zoom');
    zoom.setAttribute('kind', 'ghost'); zoom.setAttribute('align', 'left'); zoom.setAttribute('aria-pressed', 'false');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries(zoomIn.attrs)) icon.setAttribute(key, String(value));
    icon.setAttribute('slot', 'icon'); icon.setAttribute('aria-hidden', 'true');
    for (const part of zoomIn.content) { const child = document.createElementNS('http://www.w3.org/2000/svg', part.elem); for (const [key, value] of Object.entries(part.attrs)) child.setAttribute(key, String(value)); icon.append(child); }
    const tooltip = el('span', 'View at 100%'); tooltip.slot = 'tooltip-content'; zoom.append(icon, tooltip);
    const syncPressed = async full => { zoom.setAttribute('aria-pressed', String(full)); zoom.isSelected = full; await zoom.updateComplete; zoom.shadowRoot?.querySelector('button')?.setAttribute('aria-pressed', String(full)); };
    syncPressed(false);
    zoom.addEventListener('click', () => { syncPressed(display.classList.toggle('actual-size')); });
    toolbar.append(zoom); body.append(toolbar);
  }
  body.append(display);
  if (altText(item)) body.append(el('p', altText(item), 'viewer-caption'));
  const footer = el('cds-modal-footer');
  if (altText(item)) { const copy = button('Copy alt text', 'secondary'); copy.addEventListener('click', () => copyAlt(item)); footer.append(copy); }
  const download = button('Download', 'primary'); download.addEventListener('click', () => downloadFile(slug, item)); footer.append(download);
  modal.append(header, body, footer); document.body.append(modal); modal.addEventListener('cds-modal-closed', () => { modal.remove(); trigger.focus(); }); modal.open = true;
}
export function mediaGallery(slug, items, captions) {
  const gallery = el('div', null, 'media-gallery');
  for (const item of items) {
    if (/\.vtt$/i.test(item.file)) continue;
    const tile = el('cds-tile', null, 'media-tile'), kind = kindOf(item.file, item.kind), name = filename(item);
    const view = el('button', null, 'media-view'); view.type = 'button'; view.setAttribute('aria-label', `View ${name}`);
    const preview = el('span', null, 'media-preview');
    if (kind === 'image') { const image = el('img'); image.src = mediaUrl(slug, item.file); image.alt = ''; preview.append(image); }
    else if (kind === 'video') {
      const prefix = item.file.replace(/\.[^.]+$/, '').replace(/\/([^/]+)$/, '/frames/$1-');
      const poster = items.find(candidate => candidate.file.startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(candidate.file));
      if (poster) { const image = el('img'); image.src = mediaUrl(slug, poster.file); image.alt = ''; preview.append(image); }
      const play = el('span', null, 'media-play'); play.setAttribute('aria-hidden', 'true'); play.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M10 6v20l16-10z"/></svg>'; preview.append(play);
    } else { const icon = el('span', kind === 'pdf' ? 'PDF' : 'FILE', 'media-file-icon'); icon.setAttribute('aria-hidden', 'true'); preview.append(icon); }
    view.append(preview, el('span', name, 'media-name'), el('span', details(item, kind), 'media-details'));
    view.addEventListener('click', () => mediaViewer(slug, item, captions, view)); tile.append(view);
    const actions = el('div', null, 'media-actions'), overflow = el('cds-overflow-menu'), menu = el('cds-menu');
    overflow.setAttribute('label', `More actions for ${name}`); overflow.setAttribute('enable-v12-overflowmenu', '');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('slot', 'icon'); icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('width', '16'); icon.setAttribute('height', '16'); icon.setAttribute('fill', 'currentColor'); icon.setAttribute('aria-hidden', 'true');
    for (const y of [3, 8, 13]) { const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('cx', '8'); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '1.2'); icon.append(dot); } overflow.append(icon);
    const download = el('cds-menu-item'); download.setAttribute('label', 'Download'); download.addEventListener('click', () => downloadFile(slug, item)); menu.append(download);
    if (altText(item)) { const copy = el('cds-menu-item'); copy.setAttribute('label', 'Copy alt text'); copy.addEventListener('click', () => copyAlt(item)); menu.append(copy); }
    overflow.append(menu); actions.append(overflow); tile.append(actions); gallery.append(tile);
  }
  return gallery;
}
