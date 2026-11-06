import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS_CAPABILITIES as C, type BenefitsPointAccount } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DatePicker } from "../ui/DateTimePicker";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { Panel } from "../ui/Panel";
import { DataList, DataListButton } from "../ui/DataList";
import { MoneyInput } from "../ui/MoneyInput";
import { BenefitsPointHistory } from "./BenefitsPointHistory";
import { benefitsCurrencyDigits, benefitsParseDecimal, benefitsValue } from "./benefits-model";

export function BenefitsPointsEditor({ active, secure, pointsEnabled, onSaved, registerPageLeaveGuard }: {
  active: boolean; secure: boolean; pointsEnabled: boolean; onSaved(): void; registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const phoneAvailable = snapshot?.enabledCapabilities.includes(C.ANDROID) ?? false;
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [customers, setCustomers] = useState<{ items: { id: string; fullName: string }[]; matched: number } | null>(null);
  const [readingCustomers, setReadingCustomers] = useState(false), [customerError, setCustomerError] = useState("");
  useEffect(() => {
    let current = true; setReadingCustomers(true); setCustomerError("");
    const timer = setTimeout(() => { void window.yardimciDesktop!.listCustomers({ search, offset, limit: 30 }).then(page => {
      if (current) setCustomers(page);
    }).catch(() => { if (current) setCustomerError("Müşteriler okunamadı."); }).finally(() => { if (current) setReadingCustomers(false); }); }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [search, offset]);
  const [accountRevision, setAccountRevision] = useState(0), [readingAccount, setReadingAccount] = useState(false);
  const [operationPending, setOperationPending] = useState<"adjust" | "expire" | null>(null);
  const [customerId, setCustomerId] = useState(""), [currency, setCurrency] = useState("TRY"), [accountResult, setAccount] = useState<{ key: string; revision: number; value: BenefitsPointAccount } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const accountKey = JSON.stringify([customerId, currency]);
  const account = accountResult?.key === accountKey ? accountResult.value : null;
  const accountReady = Boolean(account && accountResult?.revision === accountRevision && !readingAccount);
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
  const lock = useRef(false), operationKey = useRef(crypto.randomUUID()), dirty = Boolean(amount || note || expiry || direction !== 1 || reason !== "correction");
  const clearDraft = useCallback(() => {
    setAmount(""); setNote(""); setExpiry(""); setDirection(1); setReason("correction"); setOperationPending(null); operationKey.current = crypto.randomUUID();
  }, []);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => active ? registerPageLeaveGuard?.((_destination, next) => {
    if (lock.current) return false;
    if (!dirtyRef.current) return true;
    setPending(() => () => { clearDraft(); next(); }); return false;
  }) : undefined, [active, registerPageLeaveGuard, clearDraft]);
  useEffect(() => {
    if (!active) return;
    let current = true; setReadingAccount(Boolean(customerId)); setError("");
    if (customerId) void window.yardimciDesktop!.getCommercePointAccount(customerId, currency).then(result => {
      const value = benefitsValue(result); if (current) setAccount({ key: accountKey, revision: accountRevision, value });
    }).catch(() => { if (current) setError("Puan hesabı okunamadı. Yenileyip tekrar deneyin."); }).finally(() => { if (current) setReadingAccount(false); });
    return () => { current = false; };
  }, [customerId, currency, accountKey, accountRevision, active]);
  useEffect(() => {
    let current = true;
    setDevices([]); setDeviceId(""); setGrantStatus(null); setGrantPending(false);
    if (phoneAvailable && pointsEnabled && customerId) void window.yardimciDesktop!.listCompanionPointDevices().then(result => {
      const value = benefitsValue(result); if (current) setDevices(value);
    }).catch(() => { if (current) setError("Telefonlar yüklenemedi."); });
    return () => { current = false; };
  }, [customerId, pointsEnabled, phoneAvailable]);
  useEffect(() => {
    let current = true; setGrantStatus(null); setGrantPending(false);
    if (phoneAvailable && pointsEnabled && customerId && deviceId && recordId) {
      setGrantLoading(true);
      void window.yardimciDesktop!.getCompanionPointGrantStatus({ customerId, deviceId }).then(result => {
        const enabled = benefitsValue(result); if (current) setGrantStatus({ key: grantKey, enabled });
      }).catch(() => { if (current) setError("Telefon erişimi okunamadı."); }).finally(() => { if (current) setGrantLoading(false); });
    } else setGrantLoading(false);
    return () => { current = false; };
  }, [customerId, deviceId, recordId, pointsEnabled, grantKey, phoneAvailable]);
  useEffect(() => {
    let current = true; setSpendStatus(null); setSpendPending(null);
    const bridge = window.yardimciDesktop;
    if (phoneAvailable && pointsEnabled && customerId && deviceId && recordId && bridge && typeof bridge.getCompanionPointSpendStatus === "function"
      && typeof bridge.grantCompanionPointSpend === "function" && typeof bridge.revokeCompanionPointSpend === "function") {
      void bridge.getCompanionPointSpendStatus({ customerId, deviceId, recordId }).then(result => {
        const enabled = benefitsValue(result); if (current && liveSpendKey.current === spendKey) setSpendStatus({ key: spendKey, enabled });
      }).catch(() => { if (current) setError("Telefon harcama izni okunamadı."); });
    }
    return () => { current = false; };
  }, [customerId, deviceId, recordId, pointsEnabled, spendKey, phoneAvailable]);
  async function changeSpendGrant() {
    const pendingScope = spendPending;
    if (lock.current || !pendingScope || pendingScope.key !== liveSpendKey.current || selectedSpend !== pendingScope.enabled || !pointsEnabled || !phoneAvailable || !recordId) return;
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
    if (lock.current || selectedGrant === null || !pointsEnabled || !phoneAvailable) return;
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
  function changeContext(next: () => void) {
    if (lock.current) return;
    const change = () => { clearDraft(); next(); };
    if (dirty) setPending(() => change); else change();
  }
  async function submit(expire = false) {
    if (lock.current || !secure || !pointsEnabled || !accountReady || note.trim().length < 3 || (!expire && !amount)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const bridge = window.yardimciDesktop!;
      if (expire) benefitsValue(await bridge.expireCommercePoints({ customerId, currency, operationKey: operationKey.current, note }));
      else benefitsValue(await bridge.adjustCommercePoints({ customerId, currency, operationKey: operationKey.current, note, reason,
        amountMinor: direction * benefitsParseDecimal(amount, benefitsCurrencyDigits(currency)), expiresAt: expiry ? new Date(`${expiry}T23:59:59`).getTime() : null }));
      clearDraft(); setAccountRevision(value => value + 1); onSaved();
    } catch (error) { setOperationPending(null); setError(error instanceof Error ? error.message : "Puan işlemi tamamlanamadı."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <div className="benefits-points-layout" aria-busy={busy}>
      <Panel as="section" className="benefits-points-customers form-stack" aria-label="Puan müşterileri">
        <h2>Müşteriler</h2>
        <label className="form-field">Müşteri ara<input type="search" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></label>
        <div aria-busy={readingCustomers} className="benefits-points-customer-list"><DataList>
          {customers?.items.map(customer => <DataListButton key={customer.id} title={customer.fullName} selected={customerId === customer.id} aria-pressed={customerId === customer.id} onClick={() => changeContext(() => { setCustomerName(customer.fullName); setCustomerId(customer.id); })} />)}
          {!readingCustomers && customers && !customers.items.length && <p>Müşteri bulunamadı.</p>}
        </DataList></div>
        {customerError && <p role="alert">{customerError}</p>}
        {customers && customers.matched > 30 && <div className="action-row"><ActionButton variant="quiet" disabled={readingCustomers || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 30))}>Önceki</ActionButton><span>{Math.floor(offset / 30) + 1} / {Math.ceil(customers.matched / 30)}</span><ActionButton variant="quiet" disabled={readingCustomers || offset + 30 >= customers.matched} onClick={() => setOffset(value => value + 30)}>Sonraki</ActionButton></div>}
        {customerId && <p className="benefits-selected-customer">Seçili müşteri: <strong>{customerName}</strong></p>}
      </Panel>
      <section className="benefits-points-account form-stack" aria-label="Müşteri Puan hesabı" aria-busy={readingAccount}>
        <Panel as="section" className="form-stack" aria-label="Hesap seçimi"><header className="benefits-studio__heading"><h2>{customerName || "Puan hesabı"}</h2><ActionButton variant="quiet" disabled={!customerId || busy || readingAccount} onClick={() => setAccountRevision(value => value + 1)}>Hesabı yenile</ActionButton></header>
          <label className="form-field">Para birimi<select aria-label="Para birimi" disabled={busy} value={currency} onChange={event => { const value = event.target.value; changeContext(() => setCurrency(value)); }}>{["TRY", "USD", "EUR", "GBP"].map(value => <option key={value}>{value}</option>)}</select></label>
        </Panel>
        {account ? <BenefitsPointHistory key={accountKey} account={account} currency={currency} /> : !customerId && <p>Müşteri seçin.</p>}
      </section>
      <form className="benefits-points-operations form-stack" onSubmit={event => { event.preventDefault(); if (!busy && secure && pointsEnabled && accountReady && amount && note.trim().length >= 3) setOperationPending("adjust"); }}>
        {error && <div className="action-row"><p role="alert">{error}</p><ActionButton variant="quiet" disabled={busy} onClick={() => setAccountRevision(value => value + 1)}>Yeniden dene</ActionButton></div>}
        {!secure && <p role="status">Güvenli anahtar saklama kullanılamıyor. Puan hareketleri kapalı.</p>}
        {!pointsEnabled && <p role="status">Puan kullanımı kapalı. Bakiye ve geçmiş görüntülenebilir.</p>}
        <Panel as="section" className="form-stack" aria-label="Puan düzeltmesi"><h3>Puan düzeltme</h3>
          <fieldset disabled={busy || !secure || !pointsEnabled || !accountReady} className="form-stack benefits-fields">
            <div className="form-grid form-grid--compact">
              <label className="form-field">Düzeltme türü<select aria-label="Düzeltme türü" value={reason} onChange={event => { const next = event.target.value as typeof reason; setReason(next); if (next === "opening_balance") setDirection(1); }}><option value="correction">Düzeltme</option><option value="opening_balance">Açılış bakiyesi</option></select></label>
              <label className="form-field">Yön<select aria-label="Yön" value={direction} disabled={reason === "opening_balance"} onChange={event => { setDirection(Number(event.target.value)); setExpiry(""); }}><option value={1}>Puan ekle</option><option value={-1}>Puan düş</option></select></label>
              <label className="form-field">Puan tutarı<MoneyInput value={amount} onChange={setAmount} /></label>
              <label className="form-field">Geçerlilik sonu<DatePicker ariaLabel="Geçerlilik sonu" value={expiry} disabled={direction < 0} onChange={setExpiry} /></label>
            </div>
            <label className="form-field">İşlem gerekçesi<textarea minLength={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
            <ActionButton type="submit" disabled={!amount || note.trim().length < 3}>Düzeltmeyi uygula</ActionButton>
          </fieldset>
          <ActionButton variant="quiet" disabled={!dirty || busy} onClick={() => setPending(() => clearDraft)}>Taslağı temizle</ActionButton>
        </Panel>
        <Panel as="section" className="form-stack" aria-label="Telefon Puan erişimi"><h3>Telefon erişimi</h3>
          {phoneAvailable && pointsEnabled && customerId ? <fieldset disabled={busy} className="form-stack benefits-fields">
            <label className="form-field">Telefon<select value={deviceId} onChange={event => { setGrantStatus(null); setDeviceId(event.target.value); }}><option value="">Telefon seçin</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceName || "Telefon"} ({device.deviceId})</option>)}</select></label>
            {deviceId && selectedGrant !== null && <><p>Bakiye görüntüleme: {selectedGrant ? "Açık" : "Kapalı"}</p><ActionButton variant="secondary" disabled={busy || grantLoading} onClick={() => setGrantPending(true)}>{selectedGrant ? "Telefon erişimini kaldır" : "Puan bakiyesini telefonda göster"}</ActionButton></>}
            {deviceId && <p>Gelecekte Puan harcama izni: {selectedSpend === null ? "kullanılamıyor" : selectedSpend ? "açık" : "kapalı"}. Mobil Puan harcaması henüz etkin değildir.</p>}
            {deviceId && <ActionButton variant="secondary" disabled={busy || selectedSpend === null} onClick={() => { if (selectedSpend !== null) setSpendPending({ key: spendKey, enabled: selectedSpend }); }}>{selectedSpend ? "Gelecek harcama iznini kaldır" : "Gelecek harcama izni ver"}</ActionButton>}
          </fieldset> : <p>{!phoneAvailable ? "Telefon servisi kapalı." : !pointsEnabled ? "Puan kullanımı kapalı." : "Müşteri seçin."}</p>}
        </Panel>
        <Panel as="section" className="form-stack" aria-label="Süresi dolan puanlar"><h3>Süresi dolan puanlar</h3>
          <ActionButton variant="secondary" disabled={busy || !secure || !pointsEnabled || !accountReady || note.trim().length < 3} onClick={() => setOperationPending("expire")}>Süresi dolan Puanları işle</ActionButton>
          {account && note.trim().length < 3 && <small>İşlem için gerekçe girin.</small>}
        </Panel>
      </form>
    </div>
    {operationPending ? <ConfirmDialog title={operationPending === "adjust" ? "Puan düzeltmesini onayla" : "Süresi dolan puanları işle"}
      description={`${customerName} · ${currency}${operationPending === "adjust" ? ` · ${direction > 0 ? "Ekle" : "Düş"}: ${amount}` : ""}. Bu işlem hesap hareketi oluşturur.`}
      details={<p>{note}</p>} confirmLabel="İşlemi onayla" busy={busy} onCancel={() => { if (!lock.current) setOperationPending(null); }} onConfirm={() => void submit(operationPending === "expire")} /> : spendPending && spendPending.key === spendKey ? <ConfirmDialog title="Gelecekte telefonla Puan kullanımı" description={`${customerName || "Müşteri"} (${customerId}) için ${devices.find(device => device.deviceId === deviceId)?.deviceName || "Telefon"} (${deviceId}) cihazının gelecekteki Puan harcama iznini ${spendPending.enabled ? "kaldırmak" : "vermek"} istiyor musunuz? Bu işlem Puan harcamaz; mobil Puan harcaması henüz etkin değildir.`} confirmLabel={spendPending.enabled ? "Harcamaya izni kaldır" : "Gelecek için izin ver"} busy={busy} onCancel={() => setSpendPending(null)} onConfirm={() => void changeSpendGrant()} /> : grantPending ? <ConfirmDialog title="Telefon Puan erişimi" description={`${customerName || "Müşteri"} (${customerId}) için ${devices.find(device => device.deviceId === deviceId)?.deviceName || "Telefon"} (${deviceId}) cihazının Puan bakiyesi görüntüleme erişimini ${selectedGrant ? "kaldırmak" : "açmak"} istiyor musunuz? Bu işlem Puan harcamaz.`} confirmLabel={selectedGrant ? "Erişimi kaldır" : "İzin ver"} busy={busy} onCancel={() => setGrantPending(false)} onConfirm={() => void changeGrant()} /> : pending && <ConfirmDialog title="Değişiklikler kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => { const next = pending; setPending(null); next(); }} />}
  </>;
}
