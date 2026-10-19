import english from "../assets/i18n/en.json";

/** The demo's existing TR/EN dictionary, bundled so the assistant also works alone.
 * Call only for site-owned copy; public records and user/AI text bypass this helper. */
export const locale = document.documentElement.lang === "en" ? "en-GB" : "tr-TR";
export function ui(source: string, values: Record<string, unknown> = {}): string {
  const text = locale === "en-GB" ? (english as Record<string, string>)[source] ?? source : source;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
export function html(source: string): string {
  return ui(source).replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]!);
}
