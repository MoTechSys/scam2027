/**
 * Inert-SVG gate for tenant logos (rendered to anonymous visitors on /login). Conservative allow-list logic:
 * any construct that can execute script, embed foreign content or reach an external resource rejects the file.
 * Serving additionally applies `Content-Security-Policy: default-src 'none'; sandbox` — defence in depth.
 */
const FORBIDDEN =
  /<script|<foreignobject|<iframe|<embed|<object|<use\b[^>]*href\s*=\s*["']?\s*(?:https?:|\/\/)|javascript:|\son[a-z]+\s*=|xlink:href\s*=\s*["']?\s*(?:https?:|\/\/|data:)|href\s*=\s*["']?\s*(?:https?:|\/\/|data:)|<!entity|<!doctype[^>]*\[|data:text\/html|@import|url\(\s*["']?\s*(?:https?:|\/\/)/i;

export function looksLikeSvg(text: string): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
}

export function svgIsInert(text: string): boolean {
  return looksLikeSvg(text) && !FORBIDDEN.test(text);
}
