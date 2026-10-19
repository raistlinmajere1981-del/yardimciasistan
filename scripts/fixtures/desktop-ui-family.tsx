import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";
import { ActionButton } from "../../apps/desktop-app/src/components/ui/ActionButton";
import { IconButton } from "../../apps/desktop-app/src/components/ui/IconButton";
import { DatePicker, TimePicker } from "../../apps/desktop-app/src/components/ui/DateTimePicker";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import { MediaPreview } from "../../apps/desktop-app/src/components/ui/MediaPreview";
import { MarketingMediaGallery } from "../../apps/desktop-app/src/components/marketing/MarketingMediaGallery";
import type { MarketingAssetView } from "@yardimci-asistan/shared";
import { applyUiPreferences, DEFAULT_UI_PREFERENCES } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="teal"/></svg>');
const assets = ["a", "b"].map(id => ({ id, previewUrl: image, altText: id, source: "upload", width: 160, height: 80, archivedAt: "" })) as MarketingAssetView[];
const testWindow = window as unknown as { appearance: (scheme: "light" | "dark", density: "comfortable" | "compact", scale: number) => void };
testWindow.appearance = (scheme, density, scale) => applyUiPreferences({ ...DEFAULT_UI_PREFERENCES, scheme, density, scale, motion: "reduced" });

function Fixture() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("2026-10-18");
  const [time, setTime] = useState("09:15");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState(["a", "b"]);
  const [removed, setRemoved] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  return <main>
    <ActionButton ref={trigger} onClick={() => setOpen(true)}>Formu aç</ActionButton>
    {open && <FormDialog title="UI ailesi" returnFocusRef={trigger} onClose={() => setOpen(false)}
      onSubmit={e => e.preventDefault()} footer={<ActionButton variant="secondary" onClick={() => setOpen(false)}>Tamam</ActionButton>}>
      <div className="form-stack">
        <label className="form-field">Tarih<DatePicker ariaLabel="Tarih" value={date} min="2026-10-17" max="2026-10-20" onChange={setDate}
          presets={[{label:"Yarın",value:"2026-10-19"},{label:"Sınır dışında",value:"2026-10-21"}]} /></label>
        <label className="form-field">Saat<TimePicker ariaLabel="Saat" value={time} onChange={setTime} /></label>
        <output aria-label="Seçilen zaman">{date} {time}</output>
        <ActionButton variant="secondary" onClick={() => setBusy(v => !v)}>Meşgul durumunu değiştir</ActionButton>
        <IconButton aria-label="Örneği kaldır" busy={busy} onClick={() => setRemoved(v => v+1)}><Trash2 size={16} /></IconButton>
        <output aria-label="Kaldırma sayısı">{removed}</output>
        <MediaPreview className="settings-gallery-preview" src={image} alt="Oran örneği" />
        <MediaPreview className="room-media-card-preview" alt="" fit="cover" surface="surface">Önizleme yok</MediaPreview>
        <MarketingMediaGallery assets={assets} selected={selection} onChange={setSelection} maxImages={2} />
        <output aria-label="Görsel sırası">{selection.join(",")}</output>
      </div>
    </FormDialog>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
