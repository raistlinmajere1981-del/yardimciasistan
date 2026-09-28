/**
 * Her çalıştırma için kısa özet + tam rapor. Özet panoya kopyalanıp
 * ChatGPT/Gemini'ye yapıştırılabilir; secret değerleri rapora girmez
 * (preflight yalnızca mevcut/yok bilgisi üretir).
 */

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}dk ${Math.round(s % 60)}sn`;
  return `${Math.floor(m / 60)}sa ${m % 60}dk`;
}

export function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "az önce";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`;
  const d = Math.floor(diff / 86_400_000);
  return d === 1 ? "dün" : `${d} gün önce`;
}

export function buildSummary({ title, command, args = [], exitCode, durationMs, branch, commit, extra = "" }) {
  return [
    `Başlık: ${title}`,
    `Komut: ${[command, ...args].join(" ")}`,
    `Sonuç: ${exitCode === 0 ? "PASS" : "FAIL"} (exit ${exitCode})`,
    `Süre: ${formatDuration(durationMs)}`,
    `Branch: ${branch || "-"} @ ${commit || "-"}`,
    extra,
  ].filter(Boolean).join("\n");
}

export function buildFullReport({ summary, fullLog }) {
  return `${summary}\n\n----- TAM ÇIKTI -----\n${fullLog || "(çıktı yakalanmadı)"}\n----- SON -----`;
}
