/** Host catalog is already validated against the central publication hashes by PHP.
 * Standalone widgets without a host catalog retain Turkish source copy. */
const node = document.getElementById('site-context');
const context = node ? JSON.parse(node.textContent || '{}') as {
  language?: {code?: string; locale?: string; messages?: Record<string, string>}; sourceKeys?: Record<string, string>;
} : {};
export const languageCode = context.language?.code || 'tr';
export const locale = context.language?.locale || 'tr-TR';
export function ui(source: string, values: Record<string, unknown> = {}): string {
  const key = context.sourceKeys?.[source];
  const text = (key && context.language?.messages?.[key]) || source;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
export function html(source: string): string {
  return ui(source).replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]!);
}
