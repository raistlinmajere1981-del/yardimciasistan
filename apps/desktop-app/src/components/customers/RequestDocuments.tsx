import { useState } from "react";
import type { RequestDocument } from "@yardimci-asistan/shared";
import { MediaPreview } from "../ui/MediaPreview";
import { ActionButton } from "../ui/ActionButton";
const labels = { tax_certificate: "Vergi levhası", activity_certificate: "Faaliyet belgesi", authorization: "Yetki belgesi", other: "Diğer belge" };

export function RequestDocuments({ requestId, documents = [] }: { requestId: string; documents?: RequestDocument[] | undefined }) {
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!documents.length) return null;
  async function show(doc: RequestDocument, action: "open" | "download" | "preview") {
    setBusy(true); setMessage("");
    try { const result = await window.yardimciDesktop!.requestDocument(requestId, doc.id, action); if (action === "preview") setPreview(result); }
    catch { setMessage("Belge açılamadı. Dosyanın eşitlenmesini bekleyip yeniden deneyin."); }
    finally { setBusy(false); }
  }
  return <section className="form-stack" aria-label="Başvuru belgeleri"><h3>Belgeler</h3>
    {documents.map(doc => <div className="form-stack" key={doc.id}><span>{labels[doc.kind]} · {doc.name} · {(doc.size / 1024 / 1024).toFixed(1)} MB</span>
      <div className="action-row"><ActionButton variant="secondary" disabled={busy} onClick={() => void show(doc, doc.mime === "application/pdf" ? "open" : "preview")}>{doc.mime === "application/pdf" ? "PDF aç" : "Görseli önizle"}</ActionButton>
        <ActionButton variant="secondary" disabled={busy} onClick={() => void show(doc, "download")}>İndir</ActionButton></div>
    </div>)}
    {preview && <div className="form-stack"><MediaPreview src={preview} alt="Başvuru belgesi önizlemesi" /><ActionButton variant="secondary" onClick={() => setPreview("")}>Önizlemeyi kapat</ActionButton></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
