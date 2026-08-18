import { imageParser } from './parser'
import { html_decode_url } from '../utils/html'

type ImageDimensionsResult = { dimensions: Record<string, { w: number; h: number }>; measured: boolean };
export async function scan_image_dimensions(proxyBase: string, proxyKey: string, body_html: string): Promise<ImageDimensionsResult> {
  const srcRegex = /src="([^"]+)"/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = srcRegex.exec(body_html)) !== null) {
    urls.push(match[1]);
  }

  if (urls.length === 0) return { dimensions: {}, measured: true };

  const dimensions: Record<string, { w: number; h: number }> = {};
  let measured = true;

  const proxyUrls = urls.map((u) => {
    if (u.startsWith('data:')) return u;
    return u.startsWith(proxyBase) ? u : `${proxyBase}/image_proxy?url=${encodeURIComponent(html_decode_url(u))}&k=${proxyKey}`;
  });

  for (const url of proxyUrls) {
    if (url.startsWith('data:')) continue;
    try {
      const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      if (!resp.ok) continue;
      const mime = resp.headers.get('content-type') || '';
      const buf = new Uint8Array(await resp.arrayBuffer());
      const dims = imageParser.parse(buf, mime);
      if (dims) dimensions[url] = dims;
    } catch {
      measured = false;
    }
  }

  return { dimensions, measured };
}
