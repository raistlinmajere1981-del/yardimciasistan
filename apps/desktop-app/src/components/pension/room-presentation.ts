import type { RoomStateProjection } from "@yardimci-asistan/shared";

export const roomConditionLabel: Record<RoomStateProjection["operationalCondition"], string> = {
  ready: "Hazır", cleaning: "Temizlik bekliyor", maintenance: "Bakımda", out_of_service: "Hizmet dışı"
};
export function roomToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
