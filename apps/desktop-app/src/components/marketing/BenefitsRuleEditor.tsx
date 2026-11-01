import { useCallback, useEffect, useRef, useState } from "react";
import type { BenefitsFamily, BenefitsRule, BenefitsScope } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { FormDialog } from "../ui/FormDialog";
import { MoneyInput } from "../ui/MoneyInput";
import { SearchSelect, type SearchSelectPage } from "../ui/SearchSelect";
import { benefitsCurrencyDigits, benefitsDecimal, benefitsFamilyLabels, benefitsParseDecimal, benefitsStatusLabels, benefitsValue } from "./benefits-model";

const channels: { label: string; values: BenefitsScope["channels"] }[] = [
  { label: "Desktop", values: ["desktop_cart", "desktop_desk"] }, { label: "Web", values: ["web"] },
  { label: "Bayi", values: ["web_dealer"] }, { label: "Companion", values: ["companion"] },
];
const families = Object.keys(benefitsFamilyLabels) as BenefitsFamily[];
const csv = (text: string) => [...new Set(text.split(",").map(value => value.trim()).filter(Boolean))];
function localDate(value: number): string {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function RuleDate({ label, value, onChange, clearable = true }: { label: string; value: number | null; onChange(value: number | null): void; clearable?: boolean }) {
  const local = value === null ? "" : localDate(value);
  return <div className="form-grid form-grid--compact">
    <label className="form-field">{label}<DatePicker ariaLabel={label} clearable={clearable} value={local.slice(0, 10)} onChange={date => onChange(date ? new Date(`${date}T${local.slice(11) || "00:00"}`).getTime() : null)} /></label>
    <label className="form-field">{label} saati<TimePicker ariaLabel={`${label} saati`} value={local.slice(11)} disabled={value === null} clearable={false} onChange={time => { if (value !== null) onChange(new Date(`${local.slice(0, 10)}T${time}`).getTime()); }} /></label>
  </div>;
}

function ScopeRecords({ label, values, onChange, kind }: { label: string; values: readonly string[]; onChange(values: string[]): void; kind: "product" | "category" | "customer" }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const loadPage = useCallback(async (search: string, offset: number): Promise<SearchSelectPage> => {
    const bridge = window.yardimciDesktop!;
    if (kind === "category") {
      const rows = await bridge.commerce.listCategories();
      const options = rows.filter(row => row.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))).map(row => ({ id: row.id, label: row.name }));
      setNames(current => ({ ...current, ...Object.fromEntries(options.map(option => [option.id, option.label])) }));
      return { options: options.slice(offset, offset + 60), total: options.length, offset, nextOffset: offset + 60 < options.length ? offset + 60 : null };
    }
    const page = kind === "product" ? await bridge.commerce.listProducts({ search, offset, limit: 60 }) : await bridge.listCustomers({ search, offset, limit: 60 });
    const options = page.items.map(row => ({ id: row.id, label: "name" in row ? row.name : row.fullName }));
    setNames(current => ({ ...current, ...Object.fromEntries(options.map(option => [option.id, option.label])) }));
    const total = "matched" in page ? page.matched : page.total;
    return { options, total, offset, nextOffset: offset + page.items.length < total ? offset + page.items.length : null };
  }, [kind]);
  return <div className="form-field"><span>{label}</span><SearchSelect ariaLabel={label} value="" options={[]} loadPage={loadPage}
    onChange={value => { if (value && !values.includes(value)) onChange([...values, value]); }} placeholder={label.startsWith("Hariç") ? "Hariç tutulacak kayıt seçin" : "Tümü · daraltmak için seçin"} />
    <div className="action-row">{values.map(value => <ActionButton key={value} size="sm" variant="quiet" onClick={() => onChange(values.filter(item => item !== value))} aria-label={`${names[value] ?? value} kapsamdan çıkar`}>{names[value] ?? value} ×</ActionButton>)}</div></div>;
}

export function BenefitsRuleEditor({ initial, existing, onClose, onSaved, registerPageLeaveGuard }: {
  initial: BenefitsRule; existing: boolean; onClose(): void; onSaved(): void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  const [rule, setRule] = useState(initial), [money, setMoney] = useState(() => {
    const digits = benefitsCurrencyDigits(initial.currency);
    return { percent: benefitsDecimal(initial.percentBps, 2), fixed: benefitsDecimal(initial.fixedMinor, digits), min: benefitsDecimal(initial.minSpendMinor, digits), max: initial.maxBenefitMinor === null ? "" : benefitsDecimal(initial.maxBenefitMinor, digits) };
  });
  const baseline = useRef(JSON.stringify({ rule: initial, money }));
  const [customerGroups, setCustomerGroups] = useState(initial.scope.customerGroups.join(", "));
  const [busy, setBusy] = useState(false), lock = useRef(false), [error, setError] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirty = JSON.stringify({ rule, money }) !== baseline.current || customerGroups !== initial.scope.customerGroups.join(", ");
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => registerPageLeaveGuard?.((_destination, next) => {
    if (lock.current) return false;
    if (!dirtyRef.current) return true;
    setPending(() => next); return false;
  }), [registerPageLeaveGuard]);
  function close() { if (lock.current) return; if (dirty) setPending(() => onClose); else onClose(); }
  const scope = <K extends keyof BenefitsScope>(key: K, value: BenefitsScope[K]) => setRule(current => ({ ...current, scope: { ...current.scope, [key]: value } }));
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const digits = benefitsCurrencyDigits(rule.currency);
      const value = { ...rule, scope: { ...rule.scope, customerGroups: csv(customerGroups) }, version: existing ? initial.version + 1 : 1,
        percentBps: benefitsParseDecimal(money.percent, 2), fixedMinor: benefitsParseDecimal(money.fixed, digits),
        minSpendMinor: benefitsParseDecimal(money.min, digits), maxBenefitMinor: money.max ? benefitsParseDecimal(money.max, digits) : null };
      benefitsValue(await window.yardimciDesktop!.saveCommerceBenefitsRule(value)); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Kural kaydedilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <FormDialog title={`${benefitsFamilyLabels[rule.family]} kuralı`} onClose={close} closeBlocked={busy} dismissOnBackdrop onSubmit={event => { event.preventDefault(); void save(); }}
    overlay={pending && <ConfirmDialog withinModal title="Değişiklikler kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => { const next = pending; setPending(null); next(); }} />}
    footer={<><ActionButton variant="secondary" disabled={busy} onClick={onClose}>Vazgeç</ActionButton><ActionButton type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</ActionButton></>}>
    <fieldset disabled={busy} className="form-stack benefits-fields">
      {error && <p role="alert">{error}</p>}
      <div className="form-grid form-grid--compact">
        <label className="form-field">Kural adı<input aria-label="Kural adı" required pattern="[a-zA-Z0-9_-]+" maxLength={128} value={rule.id} disabled={existing} placeholder="yaz-kuponu" onChange={event => setRule({ ...rule, id: event.target.value })} /><small>Harf, rakam, tire veya alt çizgi.</small></label>
        <label className="form-field">Durum<select aria-label="Durum" value={rule.status} onChange={event => setRule({ ...rule, status: event.target.value as BenefitsRule["status"] })}>{Object.entries(benefitsStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field">Para birimi<select value={rule.currency} onChange={event => setRule({ ...rule, currency: event.target.value })}>{[...new Set([rule.currency, "TRY", "USD", "EUR", "GBP"])].map(currency => <option key={currency}>{currency}</option>)}</select></label>
        <label className="form-field">Yüzde (%)<input type="number" required min={0} max={100} step="0.01" value={money.percent.replace(",", ".")} onChange={event => setMoney({ ...money, percent: event.target.value })} /></label>
        <label className="form-field">Sabit tutar<MoneyInput required value={money.fixed} onChange={fixed => setMoney({ ...money, fixed })} /></label>
        <label className="form-field">Asgari alışveriş tutarı<MoneyInput required value={money.min} onChange={min => setMoney({ ...money, min })} /></label>
      </div>
      {rule.points && <div className="form-grid form-grid--compact">
        <label className="form-field">Puan işlemi<select value={rule.points.operation} onChange={event => setRule({ ...rule, points: { ...rule.points!, operation: event.target.value as "earn" | "redeem" } })}><option value="earn">Puan kazandırma</option><option value="redeem">Puan kullanma</option></select></label>
        <label className="form-field">Kazanç tutarı<select value={rule.points.earnBase} onChange={event => setRule({ ...rule, points: { ...rule.points!, earnBase: event.target.value as "after_discounts" | "after_points" } })}><option value="after_discounts">İndirimlerden sonra</option><option value="after_points">Puan kullanımından sonra</option></select></label>
        <label className="form-field">Puan geçerliliği (gün)<input type="number" min={1} max={36500} value={rule.points.expiryDays ?? ""} placeholder="Süresiz" onChange={event => setRule({ ...rule, points: { ...rule.points!, expiryDays: event.target.value ? Number(event.target.value) : null } })} /></label>
      </div>}
      {rule.family === "payment_modifier" && <fieldset><legend>Ödeme yöntemleri</legend>{[...new Set(["cash", "card", "bank", "other", ...rule.paymentMethodIds])].map(method => <label key={method}><input type="checkbox" checked={rule.paymentMethodIds.includes(method)} onChange={event => setRule({ ...rule, paymentMethodIds: event.target.checked ? [...rule.paymentMethodIds, method] : rule.paymentMethodIds.filter(value => value !== method) })} />{{ cash: "Nakit", card: "Kart", bank: "Banka", other: "Diğer" }[method] ?? method}</label>)}</fieldset>}
      <RuleDate label="Başlangıç" clearable={false} value={rule.startsAt} onChange={startsAt => { if (startsAt !== null) setRule({ ...rule, startsAt }); }} />
      <RuleDate label="Bitiş (hariç)" value={rule.endsAt} onChange={endsAt => setRule({ ...rule, endsAt })} />
      <fieldset><legend>Kanallar</legend><div className="action-row">{channels.map(channel => <label key={channel.label}><input type="checkbox" checked={channel.values.every(value => rule.scope.channels.includes(value))} onChange={event => scope("channels", [...rule.scope.channels.filter(value => !channel.values.includes(value)), ...(event.target.checked ? channel.values : [])])} />{channel.label}</label>)}</div></fieldset>
      <details><summary>Kapsam ve birleştirme</summary><div className="form-stack">
        <label className="form-field">Müşteri grupları<input value={customerGroups} onChange={event => setCustomerGroups(event.target.value)} placeholder="Tümü · virgülle ayırın" /></label>
        <ScopeRecords label="Müşteriler" kind="customer" values={rule.scope.customerIds} onChange={value => scope("customerIds", value)} />
        <fieldset><legend>Fiyat grupları (boşsa tümü)</legend>{(["retail", "dealer_a", "dealer_b"] as const).map((group, index) => <label key={group}><input type="checkbox" checked={rule.scope.priceGroups.includes(group)} onChange={event => scope("priceGroups", event.target.checked ? [...rule.scope.priceGroups, group] : rule.scope.priceGroups.filter(value => value !== group))} />{["Perakende", "Bayi A", "Bayi B"][index]}</label>)}</fieldset>
        <ScopeRecords label="Ürünler" kind="product" values={rule.scope.productIds} onChange={value => scope("productIds", value)} />
        <ScopeRecords label="Kategoriler" kind="category" values={rule.scope.categoryIds} onChange={value => scope("categoryIds", value)} />
        <ScopeRecords label="Hariç ürünler" kind="product" values={rule.scope.excludedProductIds} onChange={value => scope("excludedProductIds", value)} />
        <ScopeRecords label="Hariç kategoriler" kind="category" values={rule.scope.excludedCategoryIds} onChange={value => scope("excludedCategoryIds", value)} />
        <div className="form-grid form-grid--compact"><label className="form-field">Azami avantaj tutarı<MoneyInput value={money.max} placeholder="Sınırsız" onChange={max => setMoney({ ...money, max })} /></label>
          <label className="form-field">Öncelik<input type="number" required step={1} value={rule.priority} onChange={event => setRule({ ...rule, priority: Number(event.target.value) })} /></label></div>
        <fieldset><legend>Birlikte kullanılabilir</legend>{families.map(family => <label key={family}><input type="checkbox" checked={rule.combinesWith.includes(family)} onChange={event => setRule({ ...rule, combinesWith: event.target.checked ? [...rule.combinesWith, family] : rule.combinesWith.filter(value => value !== family) })} />{benefitsFamilyLabels[family]}</label>)}</fieldset>
        {rule.family === "coupon" && <label><input type="checkbox" checked={rule.allowCouponStacking} onChange={event => setRule({ ...rule, allowCouponStacking: event.target.checked })} />Birden çok kupon birlikte kullanılabilir</label>}
      </div></details>
    </fieldset>
  </FormDialog>;
}
