import type { DesktopDashboardData } from "../../../electron/database";
import { RoomResourceCard } from "./RoomResourceCard";
import type { RoomCardCapabilities } from "./room-card-model";

export function RoomsWorkspace({ data, onDashboard, ...capabilities }: RoomCardCapabilities & {
  data: DesktopDashboardData; onDashboard: (data: DesktopDashboardData) => void;
}) {
  const summaries = new Map(data.roomOperations?.map(item => [item.roomId, item]));
  return <section className="resource-grid" aria-label="Oda yönetimi">
    {data.rooms.length === 0 && <p>Oda kaydı yok. Odaları Ayarlar bölümünden ekleyebilirsiniz.</p>}
    {data.rooms.map(room => <RoomResourceCard key={room.id} room={room} summary={summaries.get(room.id)} capabilities={capabilities} onDashboard={onDashboard} />)}
  </section>;
}
