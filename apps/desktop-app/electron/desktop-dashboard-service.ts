import type { DatabaseSync } from "node:sqlite";
import type { DesktopDashboardData } from "./database-types.js";
import { getHospitalityOperations } from "./database/hospitality-operations-store.js";
import {
  getHospitalityNotifications,
  getKbsOverview
} from "./database/hospitality-notification-store.js";
import { getRequests } from "./database/request-store.js";
import { getPreparedWhatsAppMessages } from "./database/prepared-message-store.js";
import { getRooms } from "./database/room-store.js";
import { getTables } from "./database/table-store.js";
import {
  getActiveResourceReservationTitles,
  getReservations
} from "./database/reservation-store.js";
import { getDailyTasks } from "./database/daily-task-store.js";
import { getCustomers } from "./database/customer-store.js";
import { getCustomerRoomStays } from "./database/customer-room-stay-store.js";
import { listPaymentWaitingTableOrders } from "./database/table-order-store.js";
import { getOperationalAttention } from "./database/operational-attention.js";
import { getBirthdayOverview } from "./birthday-service.js";
import { getAndroidDevices } from "./database/android-device-store.js";
import { getAndroidActionFailures } from "./android-action-service.js";
import { getPublishedMenu } from "./database/menu-store.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";

let dashboardRevision = 0;

export function createDesktopDashboardData(
  db: DatabaseSync,
  databasePath: string,
  backupPath: string
): DesktopDashboardData {
  const settings = db
    .prepare("SELECT web_module_url FROM settings LIMIT 1")
    .get() as { web_module_url?: string } | undefined;
  const enabledCapabilities = new Set(readEnabledBusinessCapabilities(db));
  const requests = getRequests(db);
  const preparedWhatsAppMessages = getPreparedWhatsAppMessages(db, requests);
  const rooms = getRooms(
    db,
    getActiveResourceReservationTitles(db, "room")
  );
  const tables = getTables(
    db,
    getActiveResourceReservationTitles(db, "table")
  );
  const menu = getPublishedMenu(db, true);

  return {
    revision: ++dashboardRevision,
    ...getHospitalityOperations(db, rooms, tables, enabledCapabilities),
    databasePath,
    backupPath,
    webModuleUrl:
      settings?.web_module_url
      ?? "",
    requests,
    preparedWhatsAppMessages,
    rooms,
    tables,
    reservations: getReservations(db),
    dailyTasks: getDailyTasks(db),
    customers: getCustomers(db),
    customerRoomStays: getCustomerRoomStays(db),
    hospitalityNotifications: getHospitalityNotifications(db),
    kbsOverview: getKbsOverview(db),
    androidDevices: getAndroidDevices(db, enabledCapabilities),
    paymentWaitingTableOrders: listPaymentWaitingTableOrders(db),
    androidActionFailures: getAndroidActionFailures(db),
    attention: getOperationalAttention(db, enabledCapabilities),
    birthdayOverview: getBirthdayOverview(db),
    summary: {
      newRequests: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM requests WHERE status = 'new' AND deleted_at = ''"
      ),
      waitingRequests: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM requests WHERE status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND deleted_at = ''"
      ),
      pendingDailyTasks: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM daily_tasks WHERE status = 'pending' AND deleted_at = ''"
      ),
      availableRooms: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM rooms WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"
      ),
      totalRooms: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM rooms WHERE is_active = 1 AND deleted_at = ''"
      ),
      availableTables: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM tables WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"
      ),
      pendingReservations: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM reservations WHERE status = 'pending' AND deleted_at = ''"
      ),
      preparedWhatsAppMessages: preparedWhatsAppMessages.length,
      activeMenuCategories: getScalarCount(
        db,
        "SELECT COUNT(*) as count FROM menu_categories WHERE is_active = 1 AND deleted_at = ''"
      ),
      availableMenuItems: getScalarCount(
        db,
        `
          SELECT COUNT(*) as count
          FROM menu_product_entries
          JOIN catalog_products ON catalog_products.id = menu_product_entries.product_id AND catalog_products.is_active = 1 AND catalog_products.deleted_at = ''
          INNER JOIN menu_categories
            ON menu_categories.id = menu_product_entries.category_id
          WHERE menu_product_entries.is_available = 1
            AND menu_product_entries.deleted_at = ''
            AND menu_categories.is_active = 1
            AND menu_categories.deleted_at = ''
        `
      )
    },
    menu
  };
}

function getScalarCount(
  db: DatabaseSync,
  sql: string,
  ...params: Array<string | number | null>
): number {
  const row = db.prepare(sql).get(...params) as
    | { count?: number }
    | undefined;
  return Number(row?.count ?? 0);
}
