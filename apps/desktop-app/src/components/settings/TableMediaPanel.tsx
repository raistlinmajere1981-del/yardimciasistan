import type {
  PublicResourceMediaAssetFields,
  PublicResourceMediaKind,
  TableMediaAsset
} from "@yardimci-asistan/shared";
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
  embedded?: boolean;
  disabled?: boolean;
  revision: number;
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
  embedded = false,
  disabled = false,
  revision,
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
      showResourcePicker={false}
      embedded={embedded}
      disabled={disabled}
      revision={revision}
      onDirtyChange={onDirtyChange}
      listMedia={listTableMedia}
      addMedia={addTableMedia}
      updateMedia={updateTableMedia}
      deleteMedia={deleteTableMedia}
    />
  );
}

function unavailable(media: TableMediaAsset[]) {
  return { ok: false, message: "Masa medyası bu ortamda kullanılamıyor.", media, dirty: false };
}


async function listTableMedia(tableId: string) {
  return window.yardimciDesktop?.listTableMedia(tableId) ?? [];
}

async function addTableMedia(tableId: string) {
  const bridge = window.yardimciDesktop;
  if (!bridge) return unavailable([]);
  return bridge.addTableMedia({ tableId });
}

async function updateTableMedia(tableId: string, item: PublicResourceMediaAssetFields, kind: PublicResourceMediaKind) {
  const bridge = window.yardimciDesktop;
  if (!bridge) return unavailable([]);
  return bridge.updateTableMedia({ tableId, mediaId: item.id, kind, title: item.title });
}

async function deleteTableMedia(tableId: string, item: PublicResourceMediaAssetFields) {
  const bridge = window.yardimciDesktop;
  if (!bridge) return unavailable([]);
  return bridge.deleteTableMedia({ tableId, mediaId: item.id });
}
