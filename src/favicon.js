/**
 * Site icon. Kept as an inline SVG so the Worker stays asset-free: no build
 * step, no static directory, no extra bindings. Served at /favicon.svg with a
 * long cache; /favicon.ico redirects here for legacy clients.
 *
 * Glyph is a single "X" mark: two rounded strokes, which stay legible down to
 * 16px where multi-letter wordmarks turn to mush.
 */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="xentool">
<defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
<stop stop-color="#22d3ee"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/>
</linearGradient></defs>
<rect width="32" height="32" rx="8" fill="url(#g)"/>
<g stroke="#0a0b10" stroke-width="3.4" stroke-linecap="round" fill="none">
<path d="M10.4 10.4L21.6 21.6"/>
<path d="M21.6 10.4L10.4 21.6"/>
</g>
</svg>`;

export const FAVICON_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=86400",
};
