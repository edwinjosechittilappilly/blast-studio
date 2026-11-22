import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AssetMeta, BriefSection, GateResult, PlatformPack, Post, StudioConfig } from '../types.ts';

const numberWords: Record<string, number> = Object.fromEntries(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'].map((word, n) => [word, n]));
const metricPattern = /(?<![\w.])(\$\s*)?(\d[\d,]*(?:\.\d+)?(?!\d|\.\d)|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|half|double|twice)\b)\s*(thousand\b|million\b|billion\b|[kmb](?![a-z]))?\s*\+?\s*(%|percent\b|times\b|[x×](?!\w)|users?\b|customers?\b|stars?\b|downloads?\b|dollars?\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b|bytes?\b|[gmk]b\b)?/gi;
function metrics(text: string): { token: string; key: string; metric: boolean }[] {
  const result: { token: string; key: string; metric: boolean }[] = [];
  for (const match of text.matchAll(metricPattern)) {
    const token = match[0].trim(), unit = match[4]?.toLowerCase();
    const word = match[2].toLowerCase();
    const multiplier = match[3]?.toLowerCase();
    const number = (word === 'half' ? .5 : word === 'double' || word === 'twice' ? 2 : numberWords[word] ?? Number(word.replace(/,/g, ''))) * (multiplier === 'k' || multiplier === 'thousand' ? 1000 : multiplier === 'm' || multiplier === 'million' ? 1000000 : multiplier === 'b' || multiplier === 'billion' ? 1000000000 : 1);
    const normalizedUnit = match[1] || unit?.startsWith('dollar') ? '$' : unit === 'percent' ? '%' : unit === '×' || unit === 'times' || ['half', 'double', 'twice'].includes(word) ? 'x' : unit?.replace(/s$/, '') ?? '';
    result.push({ token, key: `${number}:${normalizedUnit}`, metric: !!normalizedUnit });
  }
  return result;
}


export function runGates(post: Post, pack: PlatformPack, assets: AssetMeta[], brief: BriefSection[], config: StudioConfig, projectDir?: string): GateResult[] & { warnings: string[] } {
  const failures: Record<GateResult['id'], string[]> = { policy: [], disclosure: [], specs: [], accessibility: [], 'fabricated-metrics': [], rights: [] };
  const warnings: string[] = [...(pack.notes ?? [])];
  const policySources: { source?: string; lastVerified?: string }[] = [{ source: pack.aiSource, lastVerified: pack.aiLastVerified }, ...Object.values(pack.disclosure).filter((rule): rule is Extract<typeof rule, object> => typeof rule === 'object'), ...(typeof pack.sponsorship === 'object' ? [pack.sponsorship] : [])];
  for (const source of policySources) if (!source.lastVerified || !Number.isFinite(Date.parse(source.lastVerified)) || Date.now() - Date.parse(source.lastVerified) > 90 * 86400000) warnings.push(`Policy verification is missing or stale: ${source.source || pack.sources.join(', ') || pack.id}`);
  const byId = new Map(assets.map(a => [a.id, a]));
  const used = new Set<string>();
  const visit = (id: string) => { if (used.has(id)) return; used.add(id); for (const child of byId.get(id)?.embeds ?? []) visit(child); };
  post.media.forEach(m => visit(m.asset));
  const selected = assets.filter(a => used.has(a.id));
  const add = (id: GateResult['id'], message: string) => failures[id].push(message);
  // Code is exempt: snippets legitimately contain `${{ secrets.X }}`, TODO comments or `xxx` sample values.
  const checkPlaceholder = (field: string, text: string) => {
    const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    const match = prose.match(/\b(?:TODO|TBD)\b/) ?? prose.match(/\[PLACEHOLDER|PLACEHOLDER\]|\blorem\s+ipsum\b|\{\{|\}\}|<your-|\bREPLACE_ME\b|\bxxx\b/i);
    if (match) add('specs', `Placeholder in ${field}: ${match[0]}`);
  };
  if (post.title) checkPlaceholder(`${post.path} title`, post.title);
  checkPlaceholder(`${post.path} body`, post.body);
  post.thread?.forEach((item, index) => checkPlaceholder(`${post.path} thread ${index + 1}`, item));
  post.media.forEach(media => checkPlaceholder(`${post.path} alt text for ${media.file}`, media.alt ?? ''));
  for (const id of used) if (!byId.has(id)) add('rights', `Missing asset metadata for ${id}`);
  if (pack.ai === 'none' && post.body.trim()) add('policy', 'Generated text is not permitted');
  if (pack.ai === 'outline' && post.body.split('\n').some(line => {
    const text = line.trim();
    if (!text || /^#{1,6}\s+\S/.test(text)) return false;
    const bullet = text.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
    return !bullet || bullet[1].trim().split(/\s+/).length > 20;
  })) add('policy', 'Only headings and brief outline bullets (at most 20 words) are permitted');
  for (const kind of ['text', 'media', 'voice'] as const) {
    const applies = kind === 'text' ? !!post.body.trim() : kind === 'voice' ? selected.some(a => a.voiceGenerated || a.kind === 'voiceover' && a.aiGenerated) : selected.some(a => a.kind !== 'voiceover' && a.aiGenerated);
    if (!applies) continue;
    const rule = pack.disclosure[kind];
    const value = post.disclosure?.[kind]?.trim();
    const accepts = typeof rule === 'object' && kind === 'text' && pack.ai === 'draft' ? rule.acceptsWhenGenerated ?? rule.accepts : typeof rule === 'object' ? rule.accepts : undefined;
    if (typeof rule === 'object' && (!value || accepts?.length && !accepts.some(option => option.toLowerCase() === value.toLowerCase()))) add('disclosure', `${kind} disclosure required: ${rule.rule} (${rule.source})`);
    if (rule === 'unknown') warnings.push(`${kind} disclosure unknown; verify ${pack.sources.join(', ') || pack.id}`);
  }
  if (post.sponsored && typeof pack.sponsorship === 'object') {
    const rule = pack.sponsorship, value = post.disclosure?.sponsorship?.trim();
    if (!value || rule.accepts?.length && !rule.accepts.some(option => option.toLowerCase() === value.toLowerCase())) add('disclosure', `sponsorship disclosure required: ${rule.rule} (${rule.source})`);
  }
  const check = (label: string, value: number | undefined, spec: typeof pack.textLimit, compare: (a: number, b: number) => boolean = (a,b) => a > b) => {
    if (value === undefined || spec === undefined) return;
    if (spec === 'unknown') warnings.push(`${label} unknown; verify ${pack.sources.join(', ') || pack.id}`);
    else { if (compare(value, spec.value)) add('specs', `${label} exceeds ${spec.value} (${spec.source})`); if (!spec.lastVerified || !Number.isFinite(Date.parse(spec.lastVerified)) || Date.now() - Date.parse(spec.lastVerified) > 90 * 86400000) warnings.push(`${label} verification is missing or stale: ${spec.source}`); }
  };
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const length = (text: string) => {
    if (post.platform === 'bluesky') return [...segmenter.segment(text)].length;
    const linked = text.replace(/https?:\/\/[^\s<>]*[^\s<>.,;:!?\])}'"]/g, 'x'.repeat(23));
    if (post.platform === 'mastodon') return [...linked].length;
    if (post.platform !== 'x') return [...text].length;
    let count = 0;
    for (const { segment } of segmenter.segment(linked)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) { count += 2; continue; }
      for (const char of segment) { const cp = char.codePointAt(0)!; count += cp <= 4351 || cp >= 8192 && cp <= 8205 || cp >= 8208 && cp <= 8223 || cp >= 8242 && cp <= 8247 ? 1 : 2; }
    }
    return count;
  };
  for (const item of [post.body, ...(post.thread ?? [])]) check('text limit', length(item), pack.textLimit);
  if (post.title) check('title limit', [...post.title].length, pack.titleLimit);
  if (['devto', 'hashnode', 'gist', 'github-discussion', 'reddit', 'substack', 'lemmy'].includes(post.platform) && !post.title?.trim()) add('specs', 'Missing required title');
  const anchors = new Set(brief.map(section => section.anchor));
  if (!post.evidence.length || post.evidence.some(anchor => !anchors.has(anchor))) add('specs', 'Missing or unknown evidence anchor');
  const mb = pack.marketBlasterMedia;
  if (mb) {
    const kinds = new Set(post.media.map(m => m.kind));
    for (const kind of kinds) if (!mb.allowedKinds.includes(kind) || kind === 'image' && post.media.some(m => m.kind === kind && /\.gif$/i.test(m.file))) add('specs', `Market Blaster does not support ${kind} media (${mb.source})`);
    for (const group of mb.exclusiveKinds ?? []) if (group.filter(kind => kinds.has(kind)).length > 1) add('specs', `Market Blaster does not support combining ${group.join(' and ')} (${mb.source})`);
    if (mb.maxCount !== undefined && post.media.length > mb.maxCount) add('specs', `Market Blaster attachment count exceeds ${mb.maxCount} (${mb.source})`);
  }
  for (const media of post.media) {
    const spec = pack.media.find(s => s.kind === media.kind);
    const output = byId.get(media.asset)?.outputs.find(o => media.file === `assets/${media.asset}/${o.file}`);
    if (!output) add('specs', `Media is not a declared output of ${media.asset}: ${media.file}`);
    // A pack format without a media limits entry means the limits are unverified, not that the media is unsupported.
    const formatFor: Record<string, string[]> = { image: ['image', 'carousel'], gif: ['image'], video: ['video'], document: ['carousel', 'article'] };
    if (!spec) {
      if (formatFor[media.kind]?.some(format => pack.formats.includes(format as never))) warnings.push(`${media.kind} limits unknown; verify ${pack.sources.join(', ') || pack.id}`);
      else add('specs', `Unsupported ${media.kind} media`);
    }
    else {
      check(`${media.kind} count`, post.media.filter(m => m.kind === media.kind).length, spec.maxCount);
      check(`${media.kind} bytes`, output?.bytes, spec.maxBytes); check(`${media.kind} duration`, output?.seconds, spec.maxSeconds); check(`${media.kind} minimum duration`, output?.seconds, spec.minSeconds, (a,b) => a < b);
      check(`${media.kind} width`, output?.width, spec.width); check(`${media.kind} height`, output?.height, spec.height);
      if (spec.aspectRatios === 'unknown') warnings.push(`aspect ratios unknown; verify ${pack.sources.join(', ') || pack.id}`);
      else if (spec.aspectRatios && output?.aspect && !spec.aspectRatios.value.includes(output.aspect)) add('specs', `Unsupported aspect ${output.aspect} (${spec.aspectRatios.source})`);
    }
    if (['image', 'gif', 'document'].includes(media.kind) && !media.alt?.trim()) add('accessibility', `Missing alt text for ${media.asset}`);
    if (media.kind === 'video' && !byId.get(media.asset)?.outputs.some(o => /\.vtt$/i.test(o.file))) add('accessibility', `Missing captions for ${media.asset}`);
  }
  for (const asset of selected) {
    if (['gemini', 'openai', 'omp'].includes(asset.provider) && !asset.license?.trim()) add('rights', `Missing license for ${asset.id}`);
    if (asset.kind === 'logo' && !asset.trademarkChecked) add('rights', `Trademark search not checked for ${asset.id}`);
    for (const metric of asset.metrics ?? []) {
      for (const text of metric.texts ?? []) checkPlaceholder(`assets/${asset.id}/${metric.file} rendered text`, text);
      for (const kind of metric.unmeasurable ?? []) warnings.push(`Text cannot be checked in ${kind} in ${metric.file}`);
      const width = asset.outputs.find(o => o.file === metric.file)?.width ?? 1080;
      const minimum = (pack.accessibility?.minFontPx ?? 24) * width / 1080;
      if (metric.minFontPx !== null && metric.minFontPx < minimum) add('accessibility', `Text too small in ${metric.file}`);
      if (metric.nodes?.length) {
        for (const node of metric.nodes) {
          const threshold = node.fontPx >= (pack.accessibility?.largeTextPx ?? (node.bold ? 18.66 : 24)) ? pack.accessibility?.minContrastLarge ?? 3 : pack.accessibility?.minContrast ?? 4.5;
          if (node.contrast === null) warnings.push(`Contrast cannot be measured in ${metric.file}`);
          else if (node.contrast < threshold) add('accessibility', `Insufficient contrast in ${metric.file}`);
        }
      } else if (metric.minFontPx !== null) {
        if (metric.minContrast === null) warnings.push(`Contrast cannot be measured in ${metric.file}`);
        else if (metric.minContrast < (metric.minFontPx >= (pack.accessibility?.largeTextPx ?? 24) ? pack.accessibility?.minContrastLarge ?? 3 : pack.accessibility?.minContrast ?? 4.5)) add('accessibility', `Insufficient contrast in ${metric.file}`);
      }
      if (metric.overflow) add('accessibility', `Text is cut off in ${metric.file}`);
      if (metric.edge) warnings.push(`Text enters the ${metric.zoneDescription ?? 'default 5% margin'} in ${metric.file}; overlays or cropping may cover it`);
    }
  }
  const measured = new Set(selected.filter(a => a.kind === 'video' || a.kind === 'terminal-demo').flatMap(a => a.outputs.flatMap(o => o.seconds ? [Math.floor(o.seconds), Math.ceil(o.seconds), Number(o.seconds.toFixed(1))].map(s => `${s}:second`) : [])));
  const evidence = new Set(metrics(brief.map(s => `${s.title}\n${s.body}`).join('\n')).map(m => m.key));
  const waived = new Set(config.grounding.waive.flatMap(w => metrics(w).map(m => m.key)));
  const captions = projectDir ? selected.flatMap(asset => asset.outputs.filter(o => /\.vtt$/i.test(o.file)).flatMap(o => {
    const path = join(projectDir, 'assets', asset.id, o.file);
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf8').replace(/^WEBVTT[^\n]*\n?/i, '').replace(/^(?:[^\n]*\n)?[^\n]*-->[^\n]*$/gm, '');
    checkPlaceholder(`assets/${asset.id}/${o.file} captions`, text);
    return [text];
  })) : [];
  const text = [post.title ?? '', post.body, ...(post.thread ?? []), ...post.media.map(m => m.alt), ...selected.flatMap(a => (a.metrics ?? []).flatMap(m => m.texts ?? [])), ...captions].join('\n').replace(/https?:\/\/\S+/g, '').replace(/\b[a-z][\w]*-\d[\w.-]*/gi, '').replace(/^\s*\d+[.)]\s+/gm, '');
  const seen = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) for (const token of metrics(sentence)) {
    if (seen.has(token.key) || evidence.has(token.key) || waived.has(token.key) || config.grounding.waive.some(w => w.toLowerCase() === token.token.toLowerCase()) || /\b(?:video|demo|clip|recording|shorts?)\b/i.test(sentence) && measured.has(token.key)) continue;
    seen.add(token.key);
    if (token.metric) add('fabricated-metrics', `Ungrounded metric: ${token.token}`);
    else if (/\d/.test(token.token)) warnings.push(`Ungrounded version or identifier: ${token.token}`);
  }
  const result = (Object.keys(failures) as GateResult['id'][]).map(id => ({ id, pass: failures[id].length === 0, message: failures[id].join('; ') || 'Passed', ...(id === 'rights' && failures.rights.some(s => s.startsWith('Missing license')) ? { unfixable: true } : {}) }));
  return Object.assign(result, { warnings });
}
