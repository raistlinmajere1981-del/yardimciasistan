import { useEffect, useRef, useState } from "react";
import type { LocalCompanionPairingSession } from "../../../electron/local-companion-pairing-service";
import { ActionButton } from "../ui/ActionButton";
import { localPairingQr } from "./local-pairing-qr";

const pairingErrors: Record<string, string> = {
  tls_storage_unavailable: "Güvenli telefon bağlantısı kapalı. Sistem anahtar kasasını (GNOME Keyring / KWallet) açıp uygulamayı yeniden başlatın. Güvensiz metin deposu (basic_text) kullanılamaz.",
  tls_identity_invalid: "Telefon bağlantısı kimliği okunamıyor. Anahtar kasasının açık olduğunu kontrol edin; kimlik dosyalarını silmeden destek alın.",
  tls_identity_io: "Telefon bağlantısı kimliği güvenle kaydedilemedi. Disk alanını ve uygulama klasörü yazma izinlerini kontrol edin.",
  tls_clock_invalid: "Bilgisayarın tarih ve saatini düzeltip yeniden deneyin.",
  tls_addresses_invalid: "USB internet paylaşımını veya Wi-Fi bağlantısını açıp yeniden deneyin.",
  local_pairing_address_unavailable: "Erişilebilir yerel ağ adresi yok. USB internet paylaşımını veya aynı Wi-Fi ağına bağlantıyı açıp yeniden deneyin.",
  local_secure_pairing_unavailable: "Güvenli telefon sunucusu hazır değil. USB / Wi-Fi bağlantısını ve sistem anahtar kasasını kontrol edip yeniden deneyin."
};

/** Mounted only for saved Android + LAN settings; IPC remains authoritative. */
export function LocalCompanionPairingPanel({ disabled }: { disabled: boolean }) {
  const [session, setSession] = useState<LocalCompanionPairingSession | null>(null);
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const bridge = window.yardimciDesktop;
    let active = true;
    const timer = window.setInterval(() => {
      if (!session) return;
      setRemaining(Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000)));
      void bridge?.readLocalPairing().then(current => {
        if (!active || current) return;
        setSession(null);
        setQr("");
        setMessage("QR kapandı. Telefonu cihaz listesinden kontrol edin veya yeni QR açın.");
      }).catch(() => {
        if (!active) return;
        setSession(null);
        setQr("");
        setMessage("Eşleştirme kapandı. Masaüstü kilidini ve bağlantı ayarlarını kontrol edin.");
      });
    }, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session]);

  useEffect(() => () => {
    generation.current += 1;
    void window.yardimciDesktop?.cancelLocalPairing?.()?.catch(() => undefined);
  }, []);

  async function start() {
    const bridge = window.yardimciDesktop;
    if (!bridge) return;
    const ticket = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const next = await bridge.beginLocalPairing();
      if (ticket !== generation.current) return;
      setQr(localPairingQr(next));
      setRemaining(Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)));
      setSession(next);
    } catch (error) {
      if (ticket === generation.current) {
        setSession(null);
        setQr("");
        const known = error instanceof Error && Object.keys(pairingErrors).find(code => error.message.includes(code));
        setMessage(known ? pairingErrors[known]! : "Eşleştirme başlatılamadı. Masaüstü kilidini ve kaydedilmiş Android / yerel ağ ayarlarını kontrol edin.");
      }
      await bridge.cancelLocalPairing().catch(() => undefined);
    } finally { if (ticket === generation.current) setBusy(false); }
  }

  async function cancel() {
    ++generation.current;
    setSession(null);
    setQr("");
    setBusy(false);
    try { await window.yardimciDesktop?.cancelLocalPairing(); }
    catch { setMessage("Eşleştirme kapatılamadı. QR en geç iki dakika içinde geçersizleşir."); }
  }

  return <div className="form-stack">
    <p>Telefonu USB internet paylaşımıyla veya aynı Wi-Fi ağı üzerinden bağlayıp QR okutun.</p>
    {session && qr ? <>
      <img className="settings-local-pairing-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="Telefon eşleştirme QR kodu" />
      <small role="status">{remaining > 0 ? `${remaining} saniye kaldı` : "QR süresi doldu"} · Eşleştirdikten sonra telefonu onaylayıp izinlerini seçin.</small>
      <ActionButton variant="secondary" onClick={() => void cancel()}>QR kapat</ActionButton>
    </> : <ActionButton disabled={disabled} busy={busy} onClick={() => void start()}>Telefon eşleştir · QR göster</ActionButton>}
    {message && <small role="status">{message}</small>}
  </div>;
}
