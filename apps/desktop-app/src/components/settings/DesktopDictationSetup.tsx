import { useEffect, useState } from "react";
import type { DesktopDictationStatus } from "../../../electron/desktop-dictation-contract";

export function DesktopDictationSetup() {
  const [status, setStatus] = useState<DesktopDictationStatus | null>(null);
  useEffect(() => {
    let active = true, pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try { const next = await window.yardimciDesktop?.getDictationStatus?.(); if (active) setStatus(next ?? null); }
      catch { if (active) setStatus(null); }
      finally { pending = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <div className="form-stack" aria-label="Masaüstü dikte kurulumu">
    <strong>Masaüstü dikte</strong>
    <p>AI Yardımcı'yı açın, konuşma tanıma modelini seçin ve HTTPS web bağlantısını hazırlayın. Servisler'i Kaydet seçin; özel AI ayarlarının web hizmetine yayını tamamlanmalı.</p>
    <p role="status">{status?.message ?? "Kayıtlı dikte durumu kontrol ediliyor."}</p>
    <small>Metin alanındaki Dikte Başlat mikrofon izni ister. Durdur sesi gönderir; İptal göndermez. Önizleme düzenlenir ve Metni Kullan ile alana aktarılır; gönderim sizin seçiminizdir.</small>
  </div>;
}
