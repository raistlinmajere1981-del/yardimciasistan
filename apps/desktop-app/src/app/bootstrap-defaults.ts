import { emptySmsConfiguration, emptyInstagramConfiguration } from "@yardimci-asistan/shared";
import { emptyWhatsAppCloudConfiguration } from "@yardimci-asistan/shared";
import { emptyArasShippingConfiguration, getBusinessProfile } from "@yardimci-asistan/shared";
import type { DesktopDashboardData, DesktopSetupData } from "../../electron/database";

export const defaultDashboardData: DesktopDashboardData = {
  revision: 0,
  roomOperations: null,
  tableOperations: null,
  databasePath: "Tarayıcı önizleme modu",
  backupPath: "Tarayıcı önizleme modu",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  summary: {
    newRequests: 0,
    waitingRequests: 0,
    pendingDailyTasks: 0,
    availableRooms: 0,
    totalRooms: 0,
    availableTables: 0,
    pendingReservations: 0,
    preparedWhatsAppMessages: 0,
    activeMenuCategories: 0,
    availableMenuItems: 0
  },
  menu: {
    categories: [],
    items: [],
    updated_at: "2026-07-10T10:00:00+03:00"
  },
  requests: [],
  preparedWhatsAppMessages: [],
  rooms: [],
  tables: [],
  reservations: [],
  dailyTasks: [],
  customers: [],
  customerRoomStays: [],
  hospitalityNotifications: [],
  kbsOverview: {
    enabled: false,
    configured: false,
    provider: "egm",
    pendingCount: 0,
    failedCount: 0,
    submissionUnknownCount: 0,
    sentCount: 0,
    checkedInGuestCount: 0,
    activeUnsentCount: 0,
    activeMissingIdentityCount: 0
  },
  androidDevices: [],
  paymentWaitingTableOrders: [],
  androidActionFailures: [],
  attention: {
    pendingRequests: 0,
    pendingReservations: 0,
    paymentWaitingTables: 0,
    overdueTasks: 0,
    incompleteTasks: 0,
    outOfStockItems: 0,
    lowStockItems: 0,
    totalCount: 0,
    items: []
  },
  birthdayOverview: {
    enabled: true,
    mode: "manual",
    today: "2026-07-10",
    candidates: [],
    dueCount: 0,
    preparedCount: 0,
    sentCount: 0,
    invalidPhoneCount: 0,
    waitingCount: 0,
    failedCount: 0
  }
};

export const defaultSetupData: DesktopSetupData = {
  sms: emptySmsConfiguration(), instagram: emptyInstagramConfiguration(),
  setupRequired: true,
  appPasswordConfigured: false,
  businessName: "",
  profileId: "pension_restaurant",
  profileOptions: [...getBusinessProfile("pension_restaurant").defaultOptionalCapabilities],
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  syncSecret: "",
  autoSyncEnabled: true,
  localNetworkEnabled: true,
  whatsappCloud: emptyWhatsAppCloudConfiguration(),
  arasShipping: emptyArasShippingConfiguration(),
  dealerPortalEnabled: false,
  onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: false },
  onlineSalesDeliveryEnabled: false,
  aiEnabled: false,
  aiProvider: "openai_compatible",
  aiService: "openai",
  aiProjectName: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiSttModel: "",
  aiTimeoutSeconds: 30,
  aiApiKeyConfigured: false,
  aiLastPublishedAt: "",
  aiProfiles: [],
  productData: {
    enabled: false,
    provider: "open_food_facts",
    autoSearchUnknownBarcode: true,
    includeImages: true
  },
  servicePreferences: {
    whatsapp: false,
    android: false
  },
  birthdaySettings: {
    enabled: true,
    mode: "manual",
    sendTime: "10:00",
    messageTemplate: "Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz."
  }
};
