import { useRef, useState } from "react";
import type { BenefitsRule } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker } from "../ui/DateTimePicker";
import { FormDialog } from "../ui/FormDialog";
import { benefitsValue } from "./benefits-model";

export function BenefitsCouponIssuer({ rule, onClose, onMessage }: { rule: BenefitsRule; onClose(): void; onMessage(message: string): void }) {
  const [maxUses, setMaxUses] = useState(1), [perCustomer, setPerCustomer] = useState(""), [expiry, setExpiry] = useState("");
  const [secret, setSecret] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), lock = useRef(false);
  async function issue() {
    if (lock.current || secret) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = benefitsValue(await window.yardimciDesktop!.issueCommerceBenefitsCoupon({ ruleId: rule.id, maxUses,
        maxUsesPerCustomer: perCustomer ? Number(perCustomer) : null, expiresAt: new Date(`${expiry}T23:59:59`).getTime() }));
      setSecret(result.secret); onMessage("Kupon oluşturuldu. Kodu kapatmadan önce kopyalayın.");
    } catch (error) { setError(error instanceof Error ? error.message : "Kupon oluşturulamadı."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <FormDialog title="Kupon kodu oluştur" onClose={onClose} closeBlocked={busy} onSubmit={event => { event.preventDefault(); void issue(); }}
    footer={secret ? <ActionButton onClick={onClose}>Kapat</ActionButton> : <><ActionButton variant="secondary" disabled={busy} onClick={onClose}>Vazgeç</ActionButton><ActionButton type="submit" disabled={busy || !expiry}>{busy ? "Oluşturuluyor…" : "Kodu oluştur"}</ActionButton></>}>
    <fieldset disabled={busy} className="form-stack benefits-fields">
      {error && <p role="alert">{error}</p>}
      {secret ? <><p>Bu kod yalnız bir kez gösterilir. Kapatmadan önce kopyalayın.</p><output aria-label="Yeni kupon kodu" className="benefits-secret">{secret}</output><ActionButton variant="secondary" onClick={() => void navigator.clipboard.writeText(secret).then(() => onMessage("Kupon kodu kopyalandı.")).catch(() => setError("Kopyalanamadı. Kodu seçip kopyalayın."))}>Kodu kopyala</ActionButton></> : <>
        <p>{rule.id} · Kod, uygun satışlarda Hızlı Satış veya Companion ekranında kullanılabilir.</p>
        <label className="form-field">Toplam kullanım sayısı<input required type="number" min={1} step={1} value={maxUses} onChange={event => setMaxUses(Number(event.target.value))} /></label>
        <label className="form-field">Müşteri başına kullanım<input type="number" min={1} step={1} placeholder="Sınırsız" value={perCustomer} onChange={event => setPerCustomer(event.target.value)} /></label>
        <label className="form-field">Kupon geçerlilik sonu<DatePicker ariaLabel="Kupon geçerlilik sonu" value={expiry} onChange={setExpiry} /></label>
      </>}
    </fieldset>
  </FormDialog>;
}
