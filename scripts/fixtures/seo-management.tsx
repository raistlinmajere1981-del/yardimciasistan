import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SeoFields, SeoPageKey, TranslationField } from "@yardimci-asistan/shared";
import { SeoManagementWorkspace } from "../../apps/desktop-app/src/components/settings/SeoManagementWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

const initial: SeoFields = {
  title: "Örnek İşletme", description: "Orijinal arama açıklaması.",
  og_title: "Örnek İşletme", og_description: "Orijinal paylaşım açıklaması."
};
const basePages: SeoPageKey[] = ["home", "rooms", "contact"];
const pages = basePages.map(page => ({
  ...initial, page, updatedAt: "v1",
  ...(page === "rooms" ? { title: "Odalarımız" } : {})
}));
const translated = new Map<string, Record<string, string>>([
  ["home:en", { title: "Example Business", description: "English description.",
    og_title: "Social headline", og_description: "English social description." }]
]);
const calls: Array<{ kind: string; page: SeoPageKey; language?: string; fields?: SeoFields }> = [];
(window as unknown as { __seoCalls: typeof calls }).__seoCalls = calls;

const translations = (page: string, language: string): TranslationField[] => {
  const source = pages.find(item => item.page === page)!;
  const entries = translated.get(page + ":" + language) ?? {};
  return (["title", "description", "og_title", "og_description"] as const).map(field => ({
    field, source: source[field], sourceHash: "hash-" + field, text: entries[field] ?? "",
    state: page === "home" && field === "og_description" ? "stale" as const : "ready" as const,
    origin: entries[field] ? "manual" as const : null, updatedAt: ""
  }));
};

window.yardimciDesktop = {
  getSeoSnapshot: async () => ({ ok: true as const, value: { languages: ["tr", "en"], pages: structuredClone(pages) } }),
  saveSeoSource: async (page: SeoPageKey, fields: SeoFields, expected: string) => {
    const item = pages.find(entry => entry.page === page)!;
    if (item.updatedAt !== expected) return { ok: false as const, message: "Kayıt çakışması" };
    Object.assign(item, fields, { updatedAt: "v2" });
    calls.push({ kind: "source", page, fields: structuredClone(fields) });
    return { ok: true as const, value: item };
  },
  getTranslation: async ({ id }: { id: string }, language: string) => ({
    ok: true as const,
    value: { kind: "seo" as const, id, language, label: id,
      fields: translations(id, language), ready: 4, total: 4, stale: 1, manual: 4, failed: 0 }
  }),
  saveTranslation: async (input: { id: string; language: string; fields: Array<{ field: string; text: string }> }) => {
    translated.set(input.id + ":" + input.language, Object.fromEntries(input.fields.map(item => [item.field, item.text])));
    calls.push({ kind: "translation", page: input.id as SeoPageKey, language: input.language });
    return { ok: true as const, value: undefined };
  },
  suggestSeoCopy: async (page: SeoPageKey, language: string) => ({
    ok: true as const, value: {
      page, language, fields: {
        title: "AI başlık önerisi", description: "AI arama açıklaması.",
        og_title: "AI paylaşım başlığı", og_description: "AI paylaşım açıklaması."
      },
      sourceHashes: { title: "", description: "", og_title: "", og_description: "" }
    }
  })
} as unknown as typeof window.yardimciDesktop;

function TestHost() {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(true)}>SEO Yönetimini aç</button>
    {open && <SeoManagementWorkspace onClose={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<TestHost />);
