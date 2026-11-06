import { useCallback, useEffect, useRef, useState } from "react";
import type { BenefitsFamily, BenefitsManagementSnapshot, BenefitsRule } from "@yardimci-asistan/shared";
import type { PageLeaveGuard, RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { PageWorkSurface } from "../layout/PageWorkSurface";
import { DataList, DataListButton } from "../ui/DataList";
import { Panel } from "../ui/Panel";
import { FeatureViewSelector } from "../workspace/FeatureViewSelector";
import { StatusBadge } from "../ui/StatusBadge";
import { BenefitsRuleEditor } from "./BenefitsRuleEditor";
import { BenefitsPointsEditor } from "./BenefitsPointsEditor";
import { BenefitsCouponIssuer } from "./BenefitsCouponIssuer";
import { benefitsFamilyLabels, benefitsMoney, benefitsDisplayStatusLabels, benefitsRuleStatus, benefitsValue, newBenefitsRule } from "./benefits-model";

type Surface = { kind: "rule"; rule: BenefitsRule; existing: boolean } | { kind: "coupon"; rule: BenefitsRule };
export function CommerceBenefitsWorkspace({ onMessage, registerPageLeaveGuard }: { onMessage?: (message: string) => void; registerPageLeaveGuard?: RegisterPageLeaveGuard }) {
  const [view, setView] = useState<"rules" | "points">("rules"), [pointsVisited, setPointsVisited] = useState(false);
  const localGuard = useRef<PageLeaveGuard | null>(null);
  const registerLocalGuard = useCallback<RegisterPageLeaveGuard>(guard => {
    localGuard.current = guard; return () => { if (localGuard.current === guard) localGuard.current = null; };
  }, []);
  const [snapshot, setSnapshot] = useState<BenefitsManagementSnapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<BenefitsFamily>("coupon");
  const [selection, setSelection] = useState<Partial<Record<BenefitsFamily, string>>>({});
  const [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const [surface, setSurface] = useState<Surface | null>(null), epoch = useRef(0), lock = useRef(false);
  useEffect(() => registerPageLeaveGuard?.((destination, next) => !lock.current && (!localGuard.current || localGuard.current(destination, next))), [registerPageLeaveGuard]);
  function changeView(nextView: "rules" | "points") {
    if (nextView === view || lock.current) return;
    const next = () => { setSurface(null); setView(nextView); if (nextView === "points") setPointsVisited(true); };
    if (!localGuard.current || localGuard.current("benefits", next)) next();
  }
  const invalidate = useCallback(() => { ++epoch.current; }, []);
  const reload = useCallback(async () => {
    const ticket = ++epoch.current;
    const result = await window.yardimciDesktop!.getCommerceBenefits();
    if (ticket === epoch.current) setSnapshot(benefitsValue(result));
  }, []);
  useEffect(() => {
    let current = true;
    void reload().catch(() => { if (current) setError("İndirim ve Puan okunamadı."); });
    return () => { current = false; invalidate(); };
  }, [reload, invalidate]);
  async function toggle(family: BenefitsFamily) {
    if (!snapshot || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      setSnapshot(benefitsValue(await window.yardimciDesktop!.configureCommerceBenefits({ revision: snapshot.revision, families: { ...snapshot.families, [family]: !snapshot.families[family] } })));
      onMessage?.(`${benefitsFamilyLabels[family]} ayarı kaydedildi.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Ayar kaydedilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function changeStatus(rule: BenefitsRule) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { benefitsValue(await window.yardimciDesktop!.saveCommerceBenefitsRule({ ...rule, version: rule.version + 1, status: rule.status === "active" ? "disabled" : "active" })); onMessage?.(rule.status === "active" ? "Kural devre dışı bırakıldı." : "Kural etkinleştirildi."); await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Kural değiştirilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  function refresh() { setError(""); void reload().catch(() => setError("Liste yenilenemedi.")); }
  function saved(message: string) { setSurface(null); onMessage?.(message); void reload().catch(() => setError("Liste yenilenemedi. Yeniden deneyin.")); }
  const rules = snapshot?.rules.filter(rule => rule.family === family && (!status || benefitsRuleStatus(rule) === status) && rule.id.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))) ?? [];
  const usageLabel = family === "payment_modifier" ? "Ödeme avantajı kullanımı" : `${benefitsFamilyLabels[family]} kullanımı`;
  const selected = rules.find(rule => rule.id === selection[family]) ?? rules[0];
  function amount(rule: BenefitsRule) {
    return [rule.percentBps ? `%${rule.percentBps / 100}` : "", rule.fixedMinor ? benefitsMoney(rule.fixedMinor, rule.currency) : ""].filter(Boolean).join(" + ") || benefitsMoney(0, rule.currency);
  }
  function scopeSummary(rule: BenefitsRule) {
    const scope = rule.scope;
    return [scope.productIds.length ? `${scope.productIds.length} ürün` : "", scope.categoryIds.length ? `${scope.categoryIds.length} kategori` : "", scope.customerIds.length ? `${scope.customerIds.length} müşteri` : "", scope.customerGroups.length ? `${scope.customerGroups.length} müşteri grubu` : "", scope.priceGroups.length ? `${scope.priceGroups.length} fiyat grubu` : "", scope.excludedProductIds.length || scope.excludedCategoryIds.length ? "Hariç tutulan kayıtlar var" : ""].filter(Boolean).join(" · ") || "Tüm uygun kayıtlar";
  }
  function period(rule: BenefitsRule) {
    return `${new Date(rule.startsAt).toLocaleDateString("tr-TR")} – ${rule.endsAt === null ? "Süresiz" : new Date(rule.endsAt).toLocaleDateString("tr-TR")}`;
  }
  return <section className="benefits-workspace" aria-label="İndirim ve Puan yönetimi" aria-busy={busy}>
    {error && <div className="action-row"><p role="alert">{error}</p><ActionButton variant="secondary" disabled={busy} onClick={refresh}>Yeniden dene</ActionButton></div>}
    {snapshot ? <>
      {!snapshot.secureOperationsAvailable && <p role="status">Güvenli anahtar saklama kullanılamıyor. Kupon üretimi ve Puan hareketleri kapalı; kurallar kaydedilebilir.</p>}
      <div className="benefits-surface">
      <div className="page-toolbar">
        <FeatureViewSelector label="İndirim ve Puan görünümü" value={view} items={[{ id: "rules", label: "Kurallar" }, { id: "points", label: "Puan Hesapları" }]} onChange={changeView} disabled={busy} />
        <div className="page-toolbar__actions"><ActionButton variant="quiet" disabled={busy} onClick={refresh}>Yenile</ActionButton></div>
      </div>
      <PageWorkSurface mode="fill" aria-label="İndirim ve Puan çalışma yüzeyi">
      <div className="benefits-studio" hidden={view !== "rules"}>
        <Panel as="section" className="benefits-studio__families" aria-label="Kural türleri">
          <h2>Kural türleri</h2><nav aria-label="Kural türleri"><DataList>
          {(Object.keys(benefitsFamilyLabels) as BenefitsFamily[]).map(value => <DataListButton key={value} title={benefitsFamilyLabels[value]} aria-label={benefitsFamilyLabels[value]} selected={family === value} aria-pressed={family === value}
            onClick={() => { setFamily(value); setSearch(""); setStatus(""); }}
            meta={`${snapshot.rules.filter(rule => rule.family === value && benefitsRuleStatus(rule) === "active").length} etkin kural`}
            trailing={<StatusBadge tone={snapshot.families[value] ? "success" : "neutral"}>{snapshot.families[value] ? "Açık" : "Kapalı"}</StatusBadge>} />)}
          </DataList></nav>
        </Panel>
        <Panel as="section" className="benefits-studio__rules" aria-label={`${benefitsFamilyLabels[family]} kuralları`}>
          <header className="benefits-studio__heading"><h2>{benefitsFamilyLabels[family]}</h2><ActionButton disabled={busy} onClick={() => setSurface({ kind: "rule", rule: newBenefitsRule(family), existing: false })}>Yeni kural</ActionButton></header>
          <div className="form-grid form-grid--compact">
            <label className="form-field">Kural ara<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="form-field">Durum filtresi<select aria-label="Durum filtresi" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tümü</option>{Object.entries(benefitsDisplayStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <DataList className="benefits-studio__list">{rules.map(rule => <DataListButton key={rule.id} title={rule.id} selected={selected?.id === rule.id} aria-pressed={selected?.id === rule.id} onClick={() => setSelection(current => ({ ...current, [family]: rule.id }))}
            meta={`${amount(rule)} · ${scopeSummary(rule)}`} description={period(rule)} trailing={<StatusBadge tone={benefitsRuleStatus(rule) === "active" ? "success" : "neutral"}>{benefitsDisplayStatusLabels[benefitsRuleStatus(rule)]}</StatusBadge>} />)}
            {!rules.length && <p>{search || status ? "Eşleşen kural yok." : "Henüz kural yok."}</p>}
          </DataList>
        </Panel>
        <section className="benefits-studio__inspector form-stack" aria-label={`${benefitsFamilyLabels[family]} özeti`}>
          <Panel as="section" className="form-stack" aria-label={usageLabel}><h3>{usageLabel}</h3>
            <div className="action-row"><StatusBadge tone={snapshot.families[family] ? "success" : "neutral"}>{snapshot.families[family] ? "Açık" : "Kapalı"}</StatusBadge></div>
            <small>Kapalıyken bu türdeki kurallar uygulanmaz.</small>
            <ActionButton variant="secondary" disabled={busy} onClick={() => void toggle(family)}>{snapshot.families[family] ? "Kullanımı kapat" : "Kullanımı aç"}</ActionButton>
          </Panel>
          <Panel as="section" className="form-stack" aria-label="Seçili kural"><h3>Seçili kural</h3>
          {selected ? <>
            <h3>{selected.id}</h3><div className="action-row"><StatusBadge tone={benefitsRuleStatus(selected) === "active" ? "success" : "neutral"}>{benefitsDisplayStatusLabels[benefitsRuleStatus(selected)]}</StatusBadge></div>
            <dl className="benefits-studio__summary">
              <dt>{selected.points ? selected.points.operation === "earn" ? "Puan kazandırma" : "Puan kullanma" : "Avantaj"}</dt><dd>{amount(selected)}</dd>
              <dt>Kapsam</dt><dd>{scopeSummary(selected)}</dd><dt>Geçerlilik</dt><dd>{period(selected)}</dd>
              <dt>Kanallar</dt><dd>{[selected.scope.channels.some(channel => channel.startsWith("desktop_")) && "Desktop", selected.scope.channels.includes("web") && "Web", selected.scope.channels.includes("web_dealer") && "Bayi", selected.scope.channels.includes("companion") && "Companion"].filter(Boolean).join(" · ") || "Kanal seçilmedi"}</dd>
              {selected.minSpendMinor > 0 && <><dt>Asgari alışveriş</dt><dd>{benefitsMoney(selected.minSpendMinor, selected.currency)}</dd></>}
              {selected.family === "payment_modifier" && <><dt>Ödeme yöntemleri</dt><dd>{selected.paymentMethodIds.map(method => ({ cash: "Nakit", card: "Kart", bank: "Banka", other: "Diğer" }[method] ?? method)).join(" · ") || "Tümü"}</dd></>}
            </dl>
            <div className="form-stack"><ActionButton variant="secondary" disabled={busy} onClick={() => setSurface({ kind: "rule", rule: selected, existing: true })} aria-label={`${selected.id} düzenle`}>Düzenle</ActionButton>
              <ActionButton variant="quiet" disabled={busy || (selected.status !== "active" && benefitsRuleStatus({ ...selected, status: "active" }) === "expired")} onClick={() => void changeStatus(selected)} aria-label={`${selected.id} ${selected.status === "active" ? "devre dışı bırak" : "etkinleştir"}`}>{selected.status === "active" ? "Devre dışı bırak" : "Etkinleştir"}</ActionButton>
              {family === "coupon" && <ActionButton variant="secondary" disabled={busy || !snapshot.secureOperationsAvailable || !snapshot.families.coupon || benefitsRuleStatus(selected) !== "active"} onClick={() => setSurface({ kind: "coupon", rule: selected })}>Kod oluştur</ActionButton>}
            </div>
          </> : <p>Özeti görmek için bir kural ekleyin veya seçin.</p>}
          </Panel>
        </section>
      </div>
      {pointsVisited && <div className="benefits-points-view" hidden={view !== "points"}><BenefitsPointsEditor active={view === "points"} secure={snapshot.secureOperationsAvailable} pointsEnabled={snapshot.families.points} onSaved={() => onMessage?.("Puan işlemi kaydedildi.")} registerPageLeaveGuard={registerLocalGuard} /></div>}
      </PageWorkSurface>
      </div>
      {surface?.kind === "rule" && <BenefitsRuleEditor initial={surface.rule} existing={surface.existing} onClose={() => setSurface(null)} onSaved={id => { setSelection(current => ({ ...current, [family]: id })); setSearch(""); setStatus(""); saved("Kural kaydedildi."); }} registerPageLeaveGuard={registerLocalGuard} />}
      {surface?.kind === "coupon" && <BenefitsCouponIssuer rule={surface.rule} onClose={() => setSurface(null)} onMessage={message => onMessage?.(message)} />}
    </> : null}
  </section>;
}
