import { useState } from "react";
import { createRoot } from "react-dom/client";
import { IdentityCameraCapture } from "../../apps/desktop-app/src/components/customers/IdentityCameraCapture";
import "../../apps/desktop-app/src/styles/index.css";

type Response = { ok: boolean; message: string; code?: string };
type Control = typeof window & {
  __identityResponses: Response[];
  __identityCalls: Array<{ names: string[]; sizes: number[] }>;
  __identityClosures: number;
};
const control = window as Control;
control.__identityResponses = [];
control.__identityCalls = [];
control.__identityClosures = 0;

function Harness() {
  const [open, setOpen] = useState(false);
  const [both, setBoth] = useState(true);
  return <main style={{ padding: 24 }}>
    <label>Müşteri notu<input aria-label="Müşteri notu" defaultValue="Önceden girilen bilgi" /></label>
    <label><input type="checkbox" aria-label="Ön/arka" checked={both} onChange={event => setBoth(event.target.checked)} />Ön/arka</label>
    <button type="button" onClick={() => setOpen(true)}>Taramayı başlat</button>
    {open && <IdentityCameraCapture captureBackSide={both} onClose={() => { control.__identityClosures++; setOpen(false); }}
      onCaptured={async files => {
        control.__identityCalls.push({ names: files.map(file => file.name), sizes: files.map(file => file.size) });
        return control.__identityResponses.shift() ?? { ok: false, code: "analysis_failed", message: "Yanıt verilmedi." };
      }} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
