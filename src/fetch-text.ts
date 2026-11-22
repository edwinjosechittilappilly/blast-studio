import type { IO } from "./io.ts";
import { UserError } from "./types.ts";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** Fetch an external page as bounded, readable text. */
export async function fetchText(url: string, io: IO): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new UserError(`Invalid URL: ${url}`); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new UserError("URL must use HTTP or HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await io.fetch(parsed, { signal: controller.signal, headers: { accept: "text/html, text/plain;q=0.9" } });
    if (!response.ok) throw new UserError(`Fetching ${url} failed: HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_BYTES) throw new UserError(`Fetching ${url} exceeded the size limit`);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); throw new UserError(`Fetching ${url} exceeded the size limit`); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const decoder = new TextDecoder();
    let text = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
    if ((response.headers.get("content-type") ?? "").includes("html") || /<\s*(?:html|body|p|div)\b/i.test(text)) {
      text = text.replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|nav|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(?:nbsp|amp|lt|gt|quot|#39|#\d+|#x[\da-f]+);/gi, (entity) => {
          const named: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
          if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
          const value = entity[2]?.toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
          return Number.isFinite(value) && value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : entity;
        });
    }
    return text.replace(/\s+/g, " ").trim();
  } finally { clearTimeout(timer); }
}
