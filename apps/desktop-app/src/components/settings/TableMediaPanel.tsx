import type { PublicResourceMediaKind, TableMediaAsset } from "@yardimci-asistan/shared";
import {
  PublicResourceMediaPanel,
  type PublicResourceMediaPanelResource
} from "./PublicResourceMediaPanel";

interface TableMediaPanelTable {
  id: string;
  key: string;
  name: string;
  area: string;
}

interface TableMediaPanelProps {
  table: TableMediaPanelTable | null;
  tables: TableMediaPanelTable[];
  disabled?: boolean;
  revision: number;
  onTableChange: (key: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

function tableLabel(table: TableMediaPanelTable) {
  return table.area ? `${table.name} · ${table.area}` : table.name || "Masa";
}

function toResource(table: TableMediaPanelTable): PublicResourceMediaPanelResource {
  return { id: table.id, key: table.key, label: tableLabel(table) };
}

export function TableMediaPanel({
  table,
  tables,
  disabled = false,
  revision,
  onTableChange,
  onDirtyChange
}: TableMediaPanelProps) {
  return (
    <PublicResourceMediaPanel
      title="Masa Medyaları"
      subtitle="Web sitesi için görsel ve videolar"
      resourceLabel="Masa"
      ariaLabel="Masa medyaları"
      emptyHint="Seçili masaya ilk fotoğrafı veya görünümü ekleyin."
      resource={table ? toResource(table) : null}
      resources={tables.map(toResource)}
      disabled={disabled}
      revision={revision}
      onResourceChange={onTableChange}
      onDirtyChange={onDirtyChange}
      listMedia={async (tableId) => window.yardimciDesktop?.listTableMedia(tableId) ?? []}
      addMedia={async (tableId) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.addTableMedia({ tableId });
      }}
      updateMedia={async (tableId, item, kind: PublicResourceMediaKind) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.updateTableMedia({
          tableId,
          mediaId: item.id,
          kind,
          title: item.title
        });
      }}
      deleteMedia={async (tableId, item) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.deleteTableMedia({ tableId, mediaId: item.id });
      }}
    />
  );
}

function unavailable(media: TableMediaAsset[]) {
  return { ok: false, message: "Masa medyası bu ortamda kullanılamıyor.", media, dirty: false };
}
