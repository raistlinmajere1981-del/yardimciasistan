import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOwnerReplyWhatsAppMessage,
  createWhatsAppUrl,
  createWhatsAppWebUrl,
  prepareWhatsAppAction,
  WHATSAPP_WEB_HOME_URL
} from "@yardimci-asistan/whatsapp-bridge";
import {
  BarChart3,
  Bell,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  ExternalLink,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  UtensilsCrossed,
  X
} from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem, SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  AiWorkspaceHistoryEntry,
  AiWorkspaceMode,
  CreateManualRequestInput,
  DesktopDashboardData,
  DesktopSetupData,
  SaveInitialSetupInput
} from "../electron/database";
import { parseGoogleAiStudioCurl } from "./google-ai-studio";
import { buildNavigation, getPageMeta, type DesktopPage } from "./app/navigation";
import { getRoomDisplayInfo, isAccommodationTask, isRestaurantTask } from "./app/operations";
import { AppShell } from "./components/layout/AppShell";
import { PageHeader } from "./components/layout/PageHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { ActionButton } from "./components/ui/ActionButton";
import { CompactList } from "./components/ui/CompactList";
import { CompactListButton, CompactListItem } from "./components/ui/CompactListItem";
import { StatusBadge, type StatusTone } from "./components/ui/StatusBadge";
import { CustomerWorkPage } from "./pages/CustomerWorkPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MessagesPage } from "./pages/MessagesPage";
import { PensionPage } from "./pages/PensionPage";
import { RestaurantPage } from "./pages/RestaurantPage";
import {
  applyUiPreferences,
  readUiPreferences,
  saveUiPreferences,
  UI_SCALE_OPTIONS,
  type UiPreferences
} from "./ui-preferences";

type SyncState = "idle" | "loading" | "success" | "error";

interface CategoryFormState {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: string;
}

interface ItemFormState {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  allergens: string;
  tags: string;
  sort_order: string;
}

interface DashboardMetric {
  title: string;
  value: string;
  detail: string;
  tone: "info" | "ok" | "wait" | "neutral";
  icon: typeof Bell;
  enabled: boolean;
}

interface ReportMetric {
  title: string;
  value: string;
  detail: string;
  tone: "info" | "ok" | "wait" | "neutral";
  icon: typeof Bell;
}

interface ReportBreakdownItem {
  label: string;
  value: number;
  percent: number;
  detail: string;
}

interface SetupFormState {
  businessName: string;
  businessType: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  webModuleUrl: string;
  syncSecret: string;
  aiEnabled: boolean;
  aiProvider: string;
  aiService: string;
  aiProjectName: string;
  aiGoogleCurl: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  clearAiApiKey: boolean;
  aiTimeoutSeconds: string;
  roomsEnabled: boolean;
  tablesEnabled: boolean;
  qrMenuEnabled: boolean;
  whatsappEnabled: boolean;
  androidEnabled: boolean;
  roomCount: string;
  tableCount: string;
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

const defaultDashboardData: DesktopDashboardData = {
  databasePath: "Tarayıcı önizleme modu",
  backupPath: "Tarayıcı önizleme modu",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  summary: {
    newRequests: 1,
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
      requestCount: 1,
      reservationCount: 1,
      updatedAt: "2026-07-10T14:30:00+03:00"
    }
  ]
};

const defaultSetupData: DesktopSetupData = {
  setupRequired: false,
  businessName: "Deniz Çiçeği Pansiyon & Kafe",
  businessType: "pension_restaurant",
  phone: "+905321234567",
  whatsapp: "+905321234567",
  email: "merhaba@denizcicegi.example",
  address: "Sahil Yolu No: 18, Akyaka / Muğla",
  webModuleUrl: "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  syncSecret: "change-this-secret",
  aiEnabled: false,
  aiProvider: "openai_compatible",
  aiService: "openai",
  aiProjectName: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  aiTimeoutSeconds: 30,
  aiApiKeyConfigured: false,
  aiLastPublishedAt: "",
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
  }
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

const aiServicePresets = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "gemini", label: "Google AI Studio (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "custom", label: "Özel OpenAI uyumlu servis", baseUrl: "" }
] as const;

function App() {
  const contentRef = useRef<HTMLElement>(null);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(readUiPreferences);
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [dashboardData, setDashboardData] = useState<DesktopDashboardData>(defaultDashboardData);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("Webden yeni talep yok.");
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
  const [aiModelOptions, setAiModelOptions] = useState<Array<{ id: string; label: string }>>([]);
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
    void window.yardimciDesktop?.getBootstrapData().then((data) => {
      setDashboardData((current) => ({
        ...current,
        databasePath: data.databasePath,
        backupPath: data.backupPath,
        webModuleUrl: data.syncSettings.webModuleUrl
      }));
      setSetupData(data.setup);
      setSetupForm(toSetupForm(data.setup));
      setSetupMode(data.setup.setupRequired);
      if (!data.setup.setupRequired) {
        setActivePage("dashboard");
      }
      setSetupMessage(data.setup.setupRequired ? "İlk kurulum bilgilerini tamamlayın." : "Ayarlar düzenlenebilir.");
    });
    void loadDashboardData();
  }, []);

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
    setAiModelOptions([]);
  }, [setupForm.aiService, setupForm.aiApiKey]);

  useEffect(() => {
    if (aiWorkspaceRequestId && dashboardData.requests.some((request) => request.id === aiWorkspaceRequestId)) {
      return;
    }
    setAiWorkspaceRequestId(dashboardData.requests[0]?.id ?? "");
  }, [aiWorkspaceRequestId, dashboardData.requests]);

  const metrics = useMemo<DashboardMetric[]>(() => {
    const summary = dashboardData.summary;

    const dashboardMetrics: DashboardMetric[] = [
      {
        title: "Yeni talepler",
        value: String(summary.newRequests),
        detail: summary.newRequests > 0 ? "Dönüş bekleyen müşteri var" : "Henüz yeni talep yok",
        tone: summary.newRequests > 0 ? "info" : "neutral",
        icon: Bell,
        enabled: true
      },
      {
        title: "Bugünkü işler",
        value: String(summary.pendingDailyTasks),
        detail: summary.pendingDailyTasks > 0 ? "Takip edilmesi gereken işler" : "Bugün için bekleyen iş yok",
        tone: summary.pendingDailyTasks > 0 ? "wait" : "neutral",
        icon: ClipboardList,
        enabled: true
      },
      {
        title: "Boş odalar",
        value: `${dashboardData.rooms.filter((room) => getRoomDisplayInfo(room, dashboardData.reservations).status === "available").length} boş`,
        detail: `${summary.totalRooms} odadan ${dashboardData.rooms.filter((room) => getRoomDisplayInfo(room, dashboardData.reservations).status === "available").length} oda uygun`,
        tone: "ok",
        icon: BedDouble,
        enabled: modules.rooms
      },
      {
        title: "Boş masalar",
        value: `${summary.availableTables} boş`,
        detail: "Bahçe ve salon masaları uygun",
        tone: "ok",
        icon: UtensilsCrossed,
        enabled: modules.tables
      },
      {
        title: "Rezervasyonlar",
        value: String(summary.pendingReservations),
        detail: summary.pendingReservations > 0 ? "Onay gerektiren kayıtlar" : "Bekleyen rezervasyon yok",
        tone: summary.pendingReservations > 0 ? "wait" : "neutral",
        icon: CalendarCheck,
        enabled: true
      },
      {
        title: "Hazır cevaplar",
        value: String(summary.preparedWhatsAppMessages),
        detail: summary.preparedWhatsAppMessages > 0 ? "Gönderilmeyi bekleyen taslak" : "Hazır cevap beklemiyor",
        tone: summary.preparedWhatsAppMessages > 0 ? "info" : "neutral",
        icon: MessageCircle,
        enabled: modules.whatsapp || modules.ai
      }
    ];

    return dashboardMetrics.filter((metric) => metric.enabled);
  }, [dashboardData.reservations, dashboardData.rooms, dashboardData.summary, modules]);

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

  async function handlePullRequests() {
    setSyncState("loading");
    setStatusMessage("Web talepleri kontrol ediliyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
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
  }

  function selectItem(item: PublishedMenuItem) {
    setSelectedItemId(item.id);
    setItemForm(toItemForm(item, dashboardData.menu.categories[0]?.id ?? ""));
  }

  function startNewCategory() {
    setSelectedCategoryId("");
    setCategoryForm(emptyCategoryForm(nextSortOrder(dashboardData.menu.categories)));
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

  function openWhatsApp(request: SyncedCustomerRequest) {
    setSelectedWhatsAppRequestId(request.id);
    setActivePage("messages");
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
      useStoredApiKey: !setupForm.clearAiApiKey && apiKey.trim() === "",
      timeoutSeconds: Number(setupForm.aiTimeoutSeconds)
    });

    setAiConnectionTestState(result.ok ? "success" : "error");
    setAiConnectionTestMessage(result.message);
    if (result.ok) {
      setAiModelOptions(result.models);
      if (result.model !== setupForm.aiModel) {
        setSetupForm((current) => ({ ...current, aiModel: result.model }));
      }
    } else if (setupForm.aiService === "gemini") {
      setAiModelOptions(result.models ?? []);
      if (result.model) {
        setSetupForm((current) => ({ ...current, aiModel: result.model || current.aiModel }));
      }
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
      aiEnabled: setupForm.aiEnabled,
      aiProvider: setupForm.aiProvider,
      aiService: setupForm.aiService,
      aiProjectName: setupForm.aiProjectName,
      aiBaseUrl: setupForm.aiBaseUrl,
      aiModel: setupForm.aiModel,
      aiApiKey: setupForm.aiApiKey,
      clearAiApiKey: setupForm.clearAiApiKey,
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
        tables: Number(setupForm.tableCount)
      }
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

  if (setupMode) {
    return (
      <SetupWizard
        form={setupForm}
        setupData={setupData}
        saveState={setupSaveState}
        message={setupMessage}
        aiConnectionTestState={aiConnectionTestState}
        aiConnectionTestMessage={aiConnectionTestMessage}
        aiModelOptions={aiModelOptions}
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
      sidebar={(
        <Sidebar
          items={navigationItems}
          activePage={activePage}
          businessName={setupData.businessName}
          onNavigate={setActivePage}
        />
      )}
      header={(
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          action={activePage === "menu" ? (
            <div className={`sync-pill sync-${menuPublishState}`}>
              <span>{menuStatusMessage}</span>
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
            <div className={`sync-pill sync-${syncState}`}>
              <span>{statusMessage}</span>
              <button type="button" onClick={handlePullRequests} disabled={syncState === "loading"}>
                <RefreshCw size={16} aria-hidden="true" />
                Web Taleplerini Çek
              </button>
            </div>
          )}
        />
      )}
      overlay={menuPreviewOpen ? (
        <LocalMenuPreview
          menu={dashboardData.menu}
          setupData={setupData}
          webModuleUrl={dashboardData.webModuleUrl}
          onClose={() => setMenuPreviewOpen(false)}
        />
      ) : undefined}
    >

        {activePage === "dashboard" ? (
          <DashboardPage
            data={dashboardData}
            metrics={metrics}
            aiEnabled={setupData.aiEnabled}
            onCallRequest={callCustomer}
            onOpenWhatsApp={openWhatsApp}
            onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
            onOpenDailyAi={() => openAiTools("daily")}
            formatRequestType={formatRequestType}
            formatRequestStatus={formatRequestStatus}
            getRequestStatusTone={getRequestStatusTone}
            isRequestWaitingForReply={isRequestWaitingForReply}
            formatTaskDue={formatTaskDue}
            formatReservationDate={formatReservationDate}
            formatReservationStatus={formatReservationStatus}
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
              />
            )}
            customers={(
              <CustomersWorkspace
                customers={dashboardData.customers}
                requests={dashboardData.requests}
                reservations={dashboardData.reservations}
                aiEnabled={setupData.aiEnabled}
                onCall={callCustomerRecord}
                onWhatsApp={openCustomerWhatsApp}
                onSummarize={(requestId) => openAiTools("summary", requestId)}
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
            rooms={<RoomsWorkspace rooms={dashboardData.rooms} reservations={dashboardData.reservations} onUpdateStatus={handleUpdateRoomStatus} />}
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
            tables={<TablesWorkspace tables={dashboardData.tables} onUpdateStatus={handleUpdateTableStatus} />}
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
          />
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
            aiConnectionTestState={aiConnectionTestState}
            aiConnectionTestMessage={aiConnectionTestMessage}
            aiModelOptions={aiModelOptions}
            onFormChange={setSetupForm}
            onTestAiConnection={handleTestAiConnection}
            onCreateBackup={handleCreateManualBackup}
            onPublishAndroid={handlePublishAndroidSnapshot}
            onSave={handleSaveSetup}
            onSkip={() => setActivePage("dashboard")}
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

interface LocalMenuPreviewProps {
  menu: DesktopDashboardData["menu"];
  setupData: DesktopSetupData;
  webModuleUrl: string;
  onClose: () => void;
}

function LocalMenuPreview({ menu, setupData, webModuleUrl, onClose }: LocalMenuPreviewProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const categories = useMemo(
    () => menu.categories.filter((category) => category.is_active).sort(compareMenuRecords),
    [menu.categories]
  );
  const activeCategoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const items = useMemo(
    () => menu.items
      .filter((item) => item.is_available && activeCategoryIds.has(item.category_id))
      .sort(compareMenuRecords),
    [activeCategoryIds, menu.items]
  );
  const visibleCategories = activeCategoryId === "all"
    ? categories
    : categories.filter((category) => category.id === activeCategoryId);
  const visibleSections = visibleCategories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id)
    }))
    .filter((section) => section.items.length > 0);
  const heroImageUrl = resolveMenuPreviewImageUrl(
    items.find((item) => item.is_featured && item.image_url)?.image_url
      || items.find((item) => item.image_url)?.image_url
      || "",
    webModuleUrl
  );

  useEffect(() => {
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="local-menu-preview-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="local-menu-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="local-menu-preview-title">
        <header className="local-menu-preview-toolbar">
          <div>
            <strong id="local-menu-preview-title">Yerel Menü Önizlemesi</strong>
            <span>Uygulamadaki son kaydedilen bilgiler gösteriliyor; web yayını etkilenmez.</span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Önizlemeyi kapat">
            <X size={18} aria-hidden="true" />
            Kapat
          </button>
        </header>

        <div className="local-menu-preview-viewport">
          <article className="local-menu-preview-page">
            <header className={heroImageUrl ? "local-menu-hero has-image" : "local-menu-hero"}>
              {heroImageUrl && <img src={heroImageUrl} alt="" aria-hidden="true" />}
              <div className="local-menu-hero-shade" />
              <div className="local-menu-hero-content">
                <p>QR Menü · Yerel Önizleme</p>
                <h1>{setupData.businessName || "İşletme"} Menü</h1>
                <span>Güncel ürünleri ve fiyatları yayınlamadan önce kontrol edin.</span>
                <div className="local-menu-hero-meta" aria-label="Menü bilgileri">
                  <span>Güncel fiyatlar</span>
                  <span>{categories.length} kategori</span>
                  <span>{items.length} ürün</span>
                </div>
              </div>
            </header>

            <main className="local-menu-preview-content">
              <section className="local-menu-preview-categories" aria-label="Önizleme kategorileri">
                <div>
                  <button
                    className={activeCategoryId === "all" ? "is-active" : ""}
                    type="button"
                    aria-pressed={activeCategoryId === "all"}
                    onClick={() => setActiveCategoryId("all")}
                  >
                    Tüm Ürünler
                  </button>
                  {categories.map((category) => (
                    <button
                      className={activeCategoryId === category.id ? "is-active" : ""}
                      type="button"
                      aria-pressed={activeCategoryId === category.id}
                      onClick={() => setActiveCategoryId(category.id)}
                      key={category.id}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
                <p>{menu.updated_at ? `Yerel güncelleme: ${formatDateTime(menu.updated_at)}` : "Yerel güncelleme bekleniyor."}</p>
              </section>

              <div className="local-menu-preview-list">
                {visibleSections.length === 0 ? (
                  <p className="local-menu-preview-empty">Bu kategori için aktif ürün bulunmuyor.</p>
                ) : visibleSections.map(({ category, items: categoryItems }) => (
                  <section className="local-menu-preview-section" key={category.id}>
                    <div className="local-menu-preview-section-title">
                      <h2>{category.name}</h2>
                      {category.description && <p>{category.description}</p>}
                    </div>
                    <div className="local-menu-preview-grid">
                      {categoryItems.map((item) => {
                        const imageUrl = resolveMenuPreviewImageUrl(item.image_url, webModuleUrl);
                        return (
                          <article className={imageUrl ? "local-menu-preview-item" : "local-menu-preview-item no-image"} key={item.id}>
                            {imageUrl && <img src={imageUrl} alt={item.name} />}
                            <div className="local-menu-preview-item-body">
                              <div className="local-menu-preview-item-title">
                                <strong className={item.is_featured ? "is-featured" : ""}>{item.name}</strong>
                                <span>{formatCurrency(item.price, item.currency)}</span>
                              </div>
                              {item.description && <p>{item.description}</p>}
                              {item.tags.length > 0 && (
                                <div className="local-menu-preview-tags">
                                  {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </main>

            <footer className="local-menu-preview-footer">
              <div>
                <strong>{setupData.businessName || "İşletme"}</strong>
                {setupData.address && <span>{setupData.address}</span>}
              </div>
              {setupData.whatsapp && <span className="local-menu-preview-whatsapp">WhatsApp</span>}
            </footer>
          </article>
        </div>
      </section>
    </div>
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
  aiConnectionTestState: SyncState;
  aiConnectionTestMessage: string;
  aiModelOptions: Array<{ id: string; label: string }>;
  onFormChange: (form: SetupFormState) => void;
  onTestAiConnection: () => void;
  onCreateBackup?: () => void;
  onPublishAndroid?: () => void;
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
  aiConnectionTestState,
  aiConnectionTestMessage,
  aiModelOptions,
  onFormChange,
  onTestAiConnection,
  onCreateBackup,
  onPublishAndroid,
  onSave,
  onSkip,
  uiPreferences,
  onUiPreferencesChange
}: SetupWizardProps) {
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showGoogleCurl, setShowGoogleCurl] = useState(false);
  const [settingsLevel, setSettingsLevel] = useState<"basic" | "advanced">("basic");
  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const updateAiService = (service: string) => {
    const preset = aiServicePresets.find((item) => item.id === service);
    onFormChange({
      ...form,
      aiService: service,
      aiBaseUrl: preset?.baseUrl || form.aiBaseUrl,
      aiGoogleCurl: "",
      aiModel: service === form.aiService ? form.aiModel : ""
    });
  };

  const renderAiConnectionActions = (inline: boolean) => (
    <div className={`setup-ai-actions${inline ? " is-inline" : ""} sync-${aiConnectionTestState}`}>
      <button className="setup-secondary" type="button" onClick={onTestAiConnection} disabled={!form.aiEnabled || aiConnectionTestState === "loading" || (form.aiService === "gemini" && !form.aiGoogleCurl.trim() && !form.aiApiKey.trim() && !setupData.aiApiKeyConfigured)}>
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
          <div className="setup-count-row">
            <label>
              Oda sayısı
              <input value={form.roomCount} onChange={(event) => update("roomCount", event.target.value)} inputMode="numeric" />
            </label>
            <label>
              Masa sayısı
              <input value={form.tableCount} onChange={(event) => update("tableCount", event.target.value)} inputMode="numeric" />
            </label>
          </div>
          <label className="setup-checkline settings-ai-toggle">
            <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
            AI cevap önerileri açık
          </label>
        </div>
        </div>}

        {settingsLevel === "advanced" && <div className="settings-section-grid settings-advanced-grid"><div className="setup-section settings-web-section">
          <div className="setup-section-title">
            {!embedded && <p>Web Bağlantısı</p>}
            <h2>Web Bağlantısı</h2>
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
                  <option value={preset.id} key={preset.id}>{preset.label}</option>
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
                      value={form.aiGoogleCurl}
                      onChange={(event) => update("aiGoogleCurl", event.target.value)}
                      type={showGoogleCurl ? "text" : "password"}
                      placeholder={setupData.aiApiKeyConfigured ? "Kayıtlı bağlantıyı kullanmak için boş bırakabilirsiniz" : "Copy cURL quickstart çıktısını buraya yapıştırın"}
                      disabled={!form.aiEnabled || form.clearAiApiKey}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="button" onClick={() => setShowGoogleCurl((current) => !current)} disabled={!form.aiEnabled || form.clearAiApiKey}>
                      {showGoogleCurl ? "Gizle" : "Göster"}
                    </button>
                  </div>
                  <small>Komut yalnız bağlantı kontrolünde okunur; adres, anahtar ve örnek model otomatik hazırlanır.</small>
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
              {form.aiService === "gemini" && aiModelOptions.length > 0 ? (
                <select value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} disabled={!form.aiEnabled}>
                  {aiModelOptions.map((model) => (
                    <option value={model.id} key={model.id}>{model.label}</option>
                  ))}
                </select>
              ) : (
                <input value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder={form.aiService === "gemini" ? "Bağlantı kontrolünden sonra listelenir" : "Serviste görünen model adı"} disabled={!form.aiEnabled || form.aiService === "gemini"} spellCheck={false} />
              )}
              {form.aiService === "gemini" && (
                <small>{aiModelOptions.length > 0 ? `${aiModelOptions.length} model servisten alındı.` : "Bağlantıyı Dene ile kullanılabilir modeller otomatik alınır."}</small>
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
                  value={form.aiApiKey}
                  onChange={(event) => update("aiApiKey", event.target.value)}
                  type={showAiApiKey ? "text" : "password"}
                  placeholder={setupData.aiApiKeyConfigured ? "Yeni anahtar girmezseniz kayıtlı anahtar korunur" : "Servis erişim anahtarını girin"}
                  disabled={!form.aiEnabled || form.clearAiApiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button type="button" onClick={() => setShowAiApiKey((current) => !current)} disabled={!form.aiEnabled || form.clearAiApiKey}>
                  {showAiApiKey ? "Gizle" : "Göster"}
                </button>
              </div>
              <small>{setupData.aiApiKeyConfigured ? "Anahtar bu cihazda güvenli biçimde kayıtlı." : "Anahtar henüz kayıtlı değil."}</small>
            </div>}
            {setupData.aiApiKeyConfigured && (
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
                Kayıtlı erişim anahtarını sil ve AI yardımcıyı kapat
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

function WhatsAppWorkspace({ view, requests, selectedRequest, selectedMessage, selectedUrl, aiEnabled, aiState, aiMessage, onSelectRequest, onOpenExternal, onReturnToSafe, onCall, onRewrite, onMessageSent }: WhatsAppWorkspaceProps) {
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
  onOpenReservation
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

interface ReportsWorkspaceProps {
  dashboardData: DesktopDashboardData;
}

function ReportsWorkspace({ dashboardData }: ReportsWorkspaceProps) {
  const report = useMemo(() => buildReportModel(dashboardData), [dashboardData]);

  return (
    <section className="reports-workspace" aria-label="Basit raporlar">
      <section className="report-metric-grid" aria-label="Rapor özeti">
        {report.metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`report-metric-card tone-${metric.tone}`} key={metric.title}>
              <span className="metric-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <span>{metric.title}</span>
                <strong>{metric.value}</strong>
                <p>{metric.detail}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="report-grid" aria-label="Rapor detayları">
        <ReportBreakdownPanel eyebrow="Müşteri Talepleri" title="Talep Durumları" items={report.requestStatus} emptyLabel="Henüz talep kaydı yok." />
        <ReportBreakdownPanel eyebrow="Rezervasyon" title="Onay Durumu" items={report.reservationStatus} emptyLabel="Henüz rezervasyon yok." />
        <ReportBreakdownPanel eyebrow="Kaynaklar" title="Oda Durumu" items={report.roomStatus} emptyLabel="Oda kaydı yok." />
        <ReportBreakdownPanel eyebrow="Servis" title="Masa Durumu" items={report.tableStatus} emptyLabel="Masa kaydı yok." />

        <section className="panel report-panel report-focus-panel">
          <div className="panel-heading compact">
            <div>
              <p>Bugünkü Odak</p>
              <h2>Kritik İşler</h2>
            </div>
          </div>
          <div className="report-focus-list">
            {report.focusItems.map((item) => (
              <article className={`report-focus-item tone-${item.tone}`} key={item.title}>
                <span>{item.value}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel report-panel report-summary-panel">
          <div className="panel-heading compact">
            <div>
              <p>İşletme Özeti</p>
              <h2>Kayıt Dağılımı</h2>
            </div>
          </div>
          <dl className="info-list detail-info-grid">
            <div>
              <dt>Müşteri</dt>
              <dd>{dashboardData.customers.length} kayıt</dd>
            </div>
            <div>
              <dt>Tekrarlayan müşteri</dt>
              <dd>{report.repeatCustomerCount} kayıt</dd>
            </div>
            <div>
              <dt>Menü</dt>
              <dd>{dashboardData.summary.availableMenuItems} ürün yayında</dd>
            </div>
            <div>
              <dt>Günlük iş</dt>
              <dd>{report.completedTaskCount}/{dashboardData.dailyTasks.length} tamamlandı</dd>
            </div>
          </dl>
        </section>
      </section>
    </section>
  );
}

function ReportBreakdownPanel({ eyebrow, title, items, emptyLabel }: { eyebrow: string; title: string; items: ReportBreakdownItem[]; emptyLabel: string }) {
  return (
    <section className="panel report-panel">
      <div className="panel-heading compact">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state compact-empty">
          <BarChart3 size={24} aria-hidden="true" />
          <strong>Kayıt yok.</strong>
          <p>{emptyLabel}</p>
        </div>
      ) : (
        <div className="report-bar-list">
          {items.map((item) => (
            <article className="report-bar-row" key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              <div className="report-bar-track" aria-hidden="true">
                <span className="report-bar-fill" style={{ width: `${item.percent}%` }} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface CustomersWorkspaceProps {
  customers: DesktopDashboardData["customers"];
  requests: SyncedCustomerRequest[];
  reservations: DesktopDashboardData["reservations"];
  aiEnabled: boolean;
  onCall: (customer: DesktopDashboardData["customers"][number]) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
  onSummarize: (requestId: string) => void;
}

function CustomersWorkspace({ customers, requests, reservations, aiEnabled, onCall, onWhatsApp, onSummarize }: CustomersWorkspaceProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "");
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const haystack = `${customer.fullName} ${customer.phone} ${customer.email} ${customer.tags.join(" ")}`.toLowerCase();
        return haystack.includes(searchText.trim().toLowerCase());
      }),
    [customers, searchText]
  );
  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedCustomerId) ?? filteredCustomers[0] ?? customers[0];
  const selectedRequests = selectedCustomer
    ? requests.filter((request) => request.customer_id === selectedCustomer.id || request.customer_phone === selectedCustomer.phone)
    : [];
  const selectedReservations = selectedCustomer
    ? reservations.filter((reservation) => reservation.customerId === selectedCustomer.id || reservation.customerPhone === selectedCustomer.phone)
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
        </div>
        <label className="customer-search">
          <span>Ara</span>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Ad, telefon veya etiket" />
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
              <StatusBadge tone="info">{selectedCustomer.requestCount} talep</StatusBadge>
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
                <dd>{selectedCustomer.lastContactAt || selectedCustomer.updatedAt || "-"}</dd>
              </div>
              <div>
                <dt>Rezervasyon</dt>
                <dd>{selectedCustomer.reservationCount} kayıt</dd>
              </div>
            </dl>
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
    </section>
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
          <label>
            Durum
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tümü</option>
              <option value="pending">Onay bekleyen</option>
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
              <option value="cancelled">İptal edildi</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </label>
          <label>
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
          <ActionButton variant="secondary" size="sm" type="button" onClick={() => { setStatusFilter("all"); setDateFilter(""); }}>
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
  onUpdateStatus: (roomId: string, status: string) => void;
}

function RoomsWorkspace({ rooms, reservations, onUpdateStatus }: RoomsWorkspaceProps) {
  return (
    <section className="operations-grid compact-resource-grid" aria-label="Oda yönetimi">
      {rooms.length === 0 && (
        <div className="panel empty-state"><BedDouble size={28} aria-hidden="true" /><strong>Oda kaydı yok.</strong><p>Oda sayısını Temel Ayarlar bölümünden belirleyebilirsiniz.</p></div>
      )}
      {rooms.map((room) => {
        const displayInfo = getRoomDisplayInfo(room, reservations);
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
          <p className="compact-reservation-line line-clamp-1"><strong>Rezervasyon:</strong> {displayInfo.reservationTitle}</p>
          {(room.description || room.features.length > 0) && <p className="resource-description line-clamp-1">{room.description || room.features.join(", ")}</p>}
          <div className="status-button-row compact-status-actions" aria-label={`${room.name} durumunu değiştir`}>
            <button className={displayInfo.status === "available" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "available"} onClick={() => onUpdateStatus(room.id, "available")}>Boş</button>
            <button className={displayInfo.status === "occupied" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "occupied"} onClick={() => onUpdateStatus(room.id, "occupied")}>Dolu</button>
            <button className={displayInfo.status === "cleaning" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "cleaning"} onClick={() => onUpdateStatus(room.id, "cleaning")}>Temizlik</button>
            <button className={displayInfo.status === "maintenance" ? "is-active" : undefined} type="button" aria-pressed={displayInfo.status === "maintenance"} onClick={() => onUpdateStatus(room.id, "maintenance")}>Bakım</button>
          </div>
        </article>
      })}
    </section>
  );
}

interface TablesWorkspaceProps {
  tables: DesktopDashboardData["tables"];
  onUpdateStatus: (tableId: string, status: string) => void;
}

function TablesWorkspace({ tables, onUpdateStatus }: TablesWorkspaceProps) {
  return (
    <section className="operations-grid compact-resource-grid" aria-label="Masa yönetimi">
      {tables.length === 0 && (
        <div className="panel empty-state"><UtensilsCrossed size={28} aria-hidden="true" /><strong>Masa kaydı yok.</strong><p>Masa sayısını Temel Ayarlar bölümünden belirleyebilirsiniz.</p></div>
      )}
      {tables.map((table) => {
        const activeStatusAction = getTableStatusAction(table.status);
        return <article className="compact-card resource-compact-card table-compact-card" key={table.id}>
          <div className="resource-card-heading">
            <div>
              <h2>{table.name}</h2>
            </div>
            <StatusBadge tone={getResourceStatusTone(table.status)}>{formatTableStatus(table.status)}</StatusBadge>
          </div>
          <div className="compact-meta-row">
            <span>{table.area || "Genel"}</span>
            <span>{table.capacity} kişi</span>
            <span>{table.activeReservationTitle || "Rezervasyon yok"}</span>
          </div>
          {table.notes && <p className="resource-description line-clamp-1">{table.notes}</p>}
          <div className="status-button-row compact-status-actions" aria-label={`${table.name} durumunu değiştir`}>
            <button className={activeStatusAction === "available" ? "is-active" : undefined} type="button" aria-pressed={activeStatusAction === "available"} onClick={() => onUpdateStatus(table.id, "available")}>Boş</button>
            <button className={activeStatusAction === "occupied" ? "is-active" : undefined} type="button" aria-pressed={activeStatusAction === "occupied"} onClick={() => onUpdateStatus(table.id, "occupied")}>Dolu</button>
            <button className={activeStatusAction === "reserved" ? "is-active" : undefined} type="button" aria-pressed={activeStatusAction === "reserved"} onClick={() => onUpdateStatus(table.id, "reserved")}>Rezerve</button>
            <button className={activeStatusAction === "bill_waiting" ? "is-active" : undefined} type="button" aria-pressed={activeStatusAction === "bill_waiting"} onClick={() => onUpdateStatus(table.id, "bill_waiting")}>Hesap</button>
          </div>
        </article>;
      })}
    </section>
  );
}

interface MenuManagerProps {
  dashboardData: DesktopDashboardData;
  categoryForm: CategoryFormState;
  itemForm: ItemFormState;
  selectedCategoryId: string;
  selectedItemId: string;
  menuEditState: SyncState;
  menuEditMessage: string;
  onCategoryFormChange: (form: CategoryFormState) => void;
  onItemFormChange: (form: ItemFormState) => void;
  onSelectCategory: (category: PublishedMenuCategory) => void;
  onSelectItem: (item: PublishedMenuItem) => void;
  onNewCategory: () => void;
  onNewItem: () => void;
  onSaveCategory: () => void;
  onSaveItem: () => void;
}

function MenuManager({
  dashboardData,
  categoryForm,
  itemForm,
  selectedCategoryId,
  selectedItemId,
  menuEditState,
  menuEditMessage,
  onCategoryFormChange,
  onItemFormChange,
  onSelectCategory,
  onSelectItem,
  onNewCategory,
  onNewItem,
  onSaveCategory,
  onSaveItem
}: MenuManagerProps) {
  return (
    <section className="menu-manager" aria-label="QR menü yönetimi">
      <div className="menu-management-grid">
        <section className="panel menu-list-panel category-panel">
          <div className="panel-heading compact">
            <h2>Kategoriler</h2>
            <div className="menu-heading-actions">
              <StatusBadge tone="info">{dashboardData.menu.categories.length} kayıt</StatusBadge>
              <button className="icon-command" type="button" onClick={onNewCategory} aria-label="Kategori ekle">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="manager-list">
            {dashboardData.menu.categories.map((category) => (
              <button
                className={selectedCategoryId === category.id ? "manager-row is-active" : "manager-row"}
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category)}
                aria-pressed={selectedCategoryId === category.id}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.is_active ? "Aktif" : "Pasif"}</small>
                </span>
                <span className={category.is_active ? "dot is-on" : "dot"} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="manager-form">
            <label>
              Kategori adı
              <input
                value={categoryForm.name}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, name: event.target.value })}
                placeholder="Kahvaltı"
              />
            </label>
            <label>
              Açıklama
              <textarea
                value={categoryForm.description}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, description: event.target.value })}
                placeholder="Kısa kategori açıklaması"
              />
            </label>
            <label className="toggle-label">
              <input
                checked={categoryForm.is_active}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, is_active: event.target.checked })}
                type="checkbox"
              />
              Aktif
            </label>
            <details className="form-details category-details">
              <summary>Detaylı ayarlar</summary>
              <label>
                Sıra
                <input
                  value={categoryForm.sort_order}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, sort_order: event.target.value })}
                  inputMode="numeric"
                />
              </label>
            </details>
            <button className="primary-command" type="button" onClick={onSaveCategory}>
              <Save size={16} aria-hidden="true" />
              Kategoriyi Kaydet
            </button>
          </div>
        </section>

        <section className="panel menu-list-panel product-panel">
          <div className="panel-heading compact">
            <h2>Ürünler</h2>
            <div className="menu-heading-actions">
              <StatusBadge tone="info">{dashboardData.menu.items.length} kayıt</StatusBadge>
              <button className="icon-command" type="button" onClick={onNewItem} aria-label="Ürün ekle">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="manager-list product-list">
            {dashboardData.menu.items.map((item) => (
              <button
                className={selectedItemId === item.id ? "manager-row is-active" : "manager-row"}
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                aria-pressed={selectedItemId === item.id}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{findMenuCategoryName(item.category_id, dashboardData.menu.categories)} · {formatCurrency(item.price, item.currency)}</small>
                </span>
                <span className={item.is_available ? "dot is-on" : "dot"} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className="panel item-editor-panel">
          <div className="panel-heading compact">
            <h2>Ürün Detayı</h2>
          </div>

          <div className="manager-form item-form">
            <label className="item-name-field">
              Ürün adı
              <input value={itemForm.name} onChange={(event) => onItemFormChange({ ...itemForm, name: event.target.value })} placeholder="Serpme Kahvaltı" />
            </label>
            <label className="item-category-field">
              Kategori
              <select value={itemForm.category_id} onChange={(event) => onItemFormChange({ ...itemForm, category_id: event.target.value })}>
                {dashboardData.menu.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="item-price-field">
              Fiyat
              <input value={itemForm.price} onChange={(event) => onItemFormChange({ ...itemForm, price: event.target.value })} inputMode="decimal" />
            </label>
            <label className="item-description-field">
              Açıklama
              <textarea
                value={itemForm.description}
                onChange={(event) => onItemFormChange({ ...itemForm, description: event.target.value })}
                placeholder="Ürün açıklaması"
              />
            </label>
            <div className="form-row">
              <label className="toggle-label">
                <input
                  checked={itemForm.is_available}
                  onChange={(event) => onItemFormChange({ ...itemForm, is_available: event.target.checked })}
                  type="checkbox"
                />
                Mevcut
              </label>
              <label className="toggle-label">
                <input
                  checked={itemForm.is_featured}
                  onChange={(event) => onItemFormChange({ ...itemForm, is_featured: event.target.checked })}
                  type="checkbox"
                />
                Öne çıkar
              </label>
            </div>
            <details className="form-details item-details">
              <summary>Detaylı ayarlar</summary>
              <label>
                Görsel yolu
                <input value={itemForm.image_url} onChange={(event) => onItemFormChange({ ...itemForm, image_url: event.target.value })} placeholder="/assets/menu-breakfast.webp" />
              </label>
              <div className="form-row">
                <label>
                  Sıra
                  <input value={itemForm.sort_order} onChange={(event) => onItemFormChange({ ...itemForm, sort_order: event.target.value })} inputMode="numeric" />
                </label>
                <label>
                  Para birimi
                  <select value={itemForm.currency} onChange={(event) => onItemFormChange({ ...itemForm, currency: event.target.value })}>
                    <option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Etiketler
                  <input value={itemForm.tags} onChange={(event) => onItemFormChange({ ...itemForm, tags: event.target.value })} placeholder="popüler, kahvaltı" />
                </label>
                <label>
                  Alerjenler
                  <input value={itemForm.allergens} onChange={(event) => onItemFormChange({ ...itemForm, allergens: event.target.value })} placeholder="gluten, süt" />
                </label>
              </div>
            </details>
            <div className="menu-editor-footer">
              <p className={`menu-status sync-${menuEditState}`}>{menuEditMessage}</p>
              <button className="primary-command" type="button" onClick={onSaveItem}>
                <Save size={16} aria-hidden="true" />
                Ürünü Kaydet
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function toCategoryForm(category: PublishedMenuCategory | undefined): CategoryFormState {
  if (!category) {
    return emptyCategoryForm(10);
  }

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    is_active: category.is_active,
    sort_order: String(category.sort_order)
  };
}

function emptyCategoryForm(sortOrder: number): CategoryFormState {
  return {
    id: "",
    name: "",
    description: "",
    is_active: true,
    sort_order: String(sortOrder)
  };
}

function toItemForm(item: PublishedMenuItem | undefined, fallbackCategoryId: string): ItemFormState {
  if (!item) {
    return emptyItemForm(fallbackCategoryId, 10);
  }

  return {
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    price: String(item.price),
    currency: item.currency,
    image_url: item.image_url,
    is_available: item.is_available,
    is_featured: item.is_featured,
    allergens: item.allergens.join(", "),
    tags: item.tags.join(", "),
    sort_order: String(item.sort_order)
  };
}

function emptyItemForm(categoryId: string, sortOrder: number): ItemFormState {
  return {
    id: "",
    category_id: categoryId,
    name: "",
    description: "",
    price: "0",
    currency: "TRY",
    image_url: "",
    is_available: true,
    is_featured: false,
    allergens: "",
    tags: "",
    sort_order: String(sortOrder)
  };
}

function nextSortOrder(records: Array<{ sort_order: number }>) {
  return records.reduce((highest, record) => Math.max(highest, record.sort_order), 0) + 10;
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildReportModel(dashboardData: DesktopDashboardData) {
  const requestCount = dashboardData.requests.length;
  const reservationCount = dashboardData.reservations.length;
  const roomCount = dashboardData.rooms.length;
  const tableCount = dashboardData.tables.length;
  const taskCount = dashboardData.dailyTasks.length;
  const convertedRequestCount = dashboardData.requests.filter((request) => request.status === "converted_to_reservation").length;
  const answeredRequestCount = dashboardData.requests.filter((request) => request.status === "answered" || request.status === "converted_to_reservation").length;
  const pendingRequestCount = dashboardData.requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length;
  const approvedReservationCount = dashboardData.reservations.filter((reservation) => reservation.status === "approved" || reservation.status === "completed").length;
  const pendingReservationCount = dashboardData.reservations.filter((reservation) => reservation.status === "pending").length;
  const busyRoomCount = dashboardData.rooms.filter((room) => ["reserved", "occupied"].includes(room.status)).length;
  const busyTableCount = dashboardData.tables.filter((table) => ["reserved", "occupied", "bill_waiting"].includes(table.status)).length;
  const completedTaskCount = dashboardData.dailyTasks.filter((task) => task.status === "done").length;
  const pendingTaskCount = dashboardData.dailyTasks.filter((task) => task.status === "pending").length;
  const repeatCustomerCount = dashboardData.customers.filter((customer) => customer.requestCount + customer.reservationCount > 1).length;

  const metrics: ReportMetric[] = [
    {
      title: "Talep dönüşümü",
      value: formatPercent(convertedRequestCount, requestCount),
      detail: `${convertedRequestCount}/${requestCount} talep rezervasyona çevrildi`,
      tone: convertedRequestCount > 0 ? "ok" : pendingRequestCount > 0 ? "wait" : "neutral",
      icon: TrendingUp
    },
    {
      title: "Yanıt bekleyen",
      value: String(pendingRequestCount),
      detail: `${answeredRequestCount} talep cevaplandı veya rezervasyona döndü`,
      tone: pendingRequestCount > 0 ? "wait" : "ok",
      icon: MessageCircle
    },
    {
      title: "Rezervasyon onayı",
      value: formatPercent(approvedReservationCount, reservationCount),
      detail: `${pendingReservationCount} kayıt işletme onayı bekliyor`,
      tone: pendingReservationCount > 0 ? "wait" : "ok",
      icon: CalendarCheck
    },
    {
      title: "Oda kullanımı",
      value: formatPercent(busyRoomCount, roomCount),
      detail: `${dashboardData.summary.availableRooms}/${dashboardData.summary.totalRooms} oda boş`,
      tone: busyRoomCount > 0 ? "info" : "neutral",
      icon: BedDouble
    },
    {
      title: "Masa doluluğu",
      value: formatPercent(busyTableCount, tableCount),
      detail: `${dashboardData.summary.availableTables}/${tableCount} masa boş`,
      tone: busyTableCount > 0 ? "info" : "neutral",
      icon: UtensilsCrossed
    },
    {
      title: "Günlük iş tamamlama",
      value: formatPercent(completedTaskCount, taskCount),
      detail: `${pendingTaskCount} iş bekliyor`,
      tone: pendingTaskCount > 0 ? "wait" : "ok",
      icon: CheckCircle2
    }
  ];

  return {
    metrics,
    requestStatus: buildBreakdown(
      [
        ["new", formatRequestStatus("new")],
        ["answered", formatRequestStatus("answered")],
        ["converted_to_reservation", formatRequestStatus("converted_to_reservation")],
        ["rejected", formatRequestStatus("rejected")],
        ["waiting_owner", formatRequestStatus("waiting_owner")],
        ["waiting_customer", formatRequestStatus("waiting_customer")]
      ],
      (status) => dashboardData.requests.filter((request) => request.status === status).length,
      requestCount
    ),
    reservationStatus: buildBreakdown(
      [
        ["pending", formatReservationStatus("pending")],
        ["approved", formatReservationStatus("approved")],
        ["completed", formatReservationStatus("completed")],
        ["rejected", formatReservationStatus("rejected")],
        ["cancelled", formatReservationStatus("cancelled")]
      ],
      (status) => dashboardData.reservations.filter((reservation) => reservation.status === status).length,
      reservationCount
    ),
    roomStatus: buildBreakdown(
      [
        ["available", formatRoomStatus("available")],
        ["reserved", formatRoomStatus("reserved")],
        ["occupied", formatRoomStatus("occupied")],
        ["cleaning", formatRoomStatus("cleaning")],
        ["maintenance", formatRoomStatus("maintenance")]
      ],
      (status) => dashboardData.rooms.filter((room) => room.status === status).length,
      roomCount
    ),
    tableStatus: buildBreakdown(
      [
        ["available", formatTableStatus("available")],
        ["reserved", formatTableStatus("reserved")],
        ["occupied", formatTableStatus("occupied")],
        ["bill_waiting", formatTableStatus("bill_waiting")],
        ["cleaning", formatTableStatus("cleaning")]
      ],
      (status) => dashboardData.tables.filter((table) => table.status === status).length,
      tableCount
    ),
    focusItems: [
      {
        title: "Yanıt bekleyen talepler",
        value: pendingRequestCount,
        detail: pendingRequestCount > 0 ? "Müşteriye dönüş bekleyen kayıt var." : "Talep kutusu sakin.",
        tone: pendingRequestCount > 0 ? "wait" : "ok"
      },
      {
        title: "Onay bekleyen rezervasyonlar",
        value: pendingReservationCount,
        detail: pendingReservationCount > 0 ? "Onay veya ret kararı bekliyor." : "Bekleyen rezervasyon yok.",
        tone: pendingReservationCount > 0 ? "wait" : "ok"
      },
      {
        title: "Bekleyen günlük işler",
        value: pendingTaskCount,
        detail: pendingTaskCount > 0 ? "Operasyon listesinde açık iş var." : "Günlük iş listesi temiz.",
        tone: pendingTaskCount > 0 ? "wait" : "ok"
      }
    ],
    completedTaskCount,
    repeatCustomerCount
  };
}

function buildBreakdown(entries: Array<[string, string]>, countByKey: (key: string) => number, total: number): ReportBreakdownItem[] {
  return entries
    .map(([key, label]) => {
      const value = countByKey(key);
      return {
        label,
        value,
        percent: calculatePercent(value, total),
        detail: `${value} kayıt · ${formatPercent(value, total)}`
      };
    })
    .filter((item) => item.value > 0);
}

function calculatePercent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function formatPercent(value: number, total: number) {
  return `${calculatePercent(value, total)}%`;
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

function findMenuCategoryName(categoryId: string, categories: DesktopDashboardData["menu"]["categories"]) {
  return categories.find((category) => category.id === categoryId)?.name ?? "Kategori yok";
}

function compareMenuRecords(left: { sort_order: number; name: string }, right: { sort_order: number; name: string }) {
  return left.sort_order - right.sort_order || left.name.localeCompare(right.name, "tr");
}

function resolveMenuPreviewImageUrl(imageUrl: string, webModuleUrl: string) {
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) {
    return "";
  }

  try {
    return new URL(normalizedImageUrl, `${webModuleUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    return normalizedImageUrl;
  }
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function toSetupForm(setupData: DesktopSetupData): SetupFormState {
  return {
    businessName: setupData.businessName || "Deniz Çiçeği Pansiyon & Kafe",
    businessType: setupData.businessType || "pension_restaurant",
    phone: setupData.phone || "+905321234567",
    whatsapp: setupData.whatsapp || "+905321234567",
    email: setupData.email || "",
    address: setupData.address || "",
    webModuleUrl: setupData.webModuleUrl || "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
    syncSecret: setupData.syncSecret && setupData.syncSecret !== "change-this-secret" ? setupData.syncSecret : generateSyncSecret(),
    aiEnabled: setupData.aiEnabled,
    aiProvider: setupData.aiProvider || "openai_compatible",
    aiService: setupData.aiService || "openai",
    aiProjectName: setupData.aiProjectName || "",
    aiGoogleCurl: "",
    aiBaseUrl: setupData.aiBaseUrl || "https://api.openai.com/v1",
    aiModel: setupData.aiModel,
    aiApiKey: "",
    clearAiApiKey: false,
    aiTimeoutSeconds: String(setupData.aiTimeoutSeconds || 30),
    roomsEnabled: setupData.modules.rooms,
    tablesEnabled: setupData.modules.tables,
    qrMenuEnabled: setupData.modules.qrMenu,
    whatsappEnabled: setupData.modules.whatsapp,
    androidEnabled: setupData.modules.android,
    roomCount: String(Math.max(0, setupData.initialCounts.rooms || 2)),
    tableCount: String(Math.max(0, setupData.initialCounts.tables || 2))
  };
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

function generateSyncSecret() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `ya-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export default App;
