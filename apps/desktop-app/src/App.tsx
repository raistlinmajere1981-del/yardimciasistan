import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOwnerReplyWhatsAppMessage,
  createWhatsAppUrl,
  createWhatsAppWebUrl,
  prepareWhatsAppAction,
  WHATSAPP_WEB_HOME_URL
} from "@yardimci-asistan/whatsapp-bridge";
import {
  Bell,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Eye,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  UtensilsCrossed,
  X
} from "lucide-react";
import type {
  AndroidPermissionGroupId,
  AndroidPermissionGroups,
  PublishedMenuCategory,
  PublishedMenuItem,
  SyncedCustomerRequest
} from "@yardimci-asistan/sync-core";
import type {
  AiWorkspaceHistoryEntry,
  AiWorkspaceMode,
  CreateManualRequestInput,
  DesktopAndroidDevice,
  DesktopDashboardData,
  DesktopCustomerMutationResult,
  DesktopIdentityImageAnalyzeResult,
  DesktopSetupData,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  SaveInitialSetupInput
} from "../electron/database";
import type { AutomaticSyncStatus } from "../electron/sync-coordinator";
import type { AppLockActionResult, AppLockStatus } from "../electron/app-lock";
import { parseGoogleAiStudioCurl } from "./google-ai-studio";
import { buildNavigation, getPageMeta, type DesktopPage } from "./app/navigation";
import { buildDesktopNotifications, type DesktopNotificationItem } from "./app/notifications";
import { getRoomDisplayInfo, isAccommodationTask, isRestaurantTask } from "./app/operations";
import {
  aiServicePresets,
  createDefaultAiServiceDraft,
  createSaveAiServiceProfiles,
  isAiServiceProfileStored,
  nextTableCategoryFormKey,
  normalizeAiService,
  toAiServiceFormDraft,
  toSetupForm,
  type SetupFormState
} from "./app/setup-model";
import { AppShell } from "./components/layout/AppShell";
import { PageHeader } from "./components/layout/PageHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { NotificationCenter } from "./components/notifications/NotificationCenter";
import { MenuManager } from "./components/menu/MenuManager";
import { LocalMenuPreview } from "./components/menu/MenuPreview";
import {
  toCategoryForm,
  emptyCategoryForm,
  toItemForm,
  emptyItemForm,
  nextSortOrder,
  splitCommaList,
  parseNullableFormNumber,
  parsePositiveFormNumber,
  buildMenuPreviewData,
  compareMenuRecords,
  type CategoryFormState,
  type ItemFormState
} from "./components/menu/menu-model";
import { AppLockScreen } from "./components/security/AppLockScreen";
import { PasswordSettings } from "./components/security/PasswordSettings";
import { RoomManagementSection } from "./components/settings/RoomManagementSection";
import { ActionButton } from "./components/ui/ActionButton";
import { CompactList } from "./components/ui/CompactList";
import { CompactListButton, CompactListItem } from "./components/ui/CompactListItem";
import { StatusBadge, type StatusTone } from "./components/ui/StatusBadge";
import { CustomerWorkPage } from "./pages/CustomerWorkPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MessagesPage } from "./pages/MessagesPage";
import { PensionPage } from "./pages/PensionPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RestaurantPage } from "./pages/RestaurantPage";
import {
  applyUiPreferences,
  readUiPreferences,
  saveUiPreferences,
  UI_SCALE_OPTIONS,
  type UiPreferences
} from "./ui-preferences";

type SyncState = "idle" | "loading" | "success" | "error";
type AppAccessPhase = "checking" | "locked" | "unlocking" | "unlocked";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "yardimci-asistan.sidebar-collapsed";
const STORED_AI_API_KEY_MASK = "*".repeat(20);

const ANDROID_PERMISSION_GROUP_OPTIONS: Array<{
  id: AndroidPermissionGroupId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: "service_orders", label: "Servis / Sipariş", shortLabel: "Servis", description: "Masa, sipariş ve servis akışı" },
  { id: "cashier", label: "Kasa / Hesap", shortLabel: "Kasa", description: "Ödendi / Kapat işlemi" },
  { id: "rooms_tasks", label: "Oda / Günlük İşler", shortLabel: "Oda işleri", description: "Oda durumu ve günlük işler" },
  { id: "customer_reservation", label: "Müşteri / Rezervasyon", shortLabel: "Müşteri / Rezervasyon", description: "Talep yanıtı ve rezervasyon onayı" }
];

const defaultAutomaticSyncStatus: AutomaticSyncStatus = {
  enabled: true,
  clientId: "",
  requestCursor: 0,
  acknowledgedCursor: 0,
  lastAttemptAt: "",
  lastSuccessAt: "",
  lastError: "",
  consecutiveFailures: 0,
  pendingJobs: 0,
  nextRetryAt: "",
  phase: "idle",
  message: "Otomatik senkron hazır."
};

function readSidebarCollapsedPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSidebarCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Depolama kapalıysa menü tercihi yalnız bu oturumda geçerli kalır.
  }
}

function automaticSyncTone(status: AutomaticSyncStatus): SyncState {
  if (status.phase === "syncing") {
    return "loading";
  }
  if (status.phase === "success") {
    return "success";
  }
  if (status.phase === "offline" || status.phase === "error") {
    return "error";
  }
  return "idle";
}

interface ManualRequestFormState {
  requestType: string;
  customerName: string;
  customerPhone: string;
  dateText: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: string;
  message: string;
  priority: string;
}

interface CustomerFormState {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  tags: string;
  identityType: string;
  identityNumber: string;
  nationality: string;
  birthDate: string;
  gender: string;
  documentSerialNumber: string;
  documentExpiryDate: string;
  birthPlace: string;
  motherName: string;
  fatherName: string;
  issuingAuthority: string;
  address: string;
}

interface RoomAssignmentFormState {
  customerId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: string;
  notes: string;
  status: "planned" | "checked_in";
}

const defaultDashboardData: DesktopDashboardData = {
  databasePath: "Tarayıcı önizleme modu",
  backupPath: "Tarayıcı önizleme modu",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  summary: {
    newRequests: 1,
    waitingRequests: 1,
    pendingDailyTasks: 4,
    availableRooms: 5,
    totalRooms: 8,
    availableTables: 8,
    pendingReservations: 2,
    preparedWhatsAppMessages: 1,
    activeMenuCategories: 3,
    availableMenuItems: 5
  },
  menu: {
    categories: [
      {
        id: "cat_breakfast",
        name: "Kahvaltı",
        description: "Sabah servisi için hazırlanan tabaklar ve sıcaklar.",
        is_active: true,
        sort_order: 10,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "cat_drinks",
        name: "İçecekler",
        description: "Kahve, çay ve serin içecekler.",
        is_active: true,
        sort_order: 20,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "cat_food",
        name: "Hafif Lezzetler",
        description: "Gün boyu servis edilen pratik tabaklar.",
        is_active: true,
        sort_order: 30,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      }
    ],
    items: [
      {
        id: "item_breakfast_001",
        category_id: "cat_breakfast",
        name: "Serpme Kahvaltı",
        description: "Yöresel peynirler, zeytin, bal-kaymak, sıcak lezzetler ve sınırsız çay.",
        price: 450,
        currency: "TRY",
        image_url: "/assets/menu-breakfast.webp",
        is_available: true,
        is_featured: true,
        allergens: ["gluten", "süt", "yumurta"],
        tags: ["popüler", "kahvaltı"],
        stock_quantity: null,
        stock_min_quantity: null,
        stock_unit: "piece",
        stock_consumption_quantity: 1,
        hide_when_out_of_stock: false,
        stock_note: null,
        sort_order: 10,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "item_breakfast_002",
        category_id: "cat_breakfast",
        name: "Menemen",
        description: "Domates, biber ve yumurtayla tavada servis edilir.",
        price: 180,
        currency: "TRY",
        image_url: "",
        is_available: true,
        is_featured: false,
        allergens: ["yumurta"],
        tags: ["sıcak"],
        stock_quantity: null,
        stock_min_quantity: null,
        stock_unit: "piece",
        stock_consumption_quantity: 1,
        hide_when_out_of_stock: false,
        stock_note: null,
        sort_order: 20,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "item_drink_001",
        category_id: "cat_drinks",
        name: "Türk Kahvesi",
        description: "Yanında küçük ikramla servis edilir.",
        price: 90,
        currency: "TRY",
        image_url: "",
        is_available: true,
        is_featured: false,
        allergens: [],
        tags: ["kahve"],
        stock_quantity: null,
        stock_min_quantity: null,
        stock_unit: "piece",
        stock_consumption_quantity: 1,
        hide_when_out_of_stock: false,
        stock_note: null,
        sort_order: 10,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "item_drink_002",
        category_id: "cat_drinks",
        name: "Ev Limonatası",
        description: "Taze limon, nane ve hafif şekerle hazırlanır.",
        price: 120,
        currency: "TRY",
        image_url: "",
        is_available: true,
        is_featured: true,
        allergens: [],
        tags: ["soğuk", "ferah"],
        stock_quantity: null,
        stock_min_quantity: null,
        stock_unit: "piece",
        stock_consumption_quantity: 1,
        hide_when_out_of_stock: false,
        stock_note: null,
        sort_order: 20,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      },
      {
        id: "item_food_001",
        category_id: "cat_food",
        name: "Günün Tostu",
        description: "Kaşar, domates ve mevsim yeşillikleriyle.",
        price: 180,
        currency: "TRY",
        image_url: "",
        is_available: true,
        is_featured: false,
        allergens: ["gluten", "süt"],
        tags: ["hızlı"],
        stock_quantity: null,
        stock_min_quantity: null,
        stock_unit: "piece",
        stock_consumption_quantity: 1,
        hide_when_out_of_stock: false,
        stock_note: null,
        sort_order: 10,
        created_at: "2026-07-10T10:00:00+03:00",
        updated_at: "2026-07-10T10:00:00+03:00"
      }
    ],
    updated_at: "2026-07-10T10:00:00+03:00"
  },
  requests: [
    {
      id: "request_demo_001",
      customer_id: "",
      source: "web_form",
      request_type: "pension_reservation",
      status: "new",
      customer_name: "Demo Misafir",
      customer_phone: "+905321234567",
      date_text: "12-14 Temmuz",
      start_date: "2026-07-12",
      end_date: "2026-07-14",
      time: "",
      guest_count: 3,
      adult_count: 2,
      child_count: 1,
      message: "Balkonlu oda varsa bilgi almak istiyorum.",
      ai_summary: "2 yetişkin 1 çocuk için balkonlu oda soruldu.",
      ai_suggested_reply: "Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.",
      whatsapp_message: "Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.",
      assigned_to: "",
      priority: "normal",
      sync_status: "pending",
      created_at: "2026-07-10T14:30:00+03:00",
      updated_at: "2026-07-10T14:30:00+03:00"
    }
  ],
  rooms: [
    {
      id: "room_101",
      name: "Balkonlu Standart Oda",
      number: "101",
      capacity: 2,
      bedInfo: "1 çift kişilik yatak",
      floor: "1. Kat",
      status: "available",
      features: ["Klima", "Balkon", "Wi-Fi"],
      description: "Kısa konaklamalar için ferah ve sakin oda.",
      priceNote: "",
      isActive: true,
      sortOrder: 1,
      activeReservationTitle: "",
      updatedAt: "2026-07-10T10:00:00+03:00"
    },
    {
      id: "room_102",
      name: "Aile Odası",
      number: "102",
      capacity: 4,
      bedInfo: "1 çift kişilik yatak + 2 tek kişilik yatak",
      floor: "1. Kat",
      status: "reserved",
      features: ["Klima", "Ek yatak"],
      description: "Çocuklu aileler için geniş kullanım alanı.",
      priceNote: "",
      isActive: true,
      sortOrder: 2,
      activeReservationTitle: "Demo Misafir - 2 gece",
      updatedAt: "2026-07-10T10:00:00+03:00"
    }
  ],
  tables: [
    {
      id: "table_001",
      name: "Bahçe Masası 1",
      area: "Bahçe",
      capacity: 4,
      status: "available",
      currentCustomerId: "",
      currentReservationId: "",
      activeReservationTitle: "",
      notes: "",
      isActive: true,
      sortOrder: 1,
      updatedAt: "2026-07-10T10:00:00+03:00"
    },
    {
      id: "table_002",
      name: "Salon Masası 1",
      area: "Salon",
      capacity: 2,
      status: "reserved",
      currentCustomerId: "",
      currentReservationId: "",
      activeReservationTitle: "",
      notes: "",
      isActive: true,
      sortOrder: 2,
      updatedAt: "2026-07-10T10:00:00+03:00"
    }
  ],
  reservations: [
    {
      id: "reservation_demo_001",
      requestId: "request_demo_001",
      customerId: "customer_demo_001",
      customerName: "Demo Misafir",
      customerPhone: "+905321234567",
      reservationType: "room",
      status: "pending",
      title: "Demo Misafir - 2 gece",
      startDate: "2026-07-12",
      endDate: "2026-07-14",
      time: "",
      guestCount: 3,
      adultCount: 2,
      childCount: 1,
      roomIds: ["room_101"],
      tableIds: [],
      notes: "Balkonlu oda istedi.",
      priceNote: "Fiyat işletme sahibi tarafından verilecek.",
      paymentStatus: "not_required",
      updatedAt: "2026-07-10T14:35:00+03:00"
    }
  ],
  dailyTasks: [
    {
      id: "task_demo_001",
      title: "Oda 101 giriş hazırlığı",
      description: "Demo Misafir için giriş hazırlığı.",
      taskType: "check_in",
      status: "pending",
      dueDate: "2026-07-12",
      dueTime: "14:00",
      relatedType: "reservation",
      relatedId: "reservation_demo_001",
      updatedAt: "2026-07-10T14:30:00+03:00"
    },
    {
      id: "task_demo_002",
      title: "Bahçe masa kontrolü",
      description: "Akşam servisi için bahçe masaları kontrol edilecek.",
      taskType: "table_reservation",
      status: "pending",
      dueDate: "2026-07-10",
      dueTime: "18:00",
      relatedType: "table",
      relatedId: "table_001",
      updatedAt: "2026-07-10T14:30:00+03:00"
    }
  ],
  customers: [
    {
      id: "customer_demo_001",
      fullName: "Demo Misafir",
      phone: "+905321234567",
      email: "",
      source: "web_form",
      notes: "Balkonlu oda sordu.",
      tags: ["pansiyon", "demo"],
      lastContactAt: "",
      identityType: "",
      identityNumber: "",
      nationality: "",
      birthDate: "",
      gender: "",
      documentSerialNumber: "",
      documentExpiryDate: "",
      birthPlace: "",
      motherName: "",
      fatherName: "",
      issuingAuthority: "",
      address: "",
      requestCount: 1,
      reservationCount: 1,
      stayCount: 0,
      updatedAt: "2026-07-10T14:30:00+03:00"
    }
  ],
  customerRoomStays: [],
  androidDevices: [],
  paymentWaitingTableOrders: [],
  androidActionFailures: []
};

const defaultSetupData: DesktopSetupData = {
  setupRequired: false,
  appPasswordConfigured: false,
  businessName: "Deniz Çiçeği Pansiyon & Kafe",
  businessType: "pension_restaurant",
  phone: "+905321234567",
  whatsapp: "+905321234567",
  email: "merhaba@denizcicegi.example",
  address: "Sahil Yolu No: 18, Akyaka / Muğla",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  syncSecret: "change-this-secret",
  autoSyncEnabled: true,
  aiEnabled: false,
  aiProvider: "openai_compatible",
  aiService: "openai",
  aiProjectName: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiTimeoutSeconds: 30,
  aiApiKeyConfigured: false,
  aiLastPublishedAt: "",
  aiProfiles: [],
  modules: {
    rooms: false,
    tables: false,
    qrMenu: false,
    whatsapp: false,
    android: false
  },
  initialCounts: {
    rooms: 0,
    tables: 0
  },
  tableCategories: [
    { name: "Bahçe", tableCount: 1 },
    { name: "Salon", tableCount: 1 }
  ]
};

const initialCategoryForm = toCategoryForm(defaultDashboardData.menu.categories[0]);
const initialItemForm = toItemForm(defaultDashboardData.menu.items[0], initialCategoryForm.id);
const initialManualRequestForm: ManualRequestFormState = {
  requestType: "general_info",
  customerName: "",
  customerPhone: "",
  dateText: "",
  startDate: "",
  endDate: "",
  time: "",
  guestCount: "1",
  message: "",
  priority: "normal"
};

const manualRequestTypeOptions = [
  "general_info",
  "pension_reservation",
  "restaurant_reservation",
  "breakfast_request",
  "qr_menu_question",
  "location_question",
  "price_question",
  "other"
];

const manualPriorityOptions = [
  ["normal", "Normal"],
  ["high", "Yüksek"],
  ["urgent", "Acil"],
  ["low", "Düşük"]
];

function App() {
  const contentRef = useRef<HTMLElement>(null);
  const appDataInitializedRef = useRef(false);
  const [appAccessPhase, setAppAccessPhase] = useState<AppAccessPhase>("checking");
  const [appLockStatus, setAppLockStatus] = useState<AppLockStatus>({
    locked: false,
    passwordConfigured: false,
    notificationCount: 0
  });
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(readUiPreferences);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [dashboardData, setDashboardData] = useState<DesktopDashboardData>(defaultDashboardData);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("Webden yeni talep yok.");
  const [automaticSyncStatus, setAutomaticSyncStatus] = useState<AutomaticSyncStatus>(defaultAutomaticSyncStatus);
  const [menuPublishState, setMenuPublishState] = useState<SyncState>("idle");
  const [menuStatusMessage, setMenuStatusMessage] = useState("Menü yayına hazır.");
  const [menuEditState, setMenuEditState] = useState<SyncState>("idle");
  const [menuEditMessage, setMenuEditMessage] = useState("Düzenleme bekliyor.");
  const [menuPreviewOpen, setMenuPreviewOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryForm.id);
  const [selectedItemId, setSelectedItemId] = useState(initialItemForm.id);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(initialCategoryForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);
  const [manualRequestForm, setManualRequestForm] = useState<ManualRequestFormState>(initialManualRequestForm);
  const [manualRequestState, setManualRequestState] = useState<SyncState>("idle");
  const [manualRequestMessage, setManualRequestMessage] = useState("Telefonla veya yüz yüze gelen talebi kaydedin.");
  const [selectedRequestId, setSelectedRequestId] = useState(defaultDashboardData.requests[0]?.id ?? "");
  const [selectedWhatsAppRequestId, setSelectedWhatsAppRequestId] = useState(defaultDashboardData.requests[0]?.id ?? "");
  const [setupData, setSetupData] = useState<DesktopSetupData>(defaultSetupData);
  const [setupForm, setSetupForm] = useState<SetupFormState>(() => toSetupForm(defaultSetupData));
  const [setupMode, setSetupMode] = useState(false);
  const [setupSaveState, setSetupSaveState] = useState<SyncState>("idle");
  const [setupMessage, setSetupMessage] = useState("Kurulum bilgileri bekliyor.");
  const [aiConnectionTestState, setAiConnectionTestState] = useState<SyncState>("idle");
  const [aiConnectionTestMessage, setAiConnectionTestMessage] = useState("Bağlantı henüz denenmedi.");
  const [convertingRequestId, setConvertingRequestId] = useState("");
  const [suggestingRequestId, setSuggestingRequestId] = useState("");
  const [aiState, setAiState] = useState<SyncState>("idle");
  const [aiMessage, setAiMessage] = useState("AI cevap taslağı hazır.");
  const [aiWorkspaceMode, setAiWorkspaceMode] = useState<AiWorkspaceMode>("reply");
  const [aiWorkspaceRequestId, setAiWorkspaceRequestId] = useState(defaultDashboardData.requests[0]?.id ?? "");
  const [aiWorkspaceInstructions, setAiWorkspaceInstructions] = useState("");
  const [aiWorkspaceEntry, setAiWorkspaceEntry] = useState<AiWorkspaceHistoryEntry | null>(null);
  const [aiWorkspaceContent, setAiWorkspaceContent] = useState("");
  const [aiWorkspaceHistory, setAiWorkspaceHistory] = useState<AiWorkspaceHistoryEntry[]>([]);
  const [aiWorkspaceState, setAiWorkspaceState] = useState<SyncState>("idle");
  const [aiWorkspaceMessage, setAiWorkspaceMessage] = useState("Bir araç seçip AI sonucunu hazırlayın.");
  const [messagesAiOpen, setMessagesAiOpen] = useState(false);
  const [backupState, setBackupState] = useState<SyncState>("idle");
  const [backupMessage, setBackupMessage] = useState("Yerel yedek bekliyor.");
  const [androidPublishState, setAndroidPublishState] = useState<SyncState>("idle");
  const [androidPublishMessage, setAndroidPublishMessage] = useState("Android özeti henüz yayınlanmadı.");
  const [androidDeviceState, setAndroidDeviceState] = useState<SyncState>("idle");
  const [androidDeviceMessage, setAndroidDeviceMessage] = useState("Telefon rolleri ve görev alanları masaüstünden yönetilir.");
  const modules = useMemo(
    () => ({
      rooms: setupData.modules.rooms,
      tables: setupData.modules.tables,
      qrMenu: setupData.modules.qrMenu,
      whatsapp: setupData.modules.whatsapp,
      ai: setupData.aiEnabled
    }),
    [setupData]
  );
  const navigationItems = useMemo(() => buildNavigation(setupData), [setupData]);

  useEffect(() => {
    applyUiPreferences(uiPreferences);
    saveUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    saveSidebarCollapsedPreference(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.getAppLockStatus !== "function") {
      setAppAccessPhase("unlocked");
      return () => {
        active = false;
      };
    }

    void bridge.getAppLockStatus()
      .then((status) => {
        if (!active) return;
        setAppLockStatus(status);
        setAppAccessPhase(status.locked ? "locked" : "unlocked");
      })
      .catch(() => {
        if (!active) return;
        setAppLockStatus({
          locked: true,
          passwordConfigured: true,
          notificationCount: 0
        });
        setAppAccessPhase("locked");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (appAccessPhase !== "unlocked") {
      return;
    }

    void window.yardimciDesktop?.getBootstrapData().then((data) => {
      const firstApplicationLoad = !appDataInitializedRef.current;
      setDashboardData((current) => ({
        ...current,
        databasePath: data.databasePath,
        backupPath: data.backupPath,
        webModuleUrl: data.syncSettings.webModuleUrl
      }));
      setSetupData(data.setup);
      setSetupForm(toSetupForm(data.setup));
      setSetupMode(data.setup.setupRequired);
      if (!data.setup.setupRequired && firstApplicationLoad) {
        setActivePage("dashboard");
      }
      appDataInitializedRef.current = true;
      setSetupMessage(data.setup.setupRequired ? "İlk kurulum bilgilerini tamamlayın." : "Ayarlar düzenlenebilir.");
    });
    void loadDashboardData();
    void window.yardimciDesktop?.getSyncStatus?.().then(setAutomaticSyncStatus);

    const unsubscribeDashboard = window.yardimciDesktop?.onDashboardDataChanged?.((nextDashboardData) => {
      setDashboardData(nextDashboardData);
    });
    const unsubscribeSync = window.yardimciDesktop?.onSyncStatusChanged?.((nextStatus) => {
      setAutomaticSyncStatus(nextStatus);
    });
    return () => {
      unsubscribeDashboard?.();
      unsubscribeSync?.();
    };
  }, [appAccessPhase]);

  useEffect(() => {
    if (activePage !== "messages" || !messagesAiOpen || !window.yardimciDesktop) {
      return;
    }
    void window.yardimciDesktop.getAiWorkspaceHistory(16).then(setAiWorkspaceHistory);
  }, [activePage, messagesAiOpen]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo(0, 0);
  }, [activePage]);

  useEffect(() => {
    if (!navigationItems.some((item) => item.id === activePage)) {
      setActivePage("dashboard");
    }
  }, [activePage, navigationItems]);

  useEffect(() => {
    if (activePage === "messages" && setupData.aiEnabled && !setupData.modules.whatsapp) {
      setMessagesAiOpen(true);
    }
  }, [activePage, setupData.aiEnabled, setupData.modules.whatsapp]);

  useEffect(() => {
    setAiConnectionTestState("idle");
    setAiConnectionTestMessage(
      setupForm.aiStoredApiKeyConfigured
        ? "Bu sağlayıcının kayıtlı bağlantısı kullanılabilir."
        : "Bağlantı henüz denenmedi."
    );
  }, [setupForm.aiService]);

  useEffect(() => {
    if (aiWorkspaceRequestId && dashboardData.requests.some((request) => request.id === aiWorkspaceRequestId)) {
      return;
    }
    setAiWorkspaceRequestId(dashboardData.requests[0]?.id ?? "");
  }, [aiWorkspaceRequestId, dashboardData.requests]);

  const selectedWhatsAppRequest = useMemo(
    () => dashboardData.requests.find((request) => request.id === selectedWhatsAppRequestId) ?? dashboardData.requests[0],
    [dashboardData.requests, selectedWhatsAppRequestId]
  );
  const selectedRequest = useMemo(
    () => dashboardData.requests.find((request) => request.id === selectedRequestId) ?? dashboardData.requests[0],
    [dashboardData.requests, selectedRequestId]
  );
  const selectedWhatsAppMessage = useMemo(
    () => (selectedWhatsAppRequest ? buildOwnerReplyWhatsAppMessage(selectedWhatsAppRequest.ai_suggested_reply || selectedWhatsAppRequest.whatsapp_message) : ""),
    [selectedWhatsAppRequest]
  );
  const selectedWhatsAppUrl = useMemo(
    () => (selectedWhatsAppRequest ? createWhatsAppWebUrl(selectedWhatsAppRequest.customer_phone, selectedWhatsAppMessage) : ""),
    [selectedWhatsAppMessage, selectedWhatsAppRequest]
  );
  const pageMeta = getPageMeta(activePage);
  const desktopNotifications = useMemo(
    () => buildDesktopNotifications(dashboardData, automaticSyncStatus),
    [automaticSyncStatus, dashboardData]
  );
  const menuPreviewData = useMemo(
    () => buildMenuPreviewData(dashboardData.menu, categoryForm, itemForm),
    [categoryForm, dashboardData.menu, itemForm]
  );

  async function loadDashboardData() {
    if (!window.yardimciDesktop) {
      return;
    }

    const nextDashboardData = await window.yardimciDesktop.getDashboardData();
    setDashboardData(nextDashboardData);

    if (selectedCategoryId && !nextDashboardData.menu.categories.some((category) => category.id === selectedCategoryId)) {
      const nextCategory = nextDashboardData.menu.categories[0];
      setSelectedCategoryId(nextCategory?.id ?? "");
      setCategoryForm(toCategoryForm(nextCategory));
    }

    if (selectedItemId && !nextDashboardData.menu.items.some((item) => item.id === selectedItemId)) {
      const nextItem = nextDashboardData.menu.items[0];
      setSelectedItemId(nextItem?.id ?? "");
      setItemForm(toItemForm(nextItem, nextDashboardData.menu.categories[0]?.id ?? ""));
    }
  }

  async function handleLockApp() {
    setMenuPreviewOpen(false);
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.lockApp === "function"
        ? await bridge.lockApp()
        : {
            ok: true,
            message: "Uygulama kilitlendi.",
            status: {
              locked: true,
              passwordConfigured: setupData.appPasswordConfigured,
              notificationCount: desktopNotifications.length
            }
          };
    } catch {
      return;
    }

    if (!result.ok) {
      return;
    }
    setAppLockStatus({
      ...result.status,
      notificationCount: Math.max(result.status.notificationCount, desktopNotifications.length)
    });
    setAppAccessPhase("locked");
  }

  async function handleUnlockApp(password: string): Promise<AppLockActionResult> {
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.unlockApp === "function"
        ? await bridge.unlockApp(password)
        : {
            ok: true,
            message: "Kilit açıldı.",
            status: {
              locked: false,
              passwordConfigured: appLockStatus.passwordConfigured,
              notificationCount: appLockStatus.notificationCount
            }
          };
    } catch {
      result = {
        ok: false,
        message: "Kilit açılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.",
        status: appLockStatus
      };
    }

    setAppLockStatus(result.status);
    if (result.ok) {
      setAppAccessPhase("unlocking");
      window.setTimeout(() => setAppAccessPhase("unlocked"), 170);
    }
    return result;
  }

  async function handleResetAppPassword(webSecurityKey: string): Promise<AppLockActionResult> {
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.resetAppPassword === "function"
        ? await bridge.resetAppPassword(webSecurityKey)
        : {
            ok: false,
            message: "Şifre sıfırlama hazır değil. Uygulamayı yeniden başlatın.",
            status: appLockStatus
          };
    } catch {
      result = {
        ok: false,
        message: "Şifre sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.",
        status: appLockStatus
      };
    }

    setAppLockStatus(result.status);
    if (result.ok) {
      setSetupData((current) => ({ ...current, appPasswordConfigured: false }));
      setAppAccessPhase("unlocking");
      window.setTimeout(() => setAppAccessPhase("unlocked"), 170);
    }
    return result;
  }

  function handleAppPasswordConfiguredChange(configured: boolean) {
    setSetupData((current) => ({ ...current, appPasswordConfigured: configured }));
    setAppLockStatus((current) => ({ ...current, passwordConfigured: configured }));
  }

  async function handlePullRequests() {
    setSyncState("loading");
    setStatusMessage("Web talepleri kontrol ediliyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    if (window.yardimciDesktop.runSyncNow) {
      const cycle = await window.yardimciDesktop.runSyncNow();
      setAutomaticSyncStatus(cycle.status);
      await loadDashboardData();
      setSyncState(cycle.ok ? "success" : "error");
      setStatusMessage(cycle.message);
      return;
    }

    const result = await window.yardimciDesktop.pullRequests();
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    await loadDashboardData();
    setSyncState("success");
    setStatusMessage(result.count > 0 ? `${result.count} talep alındı.` : "Yeni talep bulunmuyor.");
  }

  async function handleWhatsAppMessageSent(requestId: string, message: string) {
    if (!window.yardimciDesktop) {
      return {
        ok: false as const,
        message: "Gönderim kaydı hazır değil. Uygulamayı yeniden başlatın."
      };
    }

    const result = await window.yardimciDesktop.markWhatsAppMessageSent({ requestId, message });
    if (result.ok) {
      setDashboardData(result.dashboardData);
    }
    return result;
  }

  async function handlePublishMenu() {
    setMenuPublishState("loading");
    setMenuStatusMessage("Menü webde güncelleniyor...");

    if (!window.yardimciDesktop) {
      setMenuPublishState("error");
      setMenuStatusMessage("Menü yayınlanamadı. Bağlantıyı kontrol edin.");
      return;
    }

    const result = await window.yardimciDesktop.pushMenu();
    if (!result.ok) {
      setMenuPublishState("error");
      setMenuStatusMessage("Menü yayınlanamadı. Bağlantıyı kontrol edin.");
      return;
    }

    await loadDashboardData();
    setMenuPublishState("success");
    setMenuStatusMessage("Menü webde güncellendi.");
  }

  async function handlePublishAndroidSnapshot() {
    setAndroidPublishState("loading");
    setAndroidPublishMessage("Android özeti web modülüne gönderiliyor...");

    if (!window.yardimciDesktop) {
      setAndroidPublishState("error");
      setAndroidPublishMessage("Telefon özeti yayınlanamadı. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.pushAndroidSnapshot();
    if (!result.ok) {
      setAndroidPublishState("error");
      setAndroidPublishMessage(result.message);
      return;
    }

    setAndroidPublishState("success");
    setAndroidPublishMessage(`${result.task_count} günlük iş ile Android özeti yayınlandı.`);
  }

  async function runAndroidDeviceMutation(
    pendingMessage: string,
    operation: () => ReturnType<NonNullable<typeof window.yardimciDesktop>["setAndroidDeviceRole"]>
  ) {
    setAndroidDeviceState("loading");
    setAndroidDeviceMessage(pendingMessage);
    try {
      const result = await operation();
      setDashboardData((current) => ({ ...current, androidDevices: result.devices }));
      setAndroidDeviceState(result.ok ? "success" : "error");
      setAndroidDeviceMessage(result.message);
    } catch {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon ayarı güncellenemedi. Uygulamayı yeniden başlatın.");
    }
  }

  function handleSetAndroidDeviceRole(deviceId: string, role: "admin" | "staff") {
    if (!window.yardimciDesktop) {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    void runAndroidDeviceMutation(
      role === "admin" ? "Telefon yönetici yapılıyor..." : "Telefon personel yapılıyor...",
      () => window.yardimciDesktop!.setAndroidDeviceRole(deviceId, role)
    );
  }

  function handleSetAndroidDevicePermissionGroups(deviceId: string, groups: AndroidPermissionGroups) {
    if (!window.yardimciDesktop) {
      setAndroidDeviceState("error");
      setAndroidDeviceMessage("Telefon yönetimi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    void runAndroidDeviceMutation(
      "Telefon görev alanları güncelleniyor...",
      () => window.yardimciDesktop!.setAndroidDevicePermissionGroups(deviceId, groups)
    );
  }

  function handleSetAndroidDeviceActive(deviceId: string, active: boolean) {
    if (!window.yardimciDesktop) return;
    void runAndroidDeviceMutation(
      active ? "Telefon yeniden aktif ediliyor..." : "Telefon pasifleştiriliyor...",
      () => window.yardimciDesktop!.setAndroidDeviceActive(deviceId, active)
    );
  }

  function handleResetAndroidDevicePermissions(deviceId: string) {
    if (!window.yardimciDesktop) return;
    void runAndroidDeviceMutation(
      "Telefon yetkileri sıfırlanıyor...",
      () => window.yardimciDesktop!.resetAndroidDevicePermissions(deviceId)
    );
  }

  function handleRevokeAndroidDevice(device: DesktopAndroidDevice) {
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceLabel = `${device.deviceName || "Bu telefon"}${shortId ? ` (${shortId})` : ""}`;
    if (!window.yardimciDesktop || !window.confirm(`${deviceLabel} kaldırılsın ve erişimi kapatılsın mı?`)) {
      return;
    }
    void runAndroidDeviceMutation(
      "Telefon erişimi kaldırılıyor...",
      () => window.yardimciDesktop!.revokeAndroidDevice(device.deviceId)
    );
  }

  async function openMenuPreview() {
    if (window.yardimciDesktop) {
      try {
        const currentDashboardData = await window.yardimciDesktop.getDashboardData();
        setDashboardData(currentDashboardData);
      } catch {
        // Bellekteki son yerel veriyle önizlemeyi açmaya devam et.
      }
    }

    setMenuPreviewOpen(true);
  }

  function selectCategory(category: PublishedMenuCategory) {
    setSelectedCategoryId(category.id);
    setCategoryForm(toCategoryForm(category));
    const firstCategoryItem = dashboardData.menu.items
      .filter((item) => item.category_id === category.id)
      .sort(compareMenuRecords)[0];
    setSelectedItemId(firstCategoryItem?.id ?? "");
    setItemForm(toItemForm(firstCategoryItem, category.id));
  }

  function selectItem(item: PublishedMenuItem) {
    setSelectedItemId(item.id);
    setItemForm(toItemForm(item, dashboardData.menu.categories[0]?.id ?? ""));
  }

  function startNewCategory() {
    setSelectedCategoryId("");
    setCategoryForm(emptyCategoryForm(nextSortOrder(dashboardData.menu.categories)));
    setSelectedItemId("");
    setItemForm(emptyItemForm("", nextSortOrder(dashboardData.menu.items)));
    setMenuEditState("idle");
    setMenuEditMessage("Yeni kategori.");
  }

  function startNewItem() {
    const categoryId = selectedCategoryId || dashboardData.menu.categories[0]?.id || "";
    setSelectedItemId("");
    setItemForm(emptyItemForm(categoryId, nextSortOrder(dashboardData.menu.items)));
    setMenuEditState("idle");
    setMenuEditMessage("Yeni ürün.");
  }

  async function handleSaveCategory() {
    setMenuEditState("loading");
    setMenuEditMessage("Kategori kaydediliyor...");

    if (!window.yardimciDesktop) {
      setMenuEditState("error");
      setMenuEditMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.saveMenuCategory({
      id: categoryForm.id || undefined,
      name: categoryForm.name,
      description: categoryForm.description,
      is_active: categoryForm.is_active,
      sort_order: Number(categoryForm.sort_order)
    });

    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const savedCategory = result.dashboardData.menu.categories.find((category) => category.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedCategoryId(result.savedId);
    if (savedCategory) {
      setCategoryForm(toCategoryForm(savedCategory));
    }
    if (!itemForm.category_id) {
      setItemForm((current) => ({ ...current, category_id: result.savedId }));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  async function handleSaveItem() {
    setMenuEditState("loading");
    setMenuEditMessage("Ürün kaydediliyor...");

    if (!window.yardimciDesktop) {
      setMenuEditState("error");
      setMenuEditMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.saveMenuItem({
      id: itemForm.id || undefined,
      category_id: itemForm.category_id,
      name: itemForm.name,
      description: itemForm.description,
      price: Number(itemForm.price),
      currency: itemForm.currency,
      image_url: itemForm.image_url,
      is_available: itemForm.is_available,
      is_featured: itemForm.is_featured,
      allergens: splitCommaList(itemForm.allergens),
      tags: splitCommaList(itemForm.tags),
      stock_quantity: parseNullableFormNumber(itemForm.stock_quantity),
      stock_min_quantity: parseNullableFormNumber(itemForm.stock_min_quantity),
      stock_unit: itemForm.stock_unit,
      stock_consumption_quantity: parsePositiveFormNumber(itemForm.stock_consumption_quantity, 1),
      hide_when_out_of_stock: itemForm.hide_when_out_of_stock,
      stock_note: itemForm.stock_note.trim() || null,
      sort_order: Number(itemForm.sort_order)
    });

    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const savedItem = result.dashboardData.menu.items.find((item) => item.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedItemId(result.savedId);
    if (savedItem) {
      setItemForm(toItemForm(savedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  async function handleDeleteMenuCategory() {
    if (!categoryForm.id || !window.yardimciDesktop) {
      return;
    }
    const relatedProductCount = dashboardData.menu.items.filter((item) => item.category_id === categoryForm.id).length;
    if (!window.confirm(`“${categoryForm.name}” kategorisi ve bağlı ${relatedProductCount} ürün silinsin mi?`)) {
      return;
    }

    setMenuEditState("loading");
    setMenuEditMessage("Kategori ve bağlı ürünler siliniyor...");
    const result = await window.yardimciDesktop.deleteMenuCategory(categoryForm.id);
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const nextCategory = [...result.dashboardData.menu.categories].sort(compareMenuRecords)[0];
    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !nextCategory || item.category_id === nextCategory.id)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedCategoryId(nextCategory?.id ?? "");
    setCategoryForm(toCategoryForm(nextCategory));
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, nextCategory?.id ?? ""));
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  async function handleDeleteMenuItem() {
    if (!itemForm.id || !window.yardimciDesktop) {
      return;
    }
    if (!window.confirm(`“${itemForm.name}” ürünü menüden silinsin mi?`)) {
      return;
    }

    setMenuEditState("loading");
    setMenuEditMessage("Ürün siliniyor...");
    const result = await window.yardimciDesktop.deleteMenuItem(itemForm.id);
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, selectedCategoryId || result.dashboardData.menu.categories[0]?.id || ""));
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  function openWhatsApp(request: SyncedCustomerRequest) {
    setSelectedWhatsAppRequestId(request.id);
    setActivePage("messages");
  }

  function openDashboardReply(request: SyncedCustomerRequest) {
    if (setupData.modules.whatsapp) {
      openWhatsApp(request);
      return;
    }
    if (setupData.aiEnabled) {
      openAiTools("reply", request.id);
      return;
    }
    openDashboardCustomerWork(request);
  }

  function callCustomer(request: SyncedCustomerRequest) {
    void window.yardimciDesktop?.openExternal(`tel:${request.customer_phone}`);
  }

  function callCustomerRecord(customer: DesktopDashboardData["customers"][number]) {
    void window.yardimciDesktop?.openExternal(`tel:${customer.phone}`);
  }

  async function handleCreateManualRequest() {
    setManualRequestState("loading");
    setManualRequestMessage("Manuel talep kaydediliyor...");

    if (!window.yardimciDesktop) {
      setManualRequestState("error");
      setManualRequestMessage("Talep kaydı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const input: CreateManualRequestInput = {
      requestType: manualRequestForm.requestType,
      customerName: manualRequestForm.customerName,
      customerPhone: manualRequestForm.customerPhone,
      dateText: manualRequestForm.dateText,
      startDate: manualRequestForm.startDate,
      endDate: manualRequestForm.endDate,
      time: manualRequestForm.time,
      guestCount: Number(manualRequestForm.guestCount),
      adultCount: 0,
      childCount: 0,
      message: manualRequestForm.message,
      priority: manualRequestForm.priority
    };

    const result = await window.yardimciDesktop.createManualRequest(input);
    if (!result.ok) {
      setManualRequestState("error");
      setManualRequestMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSelectedRequestId(result.savedId);
    setSelectedWhatsAppRequestId(result.savedId);
    setManualRequestForm({
      ...initialManualRequestForm,
      requestType: manualRequestForm.requestType,
      priority: manualRequestForm.priority
    });
    setManualRequestState("success");
    setManualRequestMessage(result.message);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  function openCustomerWhatsApp(customer: DesktopDashboardData["customers"][number]) {
    if (!customer.phone) {
      setStatusMessage("WhatsApp bağlantısı için müşteri telefonu gerekiyor.");
      return;
    }

    const message = `Merhaba ${customer.fullName || "Misafir"}, Yardımcı Asistan üzerinden sizinle iletişime geçiyoruz.`;
    void window.yardimciDesktop?.openExternal(createWhatsAppUrl(customer.phone, message));
  }

  async function handleConvertRequestToReservation(request: SyncedCustomerRequest) {
    setConvertingRequestId(request.id);
    setSyncState("loading");
    setStatusMessage(`${request.customer_name} için rezervasyon hazırlanıyor...`);

    if (!window.yardimciDesktop) {
      setConvertingRequestId("");
      setSyncState("error");
      setStatusMessage("Rezervasyon işlemi hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.convertRequestToReservation(request.id);
    setConvertingRequestId("");

    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleCreateOwnerReplySuggestion(request: SyncedCustomerRequest) {
    setSuggestingRequestId(request.id);
    setAiState("loading");
    setAiMessage(`${request.customer_name} için cevap taslağı hazırlanıyor...`);

    if (!window.yardimciDesktop) {
      setSuggestingRequestId("");
      setAiState("error");
      setAiMessage("AI cevabı alınamadı. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.createOwnerReplySuggestion(request.id);
    setSuggestingRequestId("");

    if (!result.ok) {
      setAiState("error");
      setAiMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSelectedWhatsAppRequestId(request.id);
    setAiState("success");
    setAiMessage(result.missingFields.length > 0 ? `${result.message} Eksik: ${result.missingFields.join(", ")}.` : result.message);
  }

  async function handleGenerateAiWorkspace() {
    if (!window.yardimciDesktop) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI araçları hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    setAiWorkspaceState("loading");
    setAiWorkspaceMessage("AI sonucu hazırlanıyor...");
    const result = await window.yardimciDesktop.generateAiWorkspace({
      mode: aiWorkspaceMode,
      requestId: aiWorkspaceMode === "daily" ? "" : aiWorkspaceRequestId,
      instructions: aiWorkspaceInstructions
    });
    if (!result.ok) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage(result.message);
      return;
    }
    setAiWorkspaceEntry(result.entry);
    setAiWorkspaceContent(result.entry.content);
    setAiWorkspaceHistory((current) => [result.entry, ...current.filter((entry) => entry.id !== result.entry.id)].slice(0, 16));
    setAiWorkspaceState("success");
    setAiWorkspaceMessage(result.message);
  }

  async function persistAiWorkspaceResult() {
    if (!window.yardimciDesktop || !aiWorkspaceEntry) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Önce bir AI sonucu hazırlayın.");
      return false;
    }
    const result = await window.yardimciDesktop.saveAiWorkspaceResult({
      mode: aiWorkspaceEntry.mode,
      requestId: aiWorkspaceEntry.requestId,
      content: aiWorkspaceContent,
      summary: aiWorkspaceEntry.summary,
      missingFields: aiWorkspaceEntry.missingFields
    });
    if (!result.ok) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage(result.message);
      return false;
    }
    setDashboardData(result.dashboardData);
    setAiWorkspaceState("success");
    setAiWorkspaceMessage(result.message);
    return true;
  }

  async function handleSaveAiWorkspace() {
    await persistAiWorkspaceResult();
  }

  async function handleCopyAiWorkspace() {
    if (!aiWorkspaceContent.trim()) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Kopyalanacak bir AI sonucu yok.");
      return;
    }
    try {
      await navigator.clipboard.writeText(aiWorkspaceContent);
      setAiWorkspaceState("success");
      setAiWorkspaceMessage("AI sonucu panoya kopyalandı.");
    } catch {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Panoya kopyalama başarısız oldu.");
    }
  }

  async function handlePrepareAiWorkspaceWhatsApp() {
    if (!aiWorkspaceEntry || aiWorkspaceEntry.mode !== "reply") {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("WhatsApp için cevap taslağı türünde bir sonuç hazırlayın.");
      return;
    }
    if (await persistAiWorkspaceResult()) {
      setSelectedWhatsAppRequestId(aiWorkspaceEntry.requestId);
      setActivePage("messages");
    }
  }

  function openAiTools(mode: AiWorkspaceMode, requestId = "", instructions = "") {
    setAiWorkspaceMode(mode);
    if (requestId) {
      setAiWorkspaceRequestId(requestId);
    }
    setAiWorkspaceInstructions(instructions);
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("AI sonucunu hazırlamak için düğmeye basın.");
    setMessagesAiOpen(true);
    setActivePage("messages");
  }

  async function handleRewriteWhatsAppMessage(instructions: string) {
    if (!selectedWhatsAppRequest || !window.yardimciDesktop) {
      setAiState("error");
      setAiMessage("Mesajı yenilemek için bir müşteri talebi seçin.");
      return;
    }

    setAiState("loading");
    setAiMessage("Mesaj yeniden hazırlanıyor...");
    const result = await window.yardimciDesktop.generateAiWorkspace({
      mode: "reply",
      requestId: selectedWhatsAppRequest.id,
      instructions
    });
    if (!result.ok) {
      setAiState("error");
      setAiMessage("AI cevabı alınamadı. Biraz sonra tekrar deneyin.");
      return;
    }

    const saveResult = await window.yardimciDesktop.saveAiWorkspaceResult({
      mode: result.entry.mode,
      requestId: result.entry.requestId,
      content: result.entry.content,
      summary: result.entry.summary,
      missingFields: result.entry.missingFields
    });
    if (!saveResult.ok) {
      setAiState("error");
      setAiMessage(saveResult.message);
      return;
    }

    setDashboardData(saveResult.dashboardData);
    setAiWorkspaceMode("reply");
    setAiWorkspaceRequestId(selectedWhatsAppRequest.id);
    setAiWorkspaceInstructions(instructions);
    setAiWorkspaceEntry(result.entry);
    setAiWorkspaceContent(result.entry.content);
    setAiWorkspaceHistory((current) => [result.entry, ...current.filter((entry) => entry.id !== result.entry.id)].slice(0, 16));
    setAiState("success");
    setAiMessage("Hazır mesaj yenilendi. Göndermeden önce kontrol edin.");
  }

  function selectAiWorkspaceHistoryEntry(entry: AiWorkspaceHistoryEntry) {
    setAiWorkspaceMode(entry.mode);
    setAiWorkspaceRequestId(entry.requestId);
    setAiWorkspaceInstructions(entry.instructions);
    setAiWorkspaceEntry(entry);
    setAiWorkspaceContent(entry.content);
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Geçmiş sonuç açıldı; düzenleyip yeniden kullanabilirsiniz.");
  }

  function changeAiWorkspaceMode(mode: AiWorkspaceMode) {
    setAiWorkspaceMode(mode);
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Yeni çalışma türü seçildi; sonucu hazırlayın.");
  }

  function changeAiWorkspaceRequest(requestId: string) {
    setAiWorkspaceRequestId(requestId);
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Talep seçildi; AI sonucunu hazırlayın.");
  }

  async function handleCreateManualBackup() {
    setBackupState("loading");
    setBackupMessage("Yerel kayıtların yedeği oluşturuluyor...");

    if (!window.yardimciDesktop) {
      setBackupState("error");
      setBackupMessage("Yedekleme hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.createManualBackup();
    if (!result.ok) {
      setBackupState("error");
      setBackupMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setBackupState("success");
    setBackupMessage(`${result.message} ${result.backupFileName}`);
  }

  async function handleUpdateRequestStatus(request: SyncedCustomerRequest, status: string) {
    setSyncState("loading");
    setStatusMessage(`${request.customer_name} için talep durumu güncelleniyor...`);

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Talep durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateRequestStatus({ requestId: request.id, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleDeleteRequest(request: SyncedCustomerRequest) {
    if (!window.yardimciDesktop || !window.confirm(`${request.customer_name} adına kayıtlı talep ve bağlı hazır mesaj silinsin mi?`)) {
      return;
    }

    setSyncState("loading");
    setStatusMessage("Talep siliniyor...");
    const result = await window.yardimciDesktop.deleteRequest(request.id);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    const nextRequestId = result.dashboardData.requests[0]?.id ?? "";
    if (selectedRequestId === request.id) {
      setSelectedRequestId(nextRequestId);
    }
    if (selectedWhatsAppRequestId === request.id) {
      setSelectedWhatsAppRequestId(nextRequestId);
    }
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleDeleteCustomer(customer: DesktopDashboardData["customers"][number]) {
    if (!window.yardimciDesktop || !window.confirm(`${customer.fullName} müşteri listesinden silinsin mi? Eski talep ve rezervasyon kayıtları korunur.`)) {
      return;
    }

    setSyncState("loading");
    setStatusMessage("Müşteri siliniyor...");
    const result = await window.yardimciDesktop.deleteCustomer(customer.id);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleSaveCustomer(input: SaveCustomerInput): Promise<DesktopCustomerMutationResult> {
    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Müşteri kartı kaydedilemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setSyncState("loading");
    setStatusMessage(input.id ? "Müşteri kartı güncelleniyor..." : "Müşteri kartı oluşturuluyor...");
    const result = await window.yardimciDesktop.saveCustomer(input);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleAssignCustomerToRoom(input: AssignCustomerRoomInput): Promise<DesktopCustomerMutationResult> {
    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Oda ataması kaydedilemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setSyncState("loading");
    setStatusMessage("Müşteri oda kaydı oluşturuluyor...");
    const result = await window.yardimciDesktop.assignCustomerToRoom(input);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleUpdateCustomerRoomStayStatus(
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ): Promise<DesktopCustomerMutationResult> {
    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Konaklama kaydı güncellenemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setSyncState("loading");
    setStatusMessage("Konaklama durumu güncelleniyor...");
    const result = await window.yardimciDesktop.updateCustomerRoomStayStatus({ stayId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleAnalyzeIdentityImage(file: File): Promise<DesktopIdentityImageAnalyzeResult> {
    if (!window.yardimciDesktop) {
      return { ok: false, message: "Kimlik görseli analizi kullanılamıyor." };
    }
    setSyncState("loading");
    setStatusMessage("Kimlik görseli AI ile okunuyor...");
    let result: DesktopIdentityImageAnalyzeResult;
    try {
      result = await window.yardimciDesktop.analyzeIdentityImage({
        fileName: file.name,
        mimeType: file.type,
        bytes: await file.arrayBuffer()
      });
    } catch {
      result = { ok: false, code: "image_unreadable", message: "Kimlik görseli okunamadı." };
    }
    setSyncState(result.ok ? "success" : "error");
    setStatusMessage(result.message);
    return result;
  }

  async function handleDeleteWhatsAppMessage(request: SyncedCustomerRequest) {
    if (!window.yardimciDesktop || !window.confirm(`${request.customer_name} için hazırlanmış mesaj silinsin mi? Talep kaydı korunur.`)) {
      return;
    }

    setSyncState("loading");
    setStatusMessage("Hazır mesaj siliniyor...");
    const result = await window.yardimciDesktop.deleteWhatsAppMessage({ requestId: request.id });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  function openRequestReservation(request: SyncedCustomerRequest) {
    const reservation = dashboardData.reservations.find((item) => item.requestId === request.id);
    if (!reservation) {
      setSyncState("error");
      setStatusMessage("Talebe bağlı rezervasyon bulunamadı.");
      return;
    }

    if (["table", "breakfast"].includes(reservation.reservationType) && setupData.modules.tables) {
      setActivePage("restaurant");
      return;
    }
    setActivePage("pension");
  }

  function openDashboardCustomerWork(request?: SyncedCustomerRequest) {
    if (request) {
      setSelectedRequestId(request.id);
    }
    setActivePage("customerWork");
  }

  function openDesktopNotification(item: DesktopNotificationItem) {
    if (item.kind === "request" && item.relatedId) {
      setSelectedRequestId(item.relatedId);
    }
    const destination = navigationItems.some((navigationItem) => navigationItem.id === item.destination)
      ? item.destination
      : "dashboard";
    setActivePage(destination);
  }

  function openDashboardReservation(reservation: DesktopDashboardData["reservations"][number]) {
    const request = dashboardData.requests.find((item) => item.id === reservation.requestId);
    if (request) {
      openDashboardCustomerWork(request);
      return;
    }
    if (!["table", "breakfast"].includes(reservation.reservationType) && setupData.modules.rooms) {
      setActivePage("pension");
      return;
    }
    setSyncState("error");
    setStatusMessage("Bu rezervasyonun bağlı müşteri talebi bulunamadı.");
  }

  async function handleUpdateRoomStatus(roomId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Oda durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Oda durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateRoomStatus({ roomId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleUpdateTableStatus(tableId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Masa durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masa durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateTableStatus({ tableId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleUpdateReservationStatus(reservationId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Rezervasyon durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Rezervasyon durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateReservationStatus({ reservationId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleUpdateDailyTaskStatus(taskId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Günlük iş durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Günlük iş güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateDailyTaskStatus({ taskId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  function openReservationWhatsApp(reservation: DesktopDashboardData["reservations"][number]) {
    if (!reservation.customerPhone) {
      setStatusMessage("WhatsApp bağlantısı için rezervasyonda müşteri telefonu gerekiyor.");
      return;
    }

    const message = buildReservationWhatsAppMessage(reservation, dashboardData.rooms, dashboardData.tables);
    void window.yardimciDesktop?.openExternal(createWhatsAppUrl(reservation.customerPhone, message));
  }

  function openSelectedWhatsAppExternal() {
    if (!selectedWhatsAppUrl) {
      setStatusMessage("WhatsApp bağlantısı için geçerli müşteri telefonu ve mesaj gerekiyor.");
      return;
    }

    void window.yardimciDesktop?.openExternal(selectedWhatsAppUrl);
  }

  async function handleTestAiConnection() {
    setAiConnectionTestState("loading");
    setAiConnectionTestMessage("AI servisine bağlanılıyor...");

    if (!window.yardimciDesktop) {
      setAiConnectionTestState("error");
      setAiConnectionTestMessage("Bağlantı kontrolü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    let baseUrl = setupForm.aiBaseUrl;
    let model = setupForm.aiModel;
    let apiKey = setupForm.clearAiApiKey ? "" : setupForm.aiApiKey;
    if (setupForm.aiService === "gemini" && setupForm.aiGoogleCurl.trim()) {
      const parsed = parseGoogleAiStudioCurl(setupForm.aiGoogleCurl);
      if (!parsed.ok) {
        setAiConnectionTestState("error");
        setAiConnectionTestMessage(parsed.message);
        return;
      }

      baseUrl = parsed.baseUrl;
      model = "";
      apiKey = parsed.apiKey;
      setSetupForm((current) => ({
        ...current,
        aiProjectName: current.aiProjectName || "Google AI Studio",
        aiGoogleCurl: "",
        aiBaseUrl: parsed.baseUrl,
        aiModel: "",
        aiApiKey: parsed.apiKey,
        clearAiApiKey: false
      }));
    }

    const result = await window.yardimciDesktop.testAiConnection({
      provider: setupForm.aiProvider,
      service: setupForm.aiService,
      projectName: setupForm.aiProjectName,
      baseUrl,
      model,
      apiKey,
      useStoredApiKey: !setupForm.clearAiApiKey && setupForm.aiStoredApiKeyConfigured && apiKey.trim() === "",
      timeoutSeconds: Number(setupForm.aiTimeoutSeconds)
    });

    setAiConnectionTestState(result.ok ? "success" : "error");
    setAiConnectionTestMessage(result.message);
    if (result.ok) {
      setSetupSaveState("idle");
      setSetupMessage("AI bağlantısı hazır. Ayarları kaydedin.");
      setSetupForm((current) => ({
        ...current,
        aiModel: result.model,
        aiModelOptions: result.models
      }));
    } else if (setupForm.aiService === "gemini") {
      setSetupForm((current) => ({
        ...current,
        aiModel: result.model || current.aiModel,
        aiModelOptions: result.models ?? current.aiModelOptions
      }));
    }
  }

  async function handleSaveSetup() {
    setSetupSaveState("loading");
    setSetupMessage("Kurulum ayarları kaydediliyor...");

    if (!window.yardimciDesktop) {
      setSetupSaveState("error");
      setSetupMessage("Ayarlar kaydedilemedi. Masaüstü uygulamasını yeniden başlatın.");
      return;
    }

    const input: SaveInitialSetupInput = {
      businessName: setupForm.businessName,
      businessType: setupForm.businessType,
      phone: setupForm.phone,
      whatsapp: setupForm.whatsapp,
      email: setupForm.email,
      address: setupForm.address,
      webModuleUrl: setupForm.webModuleUrl,
      syncSecret: setupForm.syncSecret,
      autoSyncEnabled: setupForm.autoSyncEnabled,
      aiEnabled: setupForm.aiEnabled,
      aiProvider: setupForm.aiProvider,
      aiService: setupForm.aiService,
      aiProjectName: setupForm.aiProjectName,
      aiBaseUrl: setupForm.aiBaseUrl,
      aiModel: setupForm.aiModel,
      aiModelOptions: setupForm.aiModelOptions,
      aiApiKey: setupForm.aiApiKey,
      clearAiApiKey: setupForm.clearAiApiKey,
      aiProfiles: createSaveAiServiceProfiles(setupForm),
      aiTimeoutSeconds: Number(setupForm.aiTimeoutSeconds),
      modules: {
        rooms: setupForm.roomsEnabled,
        tables: setupForm.tablesEnabled,
        qrMenu: setupForm.qrMenuEnabled,
        whatsapp: setupForm.whatsappEnabled,
        android: setupForm.androidEnabled
      },
      initialCounts: {
        rooms: Number(setupForm.roomCount),
        tables: setupForm.tableCategories.reduce((total, category) => total + Number(category.tableCount || 0), 0)
      },
      tableCategories: setupForm.tableCategories.map((category) => ({
        sourceName: category.sourceName,
        name: category.name,
        tableCount: Number(category.tableCount)
      }))
    };
    const result = await window.yardimciDesktop.saveInitialSetup(input);

    if (!result.ok) {
      setSetupSaveState("error");
      setSetupMessage(result.message);
      return;
    }

    setSetupData(result.setupData);
    setDashboardData(result.dashboardData);
    setSetupForm(toSetupForm(result.setupData));
    const aiConnectionCouldNotBePublished = setupForm.aiEnabled && result.aiWebSync?.ok === false;
    setSetupSaveState(aiConnectionCouldNotBePublished ? "error" : "success");
    setSetupMessage(aiConnectionCouldNotBePublished ? result.message : "Ayarlar kaydedildi.");
    if (!aiConnectionCouldNotBePublished) {
      setSetupMode(false);
    }
  }

  if (appAccessPhase !== "unlocked") {
    return (
      <AppLockScreen
        phase={appAccessPhase}
        passwordConfigured={appLockStatus.passwordConfigured}
        notificationCount={appLockStatus.notificationCount}
        onUnlock={handleUnlockApp}
        onResetPassword={handleResetAppPassword}
      />
    );
  }

  if (setupMode) {
    return (
      <SetupWizard
        form={setupForm}
        setupData={setupData}
        saveState={setupSaveState}
        message={setupMessage}
        aiConnectionTestState={aiConnectionTestState}
        aiConnectionTestMessage={aiConnectionTestMessage}
        onFormChange={setSetupForm}
        onTestAiConnection={handleTestAiConnection}
        onSave={handleSaveSetup}
        onSkip={() => setSetupMode(false)}
        uiPreferences={uiPreferences}
        onUiPreferencesChange={setUiPreferences}
      />
    );
  }

  const persistentMessagesPage = (
    <MessagesPage
      aiEnabled={setupData.aiEnabled}
      whatsappEnabled={setupData.modules.whatsapp}
      aiOpen={messagesAiOpen}
      active={activePage === "messages"}
      safeMode={(
        <WhatsAppWorkspace
          view="safe"
          requests={dashboardData.requests}
          selectedRequest={selectedWhatsAppRequest}
          selectedMessage={selectedWhatsAppMessage}
          selectedUrl={selectedWhatsAppUrl}
          aiEnabled={setupData.aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onCall={selectedWhatsAppRequest ? () => callCustomer(selectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      webMode={(onReturnToSafe) => (
        <WhatsAppWorkspace
          view="web"
          requests={dashboardData.requests}
          selectedRequest={selectedWhatsAppRequest}
          selectedMessage={selectedWhatsAppMessage}
          selectedUrl={selectedWhatsAppUrl}
          aiEnabled={setupData.aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onReturnToSafe={onReturnToSafe}
          onCall={selectedWhatsAppRequest ? () => callCustomer(selectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      aiTools={(
        <AiWorkspace
          setupData={setupData}
          dashboardData={dashboardData}
          mode={aiWorkspaceMode}
          selectedRequestId={aiWorkspaceRequestId}
          instructions={aiWorkspaceInstructions}
          entry={aiWorkspaceEntry}
          content={aiWorkspaceContent}
          history={aiWorkspaceHistory}
          state={aiWorkspaceState}
          message={aiWorkspaceMessage}
          onModeChange={changeAiWorkspaceMode}
          onRequestChange={changeAiWorkspaceRequest}
          onInstructionsChange={setAiWorkspaceInstructions}
          onContentChange={setAiWorkspaceContent}
          onGenerate={handleGenerateAiWorkspace}
          onSave={handleSaveAiWorkspace}
          onCopy={handleCopyAiWorkspace}
          onWhatsApp={handlePrepareAiWorkspaceWhatsApp}
          onSelectHistory={selectAiWorkspaceHistoryEntry}
        />
      )}
    />
  );

  return (
    <AppShell
      contentRef={contentRef}
      sidebarCollapsed={sidebarCollapsed}
      sidebar={(
        <Sidebar
          items={navigationItems}
          activePage={activePage}
          businessName={setupData.businessName}
          collapsed={sidebarCollapsed}
          onNavigate={setActivePage}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        />
      )}
      header={(
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          action={(
            <div className="page-header-tools">
              {activePage === "menu" ? (
            <div className={`sync-pill sync-${menuPublishState}`}>
              <span role="status" aria-live="polite">{menuStatusMessage}</span>
              <button className="secondary-sync-action" type="button" onClick={openMenuPreview}>
                <Eye size={16} aria-hidden="true" />
                Önizle
              </button>
              <button type="button" onClick={handlePublishMenu} disabled={menuPublishState === "loading"}>
                <UploadCloud size={16} aria-hidden="true" />
                Web'e Yayınla
              </button>
            </div>
          ) : activePage === "messages" ? (
            <div className="sync-pill sync-idle">
              <span>{setupData.modules.whatsapp ? (selectedWhatsAppRequest ? `${selectedWhatsAppRequest.customer_name} için hazır cevap` : "Mesaj için talep seçin") : "AI araçları kullanıma hazır."}</span>
            </div>
          ) : activePage === "settings" ? (
            <div className={`sync-pill sync-${setupSaveState}`}>
              <span>{setupMessage}</span>
              <button type="button" onClick={handleSaveSetup} disabled={setupSaveState === "loading"}>
                <Save size={16} aria-hidden="true" />
                Ayarları Kaydet
              </button>
            </div>
          ) : (
            <div className={`sync-pill sync-${syncState === "idle" ? automaticSyncTone(automaticSyncStatus) : syncState}`}>
              <span role="status" aria-live="polite">
                {syncState === "idle" ? automaticSyncStatus.message : statusMessage}
                {automaticSyncStatus.pendingJobs > 0 ? ` · ${automaticSyncStatus.pendingJobs} eşitleme bekliyor` : ""}
              </span>
              <button
                type="button"
                title={automaticSyncStatus.message}
                onClick={handlePullRequests}
                disabled={automaticSyncStatus.phase === "syncing" || syncState === "loading"}
              >
                <RefreshCw size={16} aria-hidden="true" />
                {automaticSyncStatus.phase === "syncing" ? "Eşitleniyor" : "Şimdi Eşitle"}
              </button>
            </div>
              )}
              <NotificationCenter items={desktopNotifications} onOpen={openDesktopNotification} />
              <button
                className="app-lock-trigger"
                type="button"
                aria-label="Uygulamayı kilitle"
                title="Ekranı kilitle"
                onClick={() => void handleLockApp()}
              >
                <LockKeyhole size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        />
      )}
      overlay={menuPreviewOpen ? (
        <LocalMenuPreview
          menu={menuPreviewData}
          setupData={setupData}
          webModuleUrl={dashboardData.webModuleUrl}
          onClose={() => setMenuPreviewOpen(false)}
        />
      ) : undefined}
    >

        {activePage === "dashboard" ? (
          <DashboardPage
            data={dashboardData}
            modules={setupData.modules}
            aiEnabled={setupData.aiEnabled}
            availableRoomCount={dashboardData.rooms.filter((room) => getRoomDisplayInfo(room, dashboardData.reservations).status === "available").length}
            onReplyRequest={openDashboardReply}
            onOpenCustomerWork={openDashboardCustomerWork}
            onOpenReservation={openDashboardReservation}
            onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
            onOpenDailyAi={() => openAiTools("daily")}
            formatRequestType={formatRequestType}
            formatRequestStatus={formatRequestStatus}
            getRequestStatusTone={getRequestStatusTone}
            isRequestWaitingForReply={isRequestWaitingForReply}
            formatTaskDue={formatTaskDue}
            formatReservationDate={formatReservationDate}
          />
        ) : activePage === "customerWork" ? (
          <CustomerWorkPage
            requests={(
              <RequestsWorkspace
                requests={dashboardData.requests}
                selectedRequest={selectedRequest}
                aiEnabled={setupData.aiEnabled}
                convertingRequestId={convertingRequestId}
                suggestingRequestId={suggestingRequestId}
                manualRequestForm={manualRequestForm}
                manualRequestState={manualRequestState}
                manualRequestMessage={manualRequestMessage}
                onSelectRequest={setSelectedRequestId}
                onManualRequestFormChange={setManualRequestForm}
                onCreateManualRequest={handleCreateManualRequest}
                onCall={callCustomer}
                onWhatsApp={openWhatsApp}
                onConvert={handleConvertRequestToReservation}
                onSuggest={handleCreateOwnerReplySuggestion}
                onUpdateStatus={handleUpdateRequestStatus}
                onOpenReservation={openRequestReservation}
                onDelete={handleDeleteRequest}
              />
            )}
            customers={(
              <CustomersWorkspace
                customers={dashboardData.customers}
                requests={dashboardData.requests}
                reservations={dashboardData.reservations}
                rooms={dashboardData.rooms}
                stays={dashboardData.customerRoomStays}
                aiEnabled={setupData.aiEnabled}
                onCall={callCustomerRecord}
                onWhatsApp={openCustomerWhatsApp}
                onSummarize={(requestId) => openAiTools("summary", requestId)}
                onSave={handleSaveCustomer}
                onAnalyzeIdentity={handleAnalyzeIdentityImage}
                onAssignRoom={handleAssignCustomerToRoom}
                onUpdateStayStatus={handleUpdateCustomerRoomStayStatus}
                onDelete={handleDeleteCustomer}
              />
            )}
            waiting={(
              <RequestsWorkspace
                requests={dashboardData.requests.filter((request) => isRequestWaitingForReply(request.status))}
                selectedRequest={dashboardData.requests.filter((request) => isRequestWaitingForReply(request.status)).find((request) => request.id === selectedRequestId) ?? dashboardData.requests.find((request) => isRequestWaitingForReply(request.status))}
                aiEnabled={setupData.aiEnabled}
                convertingRequestId={convertingRequestId}
                suggestingRequestId={suggestingRequestId}
                manualRequestForm={manualRequestForm}
                manualRequestState={manualRequestState}
                manualRequestMessage={manualRequestMessage}
                showManualForm={false}
                onSelectRequest={setSelectedRequestId}
                onManualRequestFormChange={setManualRequestForm}
                onCreateManualRequest={handleCreateManualRequest}
                onCall={callCustomer}
                onWhatsApp={openWhatsApp}
                onConvert={handleConvertRequestToReservation}
                onSuggest={handleCreateOwnerReplySuggestion}
                onUpdateStatus={handleUpdateRequestStatus}
                onOpenReservation={openRequestReservation}
                onDelete={handleDeleteRequest}
              />
            )}
          />
        ) : activePage === "pension" ? (
          <PensionPage
            data={dashboardData}
            reservations={(
              <ReservationsWorkspace
                reservations={dashboardData.reservations}
                rooms={dashboardData.rooms}
                onUpdateStatus={handleUpdateReservationStatus}
                onOpenWhatsApp={openReservationWhatsApp}
              />
            )}
            rooms={(
              <RoomsWorkspace
                rooms={dashboardData.rooms}
                reservations={dashboardData.reservations}
                customers={dashboardData.customers}
                stays={dashboardData.customerRoomStays}
                onUpdateStatus={handleUpdateRoomStatus}
                onAssignRoom={handleAssignCustomerToRoom}
                onUpdateStayStatus={handleUpdateCustomerRoomStayStatus}
              />
            )}
            stays={(
              <CustomerRoomStaysWorkspace
                stays={dashboardData.customerRoomStays}
                onUpdateStatus={handleUpdateCustomerRoomStayStatus}
              />
            )}
            tasks={(
              <DailyTasksWorkspace
                tasks={dashboardData.dailyTasks.filter((task) => isAccommodationTask(task, dashboardData.reservations))}
                onUpdateStatus={handleUpdateDailyTaskStatus}
              />
            )}
          />
        ) : activePage === "restaurant" ? (
          <RestaurantPage
            data={dashboardData}
            onDashboardDataChanged={setDashboardData}
            onUpdateTableStatus={handleUpdateTableStatus}
            tasks={(
              <DailyTasksWorkspace
                tasks={dashboardData.dailyTasks.filter((task) => isRestaurantTask(task, dashboardData.reservations))}
                onUpdateStatus={handleUpdateDailyTaskStatus}
              />
            )}
          />
        ) : activePage === "menu" ? (
          <MenuManager
            dashboardData={dashboardData}
            categoryForm={categoryForm}
            itemForm={itemForm}
            selectedCategoryId={selectedCategoryId}
            selectedItemId={selectedItemId}
            menuEditState={menuEditState}
            menuEditMessage={menuEditMessage}
            onCategoryFormChange={setCategoryForm}
            onItemFormChange={setItemForm}
            onSelectCategory={selectCategory}
            onSelectItem={selectItem}
            onNewCategory={startNewCategory}
            onNewItem={startNewItem}
            onSaveCategory={handleSaveCategory}
            onSaveItem={handleSaveItem}
            onDeleteCategory={handleDeleteMenuCategory}
            onDeleteItem={handleDeleteMenuItem}
            onDashboardDataChanged={setDashboardData}
          />
        ) : activePage === "reports" ? (
          <ReportsPage aiEnabled={setupData.aiEnabled} />
        ) : activePage === "messages" ? null : (
          <SetupWizard
            embedded
            form={setupForm}
            setupData={setupData}
            dashboardData={dashboardData}
            saveState={setupSaveState}
            message={setupMessage}
            backupState={backupState}
            backupMessage={backupMessage}
            androidPublishState={androidPublishState}
            androidPublishMessage={androidPublishMessage}
            androidDeviceState={androidDeviceState}
            androidDeviceMessage={androidDeviceMessage}
            aiConnectionTestState={aiConnectionTestState}
            aiConnectionTestMessage={aiConnectionTestMessage}
            onFormChange={setSetupForm}
            onTestAiConnection={handleTestAiConnection}
            onCreateBackup={handleCreateManualBackup}
            onPublishAndroid={handlePublishAndroidSnapshot}
            onSetAndroidDeviceRole={handleSetAndroidDeviceRole}
            onSetAndroidDevicePermissionGroups={handleSetAndroidDevicePermissionGroups}
            onSetAndroidDeviceActive={handleSetAndroidDeviceActive}
            onResetAndroidDevicePermissions={handleResetAndroidDevicePermissions}
            onRevokeAndroidDevice={handleRevokeAndroidDevice}
            onSave={handleSaveSetup}
            onSkip={() => setActivePage("dashboard")}
            onAppPasswordConfiguredChange={handleAppPasswordConfiguredChange}
            uiPreferences={uiPreferences}
            onUiPreferencesChange={setUiPreferences}
          />
        )}
      <div className={activePage === "messages" ? "persistent-messages-page" : "persistent-messages-page is-hidden"} aria-hidden={activePage !== "messages"}>
        {persistentMessagesPage}
      </div>
    </AppShell>
  );
}

interface SetupWizardProps {
  form: SetupFormState;
  setupData: DesktopSetupData;
  dashboardData?: DesktopDashboardData;
  embedded?: boolean;
  saveState: SyncState;
  message: string;
  backupState?: SyncState;
  backupMessage?: string;
  androidPublishState?: SyncState;
  androidPublishMessage?: string;
  androidDeviceState?: SyncState;
  androidDeviceMessage?: string;
  aiConnectionTestState: SyncState;
  aiConnectionTestMessage: string;
  onFormChange: (form: SetupFormState) => void;
  onTestAiConnection: () => void;
  onCreateBackup?: () => void;
  onPublishAndroid?: () => void;
  onSetAndroidDeviceRole?: (deviceId: string, role: "admin" | "staff") => void;
  onSetAndroidDevicePermissionGroups?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetAndroidDeviceActive?: (deviceId: string, active: boolean) => void;
  onResetAndroidDevicePermissions?: (deviceId: string) => void;
  onRevokeAndroidDevice?: (device: DesktopAndroidDevice) => void;
  onAppPasswordConfiguredChange?: (configured: boolean) => void;
  onSave: () => void;
  onSkip: () => void;
  uiPreferences: UiPreferences;
  onUiPreferencesChange: (preferences: UiPreferences) => void;
}

function SetupWizard({
  form,
  setupData,
  dashboardData,
  embedded = false,
  saveState,
  message,
  backupState = "idle",
  backupMessage = "Yedekleme bekliyor.",
  androidPublishState = "idle",
  androidPublishMessage = "Telefon özeti henüz yayınlanmadı.",
  androidDeviceState = "idle",
  androidDeviceMessage = "Telefon rolleri ve görev alanları masaüstünden yönetilir.",
  aiConnectionTestState,
  aiConnectionTestMessage,
  onFormChange,
  onTestAiConnection,
  onCreateBackup,
  onPublishAndroid,
  onSetAndroidDeviceRole,
  onSetAndroidDevicePermissionGroups,
  onSetAndroidDeviceActive,
  onResetAndroidDevicePermissions,
  onRevokeAndroidDevice,
  onAppPasswordConfiguredChange,
  onSave,
  onSkip,
  uiPreferences,
  onUiPreferencesChange
}: SetupWizardProps) {
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showGoogleCurl, setShowGoogleCurl] = useState(false);
  const [revealedAiApiKey, setRevealedAiApiKey] = useState("");
  const [aiApiKeyRevealState, setAiApiKeyRevealState] = useState<"idle" | "loading" | "error">("idle");
  const [aiApiKeyRevealMessage, setAiApiKeyRevealMessage] = useState("");
  const selectedAiServiceRef = useRef(form.aiService);
  const [settingsLevel, setSettingsLevel] = useState<"basic" | "advanced">("basic");

  useEffect(() => {
    selectedAiServiceRef.current = form.aiService;
    setShowAiApiKey(false);
    setShowGoogleCurl(false);
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
  }, [form.aiService, form.clearAiApiKey]);

  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const updateTableCategory = (key: string, field: "name" | "tableCount", value: string) => {
    update("tableCategories", form.tableCategories.map((category) =>
      category.key === key ? { ...category, [field]: value } : category
    ));
  };

  const addTableCategory = () => {
    update("tableCategories", [
      ...form.tableCategories,
      {
        key: nextTableCategoryFormKey(),
        sourceName: "",
        name: "",
        tableCount: "1"
      }
    ]);
  };

  const removeTableCategory = (key: string) => {
    update("tableCategories", form.tableCategories.filter((category) => category.key !== key));
  };

  const tableCountTotal = form.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);

  const googleUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiGoogleCurl && !form.aiApiKey;
  const genericUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiApiKey;
  const googleSecretValue = form.aiGoogleCurl
    || form.aiApiKey
    || (googleUsesStoredApiKey ? (showGoogleCurl ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");
  const genericSecretValue = form.aiApiKey
    || (genericUsesStoredApiKey ? (showAiApiKey ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");

  const toggleAiApiKeyVisibility = async (field: "google" | "generic") => {
    const isVisible = field === "google" ? showGoogleCurl : showAiApiKey;
    const setVisible = field === "google" ? setShowGoogleCurl : setShowAiApiKey;
    if (isVisible) {
      setVisible(false);
      setRevealedAiApiKey("");
      setAiApiKeyRevealState("idle");
      setAiApiKeyRevealMessage("");
      return;
    }

    const pendingValue = field === "google" ? form.aiGoogleCurl || form.aiApiKey : form.aiApiKey;
    if (pendingValue || !form.aiStoredApiKeyConfigured) {
      setVisible(true);
      return;
    }

    const requestedService = form.aiService;
    const bridge = window.yardimciDesktop;
    if (!bridge?.revealAiApiKey) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage("API anahtarı gösterilemiyor. Uygulamayı yeniden başlatın.");
      return;
    }

    setAiApiKeyRevealState("loading");
    setAiApiKeyRevealMessage("");
    const result = await bridge.revealAiApiKey(requestedService);
    if (selectedAiServiceRef.current !== requestedService) {
      return;
    }
    if (!result.ok) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage(result.message);
      return;
    }

    setRevealedAiApiKey(result.apiKey);
    setVisible(true);
    setAiApiKeyRevealState("idle");
  };

  const replaceGoogleSecret = (value: string) => {
    let nextValue = value;
    if (googleUsesStoredApiKey && !showGoogleCurl && nextValue.startsWith(STORED_AI_API_KEY_MASK)) {
      nextValue = nextValue.slice(STORED_AI_API_KEY_MASK.length);
    }

    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    if (form.aiApiKey && !form.aiGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue });
      return;
    }
    if (googleUsesStoredApiKey && showGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue, aiGoogleCurl: "" });
      return;
    }
    onFormChange({ ...form, aiGoogleCurl: nextValue, aiApiKey: "" });
  };

  const replaceGenericSecret = (value: string) => {
    const nextValue = genericUsesStoredApiKey && !showAiApiKey && value.startsWith(STORED_AI_API_KEY_MASK)
      ? value.slice(STORED_AI_API_KEY_MASK.length)
      : value;
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    update("aiApiKey", nextValue);
  };

  const updateAiService = (service: string) => {
    const normalizedService = normalizeAiService(service);
    const currentDraft = toAiServiceFormDraft(form);
    const targetDraft = form.aiServiceDrafts[normalizedService] ?? createDefaultAiServiceDraft(normalizedService);
    onFormChange({
      ...form,
      aiService: normalizedService,
      aiProjectName: targetDraft.projectName,
      aiGoogleCurl: targetDraft.googleCurl,
      aiBaseUrl: targetDraft.baseUrl,
      aiModel: targetDraft.model,
      aiModelOptions: targetDraft.modelOptions,
      aiApiKey: targetDraft.apiKey,
      aiStoredApiKeyConfigured: targetDraft.storedApiKeyConfigured,
      clearAiApiKey: targetDraft.clearApiKey,
      aiTimeoutSeconds: targetDraft.timeoutSeconds,
      aiServiceDrafts: {
        ...form.aiServiceDrafts,
        [form.aiService]: currentDraft
      }
    });
  };

  const renderAiConnectionActions = (inline: boolean) => (
    <div className={`setup-ai-actions${inline ? " is-inline" : ""} sync-${aiConnectionTestState}`}>
      <button className="setup-secondary" type="button" onClick={onTestAiConnection} disabled={!form.aiEnabled || aiConnectionTestState === "loading" || (form.aiService === "gemini" && !form.aiGoogleCurl.trim() && !form.aiApiKey.trim() && !form.aiStoredApiKeyConfigured)}>
        <RefreshCw size={16} aria-hidden="true" />
        {aiConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Bağlantıyı Dene"}
      </button>
      <span>{aiConnectionTestMessage}</span>
      <small>{setupData.aiLastPublishedAt ? `Web ayarı son yayın: ${formatDateTime(setupData.aiLastPublishedAt)}` : "Web ayarı henüz bu cihazdan yayınlanmadı."}</small>
    </div>
  );

  return (
    <main className={embedded ? "setup-shell is-embedded" : "setup-shell"}>
      {!embedded && <section className="setup-hero" aria-label="İlk kurulum">
        <div className="setup-brand">
          <img className="setup-brand-symbol" src="./assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
          <div>
            <strong>Yardımcı Asistan</strong>
            <small>{setupData.setupRequired ? "İlk Kurulum" : "Ayarlar"}</small>
          </div>
        </div>
        <div>
          <p className="setup-eyebrow">Kurulum Sihirbazı</p>
          <h1>İşletme panelini kullanıma hazırlayın.</h1>
          <p>Firma bilgileri, aktif modüller, WhatsApp ve web modül bağlantısı bu ekrandan ayarlanır. AI ayarı isteğe bağlıdır.</p>
        </div>
        <dl className="setup-paths">
          <div>
            <dt>Veri dosyası</dt>
            <dd>{setupData.setupRequired ? "İlk kayıt sonrası oluşur" : "Bu bilgisayarda güvenle saklanır"}</dd>
          </div>
          <div>
            <dt>Yedekleme</dt>
            <dd>Uygulama veri klasöründe backups klasörü ayrıldı</dd>
          </div>
        </dl>
      </section>}

      <section className="setup-form-surface">
        <div className="settings-level-tabs" role="tablist" aria-label="Ayar düzeyi">
          <button className={settingsLevel === "basic" ? "is-active" : ""} type="button" role="tab" aria-selected={settingsLevel === "basic"} onClick={() => setSettingsLevel("basic")}>Temel Ayarlar</button>
          <button className={settingsLevel === "advanced" ? "is-active" : ""} type="button" role="tab" aria-selected={settingsLevel === "advanced"} onClick={() => setSettingsLevel("advanced")}>Gelişmiş Ayarlar</button>
        </div>
        {settingsLevel === "basic" && <div className="settings-section-grid settings-basic-grid">
        {embedded && <div className="setup-section appearance-settings">
          <div className="setup-section-title">
            <h2>Uygulama Görünümü</h2>
          </div>
          <p className="setup-section-description">Ekranınıza uygun boyutu ve tema görünümünü seçin. Değişiklikler anında uygulanır ve bu bilgisayarda saklanır.</p>
          <div className="setup-grid two">
            <label>
              Arayüz ölçeği
              <select
                value={String(uiPreferences.scale)}
                onChange={(event) => onUiPreferencesChange({ ...uiPreferences, scale: Number(event.target.value) })}
              >
                {UI_SCALE_OPTIONS.map((scale) => (
                  <option value={scale} key={scale}>{Math.round(scale * 100)}%</option>
                ))}
              </select>
              <small>Metinler, menüler ve içerik alanları birlikte ölçeklenir.</small>
            </label>
            <div className="setup-field">
              <span>Tema</span>
              <label className="setup-checkline appearance-theme-toggle">
                <input
                  checked={uiPreferences.theme === "dark"}
                  onChange={(event) => onUiPreferencesChange({ ...uiPreferences, theme: event.target.checked ? "dark" : "light" })}
                  type="checkbox"
                />
                Karanlık tema
              </label>
              <small>Az ışıklı ortamlarda daha rahat bir görünüm sağlar.</small>
            </div>
          </div>
        </div>}
        <div className="setup-section settings-identity-section">
          <div className="setup-section-title">
            {!embedded && <p>Firma Bilgileri</p>}
            <h2>Temel Tanım</h2>
          </div>
          <div className="setup-grid two">
            <label>
              Firma adı
              <input value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="Deniz Çiçeği Pansiyon & Kafe" />
            </label>
            <label>
              Sektör tipi
              <select value={form.businessType} onChange={(event) => update("businessType", event.target.value)}>
                <option value="pension_restaurant">Pansiyon + Restoran/Kafe</option>
                <option value="pension">Pansiyon</option>
                <option value="restaurant">Restoran</option>
                <option value="cafe">Kafe</option>
                <option value="other">Diğer</option>
              </select>
            </label>
            <label>
              Telefon
              <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label>
              WhatsApp
              <input value={form.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label>
              E-posta
              <input value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="info@firma.com" />
            </label>
            <label>
              Adres
              <input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Kısa işletme adresi" />
            </label>
          </div>
        </div>

        <div className="setup-section settings-modules-section">
          <div className="setup-section-title">
            {!embedded && <p>Modüller</p>}
            <h2>Kullanılacak Alanlar</h2>
          </div>
          <div className="setup-toggle-grid">
            <label>
              <input checked={form.roomsEnabled} onChange={(event) => update("roomsEnabled", event.target.checked)} type="checkbox" />
              Odalar
            </label>
            <label>
              <input checked={form.tablesEnabled} onChange={(event) => update("tablesEnabled", event.target.checked)} type="checkbox" />
              Masalar
            </label>
            <label>
              <input checked={form.qrMenuEnabled} onChange={(event) => update("qrMenuEnabled", event.target.checked)} type="checkbox" />
              QR Menü
            </label>
            <label>
              <input checked={form.whatsappEnabled} onChange={(event) => update("whatsappEnabled", event.target.checked)} type="checkbox" />
              WhatsApp
            </label>
            <label>
              <input checked={form.androidEnabled} onChange={(event) => update("androidEnabled", event.target.checked)} type="checkbox" />
              Android
            </label>
          </div>
        </div>

        <div className="setup-section settings-daily-section">
          <div className="setup-section-title">
            {!embedded && <p>Kapasite ve Yardımcı</p>}
            <h2>Günlük Kullanım</h2>
          </div>
          <div className="setup-count-row settings-room-count">
            <label>
              Oda sayısı
              <input value={form.roomCount} onChange={(event) => update("roomCount", event.target.value)} inputMode="numeric" min="0" step="1" type="number" />
            </label>
          </div>
          <div className="table-category-editor">
            <div className="table-category-heading">
              <div>
                <strong>Masa kategorileri</strong>
                <small>Restoran alanlarını adlandırın ve her alandaki masa sayısını belirleyin.</small>
              </div>
              <span>{tableCountTotal} masa</span>
            </div>
            {form.tableCategories.length === 0 ? (
              <div className="table-category-empty">
                <span>Henüz masa kategorisi yok.</span>
                <small>Masa kullanacaksanız ilk kategoriyi ekleyin.</small>
              </div>
            ) : (
              <div className="table-category-list">
                {form.tableCategories.map((category, index) => (
                  <div className="table-category-row" key={category.key}>
                    <label>
                      <span>Kategori adı</span>
                      <input
                        value={category.name}
                        onChange={(event) => updateTableCategory(category.key, "name", event.target.value)}
                        placeholder={index === 0 ? "Örn. Salon" : "Örn. Bahçe"}
                        maxLength={50}
                      />
                    </label>
                    <label className="table-category-count">
                      <span>Masa</span>
                      <input
                        value={category.tableCount}
                        onChange={(event) => updateTableCategory(category.key, "tableCount", event.target.value)}
                        inputMode="numeric"
                        min="1"
                        max="200"
                        step="1"
                        type="number"
                      />
                    </label>
                    <button
                      className="table-category-remove"
                      type="button"
                      onClick={() => removeTableCategory(category.key)}
                      aria-label={`${category.name || `${index + 1}. kategori`} satırını kaldır`}
                      title="Kategoriyi kaldır"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="table-category-add" type="button" onClick={addTableCategory}>
              <Plus size={15} aria-hidden="true" />
              Kategori Ekle
            </button>
            <small className="table-category-note">
              Adedi azalttığınızda kullanılmayan masalar arşivlenir; aktif adisyon veya rezervasyona bağlı masalar korunur.
            </small>
          </div>
          <label className="setup-checkline settings-ai-toggle">
            <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
            AI cevap önerileri açık
          </label>
        </div>
        {embedded && (
          <RoomManagementSection
            roomCount={form.roomCount}
            dashboardRoomCount={dashboardData?.rooms.length ?? 0}
            onRoomCountChange={(value) => update("roomCount", value)}
          />
        )}
        {embedded && (
          <PasswordSettings
            configured={setupData.appPasswordConfigured}
            onConfiguredChange={onAppPasswordConfiguredChange ?? (() => undefined)}
          />
        )}
        {embedded && form.androidEnabled && (
          <AndroidDevicesSection
            devices={dashboardData?.androidDevices ?? []}
            state={androidDeviceState}
            message={androidDeviceMessage}
            onSetRole={onSetAndroidDeviceRole}
            onSetPermissionGroups={onSetAndroidDevicePermissionGroups}
            onSetActive={onSetAndroidDeviceActive}
            onResetPermissions={onResetAndroidDevicePermissions}
            onRevoke={onRevokeAndroidDevice}
          />
        )}
        </div>}

        {settingsLevel === "advanced" && <div className="settings-section-grid settings-advanced-grid"><div className="setup-section settings-web-section">
          <div className="setup-section-title settings-web-title">
            {!embedded && <p>Web Bağlantısı</p>}
            <h2>Web Bağlantısı</h2>
            <label className="setup-checkline settings-auto-sync-toggle">
              <input checked={form.autoSyncEnabled} onChange={(event) => update("autoSyncEnabled", event.target.checked)} type="checkbox" />
              Otomatik eşitle
            </label>
          </div>
          <div className="setup-grid two">
            <label className="setup-field">
              Web eşitleme adresi
              <input value={form.webModuleUrl} onChange={(event) => update("webModuleUrl", event.target.value)} placeholder="https://yardimciasistan.alwaysdata.net/yardimci-asistan" />
            </label>
            <label>
              Web güvenlik anahtarı
              <input value={form.syncSecret} onChange={(event) => update("syncSecret", event.target.value)} placeholder="uzun-gizli-anahtar" />
            </label>
          </div>
        </div>

        <div className="setup-section setup-ai-section">
          <div className="setup-section-title">
            {!embedded && <p>AI Bağlantısı</p>}
            <h2>AI Servisi ve Model</h2>
          </div>
          <div className="setup-grid two">
            <label className="setup-ai-service-field">
              Servis sağlayıcı
              <select value={form.aiService} onChange={(event) => updateAiService(event.target.value)} disabled={!form.aiEnabled}>
                {aiServicePresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.label}{isAiServiceProfileStored(form, preset.id) ? " · kayıtlı" : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.aiService === "gemini" ? (
              <>
                <div className="setup-field setup-ai-studio-help">
                  <button className="setup-secondary" type="button" onClick={() => void window.yardimciDesktop?.openExternal("https://aistudio.google.com/apikey")} disabled={!form.aiEnabled}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Google AI Studio'yu Aç
                  </button>
                  <small>Bağlantı anahtarı ayrıntısında “Copy cURL quickstart” seçeneğini kullanın.</small>
                </div>
                <div className="setup-field setup-ai-curl-field">
                  <span>Google AI Studio cURL bağlantısı</span>
                  <div className="setup-secret-input">
                    <input
                      aria-label="Google AI Studio cURL bağlantısı"
                      value={googleSecretValue}
                      onChange={(event) => replaceGoogleSecret(event.target.value)}
                      onFocus={(event) => {
                        if (googleUsesStoredApiKey) event.currentTarget.select();
                      }}
                      type={showGoogleCurl || googleUsesStoredApiKey ? "text" : "password"}
                      placeholder={form.aiStoredApiKeyConfigured ? "Kayıtlı bağlantıyı değiştirmek için yeni cURL yapıştırın" : "Copy cURL quickstart çıktısını buraya yapıştırın"}
                      disabled={!form.aiEnabled || form.clearAiApiKey}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="button" onClick={() => void toggleAiApiKeyVisibility("google")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showGoogleCurl}>
                      {aiApiKeyRevealState === "loading" ? "Açılıyor" : showGoogleCurl ? "Gizle" : "Göster"}
                    </button>
                  </div>
                  <small>{form.aiStoredApiKeyConfigured ? "Kayıtlı API anahtarı maskelenir; Göster ile görüntüleyebilir veya yeni cURL yapıştırabilirsiniz." : "Komut yalnız bağlantı kontrolünde okunur; adres, anahtar ve örnek model otomatik hazırlanır."}</small>
                  {aiApiKeyRevealMessage && <small className="setup-secret-error" role="status">{aiApiKeyRevealMessage}</small>}
                </div>
                {renderAiConnectionActions(true)}
              </>
            ) : (
              <label className="setup-grid-wide">
                Bağlantı adresi
                <input value={form.aiBaseUrl} onChange={(event) => update("aiBaseUrl", event.target.value)} placeholder="https://servis.example/v1" disabled={!form.aiEnabled} spellCheck={false} />
              </label>
            )}
            <label>
              Model adı
              {form.aiService === "gemini" && form.aiModelOptions.length > 0 ? (
                <select value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} disabled={!form.aiEnabled}>
                  {form.aiModelOptions.map((model) => (
                    <option value={model.id} key={model.id}>{model.label}</option>
                  ))}
                </select>
              ) : (
                <input value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder={form.aiService === "gemini" ? "Bağlantı kontrolünden sonra listelenir" : "Serviste görünen model adı"} disabled={!form.aiEnabled || form.aiService === "gemini"} spellCheck={false} />
              )}
              {form.aiService === "gemini" && (
                <small>{form.aiModelOptions.length > 0
                  ? form.aiStoredApiKeyConfigured
                    ? `${form.aiModelOptions.length} görsel ve metin modeli bu sağlayıcı altında kayıtlı.`
                    : `${form.aiModelOptions.length} görsel ve metin modeli hazır; kalıcı olması için ayarları kaydedin.`
                  : "Bağlantıyı Dene ile görsel destekli, güncel modeller otomatik alınır."}</small>
              )}
            </label>
            <label>
              Yanıt bekleme süresi (saniye)
              <input value={form.aiTimeoutSeconds} onChange={(event) => update("aiTimeoutSeconds", event.target.value)} inputMode="numeric" min="5" max="120" disabled={!form.aiEnabled} />
            </label>
            {form.aiService !== "gemini" && <div className="setup-field setup-grid-wide">
              <span>AI güvenlik anahtarı</span>
              <div className="setup-secret-input">
                <input
                  aria-label="AI güvenlik anahtarı"
                  value={genericSecretValue}
                  onChange={(event) => replaceGenericSecret(event.target.value)}
                  onFocus={(event) => {
                    if (genericUsesStoredApiKey) event.currentTarget.select();
                  }}
                  type={showAiApiKey || genericUsesStoredApiKey ? "text" : "password"}
                  placeholder={form.aiStoredApiKeyConfigured ? "Yeni anahtar girmezseniz bu sağlayıcının kayıtlı anahtarı korunur" : "Servis erişim anahtarını girin"}
                  disabled={!form.aiEnabled || form.clearAiApiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button type="button" onClick={() => void toggleAiApiKeyVisibility("generic")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showAiApiKey}>
                  {aiApiKeyRevealState === "loading" ? "Açılıyor" : showAiApiKey ? "Gizle" : "Göster"}
                </button>
              </div>
              <small>{form.aiStoredApiKeyConfigured ? "Kayıtlı API anahtarı maskelenir; Göster ile görüntüleyebilirsiniz." : "Bu sağlayıcı için anahtar henüz kayıtlı değil."}</small>
              {aiApiKeyRevealMessage && <small className="setup-secret-error" role="status">{aiApiKeyRevealMessage}</small>}
            </div>}
            {form.aiStoredApiKeyConfigured && (
              <label className="setup-checkline setup-grid-wide setup-danger-checkline">
                <input
                  checked={form.clearAiApiKey}
                  onChange={(event) => onFormChange({
                    ...form,
                    clearAiApiKey: event.target.checked,
                    aiEnabled: event.target.checked ? false : form.aiEnabled
                  })}
                  type="checkbox"
                />
                Bu sağlayıcının kayıtlı anahtarını sil ve AI yardımcıyı kapat
              </label>
            )}
          </div>
          {form.aiService !== "gemini" && renderAiConnectionActions(false)}
        </div>

        <div className="setup-section settings-storage-section">
          <div className="setup-section-title">{!embedded && <p>Bu Bilgisayar</p>}<h2>Kayıt ve Yedekleme</h2></div>
          <dl className="info-list settings-technical-info">
            <div><dt>Yerel kayıt dosyası</dt><dd>{dashboardData?.databasePath ?? "İlk kayıt sonrası oluşur"}</dd></div>
            <div><dt>Yedek klasörü</dt><dd>{dashboardData?.backupPath ?? "İlk kayıt sonrası oluşur"}</dd></div>
          </dl>
          <div className="settings-action-row">
            <button className="setup-secondary" type="button" onClick={onCreateBackup} disabled={!onCreateBackup || backupState === "loading"}><Save size={16} aria-hidden="true" />{backupState === "loading" ? "Yedekleniyor" : "Yedek Al"}</button>
            {form.androidEnabled && <button className="setup-secondary" type="button" onClick={onPublishAndroid} disabled={!onPublishAndroid || androidPublishState === "loading"}><UploadCloud size={16} aria-hidden="true" />{androidPublishState === "loading" ? "Yayınlanıyor" : "Android'e Yayınla"}</button>}
          </div>
          <p className={`menu-status sync-${backupState}`}>{backupMessage}</p>
          {form.androidEnabled && <p className={`menu-status sync-${androidPublishState}`}>{androidPublishMessage}</p>}
        </div>
        </div>}

        {!embedded && <footer className={`setup-footer sync-${saveState}`}>
          <span>{message}</span>
          <div>
            {!setupData.setupRequired && (
              <button className="setup-secondary" type="button" onClick={onSkip}>
                Panele Dön
              </button>
            )}
            <button className="setup-primary" type="button" onClick={onSave} disabled={saveState === "loading"}>
              <Save size={16} aria-hidden="true" />
              {setupData.setupRequired ? "Kurulumu Kaydet" : "Ayarları Kaydet"}
            </button>
          </div>
        </footer>}
      </section>
    </main>
  );
}

interface AndroidDevicesSectionProps {
  devices: DesktopAndroidDevice[];
  state: SyncState;
  message: string;
  onSetRole?: (deviceId: string, role: "admin" | "staff") => void;
  onSetPermissionGroups?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetActive?: (deviceId: string, active: boolean) => void;
  onResetPermissions?: (deviceId: string) => void;
  onRevoke?: (device: DesktopAndroidDevice) => void;
}

function AndroidDevicesSection({
  devices,
  state,
  message,
  onSetRole,
  onSetPermissionGroups,
  onSetActive,
  onResetPermissions,
  onRevoke
}: AndroidDevicesSectionProps) {
  const busy = state === "loading";
  const availableDevices = devices.filter((device) => !device.revokedAt);
  const removedDevices = devices.filter((device) => Boolean(device.revokedAt));
  const restoreDevice = (device: DesktopAndroidDevice) => {
    if (!onSetActive) return;
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceName = device.deviceName || "Android Telefon";
    const roleLabel = device.role === "admin" ? "Yönetici" : "Personel";
    if (!window.confirm(`${deviceName} (${shortId}) ${roleLabel} rolü ve kayıtlı görev alanlarıyla geri yüklensin mi?`)) {
      return;
    }
    onSetActive(device.deviceId, true);
  };
  return (
    <section className="setup-section settings-android-devices-section">
      <div className="setup-section-title android-devices-heading">
        <div>
          <p>Telefon Yetkileri</p>
          <h2>Android Cihazlar</h2>
        </div>
        <span>{availableDevices.length} cihaz</span>
      </div>
      <p className="setup-section-description">Rol ve görev alanları yalnız bu bilgisayardan değiştirilebilir. Kaldırılan cihazlar ana listeden çıkarılır ve erişimleri kapalı kalır.</p>
      {availableDevices.length === 0 ? (
        <div className="android-devices-empty">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <strong>{removedDevices.length > 0 ? "Etkin Android cihaz yok." : "Henüz Android cihaz görülmedi."}</strong>
            <span>{removedDevices.length > 0 ? "Gerekirse kaldırılan cihazlardan birini geri yükleyin." : "Telefon web modülüne bağlandığında burada personel olarak görünür."}</span>
          </div>
        </div>
      ) : (
        <div className="android-device-list">
          {availableDevices.map((device) => {
            const shortId = compactAndroidDeviceId(device.deviceId);
            return (
              <article className={`android-device-card${device.isActive ? "" : " is-inactive"}`} key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{shortId}</code>
                  </div>
                  <div className="android-device-badges">
                    <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                    <span className={`device-state${device.isActive ? " is-active" : " is-inactive"}`}>{device.isActive ? "Aktif" : "Pasif"}</span>
                  </div>
                </div>
                <dl className="android-device-details">
                  <div><dt>Son bağlantı</dt><dd>{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "Henüz yok"}</dd></div>
                  <div><dt>Uygulama</dt><dd>{device.appVersion || "Sürüm bilinmiyor"}</dd></div>
                  <div><dt>Görev özeti</dt><dd>{androidDevicePermissionSummary(device)}</dd></div>
                </dl>
                {device.role === "admin" ? (
                  <div className="android-device-all-permissions">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <div>
                      <strong>Tüm yetkiler açık</strong>
                      <span>Yönetici cihaz bütün görev alanlarını kullanabilir.</span>
                    </div>
                  </div>
                ) : (
                  <fieldset className="android-device-permission-groups" disabled={busy}>
                    <legend>Görev alanları</legend>
                    <div className="android-device-permission-grid">
                      {ANDROID_PERMISSION_GROUP_OPTIONS.map((group) => {
                        const checked = Boolean(device.permissionGroups?.[group.id]);
                        return (
                          <label className={`android-permission-group${checked ? " is-selected" : ""}`} key={group.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => onSetPermissionGroups?.(
                                device.deviceId,
                                androidPermissionGroupsWith(device, group.id, event.target.checked)
                              )}
                              disabled={busy || !onSetPermissionGroups}
                            />
                            <span>
                              <strong>{group.label}</strong>
                              <small>{group.description}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <div className="android-device-actions">
                  <button className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "admin")} disabled={busy || device.role === "admin"}>
                    <ShieldCheck size={15} aria-hidden="true" /> Yönetici Yap
                  </button>
                  <button className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "staff")} disabled={busy || device.role === "staff"}>Personel Yap</button>
                  <button className="setup-secondary" type="button" onClick={() => onSetActive?.(device.deviceId, !device.isActive)} disabled={busy}>{device.isActive ? "Pasifleştir" : "Aktif Et"}</button>
                  <button className="setup-secondary" type="button" onClick={() => onResetPermissions?.(device.deviceId)} disabled={busy}>Yetkileri Sıfırla</button>
                  <button className="setup-secondary android-device-remove" type="button" onClick={() => onRevoke?.(device)} disabled={busy}>Kaldır</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {removedDevices.length > 0 && (
        <details className="android-removed-devices">
          <summary>
            <span>Kaldırılan cihazlar</span>
            <strong>{removedDevices.length}</strong>
          </summary>
          <div className="android-removed-device-list">
            {removedDevices.map((device) => (
              <article className="android-removed-device-row" key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{compactAndroidDeviceId(device.deviceId)}</code>
                  </div>
                  <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                </div>
                <span>{device.revokedAt ? `${formatDateTime(device.revokedAt)} tarihinde kaldırıldı` : "Erişimi kapalı"}</span>
                <button
                  aria-label={`${device.deviceName || "Android Telefon"} (${compactAndroidDeviceId(device.deviceId)}) cihazını geri yükle`}
                  className="setup-secondary"
                  type="button"
                  onClick={() => restoreDevice(device)}
                  disabled={busy || !onSetActive}
                >
                  Geri Yükle
                </button>
              </article>
            ))}
          </div>
        </details>
      )}
      <p className={`menu-status sync-${state}`} role="status" aria-live="polite">{message}</p>
    </section>
  );
}

function compactAndroidDeviceId(deviceId: string): string {
  return deviceId.length > 22
    ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}`
    : deviceId;
}

function androidPermissionGroupsWith(
  device: DesktopAndroidDevice,
  changedGroupId: AndroidPermissionGroupId,
  enabled: boolean
): AndroidPermissionGroups {
  return Object.fromEntries(ANDROID_PERMISSION_GROUP_OPTIONS.map((group) => [
    group.id,
    group.id === changedGroupId ? enabled : Boolean(device.permissionGroups?.[group.id])
  ])) as AndroidPermissionGroups;
}

function androidDevicePermissionSummary(device: DesktopAndroidDevice): string {
  if (!device.isActive) {
    return "Yetkisiz / Pasif";
  }
  if (device.role === "admin") {
    return "Tüm yetkiler";
  }
  const selected = ANDROID_PERMISSION_GROUP_OPTIONS
    .filter((group) => device.permissionGroups?.[group.id])
    .map((group) => group.shortLabel);
  return selected.length > 0 ? selected.join(" + ") : "Görev alanı seçilmedi";
}

interface AiWorkspaceProps {
  setupData: DesktopSetupData;
  dashboardData: DesktopDashboardData;
  mode: AiWorkspaceMode;
  selectedRequestId: string;
  instructions: string;
  entry: AiWorkspaceHistoryEntry | null;
  content: string;
  history: AiWorkspaceHistoryEntry[];
  state: SyncState;
  message: string;
  onModeChange: (mode: AiWorkspaceMode) => void;
  onRequestChange: (requestId: string) => void;
  onInstructionsChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onCopy: () => void;
  onWhatsApp: () => void;
  onSelectHistory: (entry: AiWorkspaceHistoryEntry) => void;
}

function AiWorkspace({
  setupData,
  dashboardData,
  mode,
  selectedRequestId,
  instructions,
  entry,
  content,
  history,
  state,
  message,
  onModeChange,
  onRequestChange,
  onInstructionsChange,
  onContentChange,
  onGenerate,
  onSave,
  onCopy,
  onWhatsApp,
  onSelectHistory
}: AiWorkspaceProps) {
  const needsRequest = mode !== "daily";
  const selectedRequest = dashboardData.requests.find((request) => request.id === selectedRequestId);
  const generateDisabled = !setupData.aiEnabled || state === "loading" || (needsRequest && !selectedRequest);

  return (
    <section className="ai-workspace" aria-label="AI Yardımcı çalışma alanı">
      <div className="ai-status-grid">
        <article className="ai-status-card">
          <span>AI önerileri</span>
          <strong className={setupData.aiEnabled ? "is-online" : "is-offline"}>{setupData.aiEnabled ? "Kullanıma hazır" : "Kapalı"}</strong>
          <small>Hazır mesaj ve özetler</small>
        </article>
        <article className="ai-status-card">
          <span>Son çalışmalar</span>
          <strong>{history.length} kayıt</strong>
          <small>Bu bilgisayarda saklanır</small>
        </article>
        <article className="ai-status-card">
          <span>Gönderim kontrolü</span>
          <strong>Her zaman sizde</strong>
          <small>Metinler otomatik gönderilmez</small>
        </article>
      </div>

      <div className="ai-workspace-grid">
        <aside className="panel ai-tool-panel">
          <div className="panel-heading compact">
            <div>
              <p>Çalışma Türü</p>
              <h2>Ne hazırlayalım?</h2>
            </div>
          </div>
          <div className="ai-mode-list" role="tablist" aria-label="AI çalışma türleri">
            {([
              ["reply", "Cevap taslağı", "WhatsApp için sıcak ve kontrollü yanıt"],
              ["summary", "Talebi özetle", "Eksikleri ve önemli noktaları çıkar"],
              ["daily", "Günü değerlendir", "İşleri, riskleri ve öncelikleri sırala"]
            ] as Array<[AiWorkspaceMode, string, string]>).map(([value, label, description]) => (
              <button
                className={mode === value ? "ai-mode-button is-active" : "ai-mode-button"}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => onModeChange(value)}
                key={value}
              >
                <Sparkles size={17} aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>

          <label className="ai-field">
            Talep / müşteri
            <select value={selectedRequestId} onChange={(event) => onRequestChange(event.target.value)} disabled={!needsRequest}>
              {dashboardData.requests.length === 0 && <option value="">Talep bulunmuyor</option>}
              {dashboardData.requests.map((request) => (
                <option value={request.id} key={request.id}>{request.customer_name} — {formatRequestType(request.request_type)}</option>
              ))}
            </select>
          </label>
          {selectedRequest && needsRequest && (
            <div className="ai-request-context">
              <strong>{selectedRequest.customer_name}</strong>
              <span>{selectedRequest.date_text || selectedRequest.start_date || "Tarih yok"} • {selectedRequest.guest_count || "?"} kişi</span>
              <p>{selectedRequest.message || "Talep notu bulunmuyor."}</p>
            </div>
          )}
          <label className="ai-field">
            Ek talimat <small>isteğe bağlı</small>
            <textarea
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value.slice(0, 800))}
              placeholder={mode === "reply" ? "Örn. Daha kısa ve samimi yaz." : "Örn. Bugünkü girişleri öne al."}
              rows={4}
            />
            <small>{instructions.length}/800</small>
          </label>
          <button className="primary-command ai-generate-button" type="button" onClick={onGenerate} disabled={generateDisabled}>
            <Sparkles size={17} aria-hidden="true" />
            {state === "loading" ? "Hazırlanıyor" : "AI Sonucunu Hazırla"}
          </button>
        </aside>

        <article className="panel ai-result-panel">
          <div className="panel-heading compact">
            <div>
              <p>Düzenlenebilir Sonuç</p>
              <h2>{entry ? getAiWorkspaceModeLabel(entry.mode) : "Henüz sonuç yok"}</h2>
            </div>
            <span className={`status-badge ${state === "success" ? "ok" : state === "error" ? "wait" : "info"}`}>
              {state === "loading" ? "Çalışıyor" : entry?.fallback ? "Yerel güvenli" : entry ? "AI hazır" : "Bekliyor"}
            </span>
          </div>

          {entry ? (
            <>
              <div className="ai-result-meta">
                <span>{entry.requestLabel}</span>
                <span>{entry.fallback ? "Güvenli taslak" : "AI taslağı"}</span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              {entry.missingFields.length > 0 && (
                <div className="ai-missing-fields"><strong>Eksik bilgiler:</strong> {entry.missingFields.join(", ")}</div>
              )}
              <textarea
                className="ai-result-editor"
                aria-label="AI sonucu"
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                rows={16}
              />
              <div className="ai-result-actions">
                <button type="button" onClick={onCopy}><Copy size={16} aria-hidden="true" />Kopyala</button>
                <button type="button" onClick={onSave} disabled={entry.mode === "daily"}><Save size={16} aria-hidden="true" />Talebe Kaydet</button>
                <button className="whatsapp-action" type="button" onClick={onWhatsApp} disabled={entry.mode !== "reply"}>
                  <MessageCircle size={16} aria-hidden="true" />WhatsApp'a Hazırla
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state ai-empty-result">
              <Sparkles size={34} aria-hidden="true" />
              <strong>AI çalışma alanı hazır.</strong>
              <p>Sol taraftan araç ve talep seçip sonucu hazırlayın. Üretilen metin gönderilmeden önce mutlaka sizin kontrolünüzden geçer.</p>
            </div>
          )}
          <p className={`ai-workspace-message sync-${state}`}>{message}</p>
          <div className="ai-guardrail-note">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>AI kesin rezervasyon, müsaitlik veya fiyat onayı vermez. Son karar ve gönderim her zaman işletme sahibindedir.</span>
          </div>
        </article>
      </div>

      <article className="panel ai-history-panel">
        <div className="panel-heading compact">
          <div><p>Yerel Geçmiş</p><h2>Son çalışmalar</h2></div>
          <span className="status-badge info">{history.length} kayıt</span>
        </div>
        {history.length === 0 ? (
          <div className="empty-state compact-empty"><strong>Henüz geçmiş yok.</strong><p>Hazırlanan sonuçlar yalnız bu bilgisayarda saklanır.</p></div>
        ) : (
          <div className="ai-history-list">
            {history.map((historyEntry) => (
              <button type="button" onClick={() => onSelectHistory(historyEntry)} key={historyEntry.id}>
                <span className="ai-history-icon"><Sparkles size={16} aria-hidden="true" /></span>
                <span><strong>{getAiWorkspaceModeLabel(historyEntry.mode)}</strong><small>{historyEntry.requestLabel}</small></span>
                <time>{formatDateTime(historyEntry.createdAt)}</time>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

interface WhatsAppWorkspaceProps {
  view: "safe" | "web";
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  selectedMessage: string;
  selectedUrl: string;
  aiEnabled: boolean;
  aiState: SyncState;
  aiMessage: string;
  onSelectRequest: (requestId: string) => void;
  onOpenExternal: () => void;
  onReturnToSafe?: () => void;
  onCall?: () => void;
  onRewrite: (instructions: string) => void;
  onMessageSent: (requestId: string, message: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteMessage: (request: SyncedCustomerRequest) => void;
}

type WhatsAppWebViewElement = HTMLElement & {
  reload?: () => void;
  getURL?: () => string;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
};

interface WhatsAppDomResult {
  ok: boolean;
  code: string;
  message: string;
  chatTitle?: string;
  composerText?: string;
}

function asWhatsAppDomResult(value: unknown): WhatsAppDomResult {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      code: "invalid_result",
      message: "WhatsApp Web beklenen doğrulama sonucunu döndürmedi."
    };
  }

  const result = value as Partial<WhatsAppDomResult>;
  return {
    ok: result.ok === true,
    code: String(result.code ?? "unknown"),
    message: String(result.message ?? "WhatsApp Web işlemi tamamlanamadı."),
    chatTitle: typeof result.chatTitle === "string" ? result.chatTitle : "",
    composerText: typeof result.composerText === "string" ? result.composerText : ""
  };
}

function createWhatsAppInspectionScript(expectedMessage: string) {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const clean = (value) => String(value || "")
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\u00a0/g, " ")
      .replace(/\\u200b/g, "")
      .split("\\n")
      .map((line) => line.trimEnd())
      .join("\\n")
      .trim();
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const firstVisible = (root, selectors) => {
      for (const selector of selectors) {
        const match = Array.from(root.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const root = document.querySelector("#main");
    if (!root) {
      return { ok: false, code: "chat_missing", message: "Açık bir WhatsApp sohbeti bulunamadı. Önce Müşteri Numarasına Git düğmesini kullanın." };
    }
    const composer = firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    if (!composer) {
      return { ok: false, code: "composer_missing", message: "WhatsApp mesaj kutusu bulunamadı. Oturumun açık ve sohbetin yüklenmiş olduğunu kontrol edin." };
    }
    const composerText = clean(composer.innerText || composer.textContent);
    if (composerText !== clean(expectedMessage)) {
      return { ok: false, code: "message_mismatch", message: "Güvenlik kontrolü: WhatsApp mesaj kutusundaki metin onaylanacak AI taslağıyla birebir eşleşmiyor.", composerText };
    }
    const titleNode = firstVisible(root, [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [role="button"] span[dir="auto"]'
    ]);
    const chatTitle = clean(titleNode && (titleNode.getAttribute("title") || titleNode.textContent));
    if (!chatTitle) {
      return { ok: false, code: "recipient_missing", message: "Açık sohbetin alıcı bilgisi okunamadı; gönderim güvenlik nedeniyle durduruldu." };
    }
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi hazır değil. Sohbet ve mesaj kutusunu kontrol edin." };
    }
    return { ok: true, code: "ready", message: "Sohbet ve mesaj doğrulandı.", chatTitle, composerText };
  })()`;
}

function createWhatsAppSendScript(expectedMessage: string, expectedChatTitle: string) {
  return `(() => {
    const expectedMessage = ${JSON.stringify(expectedMessage.trim())};
    const expectedChatTitle = ${JSON.stringify(expectedChatTitle.trim())};
    const clean = (value) => String(value || "")
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\u00a0/g, " ")
      .replace(/\\u200b/g, "")
      .split("\\n")
      .map((line) => line.trimEnd())
      .join("\\n")
      .trim();
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const firstVisible = (root, selectors) => {
      for (const selector of selectors) {
        const match = Array.from(root.querySelectorAll(selector)).find(visible);
        if (match) return match;
      }
      return null;
    };
    if (location.origin !== "https://web.whatsapp.com") {
      return { ok: false, code: "wrong_origin", message: "Güvenlik kontrolü: açık sayfa WhatsApp Web değil." };
    }
    const root = document.querySelector("#main");
    if (!root) {
      return { ok: false, code: "chat_changed", message: "Sohbet onaydan sonra değişti; mesaj gönderilmedi." };
    }
    const composer = firstVisible(root, [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      '[contenteditable="true"][role="textbox"]'
    ]);
    const titleNode = firstVisible(root, [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[title]',
      'header [role="button"] span[dir="auto"]'
    ]);
    const chatTitle = clean(titleNode && (titleNode.getAttribute("title") || titleNode.textContent));
    const composerText = clean(composer && (composer.innerText || composer.textContent));
    if (!composer || composerText !== clean(expectedMessage) || chatTitle !== clean(expectedChatTitle)) {
      return { ok: false, code: "approval_changed", message: "Sohbet veya mesaj onaydan sonra değişti; mesaj gönderilmedi." };
    }
    const sendIcon = firstVisible(root, ['footer span[data-icon="send"]', 'footer [data-testid="compose-btn-send"]']);
    const sendControl = firstVisible(root, [
      'footer button[aria-label="Send"]',
      'footer button[aria-label="Gönder"]',
      'footer [role="button"][aria-label="Send"]',
      'footer [role="button"][aria-label="Gönder"]'
    ]) || (sendIcon && sendIcon.closest('button, [role="button"]'));
    if (!sendControl || sendControl.hasAttribute("disabled") || sendControl.getAttribute("aria-disabled") === "true") {
      return { ok: false, code: "send_missing", message: "WhatsApp Gönder düğmesi onaydan sonra kullanılamaz oldu; mesaj gönderilmedi." };
    }
    sendControl.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        const currentComposer = firstVisible(root, [
          'footer [contenteditable="true"][role="textbox"]',
          'footer [contenteditable="true"][data-tab]',
          '[contenteditable="true"][role="textbox"]'
        ]);
        const remainingText = clean(currentComposer && (currentComposer.innerText || currentComposer.textContent));
        resolve(remainingText === ""
          ? { ok: true, code: "sent", message: "WhatsApp Web mesaj kutusu temizlendi; gönderim tamamlandı.", chatTitle }
          : { ok: false, code: "send_unconfirmed", message: "Gönderim sonucu kesin doğrulanamadı. Yinelenen mesajı önlemek için tekrar göndermeden önce sohbeti kontrol edin.", chatTitle, composerText: remainingText });
      }, 1200);
    });
  })()`;
}

function WhatsAppWorkspace({ view, requests, selectedRequest, selectedMessage, selectedUrl, aiEnabled, aiState, aiMessage, onSelectRequest, onOpenExternal, onReturnToSafe, onCall, onRewrite, onMessageSent, onDeleteMessage }: WhatsAppWorkspaceProps) {
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const [copyMessage, setCopyMessage] = useState("Hazır mesaj bekliyor.");
  const [sendState, setSendState] = useState<SyncState>("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [webViewUrl, setWebViewUrl] = useState(WHATSAPP_WEB_HOME_URL);
  const webViewAction = useMemo(
    () => (selectedRequest ? prepareWhatsAppAction({ phone: selectedRequest.customer_phone, message: selectedMessage, preferredMode: "webview" }) : null),
    [selectedMessage, selectedRequest]
  );
  const webViewPayload = webViewAction?.ok && webViewAction.mode === "webview" ? webViewAction : null;
  const phoneDisplay = webViewPayload?.phoneDisplay ?? selectedRequest?.customer_phone ?? "-";

  useEffect(() => {
    if (!selectedRequest) {
      setCopyMessage("Hazır mesaj bekliyor.");
      setSendState("idle");
      setSendMessage("Gönderim için talep seçin.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    if (!webViewPayload) {
      setCopyMessage("Mesaj elle kopyalanabilir.");
      setSendState("error");
      setSendMessage("Geçerli telefon ve hazır mesaj olmadan gönderim yapılamaz.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    setCopyMessage("Hazır mesaj bekliyor.");
    setSendState("idle");
    setSendMessage("");
    setWebViewUrl(webViewPayload.homeUrl);
  }, [selectedRequest, webViewAction, webViewPayload]);

  async function copyPreparedMessage() {
    if (!selectedMessage) {
      setCopyMessage("Kopyalanacak hazır mesaj yok.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedMessage);
      setCopyMessage("Hazır mesaj kopyalandı.");
    } catch {
      setCopyMessage("Mesaj elle kopyalanabilir.");
    }
  }

  function goToCustomerNumber() {
    if (!webViewPayload) {
      return;
    }

    setSendState("idle");
    setSendMessage("WhatsApp Web sohbeti ve hazır metin yükleniyor.");
    setWebViewUrl(webViewPayload.url);
  }

  async function approveAndSendMessage() {
    const webView = webViewRef.current;
    if (!selectedRequest || !selectedMessage.trim() || !webView?.executeJavaScript) {
      setSendState("error");
      setSendMessage("Onaylı gönderim yalnızca masaüstü uygulamasındaki hazır WhatsApp Web ekranında kullanılabilir.");
      return;
    }

    const currentUrl = webView.getURL?.() || webViewUrl;
    if (!currentUrl.startsWith(WHATSAPP_WEB_HOME_URL)) {
      setSendState("error");
      setSendMessage("Güvenlik kontrolü: açık sayfa WhatsApp Web olmadığı için gönderim durduruldu.");
      return;
    }

    setSendState("loading");
    setSendMessage("Açık sohbet ve mesaj metni doğrulanıyor...");

    try {
      const inspection = asWhatsAppDomResult(await webView.executeJavaScript(createWhatsAppInspectionScript(selectedMessage), true));
      if (!inspection.ok) {
        setSendState("error");
        setSendMessage(inspection.message);
        return;
      }

      const approved = window.confirm(
        [
          "WhatsApp Web üzerinden mesaj gönderilecek.",
          "",
          `Açık sohbet: ${inspection.chatTitle || "Bilinmeyen sohbet"}`,
          `Talep sahibi: ${selectedRequest.customer_name} (${selectedRequest.customer_phone})`,
          "",
          "Gönderilecek mesaj:",
          selectedMessage,
          "",
          "Bu mesajı göndermeyi onaylıyor musunuz?"
        ].join("\n")
      );

      if (!approved) {
        setSendState("idle");
        setSendMessage("Gönderim kullanıcı tarafından iptal edildi.");
        return;
      }

      setSendMessage("Onay alındı; WhatsApp Web gönderimi yapılıyor...");
      const sendResult = asWhatsAppDomResult(
        await webView.executeJavaScript(createWhatsAppSendScript(selectedMessage, inspection.chatTitle || ""), true)
      );
      if (!sendResult.ok) {
        setSendState("error");
        setSendMessage(sendResult.message);
        return;
      }

      const recordResult = await onMessageSent(selectedRequest.id, selectedMessage);
      setSendState("success");
      setSendMessage(
        recordResult.ok
          ? "Mesaj kullanıcı onayıyla WhatsApp Web üzerinden gönderildi."
          : `Mesaj WhatsApp Web'e gönderildi; yerel kayıt güncellenemedi: ${recordResult.message}`
      );
    } catch {
      setSendState("error");
      setSendMessage("WhatsApp Web güvenlik kontrolü tamamlanamadı. Sohbeti yeniden açıp tekrar deneyin.");
    }
  }

  return (
    <section className={`whatsapp-workspace whatsapp-view-${view}`} aria-label={view === "safe" ? "Güvenli mesaj alanı" : "WhatsApp Web alanı"}>
      <aside className="panel whatsapp-request-panel">
        <div className="panel-heading compact">
          <h2>Talepler</h2>
          <StatusBadge tone="info">{requests.length} kayıt</StatusBadge>
        </div>

        <CompactList className="manager-list operation-compact-list whatsapp-request-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Hazır talep yok.</strong>
              <p>Web talepleri çekildiğinde burada görünür.</p>
            </div>
          ) : (
            requests.map((request) => (
              <CompactListButton
                className="manager-row operation-list-item message-request-row"
                key={request.id}
                title={request.customer_name}
                leading={<span className={`status-dot tone-${getRequestStatusTone(request.status)}`} aria-hidden="true" />}
                meta={(
                  <>
                    <span>{request.customer_phone || "Telefon yok"}</span>
                    <span>{formatRequestType(request.request_type)}</span>
                  </>
                )}
                selected={selectedRequest?.id === request.id}
                aria-label={`${request.customer_name}, ${request.customer_phone || "telefon yok"}, ${formatRequestType(request.request_type)}, ${formatRequestStatus(request.status)}`}
                aria-pressed={selectedRequest?.id === request.id}
                onClick={() => onSelectRequest(request.id)}
              />
            ))
          )}
        </CompactList>
      </aside>

      {view === "web" && <section className="panel whatsapp-live-panel">
        <div className="whatsapp-web-control-bar">
          <div className="whatsapp-web-recipient">
            <div>
              <span>WhatsApp Web</span>
              <h2>{selectedRequest?.customer_name ?? "Talep seçin"}</h2>
              <small>{phoneDisplay}</small>
            </div>
            <StatusBadge tone={selectedMessage ? "ok" : "neutral"}>{selectedMessage ? "Hazır mesaj var" : "Hazır mesaj yok"}</StatusBadge>
          </div>

          <p className="whatsapp-web-message-preview">
            {selectedMessage || "Hazır mesaj oluşturmak veya düzenlemek için Güvenli Moda dönün."}
          </p>

          <div className="whatsapp-web-control-actions">
            <ActionButton variant="ghost" size="sm" type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
              <Copy size={15} aria-hidden="true" />
              Hazır Mesajı Kopyala
            </ActionButton>
            <ActionButton variant="whatsapp" size="sm" type="button" onClick={goToCustomerNumber} disabled={!webViewPayload}>
              <MessageCircle size={15} aria-hidden="true" />
              Müşteri Numarasına Git
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
              <ExternalLink size={15} aria-hidden="true" />
              Dışarıda Aç
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={onReturnToSafe} disabled={!onReturnToSafe}>
              <ShieldCheck size={15} aria-hidden="true" />
              Güvenli Moda Dön
            </ActionButton>
            <ActionButton className="whatsapp-approved-send" size="sm" type="button" onClick={approveAndSendMessage} disabled={!webViewPayload || sendState === "loading"}>
              <Send size={15} aria-hidden="true" />
              {sendState === "loading" ? "Doğrulanıyor" : "Onayla ve Gönder"}
            </ActionButton>
          </div>

          <div className="whatsapp-web-feedback">
            <span className={copyMessage.includes("kopyalandı") ? "sync-success" : ""} role="status">{copyMessage}</span>
            {sendMessage && <span className={`whatsapp-send-status sync-${sendState}`} role="status">{sendMessage}</span>}
          </div>
        </div>

        <div className="whatsapp-webview-frame">
          {webViewUrl ? (
            <webview
              ref={webViewRef}
              className="whatsapp-webview"
              src={webViewUrl}
              partition="persist:yardimci-whatsapp"
              allowpopups
              webpreferences="contextIsolation=yes,nodeIntegration=no"
            />
          ) : (
            <div className="empty-state compact-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>WhatsApp bağlantısı hazır değil.</strong>
            </div>
          )}
        </div>
      </section>}

      {view === "safe" && <aside className="panel whatsapp-copy-panel">
        <div className="panel-heading compact">
          <div className="detail-title-group">
            <span className="detail-category-label">Hazır yanıt</span>
            <h2>{selectedRequest?.customer_name ?? "Talep seçin"}</h2>
          </div>
          {selectedRequest && <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>{formatRequestStatus(selectedRequest.status)}</StatusBadge>}
        </div>

        <dl className="info-list compact-detail-meta message-recipient-meta">
          <div>
            <dt>Telefon</dt>
            <dd>{phoneDisplay}</dd>
          </div>
          <div>
            <dt>Talep türü</dt>
            <dd>{selectedRequest ? formatRequestType(selectedRequest.request_type) : "-"}</dd>
          </div>
          <div>
            <dt>Kaynak</dt>
            <dd>{selectedRequest ? formatCustomerSource(selectedRequest.source) : "-"}</dd>
          </div>
        </dl>

        <label className="prepared-message-field">
          <span>Mesaj</span>
          <textarea className="prepared-whatsapp-message" readOnly value={selectedMessage} aria-label="Hazır WhatsApp mesajı" />
        </label>
        <p className={`menu-status whatsapp-copy-status ${copyMessage.includes("kopyalandı") ? "sync-success" : ""}`}>{copyMessage}</p>

        <div className="message-primary-actions">
          <ActionButton size="sm" type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
            <Copy size={16} aria-hidden="true" />
            Hazır Mesajı Kopyala
          </ActionButton>
          <ActionButton variant="whatsapp" size="sm" type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
            <ExternalLink size={16} aria-hidden="true" />
            WhatsApp Linkini Aç
          </ActionButton>
          <ActionButton variant="secondary" size="sm" type="button" onClick={onCall} disabled={!onCall}>
            <Phone size={16} aria-hidden="true" />
            Müşteriyi Ara
          </ActionButton>
          <ActionButton variant="danger" size="sm" type="button" onClick={() => selectedRequest && onDeleteMessage(selectedRequest)} disabled={!selectedRequest || !selectedMessage}>
            <Trash2 size={16} aria-hidden="true" />
            Mesajı Sil
          </ActionButton>
        </div>
        {aiEnabled && (
          <div className="message-ai-actions">
            <strong>AI ile mesajı düzenle</strong>
            <div>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha kısa ve doğrudan yaz.")} disabled={aiState === "loading"}>Daha Kısa</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha samimi ve sıcak yaz.")} disabled={aiState === "loading"}>Daha Samimi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı daha resmi ve ölçülü yaz.")} disabled={aiState === "loading"}>Daha Resmi</ActionButton>
              <ActionButton variant="ghost" size="sm" type="button" onClick={() => onRewrite("Mesajı mevcut talep bilgilerine göre yeniden hazırla.")} disabled={aiState === "loading"}>AI ile Yenile</ActionButton>
            </div>
            <p className={`menu-status sync-${aiState}`}>{aiMessage}</p>
          </div>
        )}
      </aside>}
    </section>
  );
}

interface RequestsWorkspaceProps {
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  aiEnabled: boolean;
  convertingRequestId: string;
  suggestingRequestId: string;
  manualRequestForm: ManualRequestFormState;
  manualRequestState: SyncState;
  manualRequestMessage: string;
  showManualForm?: boolean;
  onSelectRequest: (requestId: string) => void;
  onManualRequestFormChange: (form: ManualRequestFormState) => void;
  onCreateManualRequest: () => void;
  onCall: (request: SyncedCustomerRequest) => void;
  onWhatsApp: (request: SyncedCustomerRequest) => void;
  onConvert: (request: SyncedCustomerRequest) => void;
  onSuggest: (request: SyncedCustomerRequest) => void;
  onUpdateStatus: (request: SyncedCustomerRequest, status: string) => void;
  onOpenReservation: (request: SyncedCustomerRequest) => void;
  onDelete: (request: SyncedCustomerRequest) => void;
}

function RequestsWorkspace({
  requests,
  selectedRequest,
  aiEnabled,
  convertingRequestId,
  suggestingRequestId,
  manualRequestForm,
  manualRequestState,
  manualRequestMessage,
  showManualForm = true,
  onSelectRequest,
  onManualRequestFormChange,
  onCreateManualRequest,
  onCall,
  onWhatsApp,
  onConvert,
  onSuggest,
  onUpdateStatus,
  onOpenReservation,
  onDelete
}: RequestsWorkspaceProps) {
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const manualDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const selectedActionMode = selectedRequest ? getRequestActionMode(selectedRequest.status) : "open";
  const updateManualRequestForm = <Key extends keyof ManualRequestFormState,>(key: Key, value: ManualRequestFormState[Key]) => {
    onManualRequestFormChange({ ...manualRequestForm, [key]: value });
  };

  useEffect(() => {
    if (!manualFormOpen) {
      return;
    }

    manualDrawerCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setManualFormOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [manualFormOpen]);

  return (
    <section className="operations-workspace requests-workspace" aria-label="Talep yönetimi">
      <aside className="panel operations-list-panel">
        <div className="panel-heading compact">
          <div>
            <p>Talepler</p>
            <h2>{requests.length} kayıt</h2>
          </div>
        </div>
        <CompactList className="manager-list operation-compact-list operations-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <Bell size={24} aria-hidden="true" />
              <strong>Talep yok.</strong>
              <p>Web, AI ve manuel kayıtlar burada listelenir.</p>
            </div>
          ) : (
            requests.map((request) => (
              <CompactListButton
                className="manager-row operation-list-item customer-request-row"
                key={request.id}
                title={request.customer_name}
                leading={<span className={`status-dot tone-${getRequestStatusTone(request.status)}`} aria-hidden="true" />}
                description={`${formatRequestType(request.request_type)} · ${formatRequestStatus(request.status)}`}
                trailing={formatCompactRequestDate(request) ? <time dateTime={request.start_date || request.created_at}>{formatCompactRequestDate(request)}</time> : undefined}
                selected={selectedRequest?.id === request.id}
                aria-pressed={selectedRequest?.id === request.id}
                onClick={() => onSelectRequest(request.id)}
              />
            ))
          )}
        </CompactList>

        {showManualForm && (
          <ActionButton className="manual-request-toggle" variant="ghost" type="button" aria-expanded={manualFormOpen} onClick={() => setManualFormOpen(true)}>
            <Plus size={17} aria-hidden="true" />
            Elle Talep Ekle
          </ActionButton>
        )}
      </aside>

      <section className="panel operations-detail-panel request-detail-panel">
        {selectedRequest ? (
          <>
            <div className="panel-heading compact">
              <div className="detail-title-group">
                <span className="detail-category-label">{formatRequestType(selectedRequest.request_type)}</span>
                <h2>{selectedRequest.customer_name}</h2>
              </div>
              <StatusBadge tone={getRequestStatusTone(selectedRequest.status)}>
                {formatRequestStatus(selectedRequest.status)}
              </StatusBadge>
            </div>
            <dl className="info-list detail-info-grid compact-detail-meta">
              <div>
                <dt>Telefon</dt>
                <dd>{selectedRequest.customer_phone}</dd>
              </div>
              <div>
                <dt>Tarih</dt>
                <dd>{selectedRequest.date_text || formatDateForDisplay(selectedRequest.start_date) || "-"}</dd>
              </div>
              <div>
                <dt>Kişi</dt>
                <dd>{selectedRequest.guest_count} kişi</dd>
              </div>
              <div>
                <dt>Kaynak</dt>
                <dd>{formatCustomerSource(selectedRequest.source)}</dd>
              </div>
            </dl>
            <div className="compact-detail-copy">
              <span>Not</span>
              <p className="detail-scroll-copy">{selectedRequest.message || "Talep notu yok."}</p>
            </div>
            {aiEnabled && (
              <div className="compact-detail-copy soft-suggestion">
                <span>AI özeti</span>
                <p className="detail-scroll-copy">{selectedRequest.ai_summary || "Bu talep için henüz AI özeti hazırlanmadı."}</p>
              </div>
            )}
            <div className="operations-command-grid request-detail-actions">
              <ActionButton variant="secondary" size="sm" type="button" onClick={() => onCall(selectedRequest)}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </ActionButton>
              <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onWhatsApp(selectedRequest)}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </ActionButton>
              {aiEnabled && selectedActionMode === "open" && (
                <ActionButton variant="ghost" size="sm" type="button" onClick={() => onSuggest(selectedRequest)} disabled={suggestingRequestId === selectedRequest.id}>
                  <Sparkles size={16} aria-hidden="true" />
                  {suggestingRequestId === selectedRequest.id ? "Hazırlanıyor" : "AI Cevap Hazırla"}
                </ActionButton>
              )}
              {(selectedActionMode === "open" || selectedActionMode === "answered") && (
                <ActionButton size="sm" type="button" onClick={() => onConvert(selectedRequest)} disabled={convertingRequestId === selectedRequest.id}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  {convertingRequestId === selectedRequest.id ? "Onaylanıyor" : "Rezervasyona Çevir"}
                </ActionButton>
              )}
              {selectedActionMode === "open" && <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "answered")}>
                <CheckCircle2 size={16} aria-hidden="true" />
                Cevaplandı İşaretle
              </ActionButton>}
              {selectedActionMode === "open" && <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "rejected")}>
                <ClipboardList size={16} aria-hidden="true" />
                Reddet
              </ActionButton>}
              {["answered", "rejected", "closed"].includes(selectedActionMode) && (
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(selectedRequest, "new")}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Yeniden Aç
                </ActionButton>
              )}
              {selectedActionMode === "converted" && (
                <ActionButton size="sm" type="button" onClick={() => onOpenReservation(selectedRequest)}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  Rezervasyonu Aç
                </ActionButton>
              )}
              <ActionButton variant="danger" size="sm" type="button" onClick={() => onDelete(selectedRequest)}>
                <Trash2 size={16} aria-hidden="true" />
                Talebi Sil
              </ActionButton>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Bell size={28} aria-hidden="true" />
            <strong>Talep seçin.</strong>
            <p>Detay ve hızlı işlemler burada görünür.</p>
          </div>
        )}
      </section>

      {showManualForm && manualFormOpen && (
        <div
          className="manual-request-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setManualFormOpen(false);
            }
          }}
        >
          <aside className="manual-request-drawer" role="dialog" aria-modal="true" aria-labelledby="manual-request-title">
            <header className="manual-request-drawer-header">
              <div className="manual-request-heading">
                <p>Manuel kayıt</p>
                <h2 id="manual-request-title">Yeni talep ekle</h2>
              </div>
              <button ref={manualDrawerCloseRef} className="drawer-close-button" type="button" aria-label="Elle talep formunu kapat" onClick={() => setManualFormOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <form
              className="manager-form manual-request-form"
              onSubmit={(event) => {
                event.preventDefault();
                onCreateManualRequest();
              }}
            >
              <div className="manual-request-core-grid">
                <label>
                  Talep türü
                  <select value={manualRequestForm.requestType} onChange={(event) => updateManualRequestForm("requestType", event.target.value)}>
                    {manualRequestTypeOptions.map((requestType) => (
                      <option key={requestType} value={requestType}>{formatRequestType(requestType)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Ad soyad
                  <input value={manualRequestForm.customerName} onChange={(event) => updateManualRequestForm("customerName", event.target.value)} placeholder="Müşteri adı" />
                </label>
                <label>
                  Telefon
                  <input value={manualRequestForm.customerPhone} onChange={(event) => updateManualRequestForm("customerPhone", event.target.value)} placeholder="05xx xxx xx xx" />
                </label>
                <label>
                  Tarih notu
                  <input value={manualRequestForm.dateText} onChange={(event) => updateManualRequestForm("dateText", event.target.value)} placeholder="12-14 Temmuz veya bugün" />
                </label>
                <label>
                  Kişi sayısı
                  <input min="1" type="number" value={manualRequestForm.guestCount} onChange={(event) => updateManualRequestForm("guestCount", event.target.value)} />
                </label>
                <label className="manual-request-note-field">
                  Not
                  <textarea value={manualRequestForm.message} onChange={(event) => updateManualRequestForm("message", event.target.value)} placeholder="Talep detayı" />
                </label>
              </div>
              <details className="form-details">
                <summary>Detaylı bilgi</summary>
                <div className="form-row">
                  <label>
                    Giriş tarihi
                    <input lang="tr" type="date" value={manualRequestForm.startDate} onChange={(event) => updateManualRequestForm("startDate", event.target.value)} />
                    <small className="date-field-hint">Gün / Ay / Yıl</small>
                  </label>
                  <label>
                    Çıkış tarihi
                    <input lang="tr" type="date" value={manualRequestForm.endDate} onChange={(event) => updateManualRequestForm("endDate", event.target.value)} />
                    <small className="date-field-hint">Gün / Ay / Yıl</small>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Saat
                    <input type="time" value={manualRequestForm.time} onChange={(event) => updateManualRequestForm("time", event.target.value)} />
                  </label>
                  <label>
                    Öncelik
                    <select value={manualRequestForm.priority} onChange={(event) => updateManualRequestForm("priority", event.target.value)}>
                      {manualPriorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              </details>
              <div className="manual-request-drawer-footer">
                <p className={`menu-status sync-${manualRequestState}`} role="status">{manualRequestMessage}</p>
                <div>
                  <ActionButton variant="secondary" type="button" onClick={() => setManualFormOpen(false)}>Vazgeç</ActionButton>
                  <ActionButton type="submit" disabled={manualRequestState === "loading"}>
                    <Save size={16} aria-hidden="true" />
                    {manualRequestState === "loading" ? "Kaydediliyor" : "Manuel Talep Kaydet"}
                  </ActionButton>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  requests: SyncedCustomerRequest[];
  reservations: DesktopDashboardData["reservations"];
  rooms: DesktopDashboardData["rooms"];
  stays: DesktopDashboardData["customerRoomStays"];
  aiEnabled: boolean;
  onCall: (customer: DesktopDashboardData["customers"][number]) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSummarize: (requestId: string) => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onAssignRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  onUpdateStayStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
  onDelete: (customer: DesktopDashboardData["customers"][number]) => void;
}

function CustomersWorkspace({
  customers,
  requests,
  reservations,
  rooms,
  stays,
  aiEnabled,
  onCall,
  onWhatsApp,
  onSummarize,
  onSave,
  onAnalyzeIdentity,
  onAssignRoom,
  onUpdateStayStatus,
  onDelete
}: CustomersWorkspaceProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "");
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
  const [customerBeingEdited, setCustomerBeingEdited] = useState<DesktopDashboardData["customers"][number] | null>(null);
  const [assignmentCustomerId, setAssignmentCustomerId] = useState("");
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const customerStays = stays
          .filter((stay) => stay.customerId === customer.id)
          .map((stay) => `${stay.roomName} ${stay.roomNumber}`)
          .join(" ");
        const haystack = `${customer.fullName} ${customer.phone} ${customer.email} ${customer.identityNumber} ${customer.tags.join(" ")} ${customerStays}`.toLowerCase();
        return haystack.includes(searchText.trim().toLowerCase());
      }),
    [customers, searchText, stays]
  );
  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedCustomerId) ?? filteredCustomers[0] ?? null;
  const selectedRequests = selectedCustomer
    ? requests.filter((request) => request.customer_id === selectedCustomer.id || request.customer_phone === selectedCustomer.phone)
    : [];
  const selectedReservations = selectedCustomer
    ? reservations.filter((reservation) => reservation.customerId === selectedCustomer.id || reservation.customerPhone === selectedCustomer.phone)
    : [];
  const selectedStays = selectedCustomer
    ? stays.filter((stay) => stay.customerId === selectedCustomer.id)
    : [];

  useEffect(() => {
    if (!selectedCustomerId && customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  return (
    <section className="operations-workspace customers-workspace" aria-label="Müşteri yönetimi">
      <aside className="panel operations-list-panel">
        <div className="panel-heading compact">
          <div>
            <p>Müşteriler</p>
            <h2>{customers.length} kayıt</h2>
          </div>
          <ActionButton
            size="sm"
            type="button"
            onClick={() => {
              setCustomerBeingEdited(null);
              setCustomerEditorOpen(true);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Yeni Müşteri
          </ActionButton>
        </div>
        <label className="customer-search">
          <span>Ara</span>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Ad, telefon, kimlik, etiket veya oda" />
        </label>
        <CompactList className="manager-list operation-compact-list operations-list">
          {filteredCustomers.length === 0 ? (
            <div className="empty-state compact-empty">
              <Users size={24} aria-hidden="true" />
              <strong>Müşteri bulunamadı.</strong>
              <p>Arama metnini değiştirin.</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <CompactListButton
                className="manager-row operation-list-item customer-record-row"
                key={customer.id}
                title={customer.fullName}
                leading={<span className={`status-dot ${customer.requestCount > 0 ? "tone-info" : "tone-neutral"}`} aria-hidden="true" />}
                description={`${customer.phone || "Telefon yok"} · ${formatCustomerSource(customer.source)}`}
                trailing={formatShortDate(customer.lastContactAt || customer.updatedAt) ? <time dateTime={customer.lastContactAt || customer.updatedAt}>{formatShortDate(customer.lastContactAt || customer.updatedAt)}</time> : undefined}
                selected={selectedCustomer?.id === customer.id}
                aria-pressed={selectedCustomer?.id === customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
              />
            ))
          )}
        </CompactList>
      </aside>

      <section className="panel operations-detail-panel">
        {selectedCustomer ? (
          <>
            <div className="panel-heading compact">
              <div className="detail-title-group">
                <span className="detail-category-label">{formatCustomerSource(selectedCustomer.source)}</span>
                <h2>{selectedCustomer.fullName}</h2>
              </div>
              <div className="customer-heading-actions">
                <StatusBadge tone="info">{selectedCustomer.stayCount} konaklama</StatusBadge>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCustomerBeingEdited(selectedCustomer);
                    setCustomerEditorOpen(true);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Düzenle
                </ActionButton>
              </div>
            </div>
            <dl className="info-list detail-info-grid compact-detail-meta">
              <div>
                <dt>Telefon</dt>
                <dd>{selectedCustomer.phone || "-"}</dd>
              </div>
              <div>
                <dt>E-posta</dt>
                <dd>{selectedCustomer.email || "-"}</dd>
              </div>
              <div>
                <dt>Son temas</dt>
                <dd title={selectedCustomer.lastContactAt || selectedCustomer.updatedAt || undefined}>{formatCustomerLastContactDate(selectedCustomer.lastContactAt || selectedCustomer.updatedAt)}</dd>
              </div>
              <div>
                <dt>Rezervasyon</dt>
                <dd>{selectedCustomer.reservationCount} kayıt</dd>
              </div>
              <div>
                <dt>Kimlik türü</dt>
                <dd>{formatIdentityType(selectedCustomer.identityType)}</dd>
              </div>
              <div>
                <dt>Kimlik no</dt>
                <dd>{selectedCustomer.identityNumber || "-"}</dd>
              </div>
              <div>
                <dt>Doğum tarihi</dt>
                <dd>{formatDateForDisplay(selectedCustomer.birthDate) || "-"}</dd>
              </div>
              <div>
                <dt>Uyruk</dt>
                <dd>{selectedCustomer.nationality || "-"}</dd>
              </div>
            </dl>
            {hasCustomerIdentityDetails(selectedCustomer) && (
              <details className="customer-identity-details">
                <summary>
                  <CreditCard size={16} aria-hidden="true" />
                  Kimlik kartı alanları
                </summary>
                <dl className="info-list detail-info-grid compact-detail-meta">
                  <div><dt>Cinsiyet</dt><dd>{formatCustomerGender(selectedCustomer.gender)}</dd></div>
                  <div><dt>Seri / belge no</dt><dd>{selectedCustomer.documentSerialNumber || "-"}</dd></div>
                  <div><dt>Son geçerlilik</dt><dd>{formatDateForDisplay(selectedCustomer.documentExpiryDate) || "-"}</dd></div>
                  <div><dt>Doğum yeri</dt><dd>{selectedCustomer.birthPlace || "-"}</dd></div>
                  <div><dt>Anne adı</dt><dd>{selectedCustomer.motherName || "-"}</dd></div>
                  <div><dt>Baba adı</dt><dd>{selectedCustomer.fatherName || "-"}</dd></div>
                  <div><dt>Veren makam</dt><dd>{selectedCustomer.issuingAuthority || "-"}</dd></div>
                  <div className="identity-address"><dt>Adres</dt><dd>{selectedCustomer.address || "-"}</dd></div>
                </dl>
              </details>
            )}
            <div className="compact-detail-copy customer-detail-note">
              <span>Not</span>
              <p className="detail-scroll-copy">{selectedCustomer.notes || "Müşteri notu yok."}</p>
            </div>
            {selectedCustomer.tags.length > 0 && (
              <div className="tag-row">
                {selectedCustomer.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="operations-command-grid customer-detail-actions">
              <ActionButton variant="secondary" size="sm" type="button" onClick={() => onCall(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </ActionButton>
              <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onWhatsApp(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </ActionButton>
              {aiEnabled && (
                <ActionButton variant="ghost" size="sm" type="button" onClick={() => onSummarize(selectedRequests[0]?.id ?? "")} disabled={selectedRequests.length === 0}>
                  <Sparkles size={16} aria-hidden="true" />
                  Geçmişi Özetle
                </ActionButton>
              )}
              <ActionButton
                size="sm"
                type="button"
                onClick={() => setAssignmentCustomerId(selectedCustomer.id)}
                disabled={rooms.length === 0}
              >
                <BedDouble size={16} aria-hidden="true" />
                Odaya Ata
              </ActionButton>
              <ActionButton variant="danger" size="sm" type="button" onClick={() => onDelete(selectedCustomer)}>
                <Trash2 size={16} aria-hidden="true" />
                Müşteriyi Sil
              </ActionButton>
            </div>
            <div className="customer-history-grid">
              <section>
                <h3>Son Talepler</h3>
                {selectedRequests.length === 0 ? (
                  <p>Talep yok.</p>
                ) : (
                  selectedRequests.slice(0, 4).map((request) => (
                    <article key={request.id}>
                      <strong>{formatRequestType(request.request_type)}</strong>
                      <span>{formatRequestStatus(request.status)} · {request.date_text || request.start_date || "-"}</span>
                      {request.message && <p>{request.message}</p>}
                    </article>
                  ))
                )}
              </section>
              <section>
                <h3>Rezervasyonlar</h3>
                {selectedReservations.length === 0 ? (
                  <p>Rezervasyon yok.</p>
                ) : (
                  selectedReservations.slice(0, 4).map((reservation) => (
                    <article key={reservation.id}>
                      <strong>{reservation.title}</strong>
                      <span>{formatReservationStatus(reservation.status)} · {formatReservationDate(reservation)}</span>
                    </article>
                  ))
                )}
              </section>
              <section className="customer-stay-history">
                <h3>Oda / Konaklama Geçmişi</h3>
                {selectedStays.length === 0 ? (
                  <p>Oda kaydı yok.</p>
                ) : (
                  selectedStays.map((stay) => (
                    <article key={stay.id}>
                      <strong>{stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}</strong>
                      <span>{formatCustomerRoomStayStatus(stay.status)} · {formatStayDateRange(stay)}</span>
                      {stay.notes && <p>{stay.notes}</p>}
                      <CustomerRoomStayActions stay={stay} onUpdateStatus={onUpdateStayStatus} />
                    </article>
                  ))
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Users size={28} aria-hidden="true" />
            <strong>Müşteri seçin.</strong>
            <p>İletişim ve geçmiş kayıtlar burada görünür.</p>
          </div>
        )}
      </section>

      <CustomerEditorDrawer
        open={customerEditorOpen}
        customer={customerBeingEdited}
        aiEnabled={aiEnabled}
        onClose={() => setCustomerEditorOpen(false)}
        onSave={async (input) => {
          const result = await onSave(input);
          if (result.ok) {
            setSelectedCustomerId(result.savedId);
            setCustomerEditorOpen(false);
          }
          return result;
        }}
        onAnalyzeIdentity={onAnalyzeIdentity}
      />
      <RoomAssignmentDrawer
        open={Boolean(assignmentCustomerId)}
        customers={customers}
        rooms={rooms}
        initialCustomerId={assignmentCustomerId}
        initialRoomId=""
        onClose={() => setAssignmentCustomerId("")}
        onAssign={async (input) => {
          const result = await onAssignRoom(input);
          if (result.ok) {
            setAssignmentCustomerId("");
          }
          return result;
        }}
      />
    </section>
  );
}

interface CustomerEditorDrawerProps {
  open: boolean;
  customer: DesktopDashboardData["customers"][number] | null;
  aiEnabled: boolean;
  onClose: () => void;
  onSave: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
}

function CustomerEditorDrawer({
  open,
  customer,
  aiEnabled,
  onClose,
  onSave,
  onAnalyzeIdentity
}: CustomerEditorDrawerProps) {
  const [form, setForm] = useState<CustomerFormState>(() => toCustomerForm(customer));
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("Ad soyad yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
  const identityFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(toCustomerForm(customer));
      setState("idle");
      setMessage("Ad soyad yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
    }
  }, [customer, open]);

  if (!open) {
    return null;
  }

  const update = <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const analyzeIdentity = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setState("error");
      setMessage("JPG, PNG veya WebP biçiminde bir kimlik görseli seçin.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setState("error");
      setMessage("Kimlik görseli boş olamaz ve en fazla 10 MB olabilir.");
      if (identityFileRef.current) identityFileRef.current.value = "";
      return;
    }
    setState("loading");
    setMessage("Kimlik görseli AI ile okunuyor...");
    let result: DesktopIdentityImageAnalyzeResult;
    try {
      result = await onAnalyzeIdentity(file);
    } catch {
      result = { ok: false, message: "Kimlik görseli okunamadı." };
    }
    if (identityFileRef.current) {
      identityFileRef.current.value = "";
    }
    if (!result.ok) {
      setState("error");
      setMessage(result.message);
      return;
    }
    const fields = result.analysis.fields;
    setForm((current) => ({
      ...current,
      fullName: fields.full_name || current.fullName,
      identityType: fields.identity_type || current.identityType,
      identityNumber: fields.identity_number || current.identityNumber,
      nationality: fields.nationality || current.nationality,
      birthDate: fields.birth_date || current.birthDate,
      gender: fields.gender || current.gender,
      documentSerialNumber: fields.document_serial_number || current.documentSerialNumber,
      documentExpiryDate: fields.document_expiry_date || current.documentExpiryDate,
      birthPlace: fields.birth_place || current.birthPlace,
      motherName: fields.mother_name || current.motherName,
      fatherName: fields.father_name || current.fatherName,
      issuingAuthority: fields.issuing_authority || current.issuingAuthority,
      address: fields.address || current.address
    }));
    setState("success");
    setMessage(
      result.analysis.warnings.length > 0
        ? `${result.message} Kontrol: ${result.analysis.warnings.join(" ")}`
        : result.message
    );
  };

  return (
    <div className="manual-request-backdrop customer-editor-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="manual-request-drawer customer-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="customer-editor-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading">
            <p>Müşteri kartı</p>
            <h2 id="customer-editor-title">{customer ? "Müşteri bilgilerini düzenle" : "Yeni müşteri ekle"}</h2>
          </div>
          <button className="drawer-close-button" type="button" aria-label="Müşteri formunu kapat" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <form className="manager-form manual-request-form customer-editor-form" onSubmit={async (event) => {
          event.preventDefault();
          setState("loading");
          setMessage("Müşteri kartı kaydediliyor...");
          const result = await onSave(customerFormToInput(form));
          setState(result.ok ? "success" : "error");
          setMessage(result.message);
        }}>
          <section className="customer-form-section">
            <div className="customer-form-section-heading">
              <div><strong>Temel bilgiler</strong><small>İletişim ve kart görünümü</small></div>
            </div>
            <div className="manual-request-core-grid">
              <label>Ad soyad<input required maxLength={160} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
              <label>Telefon<input inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="05xx xxx xx xx" /></label>
              <label>E-posta<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label>Etiketler<input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="pansiyon, düzenli müşteri" /></label>
              <label className="manual-request-note-field">Not<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
            </div>
          </section>
          <section className="customer-form-section identity-form-section">
            <div className="customer-form-section-heading">
              <div><strong>Kimlik kartı bilgileri</strong><small>Görsel yalnız analiz edilir; kimlik fotoğrafı saklanmaz.</small></div>
              <div className="identity-image-action">
                <input
                  ref={identityFileRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void analyzeIdentity(event.target.files?.[0])}
                />
                <ActionButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={!aiEnabled || state === "loading"}
                  onClick={() => identityFileRef.current?.click()}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {state === "loading" ? "Okunuyor" : "Kimlikten AI ile Doldur"}
                </ActionButton>
              </div>
            </div>
            {!aiEnabled && <p className="identity-ai-note">Kimlik görseli analizi için Ayarlar bölümünden AI bağlantısını etkinleştirin.</p>}
            <div className="manual-request-core-grid identity-form-grid">
              <label>Belge türü<select value={form.identityType} onChange={(event) => update("identityType", event.target.value)}>
                <option value="">Seçilmedi</option>
                <option value="tc_identity_card">T.C. Kimlik Kartı</option>
                <option value="passport">Pasaport</option>
                <option value="other">Diğer</option>
              </select></label>
              <label>Kimlik / pasaport no<input value={form.identityNumber} onChange={(event) => update("identityNumber", event.target.value)} /></label>
              <label>Uyruk<input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
              <label>Doğum tarihi<input lang="tr" type="date" value={form.birthDate} onChange={(event) => update("birthDate", event.target.value)} /></label>
              <label>Cinsiyet<select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
                <option value="">Seçilmedi</option>
                <option value="female">Kadın</option>
                <option value="male">Erkek</option>
                <option value="unspecified">Belirtilmemiş</option>
              </select></label>
              <label>Seri / belge no<input value={form.documentSerialNumber} onChange={(event) => update("documentSerialNumber", event.target.value)} /></label>
              <label>Son geçerlilik<input lang="tr" type="date" value={form.documentExpiryDate} onChange={(event) => update("documentExpiryDate", event.target.value)} /></label>
              <label>Doğum yeri<input value={form.birthPlace} onChange={(event) => update("birthPlace", event.target.value)} /></label>
              <label>Anne adı<input value={form.motherName} onChange={(event) => update("motherName", event.target.value)} /></label>
              <label>Baba adı<input value={form.fatherName} onChange={(event) => update("fatherName", event.target.value)} /></label>
              <label>Veren makam<input value={form.issuingAuthority} onChange={(event) => update("issuingAuthority", event.target.value)} /></label>
              <label className="manual-request-note-field">Adres<textarea value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
            </div>
          </section>
          <div className="manual-request-drawer-footer">
            <p className={`menu-status sync-${state}`} role="status">{message}</p>
            <div>
              <ActionButton variant="secondary" type="button" onClick={onClose}>Vazgeç</ActionButton>
              <ActionButton type="submit" disabled={state === "loading"}>
                <Save size={16} aria-hidden="true" />
                {state === "loading" ? "Kaydediliyor" : "Müşteri Kartını Kaydet"}
              </ActionButton>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

interface RoomAssignmentDrawerProps {
  open: boolean;
  customers: DesktopDashboardData["customers"];
  rooms: DesktopDashboardData["rooms"];
  initialCustomerId: string;
  initialRoomId: string;
  onClose: () => void;
  onAssign: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
}

function RoomAssignmentDrawer({
  open,
  customers,
  rooms,
  initialCustomerId,
  initialRoomId,
  onClose,
  onAssign
}: RoomAssignmentDrawerProps) {
  const [form, setForm] = useState<RoomAssignmentFormState>(() => defaultRoomAssignmentForm(initialCustomerId, initialRoomId));
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("Atama, müşteri ve oda geçmişinde birlikte arşivlenir.");

  useEffect(() => {
    if (open) {
      setForm(defaultRoomAssignmentForm(initialCustomerId || customers[0]?.id || "", initialRoomId || rooms[0]?.id || ""));
      setState("idle");
      setMessage("Atama, müşteri ve oda geçmişinde birlikte arşivlenir.");
    }
  }, [customers, initialCustomerId, initialRoomId, open, rooms]);

  if (!open) return null;

  return (
    <div className="manual-request-backdrop room-assignment-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="manual-request-drawer room-assignment-drawer" role="dialog" aria-modal="true" aria-labelledby="room-assignment-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading"><p>Müşteri · Oda</p><h2 id="room-assignment-title">Odaya müşteri ata</h2></div>
          <button className="drawer-close-button" type="button" aria-label="Oda atama formunu kapat" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <form className="manager-form manual-request-form" onSubmit={async (event) => {
          event.preventDefault();
          setState("loading");
          setMessage("Oda ataması kaydediliyor...");
          const result = await onAssign({
            customerId: form.customerId,
            roomId: form.roomId,
            checkInDate: form.checkInDate,
            checkOutDate: form.checkOutDate,
            guestCount: Number(form.guestCount),
            notes: form.notes,
            status: form.status
          });
          setState(result.ok ? "success" : "error");
          setMessage(result.message);
        }}>
          <div className="manual-request-core-grid">
            <label>Müşteri<select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">Müşteri seçin</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.fullName}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
            </select></label>
            <label>Oda<select required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>
              <option value="">Oda seçin</option>
              {rooms.filter((room) => room.isActive).map((room) => (
                <option value={room.id} key={room.id}>
                  {room.number ? `Oda ${room.number} · ` : ""}{room.name} · {room.capacity} kişi · {formatRoomStatus(room.status)}
                </option>
              ))}
            </select></label>
            <label>Giriş tarihi<input required lang="tr" type="date" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value })} /></label>
            <label>Çıkış tarihi<input lang="tr" type="date" value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} /></label>
            <label>Kişi sayısı<input min="1" max="50" type="number" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: event.target.value })} /></label>
            <label>Başlangıç durumu<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RoomAssignmentFormState["status"] })}>
              <option value="planned">Planlandı / Rezerve</option>
              <option value="checked_in">Giriş yaptı / Dolu</option>
            </select></label>
            <label className="manual-request-note-field">Konaklama notu<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          <div className="manual-request-drawer-footer">
            <p className={`menu-status sync-${state}`} role="status">{message}</p>
            <div>
              <ActionButton variant="secondary" type="button" onClick={onClose}>Vazgeç</ActionButton>
              <ActionButton type="submit" disabled={state === "loading" || customers.length === 0 || rooms.length === 0}>
                <BedDouble size={16} aria-hidden="true" />
                {state === "loading" ? "Kaydediliyor" : "Odaya Ata"}
              </ActionButton>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function CustomerRoomStayActions({
  stay,
  onUpdateStatus
}: {
  stay: DesktopDashboardData["customerRoomStays"][number];
  onUpdateStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}) {
  if (stay.status === "checked_out") return null;
  return (
    <div className="stay-inline-actions">
      {stay.status === "planned" && <ActionButton size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "checked_in")}>Giriş Yap</ActionButton>}
      {stay.status === "checked_in" && <ActionButton size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "checked_out")}>Çıkış Yap</ActionButton>}
      {stay.status === "cancelled" && <ActionButton variant="secondary" size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "planned")}>Yeniden Planla</ActionButton>}
      {["planned", "checked_in"].includes(stay.status) && <ActionButton variant="danger" size="sm" type="button" onClick={() => void onUpdateStatus(stay.id, "cancelled")}>İptal</ActionButton>}
    </div>
  );
}

interface DailyTasksWorkspaceProps {
  tasks: DesktopDashboardData["dailyTasks"];
  onUpdateStatus: (taskId: string, status: string) => void;
}

function DailyTasksWorkspace({ tasks, onUpdateStatus }: DailyTasksWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const filteredTasks = useMemo(
    () => tasks.filter((task) => statusFilter === "all" || task.status === statusFilter),
    [statusFilter, tasks]
  );

  return (
    <section className="reservations-workspace" aria-label="Günlük işler">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary" aria-label="Günlük iş özeti">
          <StatusBadge tone="wait">{tasks.filter((task) => task.status === "pending").length} bekleyen</StatusBadge>
          <StatusBadge tone="ok">{tasks.filter((task) => task.status === "done").length} tamamlanan</StatusBadge>
        </div>
        <div className="reservation-filters task-filters">
          <label>
            Durum
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="pending">Bekleyen</option>
              <option value="done">Tamamlanan</option>
              <option value="cancelled">İptal</option>
              <option value="all">Tümü</option>
            </select>
          </label>
          <ActionButton variant="secondary" size="sm" type="button" onClick={() => setStatusFilter("all")}>
            Tümünü Göster
          </ActionButton>
        </div>
      </div>

      <section className="operations-grid compact-record-list" aria-label="Günlük iş listesi">
        {tasks.length === 0 ? (
          <div className="panel empty-state">
            <ClipboardList size={28} aria-hidden="true" />
            <strong>Günlük iş yok.</strong>
            <p>Rezervasyon ve takip işleri burada görünür.</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="panel empty-state">
            <ClipboardList size={28} aria-hidden="true" />
            <strong>Filtreye uygun iş yok.</strong>
            <p>Durum filtresini değiştirin.</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <CompactListItem
              className="operation-record-row task-record-row"
              key={task.id}
              leading={(
                <StatusBadge tone={task.status === "done" ? "ok" : task.status === "pending" ? "wait" : "info"}>
                  {formatTaskStatus(task.status)}
                </StatusBadge>
              )}
              title={task.title}
              meta={(
                <>
                  <span>{formatTaskDue(task)}</span>
                  <span>{formatTaskRelation(task)}</span>
                </>
              )}
              description={task.description || "Açıklama yok."}
              actions={(
                <>
                  <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(task.id, "done")} disabled={task.status === "done"}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Tamamla
                  </ActionButton>
                  <details className="expandable-details compact-action-details">
                    <summary>Diğer işlemler</summary>
                    <div className="expanded-record-content compact-secondary-menu">
                      <div className="secondary-detail-actions">
                        <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "cancelled")} disabled={task.status === "cancelled"}>İptal Et</ActionButton>
                        <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(task.id, "pending")} disabled={task.status === "pending"}>Yeniden Aç</ActionButton>
                      </div>
                    </div>
                  </details>
                </>
              )}
            />
          ))
        )}
      </section>
    </section>
  );
}

interface ReservationsWorkspaceProps {
  reservations: DesktopDashboardData["reservations"];
  rooms: DesktopDashboardData["rooms"];
  onUpdateStatus: (reservationId: string, status: string) => void;
  onOpenWhatsApp: (reservation: DesktopDashboardData["reservations"][number]) => void;
}

function ReservationsWorkspace({ reservations, rooms, onUpdateStatus, onOpenWhatsApp }: ReservationsWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const filteredReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const statusMatches = statusFilter === "all" || reservation.status === statusFilter;
        const dateMatches = !dateFilter || matchesReservationDate(reservation, dateFilter);
        return statusMatches && dateMatches;
      }),
    [dateFilter, reservations, statusFilter]
  );

  return (
    <section className="reservations-workspace" aria-label="Rezervasyon yönetimi">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary" aria-label="Rezervasyon özeti">
          <StatusBadge tone="info">{filteredReservations.length} görünen kayıt</StatusBadge>
          <StatusBadge tone="wait">{reservations.filter((reservation) => reservation.status === "pending").length} onay bekleyen</StatusBadge>
        </div>
        <div className="reservation-filters">
          <label className="reservation-status-filter">
            <span className="reservation-control-label">Durum</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tümü</option>
              <option value="pending">Onay bekleyen</option>
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
              <option value="cancelled">İptal edildi</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </label>
          <label className="reservation-date-filter">
            <span className="reservation-filter-label">
              <span>Tarih</span>
              <small className="date-field-hint" id="reservation-date-hint">Gün / Ay / Yıl</small>
            </span>
            <div className="localized-date-input">
              <input
                lang="tr"
                type="date"
                value={dateFilter}
                aria-label="Tarih"
                aria-describedby="reservation-date-hint"
                onChange={(event) => setDateFilter(event.target.value)}
              />
              <span className={dateFilter ? "localized-date-display has-value" : "localized-date-display"} aria-hidden="true">
                {dateFilter ? formatDateForDisplay(dateFilter) : "Tarih seç"}
              </span>
            </div>
          </label>
          <ActionButton
            variant="ghost"
            size="sm"
            type="button"
            disabled={statusFilter === "all" && !dateFilter}
            onClick={() => { setStatusFilter("all"); setDateFilter(""); }}
          >
            Filtreyi Temizle
          </ActionButton>
        </div>
      </div>

      <section className="operations-grid compact-record-list" aria-label="Rezervasyon listesi">
        {reservations.length === 0 ? (
          <div className="panel empty-state">
            <CalendarCheck size={28} aria-hidden="true" />
            <strong>Rezervasyon yok.</strong>
            <p>Talepler rezervasyona çevrildiğinde burada görünür.</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="panel empty-state">
            <CalendarCheck size={28} aria-hidden="true" />
            <strong>Filtreye uygun rezervasyon yok.</strong>
            <p>Durum veya tarih filtresini değiştirin.</p>
          </div>
        ) : (
          filteredReservations.map((reservation) => (
            <CompactListItem
              className="operation-record-row reservation-record-row"
              key={reservation.id}
              leading={<StatusBadge tone={getReservationStatusTone(reservation.status)}>{formatReservationStatus(reservation.status)}</StatusBadge>}
              title={reservation.title || reservation.customerName || "Misafir"}
              meta={(
                <>
                  <span>{formatReservationDate(reservation)}</span>
                  <span>{reservation.guestCount} kişi</span>
                  <span>{formatReservationRooms(reservation, rooms)}</span>
                </>
              )}
              description={reservation.notes || reservation.priceNote || "Rezervasyon notu yok."}
              actions={(
                <>
                  <ActionButton size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "approved")} disabled={reservation.status === "approved"}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Onayla
                  </ActionButton>
                  <ActionButton variant="whatsapp" size="sm" type="button" onClick={() => onOpenWhatsApp(reservation)} disabled={!reservation.customerPhone}>
                    <MessageCircle size={15} aria-hidden="true" />
                    WhatsApp
                  </ActionButton>
                  <details className="expandable-details compact-action-details">
                    <summary>Detay</summary>
                    <div className="expanded-record-content compact-secondary-menu">
                      <p>{reservation.notes || reservation.priceNote || "Rezervasyon notu yok."}</p>
                      <div className="secondary-detail-actions">
                        <ActionButton variant="danger" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "rejected")}>Reddet</ActionButton>
                        <ActionButton variant="secondary" size="sm" type="button" onClick={() => onUpdateStatus(reservation.id, "cancelled")}>İptal Et</ActionButton>
                      </div>
                    </div>
                  </details>
                </>
              )}
            />
          ))
        )}
      </section>
    </section>
  );
}

interface RoomsWorkspaceProps {
  rooms: DesktopDashboardData["rooms"];
  reservations: DesktopDashboardData["reservations"];
  customers: DesktopDashboardData["customers"];
  stays: DesktopDashboardData["customerRoomStays"];
  onUpdateStatus: (roomId: string, status: string) => void;
  onAssignRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  onUpdateStayStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}

function RoomsWorkspace({
  rooms,
  reservations,
  customers,
  stays,
  onUpdateStatus,
  onAssignRoom,
  onUpdateStayStatus
}: RoomsWorkspaceProps) {
  const [assignmentRoomId, setAssignmentRoomId] = useState("");
  return (
    <>
      <section className="operations-grid compact-resource-grid" aria-label="Oda yönetimi">
        {rooms.length === 0 && (
          <div className="panel empty-state"><BedDouble size={28} aria-hidden="true" /><strong>Oda kaydı yok.</strong><p>Oda sayısını Temel Ayarlar bölümünden belirleyebilirsiniz.</p></div>
        )}
        {rooms.map((room) => {
          const displayInfo = getRoomDisplayInfo(room, reservations);
          const activeStay = stays.find((stay) => stay.roomId === room.id && ["planned", "checked_in"].includes(stay.status));
          return <article className="compact-card resource-compact-card" key={room.id}>
            <div className="resource-card-heading">
              <div>
                <h2>{room.number ? `Oda ${room.number} — ${room.name}` : room.name}</h2>
              </div>
              <StatusBadge tone={getResourceStatusTone(displayInfo.status)}>{formatRoomStatus(displayInfo.status)}</StatusBadge>
            </div>
            <div className="compact-meta-row">
              <span>{room.capacity} kişi</span>
              <span>{room.floor || "Kat bilgisi yok"}</span>
              <span>{room.bedInfo || "Yatak bilgisi yok"}</span>
            </div>
            {activeStay ? (
              <div className="room-customer-assignment">
                <strong>{activeStay.customerName}</strong>
                <span>{formatCustomerRoomStayStatus(activeStay.status)} · {formatStayDateRange(activeStay)}</span>
                <CustomerRoomStayActions stay={activeStay} onUpdateStatus={onUpdateStayStatus} />
              </div>
            ) : (
              <p className="compact-reservation-line line-clamp-1"><strong>Rezervasyon:</strong> {displayInfo.reservationTitle}</p>
            )}
            {(room.description || room.features.length > 0) && <p className="resource-description line-clamp-1">{room.description || room.features.join(", ")}</p>}
            {!activeStay && (
              <ActionButton
                size="sm"
                type="button"
                onClick={() => setAssignmentRoomId(room.id)}
                disabled={customers.length === 0 || ["cleaning", "maintenance", "out_of_service"].includes(displayInfo.status)}
              >
                <Users size={15} aria-hidden="true" />
                Müşteri Ata
              </ActionButton>
            )}
            <div className="status-button-row compact-status-actions" aria-label={`${room.name} durumunu değiştir`}>
              <button disabled={Boolean(activeStay)} className={displayInfo.status === "available" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "available"} onClick={() => onUpdateStatus(room.id, "available")}>Boş</button>
              <button disabled={Boolean(activeStay)} className={displayInfo.status === "occupied" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "occupied"} onClick={() => onUpdateStatus(room.id, "occupied")}>Dolu</button>
              <button disabled={Boolean(activeStay)} className={displayInfo.status === "cleaning" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "cleaning"} onClick={() => onUpdateStatus(room.id, "cleaning")}>Temizlik</button>
              <button disabled={Boolean(activeStay)} className={displayInfo.status === "maintenance" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "maintenance"} onClick={() => onUpdateStatus(room.id, "maintenance")}>Bakım</button>
            </div>
          </article>;
        })}
      </section>
      <RoomAssignmentDrawer
        open={Boolean(assignmentRoomId)}
        customers={customers}
        rooms={rooms}
        initialCustomerId=""
        initialRoomId={assignmentRoomId}
        onClose={() => setAssignmentRoomId("")}
        onAssign={async (input) => {
          const result = await onAssignRoom(input);
          if (result.ok) setAssignmentRoomId("");
          return result;
        }}
      />
    </>
  );
}

function CustomerRoomStaysWorkspace({
  stays,
  onUpdateStatus
}: {
  stays: DesktopDashboardData["customerRoomStays"];
  onUpdateStatus: (
    stayId: string,
    status: "planned" | "checked_in" | "checked_out" | "cancelled"
  ) => Promise<DesktopCustomerMutationResult>;
}) {
  const [filter, setFilter] = useState("active");
  const visible = stays.filter((stay) =>
    filter === "all"
      || (filter === "active" && ["planned", "checked_in"].includes(stay.status))
      || stay.status === filter
  );
  return (
    <section className="customer-room-stays-workspace" aria-label="Konaklama arşivi">
      <div className="reservation-toolbar">
        <div className="operation-filter-summary">
          <StatusBadge tone="info">{stays.filter((stay) => stay.status === "checked_in").length} içeride</StatusBadge>
          <StatusBadge tone="wait">{stays.filter((stay) => stay.status === "planned").length} planlı</StatusBadge>
        </div>
        <label>Durum<select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="active">Aktif kayıtlar</option>
          <option value="checked_in">Giriş yaptı</option>
          <option value="planned">Planlandı</option>
          <option value="checked_out">Çıkış yaptı</option>
          <option value="cancelled">İptal</option>
          <option value="all">Tüm arşiv</option>
        </select></label>
      </div>
      <div className="compact-record-list customer-stay-list">
        {visible.length === 0 ? (
          <div className="empty-state compact-empty"><BedDouble size={24} aria-hidden="true" /><strong>Konaklama kaydı yok.</strong><p>Oda kartından veya müşteri kartından atama yapabilirsiniz.</p></div>
        ) : visible.map((stay) => (
          <CompactListItem
            className="operation-record-row customer-stay-row"
            key={stay.id}
            leading={<StatusBadge tone={getCustomerRoomStayTone(stay.status)}>{formatCustomerRoomStayStatus(stay.status)}</StatusBadge>}
            title={`${stay.customerName} · ${stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}`}
            meta={<><span>{formatStayDateRange(stay)}</span><span>{stay.guestCount} kişi</span></>}
            description={stay.notes || "Konaklama notu yok."}
            actions={<CustomerRoomStayActions stay={stay} onUpdateStatus={onUpdateStatus} />}
          />
        ))}
      </div>
    </section>
  );
}

function formatRequestType(value: string) {
  const labels: Record<string, string> = {
    general_info: "Bilgi talebi",
    pension_reservation: "Pansiyon rezervasyonu",
    restaurant_reservation: "Masa rezervasyonu",
    breakfast_request: "Kahvaltı talebi",
    qr_menu_question: "Menü sorusu",
    location_question: "Ulaşım sorusu",
    price_question: "Fiyat sorusu",
    other: "Diğer"
  };

  return labels[value] ?? "Bilgi talebi";
}

function getAiWorkspaceModeLabel(mode: AiWorkspaceMode) {
  const labels: Record<AiWorkspaceMode, string> = {
    reply: "Cevap taslağı",
    summary: "Talep özeti",
    daily: "Günlük değerlendirme"
  };
  return labels[mode];
}

function formatRequestStatus(value: string) {
  const labels: Record<string, string> = {
    new: "Onay bekliyor",
    seen: "Görüldü",
    waiting_owner: "İşletme bekliyor",
    waiting_customer: "Müşteri bekleniyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    answered: "Cevaplandı",
    converted_to_reservation: "Rezervasyona çevrildi",
    cancelled: "İptal edildi",
    archived: "Arşivlendi"
  };

  return labels[value] ?? "Onay bekliyor";
}

type RequestActionMode = "open" | "answered" | "rejected" | "converted" | "closed";

function getRequestActionMode(status: string): RequestActionMode {
  if (status === "converted_to_reservation") {
    return "converted";
  }
  if (status === "answered") {
    return "answered";
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (["cancelled", "archived"].includes(status)) {
    return "closed";
  }
  return "open";
}

function getRequestStatusTone(status: string): StatusTone {
  if (["rejected", "cancelled"].includes(status)) {
    return "danger";
  }
  if (status === "converted_to_reservation" || status === "answered" || status === "approved") {
    return "ok";
  }
  if (["new", "pending", "waiting_owner", "waiting_customer"].includes(status)) {
    return "wait";
  }
  return "info";
}

function isRequestWaitingForReply(status: string) {
  return ["new", "seen", "waiting_owner", "pending", "in_progress"].includes(status);
}

function formatCustomerSource(value: string) {
  const labels: Record<string, string> = {
    web_form: "Web form",
    web_ai: "Web AI",
    whatsapp: "WhatsApp",
    manual: "Manuel",
    phone: "Telefon",
    android: "Android"
  };

  return labels[value] ?? "Müşteri";
}

function toCustomerForm(customer: DesktopDashboardData["customers"][number] | null): CustomerFormState {
  return {
    id: customer?.id ?? "",
    fullName: customer?.fullName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
    tags: customer?.tags.join(", ") ?? "",
    identityType: customer?.identityType ?? "",
    identityNumber: customer?.identityNumber ?? "",
    nationality: customer?.nationality ?? "",
    birthDate: customer?.birthDate ?? "",
    gender: customer?.gender ?? "",
    documentSerialNumber: customer?.documentSerialNumber ?? "",
    documentExpiryDate: customer?.documentExpiryDate ?? "",
    birthPlace: customer?.birthPlace ?? "",
    motherName: customer?.motherName ?? "",
    fatherName: customer?.fatherName ?? "",
    issuingAuthority: customer?.issuingAuthority ?? "",
    address: customer?.address ?? ""
  };
}

function customerFormToInput(form: CustomerFormState): SaveCustomerInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    fullName: form.fullName,
    phone: form.phone,
    email: form.email,
    notes: form.notes,
    tags: form.tags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean),
    identityType: form.identityType,
    identityNumber: form.identityNumber,
    nationality: form.nationality,
    birthDate: form.birthDate,
    gender: form.gender,
    documentSerialNumber: form.documentSerialNumber,
    documentExpiryDate: form.documentExpiryDate,
    birthPlace: form.birthPlace,
    motherName: form.motherName,
    fatherName: form.fatherName,
    issuingAuthority: form.issuingAuthority,
    address: form.address
  };
}

function defaultRoomAssignmentForm(customerId: string, roomId: string): RoomAssignmentFormState {
  const today = localIsoDate(new Date());
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    customerId,
    roomId,
    checkInDate: today,
    checkOutDate: localIsoDate(tomorrow),
    guestCount: "1",
    notes: "",
    status: "planned"
  };
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIdentityType(value: string): string {
  if (value === "tc_identity_card") return "T.C. Kimlik Kartı";
  if (value === "passport") return "Pasaport";
  if (value === "other") return "Diğer belge";
  return "-";
}

function formatCustomerGender(value: string): string {
  if (value === "female") return "Kadın";
  if (value === "male") return "Erkek";
  if (value === "unspecified") return "Belirtilmemiş";
  return "-";
}

function hasCustomerIdentityDetails(customer: DesktopDashboardData["customers"][number]): boolean {
  return Boolean(
    customer.identityNumber
    || customer.nationality
    || customer.birthDate
    || customer.gender
    || customer.documentSerialNumber
    || customer.documentExpiryDate
    || customer.birthPlace
    || customer.motherName
    || customer.fatherName
    || customer.issuingAuthority
    || customer.address
  );
}

function formatCustomerRoomStayStatus(value: string): string {
  if (value === "planned") return "Planlandı";
  if (value === "checked_in") return "Giriş yaptı";
  if (value === "checked_out") return "Çıkış yaptı";
  if (value === "cancelled") return "İptal";
  return value || "Bilinmiyor";
}

function getCustomerRoomStayTone(value: string): StatusTone {
  if (value === "checked_in") return "ok";
  if (value === "planned") return "wait";
  if (value === "cancelled") return "danger";
  return "neutral";
}

function formatStayDateRange(stay: DesktopDashboardData["customerRoomStays"][number]): string {
  const start = formatDateForDisplay(stay.checkInDate) || stay.checkInDate || "-";
  const end = formatDateForDisplay(stay.checkOutDate) || stay.checkOutDate;
  return end ? `${start} – ${end}` : `${start} – açık`;
}

function formatReservationType(value: string) {
  const labels: Record<string, string> = {
    room: "Pansiyon",
    table: "Masa",
    breakfast: "Kahvaltı",
    mixed: "Karma"
  };

  return labels[value] ?? "Rezervasyon";
}

function formatReservationStatus(value: string) {
  const labels: Record<string, string> = {
    pending: "Onay bekliyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    cancelled: "İptal edildi",
    completed: "Tamamlandı"
  };

  return labels[value] ?? "Onay bekliyor";
}

function getReservationStatusTone(status: string): StatusTone {
  if (["rejected", "cancelled"].includes(status)) {
    return "danger";
  }
  if (status === "pending") {
    return "wait";
  }
  if (["approved", "completed"].includes(status)) {
    return "ok";
  }
  return "info";
}

function formatTaskStatus(value: string) {
  const labels: Record<string, string> = {
    pending: "Bekliyor",
    done: "Tamamlandı",
    cancelled: "İptal",
    archived: "Arşiv"
  };

  return labels[value] ?? "Bekliyor";
}

function formatTaskDue(task: DesktopDashboardData["dailyTasks"][number]) {
  return [formatDateForDisplay(task.dueDate), task.dueTime].filter(Boolean).join(" · ") || "Zaman yok";
}

function formatTaskRelation(task: DesktopDashboardData["dailyTasks"][number]) {
  if (!task.relatedType && !task.relatedId) {
    return "İlgili kayıt yok";
  }

  const labels: Record<string, string> = {
    reservation: "İlgili rezervasyon",
    room: "İlgili oda",
    table: "İlgili masa",
    customer: "İlgili müşteri",
    request: "İlgili talep"
  };

  return labels[task.relatedType] ?? "İlgili kayıt";
}

function formatRoomStatus(value: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    reserved: "Rezerve",
    occupied: "Dolu",
    cleaning: "Temizlik",
    maintenance: "Bakım"
  };

  return labels[value] ?? "Boş";
}

function formatTableStatus(value: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    reserved: "Rezerve",
    occupied: "Dolu",
    bill_waiting: "Hesap bekliyor",
    waiting_bill: "Hesap bekliyor",
    checkout: "Hesap bekliyor",
    payment: "Hesap bekliyor",
    cleaning: "Temizlik"
  };

  return labels[value] ?? "Boş";
}

function getTableStatusAction(value: string) {
  if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(value)) {
    return "bill_waiting";
  }
  return ["available", "occupied", "reserved"].includes(value) ? value : "";
}

function getResourceStatusTone(value: string): StatusTone {
  if (value === "available") {
    return "ok";
  }

  if (["reserved", "bill_waiting", "waiting_bill", "checkout", "payment"].includes(value)) {
    return "wait";
  }

  if (value === "maintenance") {
    return "danger";
  }

  return "info";
}

function formatReservationDate(reservation: DesktopDashboardData["reservations"][number]) {
  const startDate = formatDateForDisplay(reservation.startDate);
  const endDate = formatDateForDisplay(reservation.endDate);
  const date = endDate ? `${startDate} - ${endDate}` : startDate;
  return [date, reservation.time].filter(Boolean).join(" · ") || "-";
}

function formatDateForDisplay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatShortDate(value: string) {
  if (!value) {
    return "";
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoDate) {
    return `${isoDate[3]}.${isoDate[2]}`;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length <= 14 ? trimmedValue : "";
}

function formatCompactRequestDate(request: SyncedCustomerRequest) {
  for (const value of [request.start_date, request.date_text, request.created_at]) {
    const formattedValue = formatShortDate(value);
    if (formattedValue) {
      return formattedValue;
    }
  }
  return "";
}

function matchesReservationDate(reservation: DesktopDashboardData["reservations"][number], date: string) {
  const startDate = reservation.startDate || reservation.endDate;
  const endDate = reservation.endDate || reservation.startDate;
  if (!startDate && !endDate) {
    return false;
  }

  return date >= startDate && date <= endDate;
}

function formatReservationRooms(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"]
) {
  const names = reservation.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Henüz oda atanmadı";
}

function formatResourceLinks(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"],
  tables: DesktopDashboardData["tables"]
) {
  const roomNames = reservation.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name).filter(Boolean);
  const tableNames = reservation.tableIds.map((tableId) => tables.find((table) => table.id === tableId)?.name).filter(Boolean);
  const roomText = roomNames.length > 0 ? `Oda: ${roomNames.join(", ")}` : reservation.roomIds.length > 0 ? "Oda atandı" : "";
  const tableText = tableNames.length > 0 ? `Masa: ${tableNames.join(", ")}` : reservation.tableIds.length > 0 ? "Masa atandı" : "";
  return [roomText, tableText].filter(Boolean).join(" · ") || "Yer bilgisi daha sonra paylaşılacak";
}

function buildReservationWhatsAppMessage(
  reservation: DesktopDashboardData["reservations"][number],
  rooms: DesktopDashboardData["rooms"],
  tables: DesktopDashboardData["tables"]
) {
  const greeting = `Merhaba ${reservation.customerName || "Misafir"},`;
  const dateText = formatReservationDate(reservation);
  const typeText = formatReservationType(reservation.reservationType).toLowerCase();

  if (reservation.status === "approved") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} rezervasyonunuz işletme tarafından onaylandı.`,
      formatResourceLinks(reservation, rooms, tables),
      "Geliş saatiniz veya özel notunuz varsa bize yazabilirsiniz."
    ].join(" ");
  }

  if (reservation.status === "rejected") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} talebinize mevcut uygunluk nedeniyle olumlu dönüş yapamıyoruz.`,
      "Uygun başka tarih veya seçenek için tekrar yardımcı olabiliriz."
    ].join(" ");
  }

  if (reservation.status === "cancelled") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} rezervasyonunuz iptal olarak güncellendi.`,
      "Yeni bir tarih düşünürseniz bize yazabilirsiniz."
    ].join(" ");
  }

  return [
    greeting,
    `${dateText} tarihli ${typeText} talebiniz için sizinle iletişime geçiyoruz.`,
    "Detayları işletme sahibi kontrol edip size net bilgi verecektir."
  ].join(" ");
}

function formatCustomerLastContactDate(value: string) {
  if (!value) {
    return "-";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export default App;
