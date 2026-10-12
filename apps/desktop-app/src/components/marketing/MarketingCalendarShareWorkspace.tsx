import { useCallback, useEffect, useState } from "react";
import type { MarketingScheduleDetail, MarketingShareDetail, MarketingStudioSnapshot, MarketingScheduleSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { ActionButton } from "../ui/ActionButton";
import { MarketingDeliveryWorkspace } from "./MarketingDeliveryWorkspace";
import { MarketingShareWorkspace } from "./MarketingShareWorkspace";
import { resultValue } from "./share-draft";

interface CalendarShareState {
  studio: MarketingStudioSnapshot;
  share: MarketingShareDetail;
  plans: MarketingScheduleSnapshot;
}

/** Main Calendar only selects a schedule; the Marketing share detail owns its display and editing. */
export function MarketingCalendarShareWorkspace({plan, onClose, onReload, onMessage, registerPageLeaveGuard}: {
  plan: MarketingScheduleDetail;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMessage?: (message: string) => void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard;
}) {
  const [state, setState] = useState<CalendarShareState | null>(null);
  const [error, setError] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const load = useCallback(async () => {
    const bridge = window.yardimciDesktop!;
    const [studio, schedules] = await Promise.all([
      bridge.getMarketingStudio().then(resultValue),
      bridge.getMarketingSchedules().then(resultValue)
    ]);
    const target = plan.schedule;
    const publication = studio.publications.find(p => target.targetType === "public_publication" && p.id === target.targetId);
    const campaign = studio.campaigns?.find(c => target.targetType === "audience_campaign" && c.campaign.id === target.targetId);
    const contentId = publication?.contentId || campaign?.campaign.contentId;
    if (!contentId) throw new Error("Bu plana bağlı paylaşım içeriği bulunamadı.");
    const share = resultValue(await bridge.getMarketingShare(contentId));
    // Schedule results requested for the whole timeline, not only this calendar week.
    const plans = schedules.schedules.some(s => s.schedule.id === target.id) ? schedules :
      {...schedules, schedules: [...schedules.schedules, plan]};
    return {studio, share, plans};
  }, [plan]);

  useEffect(() => {
    let live = true;
    void load().then(value => {if (live) {setState(value); setError("");}})
      .catch(e => {if (live) setError(e instanceof Error ? e.message : "Paylaşım detayı açılamadı.");});
    return () => {live = false;};
  }, [load]);

  const reload = useCallback(async () => {
    const value = await load();
    setState(value);
    await onReload();
  }, [load, onReload]);
  const publication = state?.studio.publications.find(p => plan.schedule.targetType === "public_publication" && p.id === plan.schedule.targetId);
  if (deliveryId && state) return <MarketingDeliveryWorkspace id={deliveryId} channels={state.studio.channels}
    onClose={onClose} onReload={reload}/>;
  // Wait for data before mounting the one canonical detail dialog. The former
  // loading WorkspaceFrame opened a modal, closed it, then opened another one.
  if (!state) return error ? <div className="panel" role="alert">
    <p>{error}</p>
    <ActionButton variant="secondary" onClick={onClose}>Kapat</ActionButton>
  </div> : null;

  return <MarketingShareWorkspace key={plan.schedule.id} snapshot={state.studio} initial={state.share}
    {...(publication === undefined ? {} : {publication})}
    schedules={state.plans} initialChannel={plan.schedule.channel} focusScheduleId={plan.schedule.id}
    onClose={onClose} onReload={reload}
    onOpenTarget={target => {if (target.targetType === "audience_campaign") setDeliveryId(target.targetId);}}
    {...(onMessage === undefined ? {} : {onMessage})}
    {...(registerPageLeaveGuard === undefined ? {} : {registerPageLeaveGuard})}/>;
}
