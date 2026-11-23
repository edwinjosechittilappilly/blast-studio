import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { parse } from 'yaml';

/** Fingerprint render inputs and the rendered artifacts of embedded assets. */
export function sourceHash(assetDir: string): string {
  return hashAsset(assetDir, new Set());
}

function hashAsset(assetDir: string, visiting: Set<string>): string {
  if (visiting.has(assetDir)) throw new Error(`Cyclic asset embeds: ${assetDir}`);
  visiting.add(assetDir);
  const files: { path: string; content: Buffer }[] = [];
  const collect = (dir: string, prefix: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) collect(join(dir, entry.name), path);
      else if (entry.isFile()) {
        const content = readFileSync(join(dir, entry.name));
        // Binary resources such as fonts and images can affect the render too.
        files.push({ path, content });
      }
    }
  };
  for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.startsWith('source.') || entry.name === 'demo.tape')) files.push({ path: entry.name, content: readFileSync(join(assetDir, entry.name)) });
    else if (entry.isDirectory() && (entry.name === 'source' || entry.name === 'slides')) collect(join(assetDir, entry.name), entry.name);
  }
  const metadataPath = join(assetDir, 'asset.yml');
  const metadata = existsSync(metadataPath) ? parse(readFileSync(metadataPath, 'utf8')) ?? {} : {};
  const { outputs: _outputs, metrics: _metrics, selfReview: _selfReview, blockers: _blockers, notes: _notes, license: _license, trademarkChecked: _trademarkChecked, alt: _alt, ...inputs } = metadata;
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  files.push({ path: 'asset.yml', content: Buffer.from(JSON.stringify(canonical(inputs))) });
  for (const id of (inputs.embeds ?? []) as string[]) {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid embedded asset ID: ${JSON.stringify(id)}`);
    const assetsDir = realpathSync(dirname(assetDir));
    const childDir = realpathSync(join(assetsDir, id));
    if (!childDir.startsWith(assetsDir + sep)) throw new Error(`Embedded asset escapes assets directory: ${id}`);
    files.push({ path: `embed/${id}/sourceHash`, content: Buffer.from(hashAsset(childDir, visiting)) });
    const child = parse(readFileSync(join(childDir, 'asset.yml'), 'utf8'));
    for (const output of child.outputs ?? []) {
      const outputPath = join(childDir, output.file);
      files.push({ path: `embed/${id}/${output.file}`, content: existsSync(outputPath) ? readFileSync(outputPath) : Buffer.from('missing') });
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${Buffer.byteLength(file.path)}:${file.path}:${file.content.length}:`).update(file.content);
  visiting.delete(assetDir);
  return hash.digest('hex');
}
