import type { DesktopDashboardData } from "../../../electron/database";
import { RoomResourceCard } from "./RoomResourceCard";
import { getRoomCardModel, type RoomCardCapabilities } from "./room-card-model";
import { usePensionPage } from "./pension-page-state";
import { roomToday } from "./room-presentation";
import { ChoiceChips } from "../ui/ChoiceChips";
import { ActionButton } from "../ui/ActionButton";
import { useResourceCoverPreviews } from "../operations/use-resource-cover-previews";

const roomFilterOptions = [
  { id: "all", label: "Tümü" },
  { id: "occupied", label: "Dolu" },
  { id: "empty", label: "Boş" },
  { id: "cleaning", label: "Temizlik" },
  { id: "maintenance", label: "Bakımda" }
];

function getRoomBrowserState(data: DesktopDashboardData, capabilities: RoomCardCapabilities, floor: string) {
  const summaries = new Map(data.roomOperations?.map(item => [item.roomId, item]));
  const today = roomToday();
  const rooms = data.rooms.filter(room => floor === "all" || room.floor.trim() === floor).map(room => {
    const summary = summaries.get(room.id);
    const model = getRoomCardModel(room, summary, capabilities, today);
    const occupied = model.current.length > 0 || room.status === "occupied";
    return {
      room,
      matches: (value: string) => value === "all"
        || (value === "occupied" && occupied)
        || (value === "empty" && Boolean(summary) && !occupied)
        || (value === "cleaning" && model.physical === "cleaning")
        || (value === "maintenance" && model.physical === "maintenance")
    };
  });
  return { summaries, rooms };
}

export function RoomCategoryControl({ data }: {
  data: DesktopDashboardData;
}) {
  const page = usePensionPage();
  if (!page) return null;

  const floor = page.filters.roomFloor ?? "all";
  const floors = [...new Set(data.rooms.map(room => room.floor.trim()).filter(Boolean))];

  return <select
    className="hospitality-resource-title-select"
    aria-label="Kat"
    value={floor}
    onChange={event => page.setFilters(current => ({ ...current, roomFloor: event.target.value }))}
  >
    <option value="all">Tüm Kategoriler</option>
    {floors.map(name => <option key={name} value={name}>{name}</option>)}
  </select>;
}

export function RoomFiltersToolbar({ data, ...capabilities }: RoomCardCapabilities & {
  data: DesktopDashboardData;
}) {
  const page = usePensionPage();
  if (!page) return null;

  const floor = page.filters.roomFloor ?? "all";
  const filter = page.filters.roomFilter ?? "all";
  const { rooms } = getRoomBrowserState(data, capabilities, floor);

  return <div className="hospitality-resource-toolbar" aria-label="Oda filtreleri">
    <ChoiceChips
      ariaLabel="Oda filtresi"
      value={filter}
      onChange={roomFilter => page.setFilters(current => ({ ...current, roomFilter }))}
      options={roomFilterOptions.map(option => ({
        ...option,
        label: `${option.label} (${rooms.filter(item => item.matches(option.id)).length})`
      }))}
    />
  </div>;
}

export function RoomsWorkspace({ data, onDashboard, ...capabilities }: RoomCardCapabilities & {
  data: DesktopDashboardData; onDashboard: (data: DesktopDashboardData) => void;
}) {
  const page = usePensionPage();
  const floor = page?.filters.roomFloor ?? "all";
  const filter = page?.filters.roomFilter ?? "all";
  const { summaries, rooms } = getRoomBrowserState(data, capabilities, floor);
  const coverPreviews = useResourceCoverPreviews("room", data.revision);
  const visible = rooms.filter(item => item.matches(filter));

  return <div className="rooms-browser">
    <section className="resource-grid" aria-label="Oda yönetimi">
      {data.rooms.length === 0 && <p>Oda kaydı yok. Odaları Ayarlar bölümünden ekleyebilirsiniz.</p>}
      {visible.map(({ room }) => <RoomResourceCard key={room.id} room={room} summary={summaries.get(room.id)}
        capabilities={capabilities} onDashboard={onDashboard} imageSrc={coverPreviews[room.id]} />)}
    </section>
    {data.rooms.length > 0 && visible.length === 0 && <div className="form-stack" role="status"><p>Bu filtrelere uyan oda yok.</p>
      {page && <ActionButton variant="secondary" onClick={() => page.setFilters(current => ({ ...current, roomFloor: "all", roomFilter: "all" }))}>Oda Filtrelerini Temizle</ActionButton>}
    </div>}
  </div>;
}
