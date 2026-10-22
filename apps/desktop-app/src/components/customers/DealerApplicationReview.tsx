import { useState } from "react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import { ActionButton } from "../ui/ActionButton";
import { DealerWebAccessPanel } from "./DealerWebAccessPanel";
import { RequestDocuments } from "./RequestDocuments";
export type ApproveDealerApplication = (id: string, priceGroup: string) => Promise<{ ok: boolean; message: string; customerId?: string }>;
export function DealerApplicationReview({ request, onApprove }: { request: SyncedCustomerRequest; onApprove?: ApproveDealerApplication | undefined }) {
  const [priceGroup, setPriceGroup] = useState("");
  const [customerId, setCustomerId] = useState(request.dealer_customer_id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const data = request.dealer_application;
  async function approve() {
    setBusy(true); setMessage("");
    try {
      const result = await (onApprove ?? window.yardimciDesktop!.approveDealerApplication)(request.id, priceGroup);
      setMessage(result.message); if (result.ok && result.customerId) setCustomerId(result.customerId);
    } catch { setMessage("Başvuru onaylanamadı. Yeniden deneyin."); }
    finally { setBusy(false); }
  }
  return <section className="form-stack" aria-label="Bayi başvurusu">
    <dl className="data-list request-meta-grid">
      <div><dt>Firma / unvan</dt><dd>{data?.company_name}</dd></div>
      <div><dt>Yetkili</dt><dd>{data?.authorized_person}</dd></div>
      <div><dt>E-posta</dt><dd>{data?.email}</dd></div>
      <div><dt>Vergi dairesi</dt><dd>{data?.tax_office || "—"}</dd></div>
      <div><dt>Vergi numarası</dt><dd>{data?.tax_number || "—"}</dd></div>
    </dl>
    <RequestDocuments requestId={request.id} documents={request.documents} />
    {!customerId && !["rejected", "cancelled", "archived"].includes(request.status) && <div className="form-stack">
      <label className="form-field"><span>Fiyat grubu</span><select aria-label="Fiyat grubu" value={priceGroup} disabled={busy} onChange={event => setPriceGroup(event.target.value)}>
        <option value="">Seçin</option><option value="retail">Perakende</option><option value="dealer_a">Bayi A</option><option value="dealer_b">Bayi B</option>
      </select></label><ActionButton disabled={busy || !priceGroup} onClick={() => void approve()}>Onayla ve Bayi Oluştur</ActionButton>
    </div>}
    {message && <p role="status">{message}</p>}
    {customerId && <DealerWebAccessPanel customerId={customerId} disabled={busy} />}
  </section>;
}
