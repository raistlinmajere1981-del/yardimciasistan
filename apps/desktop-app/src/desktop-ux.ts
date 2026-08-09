import { installCashPageUx } from "./cash-page-ux";
import { installCustomerWorkEnhancements } from "./customer-work-enhancements";
import { installMenuEditorUx } from "./menu-editor-ux";
import { installRoomManagementUx } from "./room-management-ux";

type Cleanup = () => void;

/**
 * React dışında kalan geçici UX uyumluluk katmanlarını tek noktadan yönetir.
 *
 * Yeni özellikler mümkün olduğunca React bileşenlerinin içinde uygulanmalıdır.
 * Buradaki katman yalnız eski ekranları güvenli biçimde kademeli olarak taşımak
 * için tutulur ve her kurulum temizlenebilir bir yaşam döngüsüne sahiptir.
 */
export function installDesktopUxEnhancements(): Cleanup {
  const cleanups: Cleanup[] = [
    installCashPageUx(),
    installCustomerWorkEnhancements(),
    installMenuEditorUx(),
    installRoomManagementUx()
  ];

  return () => {
    for (const cleanup of [...cleanups].reverse()) {
      cleanup();
    }
  };
}
