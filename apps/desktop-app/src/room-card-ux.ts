// Oda kartlarının React tarafından oluşturulan DOM ağacını dışarıdan değiştirmiyoruz.
// Görsel sadeleştirme yalnız CSS ile uygulanır; böylece sayfa geçişleri React ağacıyla çakışmaz.
export function installRoomCardUx() {
  return () => undefined;
}
