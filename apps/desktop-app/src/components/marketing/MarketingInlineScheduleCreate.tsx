import { useEffect } from "react";
import type { MarketingChannelRegistry, MarketingScheduleInput } from "@yardimci-asistan/shared";
import { MarketingScheduleActions, MarketingScheduleWorkspace } from "./MarketingScheduleWorkspace";
import { useMarketingScheduleController } from "./useMarketingScheduleController";

/** Create a campaign plan inside the canonical share detail, never in a separate dialog. */
export function MarketingInlineScheduleCreate({initial, channels, blocked, onReload, onBusy, onDirty}: {
  initial: MarketingScheduleInput;
  channels: MarketingChannelRegistry;
  blocked: boolean;
  onReload: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean, discard: () => void, id: string) => void;
}) {
  const {draft, setDraft, dirty, busy, message, operation, transition, discard} =
    useMarketingScheduleController({initial, onReload, onBusy});
  const available = channels.some(channel => channel.id === draft.channel && channel.enabled && channel.configured);
  useEffect(() => {onDirty(dirty, discard, `new-plan:${initial.targetId}`);},
    [dirty, discard, onDirty, initial.targetId]);
  return <section className="form-stack" aria-label="Yeni yayın planı" aria-busy={busy}>
    <MarketingScheduleWorkspace draft={draft} onChange={setDraft} channels={channels} busy={busy || blocked}/>
    {!available && <p role="status">Bu kanal yapılandırılmadan plan oluşturulamaz.</p>}
    {message && <p role="status">{message}</p>}
    <MarketingScheduleActions draft={draft} editing available={available} busy={busy || blocked}
      onSave={() => void operation()} onTransition={transition}/>
  </section>;
}
