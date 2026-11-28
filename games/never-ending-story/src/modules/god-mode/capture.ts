/**
 * Screenshot of one DOM element without a library: the element is cloned with its computed styles,
 * images/canvases/fonts are inlined, and the clone is drawn through an SVG `foreignObject` onto a canvas.
 * Elements marked `data-wish-skip` (the God float itself) are left out. Returns null when the browser refuses.
 */

/** Size and quality ladder: the first JPEG at or below `maxBytes` wins. */
export const SHOT_MAX_BYTES = 150_000;
const SHOT_WIDTHS = [720, 600, 480, 360];
const SHOT_QUALITY = [0.82, 0.7, 0.55, 0.4];
const MAX_NODES = 4000;

export function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  const b64 = i >= 0 ? url.slice(i + 1) : '';
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const urlCache = new Map<string, Promise<string>>();
/** Same-origin and data: URLs only; anything else stays as it is and may be dropped by the browser. */
function inlineUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let hit = urlCache.get(url);
  if (!hit) {
    hit = fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch')))).then(blobToDataUrl);
    hit.catch(() => urlCache.delete(url));
    urlCache.set(url, hit);
  }
  return hit;
}

let fontCss: Promise<string> | null = null;
/** @font-face rules of the page with their files embedded, so Thai text keeps the game fonts in the image. */
function embeddedFonts(): Promise<string> {
  fontCss ??= (async () => {
    const out: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const src = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'));
        if (!src) continue;
        try {
          const data = await inlineUrl(new URL(src[1], sheet.href ?? location.href).href);
          out.push(`@font-face{font-family:${rule.style.getPropertyValue('font-family')};font-weight:${rule.style.getPropertyValue('font-weight') || 400};font-style:${rule.style.getPropertyValue('font-style') || 'normal'};src:url("${data}")}`);
        } catch { /* a missing font only changes the glyph shapes */ }
      }
    }
    return out.join('\n');
  })();
  fontCss.catch(() => { fontCss = null; });
  return fontCss;
}

function styleText(el: Element): string {
  const cs = getComputedStyle(el);
  let out = '';
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    out += `${name}:${cs.getPropertyValue(name)};`;
  }
  return out;
}

async function cloneTree(source: Element, state: { nodes: number; jobs: Promise<void>[] }): Promise<Element | null> {
  if (source.hasAttribute('data-wish-skip')) return null;
  if (++state.nodes > MAX_NODES) throw new Error('too-many-nodes');
  const tag = source.tagName.toLowerCase();
  if (tag === 'script' || tag === 'iframe' || tag === 'video') return null;
  let clone: Element;
  if (source instanceof HTMLCanvasElement) {
    const img = document.createElement('img');
    try { img.src = source.toDataURL('image/png'); } catch { /* tainted canvas: leave it blank */ }
    clone = img;
  } else {
    clone = source.cloneNode(false) as Element;
  }
  const style = styleText(source);
  clone.setAttribute('style', style);
  if (source instanceof HTMLImageElement) {
    const src = source.currentSrc || source.src;
    if (src) state.jobs.push(inlineUrl(src).then((d) => { clone.setAttribute('src', d); clone.removeAttribute('srcset'); }, () => undefined));
  }
  const bg = getComputedStyle(source).backgroundImage;
  const urls = [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
  if (urls.length) {
    state.jobs.push((async () => {
      let next = bg;
      for (const m of urls) {
        try { next = next.replace(m[0], `url("${await inlineUrl(m[1])}")`); } catch { /* keep the original reference */ }
      }
      clone.setAttribute('style', `${clone.getAttribute('style')};background-image:${next}`);
    })());
  }
  if (source instanceof HTMLTextAreaElement) clone.textContent = source.value;
  if (source instanceof HTMLInputElement) clone.setAttribute('value', source.value);
  if (!(source instanceof HTMLCanvasElement)) {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const c = await cloneTree(child as Element, state);
        if (c) clone.appendChild(c);
      } else if (child.nodeType === Node.TEXT_NODE && !(source instanceof HTMLTextAreaElement)) {
        clone.appendChild(child.cloneNode(true));
      }
    }
  }
  return clone;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg-image'));
    img.src = url;
  });
}

/** Rasterize `el` to a JPEG data URL of at most `maxBytes`, or null if the browser cannot do it. */
export async function captureElement(el: HTMLElement, maxBytes = SHOT_MAX_BYTES): Promise<string | null> {
  try {
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width <= 0 || height <= 0) return null;
    const state = { nodes: 0, jobs: [] as Promise<void>[] };
    const root = await cloneTree(el, state);
    if (!root) return null;
    // The element is drawn at the origin of its own image: drop its page position, scale and margin.
    root.setAttribute('style', `${root.getAttribute('style')};position:relative;left:0;top:0;right:auto;bottom:auto;margin:0;transform:none;translate:none;scale:none;width:${width}px;height:${height}px;`);
    await Promise.all([...state.jobs, document.fonts?.ready]);
    const fonts = await embeddedFonts();
    root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const body = new XMLSerializer().serializeToString(root);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%"><style xmlns="http://www.w3.org/1999/xhtml">${fonts}</style>${body}</foreignObject></svg>`;
    // A data: URL keeps the canvas clean; a blob: URL taints it in Chrome once the SVG holds a foreignObject.
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    let last: string | null = null;
    for (let i = 0; i < SHOT_WIDTHS.length; i++) {
      const w = Math.min(SHOT_WIDTHS[i], width * 2);
      const h = Math.round((w * height) / width);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      last = canvas.toDataURL('image/jpeg', SHOT_QUALITY[i]);
      if (dataUrlBytes(last) <= maxBytes) return last;
    }
    return last && dataUrlBytes(last) <= maxBytes * 2 ? last : null;
  } catch (error) {
    console.debug('wish-capture', error);
    return null;
  }
}
