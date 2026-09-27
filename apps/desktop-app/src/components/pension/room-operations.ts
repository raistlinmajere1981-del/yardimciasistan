/** Shared by the workspace and the resource card; validation stays in DesktopDatabase. */
export function setRoomOperationalStatus(roomId: string, status: string) {
  return window.yardimciDesktop!.updateRoomStatus({ roomId, status });
}
