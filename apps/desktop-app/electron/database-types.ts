import type {
  OnlineSalesDeliverySettings,
  BirthdaySettings,
  CustomerGender,
  CustomerIdentityType,
  IdentityImageAnalysis,
  MenuStockUnit,
  StockImageAnalysis,
  StockImageApplyLine,
  StockImageImportSource,
  ProductDataProviderId,
  BusinessCapability,
  CustomerCommercialProfile,
  SaveCustomerCommercialProfileInput
} from "@yardimci-asistan/shared";
import type {
  AndroidDeviceRole,
  AndroidPermission,
  AndroidPermissionGroups,
  PublishedQrMenu,
  PushAiSettingsResult,
  PushBusinessContextResult,
  SyncedCustomerRequest
} from "@yardimci-asistan/sync-core";
import type { DesktopBirthdayOverview } from "./birthday-service.js";

export interface DesktopDatabaseOptions {
  appPath: string;
  userDataPath: string;
  dataRoot?: string;
  backupPath?: string;
}

interface DashboardSummary {
  newRequests: number;
  waitingRequests: number;
  pendingDailyTasks: number;
  availableRooms: number;
  totalRooms: number;
  availableTables: number;
  pendingReservations: number;
  preparedWhatsAppMessages: number;
  activeMenuCategories: number;
  availableMenuItems: number;
}

export interface DesktopRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  status: string;
  features: string[];
  description: string;
  priceNote: string;
  isActive: boolean;
  sortOrder: number;
  activeReservationTitle: string;
  updatedAt: string;
}

export interface DesktopTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  status: string;
  currentCustomerId: string;
  currentReservationId: string;
  activeReservationTitle: string;
  notes: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface DesktopTableCategory {
  name: string;
  tableCount: number;
}

export interface DesktopReservation {
  id: string;
  requestId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  reservationType: string;
  status: string;
  title: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: number;
  adultCount: number;
  childCount: number;
  roomIds: string[];
  tableIds: string[];
  notes: string;
  priceNote: string;
  paymentStatus: string;
  updatedAt: string;
}

export interface DesktopDailyTask {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  dueDate: string;
  dueTime: string;
  relatedType: string;
  relatedId: string;
  updatedAt: string;
}

export interface DesktopCustomer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
  lastContactAt: string;
  identityType: CustomerIdentityType;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  birthdayMessageEnabled: boolean;
  gender: CustomerGender;
  documentSerialNumber: string;
  documentExpiryDate: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
  commercialProfile: CustomerCommercialProfile | null;
  requestCount: number;
  reservationCount: number;
  stayCount: number;
  updatedAt: string;
}

type DesktopHospitalityNotificationKind = "arrival" | "departure" | "room_change";
type DesktopHospitalityNotificationStatus = "pending" | "sent" | "failed" | "submission_unknown";
type DesktopKbsProvider = "egm" | "jandarma";

export interface DesktopHospitalityNotification {
  id: string;
  guestId: string;
  stayId: string;
  customerId: string;
  customerName: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  kind: DesktopHospitalityNotificationKind;
  status: DesktopHospitalityNotificationStatus;
  provider: DesktopKbsProvider | "";
  providerReference: string;
  occurredAt: string;
  sentAt: string;
  createdAt: string;
  guestStatus: "planned" | "checked_in" | "checked_out" | "cancelled";
  stayStatus: string;
  checkInDate: string;
  checkOutDate: string;
  identityReady: boolean;
}

export interface DesktopKbsOverview {
  enabled: boolean;
  configured: boolean;
  provider: DesktopKbsProvider;
  pendingCount: number;
  failedCount: number;
  submissionUnknownCount: number;
  sentCount: number;
  checkedInGuestCount: number;
  activeUnsentCount: number;
  activeMissingIdentityCount: number;
}

export type DesktopKbsDeliveryMutationResult =
  | {
      ok: true;
      state: "sent" | "already_sent";
      message: string;
      provider: DesktopKbsProvider;
      providerReference: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      state: "waiting" | "interaction_required" | "failed" | "submission_unknown";
      message: string;
      provider: DesktopKbsProvider;
      retryable: boolean;
      code?: string;
      dashboardData: DesktopDashboardData;
    };

export interface DesktopCustomerRoomStay {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  reservationId: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  notes: string;
  source: string;
  checkedInAt: string;
  checkedOutAt: string;
  createdAt: string;
  updatedAt: string;
  guests: DesktopStayGuest[];
  pendingNotificationCount: number;
}

interface DesktopStayGuest {
  id: string;
  customerId: string;
  customerName: string;
  status: "planned" | "checked_in" | "checked_out" | "cancelled";
  checkedInAt: string;
  checkedOutAt: string;
  identityReady: boolean;
}

export interface StayGuestInput { stayId: string; customerId: string }
export interface CheckoutStayGuestInput extends StayGuestInput { nextPrimaryCustomerId?: string }
export interface MoveStayRoomInput { stayId: string; roomId: string }

export interface DesktopPreparedMessage {
  id: string;
  requestId: string;
  customerName: string;
  customerPhone: string;
  message: string;
  status: string;
  updatedAt: string;
}

export interface DesktopAndroidDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  role: AndroidDeviceRole;
  isActive: boolean;
  permissionGroups: AndroidPermissionGroups;
  permissions: AndroidPermission[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string;
}

export interface DesktopAndroidActionFailure {
  id: string;
  actionType: string;
  deviceId: string;
  message: string;
  targetPage: "dashboard" | "customerWork" | "pension" | "restaurant" | "settings";
  relatedId: string;
  createdAt: string;
}

export interface DesktopAndroidPermissionGroupsUpdate {
  deviceId: string;
  groups: AndroidPermissionGroups;
}

export type DesktopAndroidDeviceMutationResult =
  | { ok: true; message: string; devices: DesktopAndroidDevice[] }
  | { ok: false; message: string; devices: DesktopAndroidDevice[] };

export interface DesktopDashboardData {
  /** Monotonic across facade instances in the main process. */
  revision: number;
  roomOperations: DesktopRoomOperations[] | null;
  tableOperations: DesktopTableOperations[] | null;
  databasePath: string;
  backupPath: string;
  webModuleUrl: string;
  requests: SyncedCustomerRequest[];
  preparedWhatsAppMessages: DesktopPreparedMessage[];
  rooms: DesktopRoom[];
  tables: DesktopTable[];
  reservations: DesktopReservation[];
  dailyTasks: DesktopDailyTask[];
  customers: DesktopCustomer[];
  customerRoomStays: DesktopCustomerRoomStay[];
  hospitalityNotifications: DesktopHospitalityNotification[];
  kbsOverview: DesktopKbsOverview;
  androidDevices: DesktopAndroidDevice[];
  paymentWaitingTableOrders: DesktopPaymentWaitingTableOrder[];
  androidActionFailures: DesktopAndroidActionFailure[];
  menu: PublishedQrMenu;
  summary: DashboardSummary;
  attention: DesktopOperationalAttention;
  birthdayOverview: DesktopBirthdayOverview;
}

export interface DesktopRoomAccountSummary {
  folioId: string;
  stayId: string;
  stayStatus: string;
  customerName: string;
  remainingMinor: number;
  currency: string;
}

export interface DesktopRoomOperations {
  roomId: string;
  /** All active stays, independent of the recent-history limit. */
  stays: DesktopCustomerRoomStay[];
  reservations: DesktopReservation[];
  accounts: DesktopRoomAccountSummary[];
}

export interface DesktopTableOperations {
  tableId: string;
  order: Pick<DesktopTableOrder, "id" | "status" | "itemCount" | "total" | "openedAt" | "updatedAt"> & { currency: string } | null;
  reservations: DesktopReservation[];
}

export type DesktopReportPreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export interface DesktopReportRangeInput {
  preset: DesktopReportPreset;
  label: string;
  startDate: string;
  endDate: string;
}

export interface DesktopReportPeriod {
  preset: DesktopReportPreset;
  label: string;
  startDate: string;
  endDate: string;
}

interface DesktopReportTopItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface DesktopReportDailyRevenue {
  date: string;
  revenue: number;
  closedOrders: number;
}

interface DesktopReportStockConsumption {
  productId: string;
  name: string;
  quantity: number;
  unit: MenuStockUnit;
}

export interface DesktopReportStockMovement {
  id: string;
  productId: string;
  itemName: string;
  type: import("@yardimci-asistan/shared").InventoryMovementType;
  quantityChange: number;
  quantityAfter: number;
  unit: MenuStockUnit;
  sourceType: string;
  sourceLabel: string;
  note: string;
  createdAt: string;
}

type DesktopReportAttentionKind =
  | "pending_request"
  | "pending_reservation"
  | "payment_waiting"
  | "overdue_task"
  | "open_task"
  | "out_of_stock"
  | "low_stock";

export interface DesktopReportAttentionItem {
  kind: DesktopReportAttentionKind;
  title: string;
  detail: string;
}

interface DesktopOperationalAttention {
  pendingRequests: number;
  pendingReservations: number;
  paymentWaitingTables: number;
  overdueTasks: number;
  incompleteTasks: number;
  outOfStockItems: number;
  lowStockItems: number;
  totalCount: number;
  items: DesktopReportAttentionItem[];
}

export interface DesktopReportData {
  period: DesktopReportPeriod;
  generatedAt: string;
  summary: {
    restaurantRevenue: number;
    closedOrders: number;
    averageOrder: number;
    approvedReservations: number;
    approvedAccommodationReservations: number;
    approvedFoodReservations: number;
    approvedMixedReservations: number;
    approvedGenericReservations: number;
    newRequests: number;
    pendingTasks: number;
  };
  restaurant: {
    revenue: number;
    closedOrders: number;
    averageOrder: number;
    soldItemCount: number;
    cancelledOrders: number;
    dailyRevenue: DesktopReportDailyRevenue[];
    topItems: DesktopReportTopItem[];
  };
  pensionAndRequests: {
    incomingReservations: number;
    approvedReservations: number;
    pendingReservations: number;
    cancelledOrRejectedReservations: number;
    accommodationNights: number;
    newRequests: number;
    answeredRequests: number;
    waitingRequests: number;
  };
  stock: {
    topConsumed: DesktopReportStockConsumption[];
    manualMovementCount: number;
    imageMovementCount: number;
    manualMovements: DesktopReportStockMovement[];
    imageMovements: DesktopReportStockMovement[];
    recentMovements: DesktopReportStockMovement[];
  };
  attention: DesktopOperationalAttention;
}

export type DesktopReportQueryResult =
  | { ok: true; data: DesktopReportData }
  | { ok: false; message: string };

export type DesktopReportAiMode = "summary" | "sales" | "recommendations";

export interface GenerateDesktopReportAiInput {
  mode: DesktopReportAiMode;
  range: DesktopReportRangeInput;
}

export type GenerateDesktopReportAiResult =
  | { ok: true; content: string }
  | { ok: false; message: string };

export type DesktopAiService = "openai" | "openrouter" | "groq" | "gemini" | "cloudflare" | "custom";

export interface DesktopAiModelOption {
  id: string;
  label: string;
}

export interface DesktopAiServiceProfile {
  service: DesktopAiService;
  projectName: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
  imageModel?: string;
  sttModel?: string;
  modelOptions: DesktopAiModelOption[];
  timeoutSeconds: number;
  apiKeyConfigured: boolean;
  updatedAt: string;
}

export interface SaveAiServiceProfileInput {
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
  imageModel?: string;
  sttModel?: string;
  modelOptions?: DesktopAiModelOption[];
  timeoutSeconds: number;
  apiKey: string;
  clearApiKey: boolean;
}

export interface AiApiKeyWrite {
  mode: "keep" | "replace" | "clear";
  encryptedValue?: string;
}

interface DesktopProductDataSettings {
  enabled: boolean;
  provider: ProductDataProviderId;
  autoSearchUnknownBarcode: boolean;
  includeImages: boolean;
}

export interface DesktopSetupData {
  setupRequired: boolean;
  appPasswordConfigured: boolean;
  businessName: string;
  profileId: string;
  profileOptions: BusinessCapability[];
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled: boolean;
  localNetworkEnabled?: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: DesktopAiService;
  aiProjectName: string;
  aiModel: string;
  aiVisionModel?: string;
  aiImageModel?: string;
  aiSttModel?: string;
  aiBaseUrl: string;
  aiTimeoutSeconds: number;
  aiApiKeyConfigured: boolean;
  aiLastPublishedAt: string;
  aiProfiles: DesktopAiServiceProfile[];
  productData: DesktopProductDataSettings;
  sms: import("@yardimci-asistan/shared").SmsConfiguration;
  instagram: import("@yardimci-asistan/shared").InstagramConfiguration;
  whatsappCloud: import("@yardimci-asistan/shared").WhatsAppCloudConfiguration;
  arasShipping: import("@yardimci-asistan/shared").ArasShippingConfiguration;
  dealerPortalEnabled: boolean;
  onlineSalesDelivery: OnlineSalesDeliverySettings;
  onlineSalesDeliveryEnabled?: boolean;
  servicePreferences: {
    whatsapp: boolean;
    android: boolean;
  };
  birthdaySettings: BirthdaySettings;
}

export interface SaveInitialSetupInput {
  businessName: string;
  profileId: string;
  profileOptions?: BusinessCapability[];
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  autoSyncEnabled?: boolean;
  localNetworkEnabled?: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: string;
  aiProjectName: string;
  aiModel: string;
  aiVisionModel?: string;
  aiImageModel?: string;
  aiSttModel?: string;
  aiModelOptions?: DesktopAiModelOption[];
  aiBaseUrl: string;
  aiTimeoutSeconds: number;
  aiApiKey: string;
  clearAiApiKey: boolean;
  aiProfiles?: SaveAiServiceProfileInput[];
  productData?: DesktopProductDataSettings;
  sms?: import("@yardimci-asistan/shared").SmsConfigurationInput;
  instagram?: { enabled: boolean };
  whatsappCloud?: import("@yardimci-asistan/shared").WhatsAppCloudConfigurationInput;
  arasShipping?: import("@yardimci-asistan/shared").ArasShippingConfigurationInput;
  dealerPortalEnabled?: boolean;
  onlineSalesDelivery?: OnlineSalesDeliverySettings;
  onlineSalesDeliveryEnabled?: boolean;
  servicePreferences: {
    whatsapp: boolean;
    android: boolean;
  };
  birthdaySettings?: BirthdaySettings;
}

export type DesktopSetupSaveResult =
  | {
      ok: true;
      message: string;
      setupData: DesktopSetupData;
      dashboardData: DesktopDashboardData;
      aiWebSync?: PushAiSettingsResult;
      businessContextWebSync?: PushBusinessContextResult;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveMenuCategoryInput {
  id?: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface ReorderMenuRecordsInput {
  kind: "categories" | "items";
  orderedIds: string[];
  categoryId?: string;
}

export interface SaveMenuProductEntryInput {
  id?: string;
  product_id?: string;
  /** Only new-product creation; edits use the shared canonical Product Workspace. */
  product?: import("./commerce-store").SaveCatalogProductInput;
  category_id: string;
  price_override: number | null;
  is_available: boolean;
  is_featured: boolean;
  allergens: string[];
  tags: string[];
  stock_consumption_quantity: number;
  hide_when_out_of_stock: boolean;
  sort_order: number;
}

export type DesktopMenuSaveResult =
  | {
      ok: true;
      message: string;
      savedId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface CreateStockImageImportInput {
  importId: string;
  source: StockImageImportSource;
  deviceId?: string;
  imageHash: string;
  originalFilename?: string;
}

export interface ApplyStockImageImportInput {
  importId: string;
  imageHash: string;
  duplicateWarningAcknowledged?: boolean;
  lines: StockImageApplyLine[];
}

export interface DesktopStockImageAnalyzeInput {
  importId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export type DesktopStockImageAnalyzeResult =
  | {
      ok: true;
      message: string;
      importId: string;
      imageHash: string;
      duplicateWarning: boolean;
      analysis: StockImageAnalysis;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type DesktopStockImageApplyResult =
  | {
      ok: true;
      message: string;
      importId: string;
      appliedLineCount: number;
      totalQuantity: number;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveCustomerInput {
  id?: string;
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  identityType: string;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  birthdayMessageEnabled?: boolean;
  gender: string;
  documentSerialNumber: string;
  documentExpiryDate: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
  /**
   * undefined = ticari profile dokunma; null = profili kaldır;
   * object = aynı customer transaction'ında oluştur/güncelle.
   */
  commercialProfile?: SaveCustomerCommercialProfileInput | null;
}

export interface CreateStayFromReservationInput {
  requestId?: string;
  reservationId: string;
  roomId?: string;
  /** Defaults to planned for legacy callers; direct room entry requests checked_in. */
  status?: "planned" | "checked_in";
  guestCustomerIds?: string[];
  primaryCustomerId?: string;
}

export interface AssignCustomerRoomInput {
  requestId?: string;
  customerId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  notes: string;
  status: "planned" | "checked_in";
  guestCustomerIds?: string[];
}

export interface UpdateCustomerRoomStayStatusInput {
  stayId: string;
  status: "planned" | "checked_in" | "checked_out" | "cancelled";
}

export type DesktopCustomerMutationResult =
  | {
      ok: true;
      message: string;
      savedId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface DesktopIdentityImageAnalyzeInput {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export type DesktopIdentityImageAnalyzeResult =
  | {
      ok: true;
      message: string;
      analysis: IdentityImageAnalysis;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type RequestReservationConversionResult =
  | {
      ok: true;
      message: string;
      reservationId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface CreateManualRequestInput {
  requestType: string;
  customerName: string;
  customerPhone: string;
  dateText: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: number;
  adultCount: number;
  childCount: number;
  message: string;
  priority: string;
}

export type CreateManualRequestResult =
  | {
      ok: true;
      message: string;
      savedId: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface SaveRequestAiSuggestionInput {
  requestId: string;
  summary: string;
  suggestedReply: string;
  missingFields: string[];
}

export type RequestAiSuggestionResult =
  | {
      ok: true;
      message: string;
      requestId: string;
      summary: string;
      suggestedReply: string;
      missingFields: string[];
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface RewriteRequestAiSuggestionInput {
  requestId: string;
  instructions: string;
}

export type DailyBusinessEvaluationResult =
  | {
      ok: true;
      message: string;
      content: string;
      fallback: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type DesktopStatusUpdateResult =
  | {
      ok: true;
      message: string;
      dashboardData: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface UpdateRequestStatusInput {
  requestId: string;
  status: string;
}

export interface UpdateRoomStatusInput {
  roomId: string;
  status: string;
}

export interface AssignTableCustomerInput {
  tableId: string;
  /** Empty string removes the customer relation. */
  customerId: string;
}

export interface UpdateTableStatusInput {
  tableId: string;
  status: string;
}

export type TableOrderStatus = "open" | "preparing" | "served" | "payment" | "paid" | "cancelled";
export type TableOrderItemStatus = "open" | "preparing" | "served" | "cancelled";

export interface DesktopTableOrderItem {
  id: string;
  orderId: string;
  productId: string;
  menuEntryId: string;
  productName: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  lineTotal: number;
  note: string;
  status: TableOrderItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopTableOrder {
  id: string;
  tableId: string;
  tableName: string;
  status: TableOrderStatus;
  openedAt: string;
  closedAt: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  note: string;
  itemCount: number;
  items: DesktopTableOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DesktopPaymentWaitingTableOrder {
  id: string;
  tableId: string;
  tableName: string;
  total: number;
  currency: string;
  openedAt: string;
  updatedAt: string;
}

export interface AddTableOrderItemInput {
  orderId: string;
  menuEntryId: string;
  quantity: number;
  note: string;
}

export interface UpdateTableOrderItemQuantityInput {
  itemId: string;
  quantity: number;
}

export interface UpdateTableOrderItemNoteInput {
  itemId: string;
  note: string;
}

export interface UpdateTableOrderDiscountInput {
  orderId: string;
  discountTotal: number;
}

export interface UpdateTableOrderStatusInput {
  orderId: string;
  status: string;
}

export type DesktopTableOrderResult =
  | {
      ok: true;
      message: string;
      order: DesktopTableOrder;
      dashboardData?: DesktopDashboardData;
    }
  | {
      ok: false;
      message: string;
    };

export interface UpdateReservationStatusInput {
  reservationId: string;
  status: string;
}

export interface SaveManualReservationInput {
  reservationId?: string;
  expectedUpdatedAt?: string;
  customerId: string;
  roomId?: string;
  startDate: string;
  endDate: string;
  guestCount: number;
  notes: string;
}

export interface AssignReservationRoomInput {
  reservationId: string;
  roomId: string;
}

export interface SaveManualRestaurantReservationInput {
  customerId: string;
  tableId?: string;
  date: string;
  time: string;
  guestCount: number;
  notes: string;
}

export interface UpdateDailyTaskStatusInput {
  taskId: string;
  status: string;
}

export interface SaveDailyTaskInput {
  id?: string;
  title: string;
  description: string;
  taskType: "manual_pension" | "manual_restaurant";
  dueDate: string;
  dueTime: string;
}

export interface MarkWhatsAppMessageSentInput {
  requestId: string;
  message: string;
}

export interface DeleteWhatsAppMessageInput {
  messageId?: string;
  requestId?: string;
}

export interface RecordSyncEventInput {
  direction: string;
  entityType: string;
  ok: boolean;
  recordCount?: number;
  message?: string;
  status?: number;
}

export type DesktopSyncJobType = import("./desktop-publication-registry").DesktopPublicationJobType;

export interface DesktopSyncJob {
  jobKey: string;
  jobType: DesktopSyncJobType;
  sourceRevision: number;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string;
  updatedAt: string;
}

export interface DesktopSyncRuntimeStatus {
  restoreReconciliation?: import("./database/restore-reconciliation-store").RestoreReconciliationStatus;
  enabled: boolean;
  clientId: string;
  requestCursor: number;
  webOrderCursor: number;
  webOrderAcknowledgedCursor: number;
  acknowledgedCursor: number;
  lastAttemptAt: string;
  lastSuccessAt: string;
  lastError: string;
  consecutiveFailures: number;
  pendingJobs: number;
  nextRetryAt: string;
}

export type ApplyAndroidActionResult =
  | {
      ok: true;
      message: string;
      alreadyApplied: boolean;
    }
  | {
      ok: false;
      message: string;
    };
