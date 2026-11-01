import { useEffect, useRef, useState } from "react";
import type { BenefitsPointAccount } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DatePicker } from "../ui/DateTimePicker";
import { FormDialog } from "../ui/FormDialog";
import { MoneyInput } from "../ui/MoneyInput";
import { SearchSelect } from "../ui/SearchSelect";
import { BenefitsPointHistory } from "./BenefitsPointHistory";
import { benefitsCurrencyDigits, benefitsParseDecimal, benefitsValue } from "./benefits-model";

export function BenefitsPointsEditor({ secure, pointsEnabled, onClose, onSaved, registerPageLeaveGuard }: {
  secure: boolean; pointsEnabled: boolean; onClose(): void; onSaved(): void; registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  const [customerId, setCustomerId] = useState(""), [currency, setCurrency] = useState("TRY"), [account, setAccount] = useState<BenefitsPointAccount | null>(null);
  const [customerName, setCustomerName] = useState("");
  const customerNames = useRef(new Map<string, string>());
  const [amount, setAmount] = useState(""), [direction, setDirection] = useState(1), [reason, setReason] = useState<"opening_balance" | "correction">("correction");
  const [note, setNote] = useState(""), [expiry, setExpiry] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [devices, setDevices] = useState<{ deviceId: string; deviceName: string; recordId: string }[]>([]), [deviceId, setDeviceId] = useState("");
  const [grantStatus, setGrantStatus] = useState<{ key: string; enabled: boolean } | null>(null);
  const [grantPending, setGrantPending] = useState(false), [grantLoading, setGrantLoading] = useState(false);
  const [spendStatus, setSpendStatus] = useState<{ key: string; enabled: boolean } | null>(null);
  const [spendPending, setSpendPending] = useState<{ key: string; enabled: boolean } | null>(null);
  const recordId = devices.find(device => device.deviceId === deviceId)?.recordId ?? "";
  const spendKey = JSON.stringify([customerId, deviceId, recordId, pointsEnabled]);
  const liveSpendKey = useRef(spendKey); liveSpendKey.current = spendKey;
  const selectedSpend = spendStatus?.key === spendKey ? spendStatus.enabled : null;
  const grantKey = JSON.stringify([customerId, deviceId, recordId, pointsEnabled]), selectedGrant = grantStatus?.key === grantKey ? grantStatus.enabled : null;
  const lock = useRef(false), operationKey = useRef(crypto.randomUUID()), dirty = Boolean(amount || note || expiry);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => registerPageLeaveGuard?.((_destination, next) => {
    if (lock.current) return false;
    if (!dirtyRef.current) return true;
    setPending(() => next); return false;
  }), [registerPageLeaveGuard]);
  useEffect(() => {
    let current = true; setAccount(null); setError("");
    if (customerId) void window.yardimciDesktop!.getCommercePointAccount(customerId, currency).then(result => {
      const value = benefitsValue(result); if (current) setAccount(value);
    }).catch(() => { if (current) setError("Puan hesabı okunamadı. Müşteriyi yeniden seçin."); });
    return () => { current = false; };
  }, [customerId, currency]);
  useEffect(() => {
    let current = true;
    setDevices([]); setDeviceId(""); setGrantStatus(null); setGrantPending(false);
    if (pointsEnabled && customerId) void window.yardimciDesktop!.listCompanionPointDevices().then(result => {
      const value = benefitsValue(result); if (current) setDevices(value);
    }).catch(() => { if (current) setError("Telefonlar yüklenemedi."); });
    return () => { current = false; };
  }, [customerId, pointsEnabled]);
  useEffect(() => {
    let current = true; setGrantStatus(null); setGrantPending(false);
    if (pointsEnabled && customerId && deviceId && recordId) {
      setGrantLoading(true);
      void window.yardimciDesktop!.getCompanionPointGrantStatus({ customerId, deviceId }).then(result => {
        const enabled = benefitsValue(result); if (current) setGrantStatus({ key: grantKey, enabled });
      }).catch(() => { if (current) setError("Telefon erişimi okunamadı."); }).finally(() => { if (current) setGrantLoading(false); });
    } else setGrantLoading(false);
    return () => { current = false; };
  }, [customerId, deviceId, recordId, pointsEnabled, grantKey]);
  useEffect(() => {
    let current = true; setSpendStatus(null); setSpendPending(null);
    const bridge = window.yardimciDesktop;
    if (pointsEnabled && customerId && deviceId && recordId && bridge && typeof bridge.getCompanionPointSpendStatus === "function"
      && typeof bridge.grantCompanionPointSpend === "function" && typeof bridge.revokeCompanionPointSpend === "function") {
      void bridge.getCompanionPointSpendStatus({ customerId, deviceId, recordId }).then(result => {
        const enabled = benefitsValue(result); if (current && liveSpendKey.current === spendKey) setSpendStatus({ key: spendKey, enabled });
      }).catch(() => { if (current) setError("Telefon harcama izni okunamadı."); });
    }
    return () => { current = false; };
  }, [customerId, deviceId, recordId, pointsEnabled, spendKey]);
  async function changeSpendGrant() {
    const pendingScope = spendPending;
    if (lock.current || !pendingScope || pendingScope.key !== liveSpendKey.current || selectedSpend !== pendingScope.enabled || !pointsEnabled || !recordId) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.grantCompanionPointSpend || !bridge.revokeCompanionPointSpend) return;
    lock.current = true; setBusy(true); setError(""); setSpendPending(null);
    try {
      const input = { customerId, deviceId, recordId, confirmed: true as const };
      const changed = benefitsValue(await (pendingScope.enabled ? bridge.revokeCompanionPointSpend(input) : bridge.grantCompanionPointSpend(input)));
      if (!changed) throw new Error("İzin değişmedi. Telefonu ve müşteriyi kontrol edin.");
      if (liveSpendKey.current === pendingScope.key) setSpendStatus({ key: pendingScope.key, enabled: !pendingScope.enabled });
    } catch (error) { if (liveSpendKey.current === pendingScope.key) { setSpendStatus(null); setError(error instanceof Error ? error.message : "İzin değiştirilemedi."); } }
    finally { lock.current = false; setBusy(false); }
  }
  async function changeGrant() {
    if (lock.current || selectedGrant === null) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const recordId = devices.find(device => device.deviceId === deviceId)?.recordId;
      if (!recordId) throw new Error("Telefonu yeniden seçin.");
      const input = { customerId, deviceId, recordId, confirmed: true as const }, bridge = window.yardimciDesktop!;
      const changed = benefitsValue(await (selectedGrant ? bridge.revokeCompanionPointAccess(input) : bridge.grantCompanionPointAccess(input)));
      if (!changed) throw new Error("Erişim değişmedi. Cihazı ve müşteriyi kontrol edin.");
      setGrantStatus({ key: grantKey, enabled: !selectedGrant }); setGrantPending(false);
    } catch (error) { setGrantPending(false); setGrantStatus(null); setError(error instanceof Error ? error.message : "Telefon erişimi değiştirilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  function close() { if (lock.current) return; if (dirty) setPending(() => onClose); else onClose(); }
  async function submit(expire = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const bridge = window.yardimciDesktop!;
      if (expire) benefitsValue(await bridge.expireCommercePoints({ customerId, currency, operationKey: operationKey.current, note }));
      else benefitsValue(await bridge.adjustCommercePoints({ customerId, currency, operationKey: operationKey.current, note, reason,
        amountMinor: direction * benefitsParseDecimal(amount, benefitsCurrencyDigits(currency)), expiresAt: expiry ? new Date(`${expiry}T23:59:59`).getTime() : null }));
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Puan işlemi tamamlanamadı."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <FormDialog title="Puan hesabı" onClose={close} dismissOnBackdrop closeBlocked={busy} onSubmit={event => { event.preventDefault(); void submit(); }}
    overlay={spendPending && spendPending.key === spendKey ? <ConfirmDialog withinModal title="Gelecekte telefonla Puan kullanımı" description={`${customerName || "Müşteri"} (${customerId}) için ${devices.find(device => device.deviceId === deviceId)?.deviceName || "Telefon"} (${deviceId}) cihazının gelecekteki Puan harcama iznini ${spendPending.enabled ? "kaldırmak" : "vermek"} istiyor musunuz? Bu işlem Puan harcamaz; mobil Puan harcaması henüz etkin değildir.`} confirmLabel={spendPending.enabled ? "Harcamaya izni kaldır" : "Gelecek için izin ver"} busy={busy} onCancel={() => setSpendPending(null)} onConfirm={() => void changeSpendGrant()} /> : grantPending ? <ConfirmDialog withinModal title="Telefon Puan erişimi" description={`${customerName || "Müşteri"} (${customerId}) için ${devices.find(device => device.deviceId === deviceId)?.deviceName || "Telefon"} (${deviceId}) cihazının Puan bakiyesi görüntüleme erişimini ${selectedGrant ? "kaldırmak" : "açmak"} istiyor musunuz? Bu işlem Puan harcamaz.`} confirmLabel={selectedGrant ? "Erişimi kaldır" : "İzin ver"} busy={busy} onCancel={() => setGrantPending(false)} onConfirm={() => void changeGrant()} /> : pending && <ConfirmDialog withinModal title="Değişiklikler kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => { const next = pending; setPending(null); next(); }} />}
    footer={<><ActionButton variant="secondary" disabled={busy} onClick={onClose}>Vazgeç</ActionButton><ActionButton type="submit" disabled={busy || !secure || !pointsEnabled || !account || !amount || note.trim().length < 3}>{busy ? "İşleniyor…" : "Düzeltmeyi kaydet"}</ActionButton></>}>
    <fieldset className="form-stack benefits-fields" disabled={busy}>
      {error && <p role="alert">{error}</p>}
      <SearchSelect ariaLabel="Puan müşterisi" value={customerId} options={[]} placeholder="Müşteri seçin" onChange={value => { setCustomerName(customerNames.current.get(value) ?? ""); setCustomerId(value); }} loadPage={async (search, offset) => {
        const page = await window.yardimciDesktop!.listCustomers({ search, offset, limit: 60 });
        for (const customer of page.items) customerNames.current.set(customer.id, customer.fullName);
        return { options: page.items.map(customer => ({ id: customer.id, label: customer.fullName })), total: page.matched, offset, nextOffset: offset + page.items.length < page.matched ? offset + page.items.length : null };
      }} />
      {pointsEnabled && customerId && <section aria-label="Telefon Puan erişimi" className="form-stack">
        <label className="form-field">Telefon<select value={deviceId} onChange={event => { setGrantStatus(null); setDeviceId(event.target.value); }}><option value="">Telefon seçin</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceName || "Telefon"} ({device.deviceId})</option>)}</select></label>
        <p>Bu izin yalnız seçilen müşterinin Puan bakiyesini gösterir; Puan harcama izni değildir.</p>
        {deviceId && selectedGrant !== null && <ActionButton variant="secondary" disabled={busy || grantLoading} onClick={() => setGrantPending(true)}>{selectedGrant ? "Telefon erişimini kaldır" : "Puan bakiyesini telefonda göster"}</ActionButton>}
        {deviceId && <p>Gelecekte Puan harcama izni: {selectedSpend === null ? "kullanılamıyor" : selectedSpend ? "açık" : "kapalı"}. Mobil Puan harcaması henüz etkin değildir.</p>}
        {deviceId && <ActionButton variant="secondary" disabled={busy || selectedSpend === null} onClick={() => { if (selectedSpend !== null) setSpendPending({ key: spendKey, enabled: selectedSpend }); }}>{selectedSpend ? "Gelecek harcama iznini kaldır" : "Gelecek harcama izni ver"}</ActionButton>}
      </section>}
      <label className="form-field">Para birimi<select value={currency} onChange={event => setCurrency(event.target.value)}>{["TRY", "USD", "EUR", "GBP"].map(value => <option key={value}>{value}</option>)}</select></label>
      {account && <BenefitsPointHistory account={account} currency={currency} />}
      {!secure && <p>Güvenli anahtar saklama kullanılamıyor. Puan hareketleri kapalı.</p>}
      {!pointsEnabled && <p>Puan ailesi kapalı. Bakiye ve geçmiş görüntülenebilir.</p>}
      <div className="form-grid form-grid--compact">
        <label className="form-field">Düzeltme türü<select value={reason} onChange={event => { const next = event.target.value as typeof reason; setReason(next); if (next === "opening_balance") setDirection(1); }}><option value="correction">Düzeltme</option><option value="opening_balance">Açılış bakiyesi</option></select></label>
        <label className="form-field">Yön<select value={direction} disabled={reason === "opening_balance"} onChange={event => { setDirection(Number(event.target.value)); setExpiry(""); }}><option value={1}>Puan ekle</option><option value={-1}>Puan düş</option></select></label>
        <label className="form-field">Puan tutarı<MoneyInput value={amount} onChange={setAmount} /></label>
        <label className="form-field">Geçerlilik sonu<DatePicker ariaLabel="Geçerlilik sonu" value={expiry} disabled={direction < 0} onChange={setExpiry} /></label>
      </div>
      <label className="form-field">İşlem gerekçesi<textarea required minLength={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
      <ActionButton variant="secondary" disabled={!secure || !account || note.trim().length < 3} onClick={() => void submit(true)}>Süresi dolan Puanları işle</ActionButton>
    </fieldset>
  </FormDialog>;
}
