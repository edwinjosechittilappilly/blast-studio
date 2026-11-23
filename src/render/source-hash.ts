import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Fingerprint editable asset sources, including their relative names. */
export function sourceHash(assetDir: string): string {
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
        // Nested media is not editable text and can be very large.
        if (content.includes(0) || !Buffer.from(content.toString('utf8')).equals(content)) continue;
        files.push({ path, content });
      }
    }
  };
  for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.startsWith('source.') || entry.name === 'demo.tape')) files.push({ path: entry.name, content: readFileSync(join(assetDir, entry.name)) });
    else if (entry.isDirectory() && (entry.name === 'source' || entry.name === 'slides')) collect(join(assetDir, entry.name), entry.name);
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${Buffer.byteLength(file.path)}:${file.path}:${file.content.length}:`).update(file.content);
  return hash.digest('hex');
}
