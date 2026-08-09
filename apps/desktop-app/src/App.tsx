import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOwnerReplyWhatsAppMessage,
  createWhatsAppUrl,
  createWhatsAppWebUrl
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
  formatDateForDisplay,
  formatDateTime,
  formatRequestStatus,
  formatRequestType,
  formatReservationDate,
  formatReservationStatus,
  formatRoomStatus,
} from "./app/record-formatters";
import {
  createSaveAiServiceProfiles,
  toSetupForm,
  type SetupFormState
} from "./app/setup-model";
import {
  formatCustomerRoomStayStatus,
  formatCustomerSource,
  formatStayDateRange
} from "./app/customer-model";
import { CustomersWorkspace } from "./components/customers/CustomersWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply, type ManualRequestFormState } from "./components/customers/RequestsWorkspace";
import { CustomerRoomStaysWorkspace, DailyTasksWorkspace, ReservationsWorkspace, RoomsWorkspace, formatTaskDue } from "./components/operations/OperationWorkspaces";
import { AppShell } from "./components/layout/AppShell";
import { PageHeader } from "./components/layout/PageHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { NotificationCenter } from "./components/notifications/NotificationCenter";
import { AiWorkspace, WhatsAppWorkspace } from "./components/messages/MessageWorkspaces";
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
import { SetupWizard, compactAndroidDeviceId } from "./components/settings/SetupWizard";
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
  type UiPreferences
} from "./ui-preferences";

type SyncState = "idle" | "loading" | "success" | "error";
type AppAccessPhase = "checking" | "locked" | "unlocking" | "unlocked";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "yardimci-asistan.sidebar-collapsed";
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
          getRequestStatusTone={getRequestStatusTone}
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
          getRequestStatusTone={getRequestStatusTone}
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




function formatReservationType(value: string) {
  const labels: Record<string, string> = {
    room: "Pansiyon",
    table: "Masa",
    breakfast: "Kahvaltı",
    mixed: "Karma"
  };

  return labels[value] ?? "Rezervasyon";
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

export default App;
