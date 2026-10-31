import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LinkPreview } from '../shared/ops.ts';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Myra';

export async function get(url: string | URL, timeout: number, headers: Record<string, string> = {}) {
  const ctl = new AbortController(),
    t = setTimeout(() => ctl.abort(), timeout * 1000);
  try {
    return await fetch(url, { signal: ctl.signal, headers, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

export async function linkPreview(s: string): Promise<LinkPreview> {
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { title: s, desc: s, image: '' };
  }
  let html = '';
  try {
    const r = await get(url, 10, { 'User-Agent': UA });
    html = Buffer.from(await r.arrayBuffer())
      .subarray(0, 400000)
      .toString('utf8');
  } catch {}
  const meta = (keys: string[]) => {
    for (const k of keys) {
      for (const pat of [
        `<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["']`,
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["']`,
      ]) {
        const [, content] = html.match(new RegExp(pat, 'i')) ?? [];
        if (content !== undefined) return content;
      }
    }
    return null;
  };
  let title = meta(['og:title', 'twitter:title']) || '';
  if (!title) title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? title;
  let image = meta(['og:image', 'twitter:image']) || '';
  if (image) {
    try {
      image = new URL(image, url).href;
    } catch {}
  }
  const decode = (x: string) =>
    x
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  return {
    title: decode(title || url.host || s),
    desc: decode(meta(['og:description', 'description']) ?? (url.host || s)),
    image,
  };
}

// links from Mobbin or Higgsfield come home as data, so the pictures are saved with the board
export async function fetchImage(s: string): Promise<string | null> {
  try {
    const r = await get(new URL(s), 30),
      data = Buffer.from(await r.arrayBuffer());
    if (data.length <= 200) return null;
    const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return `data:${type};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

// straight to disk, never all in memory, and it only appears at `file` once it's complete
export async function download(url: string, file: string, timeout: number, headers: Record<string, string> = {}) {
  const r = await get(url, timeout, headers);
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
  const part = `${file}.part`;
  try {
    await pipeline(Readable.from(r.body), fs.createWriteStream(part));
    fs.renameSync(part, file);
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw e;
  }
}
