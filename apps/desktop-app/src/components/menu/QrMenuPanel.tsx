import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, QrCode } from "lucide-react";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { QrMenuWorkspace, type OrderRoom, type OrderTable } from "./QrMenuWorkspace";
import { resolveQrMenuPublicUrl } from "./qr-code";


export function QrMenuPanel({ enabled: moduleEnabled, webModuleUrl, onPreview, utilityAction }: {
  enabled: boolean;
  webModuleUrl: string;
  onPreview: () => void;
  utilityAction?: ReactNode;
}) {
  const [webEnabled, setWebEnabled] = useState(true);
  const [ordersEnabled, setOrdersEnabled] = useState(false);
  const [roomOrdersEnabled, setRoomOrdersEnabled] = useState(false);
  const [orderRooms, setOrderRooms] = useState<OrderRoom[]>([]);
  const [orderTables, setOrderTables] = useState<OrderTable[]>([]);
  const [publicationLoading, setPublicationLoading] = useState(true);
  const [publicationSaving, setPublicationSaving] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const url = useMemo(() => resolveQrMenuPublicUrl(webModuleUrl), [webModuleUrl]);
  const visibleOnWeb = moduleEnabled && webEnabled;
  const busy = publicationLoading || publicationSaving;

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getQrMenuWebPublication) {
      setPublicationLoading(false);
      return () => {
        active = false;
      };
    }

    setPublicationError("");
    setPublicationLoading(true);
    void bridge.getQrMenuWebPublication()
      .then((state) => {
        if (!active) return;
        setWebEnabled(state.enabled !== false);
        setOrdersEnabled(state.ordersEnabled === true);
        setOrderTables(state.tables ?? []);
        setRoomOrdersEnabled(state.roomOrdersEnabled === true);
        setOrderRooms(state.rooms ?? []);
      })
      .catch(() => {
        if (!active) return;
        const message = "QR Menü web görünürlüğü okunamadı.";
        setPublicationError(message);
        reportAppStatus("error", message);
      })
      .finally(() => {
        if (active) setPublicationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [moduleEnabled]);

  async function toggle(next: boolean) {
    if (!moduleEnabled || publicationSaving) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.setQrMenuWebPublication) {
      reportAppStatus("error", "QR Menü web görünürlüğü değiştirilemedi.");
      return;
    }

    setPublicationError("");
    setPublicationSaving(true);
    try {
      const result = await bridge.setQrMenuWebPublication(next);
      if (!result.ok) {
        const message = result.message || "QR Menü web görünürlüğü değiştirilemedi.";
        setPublicationError(message);
        reportAppStatus("error", message);
        return;
      }
      setWebEnabled(result.enabled);
      if (!result.enabled) setToolsOpen(false);
      reportAppStatus("success", result.message);
    } catch {
      const message = "QR Menü web görünürlüğü değiştirilemedi.";
      setPublicationError(message);
      reportAppStatus("error", message);
    } finally {
      setPublicationSaving(false);
    }
  }

  async function toggleOrders(next: boolean) {
    if (!visibleOnWeb || busy) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.setQrTableOrdersEnabled) return;
    setPublicationSaving(true);
    try {
      const result = await bridge.setQrTableOrdersEnabled(next);
      if (!result.ok) { reportAppStatus("error", result.message); return; }
      setOrdersEnabled(result.enabled);
      setOrderTables(result.tables);
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Masa siparişi ayarı kaydedilemedi.");
    } finally {
      setPublicationSaving(false);
    }
  }

  async function toggleRoomOrders(next:boolean) {
    if (!visibleOnWeb || busy) return;
    const bridge=window.yardimciDesktop;
    if (!bridge?.setQrRoomOrdersEnabled) return;
    setPublicationSaving(true);
    try {
      const result=await bridge.setQrRoomOrdersEnabled(next);
      if(!result.ok) {reportAppStatus("error",result.message);return;}
      setRoomOrdersEnabled(result.enabled);
      setOrderRooms(result.rooms);
      reportAppStatus("success",result.message);
    }catch {
      reportAppStatus("error","Odaya sipariş ayarı kaydedilemedi.");
    }finally {setPublicationSaving(false);}
  }

  async function openQrTools() {
    if(!visibleOnWeb || !url) return;
    try {
      const state=await window.yardimciDesktop?.getQrMenuWebPublication();
      if (state) {
        setOrderTables(state.tables ?? []);
        setOrderRooms(state.rooms ?? []);
        setOrdersEnabled(state.ordersEnabled);
        setRoomOrdersEnabled(state.roomOrdersEnabled);
      }
    }catch {reportAppStatus("error","Güncel QR kodları okunamadı.");return;}
    setToolsOpen(true);
  }
  const statusText = publicationLoading
    ? "Web durumu okunuyor…"
    : publicationSaving
      ? "Web görünürlüğü güncelleniyor…"
      : publicationError
        ? publicationError
        : !moduleEnabled
          ? "QR Menü modülü Ayarlar'dan kapalı"
          : visibleOnWeb
            ? "Web QR menüsü görünür"
            : "Web QR menüsü gizli · yerel menü açık";

  return <>
    <section
      className={`menu-qr-service${visibleOnWeb ? " is-enabled" : " is-disabled"}${publicationError ? " has-error" : ""}`}
      data-surface-role="integration"
      aria-label="QR Menü"
      aria-busy={busy || undefined}
    >
      <div className="menu-qr-service__header">
        <div className="menu-qr-service__identity">
          <strong>QR Menü</strong>
          <span role={publicationError ? "alert" : "status"}>{statusText}</span>
        </div>
        <div className="menu-qr-service__order-toggles">
          <label className="menu-qr-service__toggle">
            <input type="checkbox" aria-label="Masadan sipariş" checked={visibleOnWeb && ordersEnabled}
              disabled={!visibleOnWeb || busy} onChange={(event) => void toggleOrders(event.target.checked)} />
            <span>Masadan sipariş {ordersEnabled && visibleOnWeb ? "açık" : "kapalı"}</span>
          </label>
          <label className="menu-qr-service__toggle">
            <input type="checkbox" aria-label="Odaya sipariş" checked={visibleOnWeb && roomOrdersEnabled}
              disabled={!visibleOnWeb || busy} onChange={event=>void toggleRoomOrders(event.target.checked)} />
            <span>Odaya sipariş {visibleOnWeb && roomOrdersEnabled ? "açık" : "kapalı"}</span>
          </label>
        </div>
        <div className="menu-qr-service__actions">
          {utilityAction}
          <ActionButton variant="secondary" size="sm" onClick={onPreview}>
            <Eye size={16} aria-hidden="true" /> Önizle
          </ActionButton>
          <ActionButton variant="secondary" size="sm" disabled={!visibleOnWeb || !url} onClick={() => void openQrTools()}>
            <QrCode size={16} aria-hidden="true" /> QR Kod
          </ActionButton>
        </div>
        <label className="menu-qr-service__toggle">
          <input
            aria-label="QR Menü webde aktif"
            type="checkbox"
            checked={visibleOnWeb}
            disabled={!moduleEnabled || busy}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <span>{publicationSaving ? "Güncelleniyor…" : visibleOnWeb ? "Webde aktif" : "Webde pasif"}</span>
        </label>
      </div>
    </section>

    {toolsOpen && visibleOnWeb && <QrMenuWorkspace url={url} roomOrdersEnabled={roomOrdersEnabled}
      ordersEnabled={ordersEnabled} rooms={orderRooms} tables={orderTables} onClose={() => setToolsOpen(false)}
      onRefresh={async () => {
        const fresh = await window.yardimciDesktop?.getQrMenuWebPublication();
        if (!fresh) throw new Error("QR kodları okunamadı.");
        return { rooms: fresh.rooms, tables: fresh.tables };
      }} />}
  </>;
}
