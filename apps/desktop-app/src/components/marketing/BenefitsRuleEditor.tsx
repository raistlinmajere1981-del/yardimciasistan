import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS_CAPABILITIES as C, type BenefitsFamily, type BenefitsRule, type BenefitsScope } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { useWebAvailability } from "../../app/web-availability";
import { Panel } from "../ui/Panel";
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
    <label className="form-field form-field--fluid">{label}<DatePicker ariaLabel={label} clearable={clearable} value={local.slice(0, 10)} onChange={date => onChange(date ? new Date(`${date}T${local.slice(11) || "00:00"}`).getTime() : null)} /></label>
    <label className="form-field form-field--fluid">{label} saati<TimePicker ariaLabel={`${label} saati`} value={local.slice(11)} disabled={value === null} clearable={false} onChange={time => { if (value !== null) onChange(new Date(`${local.slice(0, 10)}T${time}`).getTime()); }} /></label>
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
  return <div className="form-field form-field--fluid"><span>{label}</span><SearchSelect ariaLabel={label} value="" options={[]} loadPage={loadPage}
    onChange={value => { if (value && !values.includes(value)) onChange([...values, value]); }} placeholder="Kayıt seçin" />
    {values.length > 0 && <div className="action-row">{values.map(value => <ActionButton key={value} size="sm" variant="quiet" onClick={() => onChange(values.filter(item => item !== value))} aria-label={`${names[value] ?? value} kapsamdan çıkar`}>{names[value] ?? value} ×</ActionButton>)}</div>}</div>;
}

export function BenefitsRuleEditor({ initial, existing, onClose, onSaved, registerPageLeaveGuard }: {
  initial: BenefitsRule; existing: boolean; onClose(): void; onSaved(id: string): void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const capabilities = snapshot?.enabledCapabilities ?? [], webAvailable = useWebAvailability();
  const availableChannels: BenefitsScope["channels"] = [
    ...(capabilities.includes(C.SALES) ? ["desktop_cart" as const] : []),
    ...(capabilities.includes(C.ORDERS) || capabilities.includes(C.FOOD_ORDERS) ? ["desktop_desk" as const] : []),
    ...(webAvailable && capabilities.includes(C.ONLINE_SALES) ? ["web" as const] : []),
    ...(webAvailable && capabilities.includes(C.ONLINE_SALES) && capabilities.includes(C.WHOLESALE) ? ["web_dealer" as const] : []),
    ...(capabilities.includes(C.ANDROID) && capabilities.includes(C.SALES) ? ["companion" as const] : []),
  ];
  const [modes, setModes] = useState(() => ({
    price: initial.scope.priceGroups.length ? "selected" : "all",
    customer: initial.scope.customerIds.length ? initial.scope.customerGroups.length ? "both" : "customers" : initial.scope.customerGroups.length ? "groups" : "all",
    product: initial.scope.productIds.length ? initial.scope.categoryIds.length ? "both" : "products" : initial.scope.categoryIds.length ? "categories" : "all",
    combine: initial.combinesWith.length ? "selected" : "alone",
  }));
  const initialModes = useRef(JSON.stringify(modes));
  const [rule, setRule] = useState(() => existing ? initial : { ...initial, scope: { ...initial.scope, channels: initial.scope.channels.filter(channel => availableChannels.includes(channel)) } }), [money, setMoney] = useState(() => {
    const digits = benefitsCurrencyDigits(initial.currency);
    return { percent: benefitsDecimal(initial.percentBps, 2), fixed: benefitsDecimal(initial.fixedMinor, digits), min: benefitsDecimal(initial.minSpendMinor, digits), max: initial.maxBenefitMinor === null ? "" : benefitsDecimal(initial.maxBenefitMinor, digits) };
  });
  const baseline = useRef(JSON.stringify({ rule, money }));
  const [customerGroups, setCustomerGroups] = useState(initial.scope.customerGroups.join(", "));
  const [busy, setBusy] = useState(false), lock = useRef(false), [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: "nearest" }); }, [error]);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirty = JSON.stringify(modes) !== initialModes.current || JSON.stringify({ rule, money }) !== baseline.current || customerGroups !== initial.scope.customerGroups.join(", ");
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
      if (modes.price === "selected" && !rule.scope.priceGroups.length) throw new Error("En az bir fiyat grubu seçin.");
      if (["customers", "both"].includes(modes.customer) && !rule.scope.customerIds.length) throw new Error("En az bir müşteri seçin.");
      if (["groups", "both"].includes(modes.customer) && !csv(customerGroups).length) throw new Error("En az bir müşteri grubu girin.");
      if (["products", "both"].includes(modes.product) && !rule.scope.productIds.length) throw new Error("En az bir ürün seçin.");
      if (["categories", "both"].includes(modes.product) && !rule.scope.categoryIds.length) throw new Error("En az bir kategori seçin.");
      if (modes.combine === "selected" && !rule.combinesWith.length) throw new Error("Birlikte uygulanacak en az bir avantaj seçin.");
      if (!rule.scope.channels.length) throw new Error("En az bir kullanılabilir kanal seçin.");
      if (rule.family === "payment_modifier" && !rule.paymentMethodIds.length) throw new Error("En az bir ödeme yöntemi seçin.");
      const digits = benefitsCurrencyDigits(rule.currency);
      const value = { ...rule, scope: { ...rule.scope, customerGroups: csv(customerGroups) }, version: existing ? initial.version + 1 : 1,
        percentBps: benefitsParseDecimal(money.percent, 2), fixedMinor: benefitsParseDecimal(money.fixed, digits),
        minSpendMinor: benefitsParseDecimal(money.min, digits), maxBenefitMinor: money.max ? benefitsParseDecimal(money.max, digits) : null };
      benefitsValue(await window.yardimciDesktop!.saveCommerceBenefitsRule(value)); onSaved(value.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Kural kaydedilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <FormDialog dialogClassName="benefits-rule-dialog" title={`${benefitsFamilyLabels[rule.family]} kuralı`} onClose={close} closeBlocked={busy} dismissOnBackdrop onSubmit={event => { event.preventDefault(); void save(); }}
    overlay={pending && <ConfirmDialog withinModal title="Değişiklikler kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => { const next = pending; setPending(null); next(); }} />}
    footer={<><ActionButton variant="secondary" disabled={busy} onClick={close}>Vazgeç</ActionButton><ActionButton type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</ActionButton></>}>
    <fieldset disabled={busy} className="form-stack benefits-fields">
      {error && <p ref={errorRef} role="alert">{error}</p>}
      <div className="benefits-rule-layout">
        <div className="benefits-rule-column">
        <Panel as="section" className="form-stack" aria-label="Genel bilgiler"><h3>Genel bilgiler</h3>
          <label className="form-field form-field--fluid">Kural adı<input aria-label="Kural adı" required pattern="[a-zA-Z0-9_-]+" maxLength={128} value={rule.id} disabled={existing} placeholder={{ coupon: "yaz-kuponu", points: "puan-kazanci", payment_modifier: "kart-indirimi" }[rule.family]} onChange={event => setRule({ ...rule, id: event.target.value })} /><small>Harf, rakam, tire veya alt çizgi.</small></label>
          <div className="form-grid form-grid--compact">
            <label className="form-field form-field--fluid">Durum<select aria-label="Durum" value={rule.status} onChange={event => setRule({ ...rule, status: event.target.value as BenefitsRule["status"] })}>{Object.entries(benefitsStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field form-field--fluid">Para birimi<select aria-label="Para birimi" value={rule.currency} onChange={event => setRule({ ...rule, currency: event.target.value })}>{[...new Set([rule.currency, "TRY", "USD", "EUR", "GBP"])].map(currency => <option key={currency}>{currency}</option>)}</select></label>
          </div>
          {rule.family === "payment_modifier" && <fieldset className="benefits-rule-choices"><legend>Ödeme yöntemleri</legend>{[...new Set(["cash", "card", "bank", "other", ...rule.paymentMethodIds])].map(method => <label key={method}><input type="checkbox" checked={rule.paymentMethodIds.includes(method)} onChange={event => setRule({ ...rule, paymentMethodIds: event.target.checked ? [...rule.paymentMethodIds, method] : rule.paymentMethodIds.filter(value => value !== method) })} />{{ cash: "Nakit", card: "Kart", bank: "Banka", other: "Diğer" }[method] ?? method}</label>)}</fieldset>}
        </Panel>
        <Panel as="section" className="form-stack" aria-label="Kapsam"><h3>Kapsam</h3>
            <label className="form-field form-field--fluid">Fiyat grubu kapsamı<select aria-label="Fiyat grubu kapsamı" value={modes.price} onChange={event => { setModes({ ...modes, price: event.target.value }); scope("priceGroups", []); }}><option value="all">Tüm fiyat grupları</option><option value="selected">Seçili fiyat grupları</option></select></label>
            {modes.price === "selected" && <fieldset className="benefits-rule-choices"><legend>Fiyat grupları</legend>{(["retail", "dealer_a", "dealer_b"] as const).map((group, index) => <label key={group}><input type="checkbox" checked={rule.scope.priceGroups.includes(group)} onChange={event => scope("priceGroups", event.target.checked ? [...rule.scope.priceGroups, group] : rule.scope.priceGroups.filter(value => value !== group))} />{["Perakende", "Bayi A", "Bayi B"][index]}</label>)}</fieldset>}
            <label className="form-field form-field--fluid">Müşteri kapsamı<select aria-label="Müşteri kapsamı" value={modes.customer} onChange={event => { setModes({ ...modes, customer: event.target.value }); setCustomerGroups(""); setRule({ ...rule, scope: { ...rule.scope, customerIds: [], customerGroups: [] } }); }}><option value="all">Tüm müşteriler</option><option value="customers">Belirli müşteriler</option><option value="groups">Müşteri grupları</option>{modes.customer === "both" && <option value="both">Belirli müşteriler ve gruplar (kesişim)</option>}</select></label>
            {["customers", "both"].includes(modes.customer) && <ScopeRecords label="Müşteriler" kind="customer" values={rule.scope.customerIds} onChange={value => scope("customerIds", value)} />}
            {["groups", "both"].includes(modes.customer) && <label className="form-field form-field--fluid">Müşteri grupları<input value={customerGroups} onChange={event => setCustomerGroups(event.target.value)} placeholder="Grup adları, virgülle ayırın" /></label>}
            <label className="form-field form-field--fluid">Ürün kapsamı<select aria-label="Ürün kapsamı" value={modes.product} onChange={event => { setModes({ ...modes, product: event.target.value }); setRule({ ...rule, scope: { ...rule.scope, productIds: [], categoryIds: [] } }); }}><option value="all">Tüm ürünler</option><option value="products">Belirli ürünler</option><option value="categories">Belirli kategoriler</option>{modes.product === "both" && <option value="both">Belirli ürünler ve kategoriler (kesişim)</option>}</select></label>
            {["products", "both"].includes(modes.product) && <ScopeRecords label="Ürünler" kind="product" values={rule.scope.productIds} onChange={value => scope("productIds", value)} />}
            {["categories", "both"].includes(modes.product) && <ScopeRecords label="Kategoriler" kind="category" values={rule.scope.categoryIds} onChange={value => scope("categoryIds", value)} />}
          <fieldset className="form-stack"><legend>Hariç tutulan kayıtlar</legend><div className="benefits-rule-layout">
            <ScopeRecords label="Hariç ürünler" kind="product" values={rule.scope.excludedProductIds} onChange={value => scope("excludedProductIds", value)} />
            <ScopeRecords label="Hariç kategoriler" kind="category" values={rule.scope.excludedCategoryIds} onChange={value => scope("excludedCategoryIds", value)} />
          </div></fieldset>
        </Panel>
        </div>
        <div className="benefits-rule-column">
        <Panel as="section" className="form-stack" aria-label="Avantaj değeri"><h3>Avantaj değeri</h3>
          {rule.points && <label className="form-field form-field--fluid">Puan işlemi<select aria-label="Puan işlemi" value={rule.points.operation} onChange={event => setRule({ ...rule, points: { ...rule.points!, operation: event.target.value as "earn" | "redeem" } })}><option value="earn">Puan kazandırma</option><option value="redeem">Puan kullanma</option></select></label>}
          <div className="form-grid form-grid--compact">
            <label className="form-field form-field--fluid">Yüzde (%)<input type="number" required min={0} max={100} step="0.01" value={money.percent.replace(",", ".")} onChange={event => setMoney({ ...money, percent: event.target.value })} /></label>
            <label className="form-field form-field--fluid">Sabit tutar<MoneyInput required value={money.fixed} onChange={fixed => setMoney({ ...money, fixed })} /></label>
            <label className="form-field form-field--fluid">Asgari alışveriş tutarı<MoneyInput required value={money.min} onChange={min => setMoney({ ...money, min })} /></label>
            <label className="form-field form-field--fluid">Azami avantaj tutarı<MoneyInput value={money.max} placeholder="Sınırsız" onChange={max => setMoney({ ...money, max })} /></label>
          </div>
          {rule.points?.operation === "earn" && <>
            <label className="form-field form-field--fluid">Kazanç tutarı<select aria-label="Kazanç tutarı" value={rule.points.earnBase} onChange={event => setRule({ ...rule, points: { ...rule.points!, earnBase: event.target.value as "after_discounts" | "after_points" } })}><option value="after_discounts">İndirimlerden sonra</option><option value="after_points">Puan kullanımından sonra</option></select></label>
            <label className="form-field form-field--fluid">Puan geçerliliği (gün)<input type="number" min={1} max={36500} value={rule.points.expiryDays ?? ""} placeholder="Süresiz" onChange={event => setRule({ ...rule, points: { ...rule.points!, expiryDays: event.target.value ? Number(event.target.value) : null } })} /></label>
          </>}
        </Panel>
        <Panel as="section" className="form-stack" aria-label="Zaman ve kanallar"><h3>Zaman ve kanallar</h3>
          <RuleDate label="Başlangıç" clearable={false} value={rule.startsAt} onChange={startsAt => { if (startsAt !== null) setRule({ ...rule, startsAt }); }} />
          <RuleDate label="Bitiş (hariç)" value={rule.endsAt} onChange={endsAt => setRule({ ...rule, endsAt })} />
          <fieldset><legend>Kanallar</legend><div className="benefits-channel-choices">{channels.map(channel => {
            const available = channel.values.filter(value => availableChannels.includes(value));
            const retained = channel.values.some(value => rule.scope.channels.includes(value) && !availableChannels.includes(value));
            return <label key={channel.label}><input type="checkbox" disabled={!available.length} checked={available.length > 0 && available.every(value => rule.scope.channels.includes(value))}
              onChange={event => scope("channels", [...rule.scope.channels.filter(value => !available.includes(value)), ...(event.target.checked ? available : [])])} />{channel.label}{!available.length && " · Kullanılamıyor"}{retained && <small>Kullanılamayan kayıtlı kanal kapsamı korunur.</small>}</label>;
          })}</div></fieldset>
        </Panel>
        <Panel as="section" className="form-stack" aria-label="Diğer avantajlarla kullanım"><h3>Diğer avantajlarla kullanım</h3>
          <label className="form-field form-field--fluid">Uygulama<select aria-label="Uygulama" value={modes.combine} onChange={event => { setModes({ ...modes, combine: event.target.value }); setRule({ ...rule, combinesWith: [] }); }}><option value="alone">Tek başına uygulanır</option><option value="selected">Seçili avantajlarla birlikte uygulanır</option></select></label>
          {modes.combine === "selected" && <fieldset className="benefits-rule-choices"><legend>Avantajlar</legend>{families.map(family => <label key={family}><input type="checkbox" checked={rule.combinesWith.includes(family)} onChange={event => setRule({ ...rule, combinesWith: event.target.checked ? [...rule.combinesWith, family] : rule.combinesWith.filter(value => value !== family) })} />{benefitsFamilyLabels[family]}</label>)}</fieldset>}
          {rule.family === "coupon" && <label className="benefits-rule-check"><input type="checkbox" checked={rule.allowCouponStacking} onChange={event => setRule({ ...rule, allowCouponStacking: event.target.checked })} />Birden çok kupon uygulanabilir</label>}
          <label className="form-field form-field--fluid">Öncelik<input type="number" required step={1} value={rule.priority} onChange={event => setRule({ ...rule, priority: Number(event.target.value) })} /></label>
        </Panel>
        </div>
      </div>
    </fieldset>
  </FormDialog>;
}
