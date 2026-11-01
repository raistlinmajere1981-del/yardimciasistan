import { useCallback, useEffect, useRef, useState } from "react";
import type { BenefitsFamily, BenefitsManagementSnapshot, BenefitsRule } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { Panel } from "../ui/Panel";
import { StatusBadge } from "../ui/StatusBadge";
import { BenefitsRuleEditor } from "./BenefitsRuleEditor";
import { BenefitsPointsEditor } from "./BenefitsPointsEditor";
import { BenefitsCouponIssuer } from "./BenefitsCouponIssuer";
import { benefitsFamilyLabels, benefitsStatusLabels, benefitsValue, newBenefitsRule } from "./benefits-model";

type Surface = { kind: "rule"; rule: BenefitsRule; existing: boolean } | { kind: "coupon"; rule: BenefitsRule } | { kind: "points" };
export function CommerceBenefitsWorkspace({ onMessage, registerPageLeaveGuard }: { onMessage?: (message: string) => void; registerPageLeaveGuard?: RegisterPageLeaveGuard }) {
  const [snapshot, setSnapshot] = useState<BenefitsManagementSnapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [surface, setSurface] = useState<Surface | null>(null), epoch = useRef(0), lock = useRef(false);
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
  async function disable(rule: BenefitsRule) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { benefitsValue(await window.yardimciDesktop!.saveCommerceBenefitsRule({ ...rule, version: rule.version + 1, status: "disabled" })); onMessage?.("Kural devre dışı bırakıldı."); await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Kural değiştirilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }
  function saved(message: string) { setSurface(null); onMessage?.(message); void reload().catch(() => setError("Liste yenilenemedi. Yeniden deneyin.")); }
  return <section className="marketing-body form-stack benefits-workspace" aria-label="İndirim ve Puan yönetimi" aria-busy={busy}>
    <div className="marketing-analytics-heading"><p>Kuralları hazırlayın. Hızlı Satış’ta İndirim ve Puan seçerek uygulayın.</p><ActionButton variant="quiet" disabled={busy} onClick={() => { setError(""); void reload().catch(() => setError("Liste yenilenemedi.")); }}>Yenile</ActionButton></div>
    {error && <p role="alert">{error}</p>}
    {snapshot && <>
      {!snapshot.secureOperationsAvailable && <p>Güvenli anahtar saklama kullanılamıyor. Kupon üretimi ve Puan hareketleri kapalı; kurallar kaydedilebilir.</p>}
      <div className="benefits-families">{(Object.keys(benefitsFamilyLabels) as BenefitsFamily[]).map(family => {
        const rules = snapshot.rules.filter(rule => rule.family === family);
        return <Panel as="section" surfaceRole="configuration" className="form-stack" key={family} aria-label={benefitsFamilyLabels[family]}>
          <header className="marketing-analytics-heading"><h3>{benefitsFamilyLabels[family]}</h3><ActionButton size="sm" variant="secondary" role="switch" aria-checked={snapshot.families[family]} aria-label={`${benefitsFamilyLabels[family]} ailesi`} disabled={busy} onClick={() => void toggle(family)}>{snapshot.families[family] ? "Etkin" : "Kapalı"}</ActionButton></header>
          <ActionButton variant="secondary" disabled={busy} onClick={() => setSurface({ kind: "rule", rule: newBenefitsRule(family), existing: false })}>Kural ekle</ActionButton>
          {!rules.length && <p>Henüz kural yok.</p>}
          {rules.map(rule => <div className="record-stack" key={rule.id}><div className="marketing-analytics-heading"><strong>{rule.id}</strong><StatusBadge tone={rule.status === "active" ? "success" : "neutral"}>{benefitsStatusLabels[rule.status]}</StatusBadge></div>
            <small>Sürüm {rule.version}{rule.points && ` · ${rule.points.operation === "earn" ? "Puan kazandırma" : "Puan kullanma"}`}</small>
            <div className="action-row"><ActionButton size="sm" variant="quiet" disabled={busy} onClick={() => setSurface({ kind: "rule", rule, existing: true })} aria-label={`${rule.id} düzenle`}>Düzenle</ActionButton>
              {rule.status !== "disabled" && <ActionButton size="sm" variant="quiet" disabled={busy} onClick={() => void disable(rule)} aria-label={`${rule.id} devre dışı bırak`}>Devre dışı bırak</ActionButton>}
              {family === "coupon" && <ActionButton size="sm" variant="secondary" disabled={busy || !snapshot.secureOperationsAvailable || !snapshot.families.coupon || rule.status !== "active"} onClick={() => setSurface({ kind: "coupon", rule })}>Kod oluştur</ActionButton>}
            </div></div>)}
          {family === "points" && <ActionButton variant="secondary" disabled={busy} onClick={() => setSurface({ kind: "points" })}>Müşteri Puan hesabı</ActionButton>}
        </Panel>;
      })}</div>
      {surface?.kind === "rule" && <BenefitsRuleEditor initial={surface.rule} existing={surface.existing} onClose={() => setSurface(null)} onSaved={() => saved("Kural kaydedildi.")} {...(registerPageLeaveGuard ? { registerPageLeaveGuard } : {})} />}
      {surface?.kind === "points" && <BenefitsPointsEditor secure={snapshot.secureOperationsAvailable} pointsEnabled={snapshot.families.points} onClose={() => setSurface(null)} onSaved={() => saved("Puan işlemi kaydedildi.")} {...(registerPageLeaveGuard ? { registerPageLeaveGuard } : {})} />}
      {surface?.kind === "coupon" && <BenefitsCouponIssuer rule={surface.rule} onClose={() => setSurface(null)} onMessage={message => onMessage?.(message)} />}
    </>}
  </section>;
}
