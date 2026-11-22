import type { AssetMeta, BriefSection, GateResult, PlatformPack, Post, StudioConfig } from '../types.ts';

export function runGates(post: Post, pack: PlatformPack, assets: AssetMeta[], brief: BriefSection[], config: StudioConfig): GateResult[] & { warnings: string[] } {
  const failures: Record<GateResult['id'], string[]> = { policy: [], disclosure: [], specs: [], accessibility: [], 'fabricated-metrics': [], rights: [] };
  const warnings: string[] = [...(pack.notes ?? [])];
  warnings.push(`AI policy verification date unavailable; verify ${pack.sources.join(', ') || pack.id}`);
  const byId = new Map(assets.map(a => [a.id, a]));
  const used = new Set<string>();
  const visit = (id: string) => { if (used.has(id)) return; used.add(id); for (const child of byId.get(id)?.embeds ?? []) visit(child); };
  post.media.forEach(m => visit(m.asset));
  const selected = assets.filter(a => used.has(a.id));
  const add = (id: GateResult['id'], message: string) => failures[id].push(message);
  for (const id of used) if (!byId.has(id)) add('rights', `Missing asset metadata for ${id}`);
  if (pack.ai === 'none' && post.body.trim()) add('policy', 'Generated text is not permitted');
  if (pack.ai === 'outline' && post.body.split('\n').some(line => line.trim() && !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line))) add('policy', 'Only a bullet outline is permitted');
  for (const kind of ['text', 'media', 'voice'] as const) {
    const applies = kind === 'text' ? !!post.body.trim() : kind === 'voice' ? selected.some(a => a.kind === 'voiceover' && a.aiGenerated) : selected.some(a => a.kind !== 'voiceover' && a.aiGenerated);
    if (!applies) continue;
    const rule = pack.disclosure[kind];
    if (typeof rule === 'object' && !post.disclosure?.[kind]?.trim()) add('disclosure', `${kind} disclosure required: ${rule.rule} (${rule.source})`);
    if (rule === 'unknown') warnings.push(`${kind} disclosure unknown; verify ${pack.sources.join(', ') || pack.id}`);
  }
  const check = (label: string, value: number | undefined, spec: typeof pack.textLimit, compare: (a: number, b: number) => boolean = (a,b) => a > b) => {
    if (value === undefined || spec === undefined) return;
    if (spec === 'unknown') warnings.push(`${label} unknown; verify ${pack.sources.join(', ') || pack.id}`);
    else { if (compare(value, spec.value)) add('specs', `${label} exceeds ${spec.value} (${spec.source})`); if (spec.verified && Date.now() - Date.parse(spec.verified) > 90 * 86400000) warnings.push(`${label} verification is stale: ${spec.source}`); }
  };
  check('text limit', post.body.length, pack.textLimit); if (post.title) check('title limit', post.title.length, pack.titleLimit);
  for (const media of post.media) {
    const spec = pack.media.find(s => s.kind === media.kind);
    if (!spec) { warnings.push(`No ${media.kind} specification; verify ${pack.sources.join(', ') || pack.id}`); }
    else {
      check(`${media.kind} count`, post.media.filter(m => m.kind === media.kind).length, spec.maxCount);
      const output = byId.get(media.asset)?.outputs.find(o => o.file === media.file || media.file.endsWith('/' + o.file));
      check(`${media.kind} bytes`, output?.bytes, spec.maxBytes); check(`${media.kind} duration`, output?.seconds, spec.maxSeconds); check(`${media.kind} minimum duration`, output?.seconds, spec.minSeconds, (a,b) => a < b);
      check(`${media.kind} width`, output?.width, spec.width); check(`${media.kind} height`, output?.height, spec.height);
      if (spec.aspectRatios === 'unknown') warnings.push(`aspect ratios unknown; verify ${pack.sources.join(', ') || pack.id}`);
      else if (spec.aspectRatios && output?.aspect && !spec.aspectRatios.value.includes(output.aspect)) add('specs', `Unsupported aspect ${output.aspect} (${spec.aspectRatios.source})`);
    }
    if (media.kind === 'image' && !media.alt?.trim()) add('accessibility', `Missing alt text for ${media.asset}`);
    if (media.kind === 'video' && !byId.get(media.asset)?.outputs.some(o => /\.vtt$/i.test(o.file))) add('accessibility', `Missing captions for ${media.asset}`);
  }
  for (const asset of selected) {
    if (['gemini', 'openai', 'omp'].includes(asset.provider) && !asset.license?.trim()) add('rights', `Missing license for ${asset.id}`);
    if (asset.kind === 'logo' && !asset.trademarkChecked) add('rights', `Trademark search not checked for ${asset.id}`);
    for (const metric of asset.metrics ?? []) {
      const width = asset.outputs.find(o => o.file === metric.file)?.width ?? 1080;
      if (metric.minFontPx < 24 * width / 1080) add('accessibility', `Text too small in ${metric.file}`);
      if (metric.minContrast === null) warnings.push(`Contrast cannot be measured in ${metric.file}`);
      else if (metric.minContrast < 4.5) add('accessibility', `Insufficient contrast in ${metric.file}`);
      if (metric.overflow) add('accessibility', `Text overflows in ${metric.file}`);
    }
  }
  const evidence = brief.map(s => `${s.title}\n${s.body}`).join('\n').toLowerCase();
  const text = [post.title ?? '', post.body, ...(post.thread ?? [])].join('\n').replace(/https?:\/\/\S+/g, '').replace(/^\s*\d+[.)]\s+/gm, '');
  const tokens = text.match(/(?<![\w.])v?\d+(?:,\d{3})*(?:\.\d+)*(?:\s?(?:%|x\b|[kKmM]\b|(?:ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?|users?|customers?|downloads?|dollars?|bytes?|GB|MB|KB)\b))?/g) ?? [];
  for (const token of new Set(tokens)) {
    if (evidence.includes(token.toLowerCase()) || config.grounding.waive.some(w => w.toLowerCase() === token.toLowerCase())) continue;
    if (/\d\s*(?:%|x\b|[kKmM]\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b|users?\b|customers?\b|downloads?\b|dollars?\b|bytes?\b|GB\b|MB\b|KB\b)/i.test(token)) add('fabricated-metrics', `Ungrounded metric: ${token}`);
    else warnings.push(`Ungrounded version or identifier: ${token}`);
  }
  const result = (Object.keys(failures) as GateResult['id'][]).map(id => ({ id, pass: failures[id].length === 0, message: failures[id].join('; ') || 'Passed', ...(id === 'rights' && failures.rights.some(s => s.startsWith('Missing license')) ? { unfixable: true } : {}) }));
  return Object.assign(result, { warnings });
}
