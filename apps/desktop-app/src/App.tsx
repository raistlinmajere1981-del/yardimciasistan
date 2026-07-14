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
  ExternalLink,
  Home,
  Menu as MenuIcon,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  UtensilsCrossed
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

type SyncState = "idle" | "loading" | "success" | "error";
type DesktopPage = "dashboard" | "requests" | "customers" | "reports" | "tasks" | "reservations" | "rooms" | "tables" | "menu" | "whatsapp" | "ai";
type WhatsAppConnectionState = "idle" | "loading" | "ready" | "error";

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
    rooms: true,
    tables: true,
    qrMenu: true,
    whatsapp: true,
    android: true
  },
  initialCounts: {
    rooms: 2,
    tables: 2
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
  { id: "gemini", label: "Google AI Studio (Gemini API)", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "custom", label: "Özel OpenAI uyumlu servis", baseUrl: "" }
] as const;

function App() {
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [dashboardData, setDashboardData] = useState<DesktopDashboardData>(defaultDashboardData);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("Web talepleri için henüz güncelleme yapılmadı.");
  const [menuPublishState, setMenuPublishState] = useState<SyncState>("idle");
  const [menuStatusMessage, setMenuStatusMessage] = useState("QR menü henüz bu oturumda yayınlanmadı.");
  const [menuEditState, setMenuEditState] = useState<SyncState>("idle");
  const [menuEditMessage, setMenuEditMessage] = useState("Düzenleme bekliyor.");
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
    if (activePage !== "ai" || !window.yardimciDesktop) {
      return;
    }
    void window.yardimciDesktop.getAiWorkspaceHistory(16).then(setAiWorkspaceHistory);
  }, [activePage]);

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
        title: "Yeni Talepler",
        value: String(summary.newRequests),
        detail: summary.newRequests > 0 ? "Dönüş bekleyen müşteri var" : "Henüz yeni talep yok",
        tone: summary.newRequests > 0 ? "info" : "neutral",
        icon: Bell,
        enabled: true
      },
      {
        title: "Bugünkü İşler",
        value: String(summary.pendingDailyTasks),
        detail: summary.pendingDailyTasks > 0 ? "Takip edilmesi gereken işler" : "Bugün için bekleyen iş yok",
        tone: summary.pendingDailyTasks > 0 ? "wait" : "neutral",
        icon: ClipboardList,
        enabled: true
      },
      {
        title: "Oda Durumu",
        value: `${summary.availableRooms} boş`,
        detail: `${summary.totalRooms} odadan ${summary.availableRooms} oda uygun`,
        tone: "ok",
        icon: BedDouble,
        enabled: modules.rooms
      },
      {
        title: "Masa Durumu",
        value: `${summary.availableTables} boş`,
        detail: "Bahçe ve salon masaları uygun",
        tone: "ok",
        icon: UtensilsCrossed,
        enabled: modules.tables
      },
      {
        title: "Bekleyen Rezervasyonlar",
        value: String(summary.pendingReservations),
        detail: summary.pendingReservations > 0 ? "Onay gerektiren kayıtlar" : "Bekleyen rezervasyon yok",
        tone: summary.pendingReservations > 0 ? "wait" : "neutral",
        icon: CalendarCheck,
        enabled: true
      },
      {
        title: "WhatsApp Hazır Cevaplar",
        value: String(summary.preparedWhatsAppMessages),
        detail: summary.preparedWhatsAppMessages > 0 ? "Gönderilmeyi bekleyen taslak" : "Hazır cevap beklemiyor",
        tone: summary.preparedWhatsAppMessages > 0 ? "info" : "neutral",
        icon: MessageCircle,
        enabled: modules.whatsapp
      }
    ];

    return dashboardMetrics.filter((metric) => metric.enabled);
  }, [dashboardData.summary, modules]);

  const menuPreviewUrl = useMemo(() => `${dashboardData.webModuleUrl.replace(/\/+$/, "")}/menu.html`, [dashboardData.webModuleUrl]);
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
  const aiPreviewRequest = useMemo(
    () => dashboardData.requests.find((request) => request.ai_suggested_reply.trim().length > 0) ?? dashboardData.requests[0],
    [dashboardData.requests]
  );
  const aiPreviewMessage = aiPreviewRequest?.ai_suggested_reply || aiPreviewRequest?.whatsapp_message || "";
  const pageMeta = getPageMeta(activePage);

  async function loadDashboardData() {
    if (!window.yardimciDesktop) {
      return;
    }

    const nextDashboardData = await window.yardimciDesktop.getDashboardData();
    setDashboardData(nextDashboardData);
  }

  async function handlePullRequests() {
    setSyncState("loading");
    setStatusMessage("Web talepleri kontrol ediliyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masaüstü bağlantısı hazır değil. Uygulamayı Electron içinde açın.");
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
        message: "Gönderim kaydı için uygulamayı Electron içinde açın."
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
    setMenuStatusMessage("QR menü web modülüne gönderiliyor...");

    if (!window.yardimciDesktop) {
      setMenuPublishState("error");
      setMenuStatusMessage("Masaüstü bağlantısı hazır değil. Uygulamayı Electron içinde açın.");
      return;
    }

    const result = await window.yardimciDesktop.pushMenu();
    if (!result.ok) {
      setMenuPublishState("error");
      setMenuStatusMessage(result.message);
      return;
    }

    await loadDashboardData();
    setMenuPublishState("success");
    setMenuStatusMessage(`${result.category_count} kategori ve ${result.item_count} ürün yayınlandı.`);
  }

  async function handlePublishAndroidSnapshot() {
    setAndroidPublishState("loading");
    setAndroidPublishMessage("Android özeti web modülüne gönderiliyor...");

    if (!window.yardimciDesktop) {
      setAndroidPublishState("error");
      setAndroidPublishMessage("Android özeti için uygulamayı Electron içinde açın.");
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

  function openMenuPreview() {
    void window.yardimciDesktop?.openExternal(menuPreviewUrl);
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
      setMenuEditMessage("Masaüstü bağlantısı hazır değil. Uygulamayı Electron içinde açın.");
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
    setMenuStatusMessage("QR menüde yayınlanmamış değişiklik var.");
  }

  async function handleSaveItem() {
    setMenuEditState("loading");
    setMenuEditMessage("Ürün kaydediliyor...");

    if (!window.yardimciDesktop) {
      setMenuEditState("error");
      setMenuEditMessage("Masaüstü bağlantısı hazır değil. Uygulamayı Electron içinde açın.");
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
    setMenuStatusMessage("QR menüde yayınlanmamış değişiklik var.");
  }

  function openWhatsApp(request: SyncedCustomerRequest) {
    setSelectedWhatsAppRequestId(request.id);
    setActivePage("whatsapp");
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
      setManualRequestMessage("Manuel talep için uygulamayı Electron içinde açın.");
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
      setStatusMessage("Rezervasyon işlemi için uygulamayı Electron içinde açın.");
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
      setAiMessage("AI taslağı için uygulamayı Electron içinde açın.");
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
      setAiWorkspaceMessage("AI çalışma alanı için uygulamayı Electron içinde açın.");
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
      setActivePage("whatsapp");
    }
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
    setBackupMessage("Yerel veritabanı yedeği oluşturuluyor...");

    if (!window.yardimciDesktop) {
      setBackupState("error");
      setBackupMessage("Yedekleme için uygulamayı Electron içinde açın.");
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
      setStatusMessage("Talep durumu için uygulamayı Electron içinde açın.");
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

  async function handleUpdateRoomStatus(roomId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Oda durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Oda durumu için uygulamayı Electron içinde açın.");
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
      setStatusMessage("Masa durumu için uygulamayı Electron içinde açın.");
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
      setStatusMessage("Rezervasyon durumu için uygulamayı Electron içinde açın.");
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
      setStatusMessage("Günlük iş durumu için uygulamayı Electron içinde açın.");
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

    const message = buildReservationWhatsAppMessage(reservation);
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
      setAiConnectionTestMessage("Bağlantı denemesi için uygulamayı Electron içinde açın.");
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
      setSetupMessage("Kurulum ayarları sadece Electron uygulaması içinde kaydedilebilir.");
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
    setSetupSaveState(result.aiWebSync?.ok === false ? "error" : "success");
    setSetupMessage(result.message);
    if (result.aiWebSync?.ok !== false) {
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
      />
    );
  }

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-symbol" src="./assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
          <div>
            <strong>Yardımcı Asistan</strong>
            <small>İşletme Paneli</small>
          </div>
        </div>

        <nav aria-label="Masaüstü menü">
          <button className={activePage === "dashboard" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("dashboard")}>
            <Home size={18} aria-hidden="true" />
            Ana Ekran
          </button>
          <button className={activePage === "requests" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("requests")}>
            <Bell size={18} aria-hidden="true" />
            Talepler
          </button>
          <button className={activePage === "customers" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("customers")}>
            <Users size={18} aria-hidden="true" />
            Müşteriler
          </button>
          <button className={activePage === "reports" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("reports")}>
            <BarChart3 size={18} aria-hidden="true" />
            Raporlar
          </button>
          <button className={activePage === "tasks" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("tasks")}>
            <ClipboardList size={18} aria-hidden="true" />
            Günlük İşler
          </button>
          <button className={activePage === "reservations" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("reservations")}>
            <CalendarCheck size={18} aria-hidden="true" />
            Rezervasyonlar
          </button>
          {modules.rooms && (
            <button className={activePage === "rooms" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("rooms")}>
              <BedDouble size={18} aria-hidden="true" />
              Odalar
            </button>
          )}
          {modules.tables && (
            <button className={activePage === "tables" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("tables")}>
              <UtensilsCrossed size={18} aria-hidden="true" />
              Masalar
            </button>
          )}
          {modules.qrMenu && (
            <button className={activePage === "menu" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("menu")}>
              <MenuIcon size={18} aria-hidden="true" />
              QR Menü
            </button>
          )}
          {modules.whatsapp && (
            <button className={activePage === "whatsapp" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("whatsapp")}>
              <MessageCircle size={18} aria-hidden="true" />
              WhatsApp
            </button>
          )}
          {modules.ai && (
            <button className={activePage === "ai" ? "nav-item is-active" : "nav-item"} type="button" onClick={() => setActivePage("ai")}>
              <Sparkles size={18} aria-hidden="true" />
              AI Yardımcı
            </button>
          )}
          <button className="nav-item" type="button" onClick={() => setSetupMode(true)}>
            <Settings size={18} aria-hidden="true" />
            Ayarlar
          </button>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p>{pageMeta.eyebrow}</p>
            <h1>{pageMeta.title}</h1>
          </div>
          {activePage === "menu" ? (
            <div className={`sync-pill sync-${menuPublishState}`}>
              <span>{menuStatusMessage}</span>
              <button type="button" onClick={handlePublishMenu} disabled={menuPublishState === "loading"}>
                <UploadCloud size={16} aria-hidden="true" />
                Web'e Yayınla
              </button>
            </div>
          ) : activePage === "whatsapp" ? (
            <div className="sync-pill sync-idle">
              <span>{selectedWhatsAppRequest ? `${selectedWhatsAppRequest.customer_name} için hazır cevap` : "WhatsApp için talep seçin"}</span>
              <button type="button" onClick={openSelectedWhatsAppExternal} disabled={!selectedWhatsAppUrl}>
                <ExternalLink size={16} aria-hidden="true" />
                Dışarıda Aç
              </button>
            </div>
          ) : activePage === "ai" ? (
            <div className="sync-pill sync-idle">
              <span>{setupData.aiEnabled ? `${aiServicePresets.find((service) => service.id === setupData.aiService)?.label ?? "Özel servis"} • ${setupData.aiModel || "Model seçilmedi"}` : "AI yardımcısı kapalı"}</span>
              <button type="button" onClick={() => setSetupMode(true)}>
                <Settings size={16} aria-hidden="true" />
                AI Ayarlarını Aç
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
        </header>

        {activePage === "dashboard" ? (
          <>
        <section className="metric-grid" aria-label="Günlük durum">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article className={`metric-card tone-${metric.tone}`} key={metric.title}>
                <div className="metric-icon">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <div>
                  <span>{metric.title}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="dashboard-grid">
          <article className="panel requests-panel">
            <div className="panel-heading">
              <div>
                <p>Yeni Gelenler</p>
                <h2>Talepler</h2>
              </div>
              <span className="status-badge info">{dashboardData.requests.length} kayıt</span>
            </div>

            <div className="request-list">
              {dashboardData.requests.length === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 size={28} aria-hidden="true" />
                  <strong>Henüz yeni talep yok.</strong>
                  <p>Web sitesinden gelen talepler burada görünecek.</p>
                </div>
              ) : (
                dashboardData.requests.map((request) => (
                  <article className="request-card" key={request.id}>
                    <div>
                      <span className={`status-badge ${request.status === "converted_to_reservation" ? "ok" : "wait"}`}>
                        {formatRequestStatus(request.status)}
                      </span>
                      <h3>{request.customer_name}</h3>
                      <p>{formatRequestType(request.request_type)} • {request.date_text || request.start_date} • {request.guest_count} kişi</p>
                      <p>{request.message}</p>
                    </div>
                    <div className="request-actions">
                      <button type="button" onClick={() => callCustomer(request)}>
                        <Phone size={16} aria-hidden="true" />
                        Müşteriyi Ara
                      </button>
                      {request.status !== "converted_to_reservation" && (
                        <button
                          className="convert-action"
                          type="button"
                          onClick={() => handleConvertRequestToReservation(request)}
                          disabled={convertingRequestId === request.id}
                        >
                          <CalendarCheck size={16} aria-hidden="true" />
                          {convertingRequestId === request.id ? "Onaylanıyor" : "Rezervasyona Çevir"}
                        </button>
                      )}
                      {setupData.aiEnabled && (
                        <button
                          className="ai-action"
                          type="button"
                          onClick={() => handleCreateOwnerReplySuggestion(request)}
                          disabled={suggestingRequestId === request.id}
                        >
                          <Sparkles size={16} aria-hidden="true" />
                          {suggestingRequestId === request.id ? "Hazırlanıyor" : "AI Taslak Yenile"}
                        </button>
                      )}
                      <button className="whatsapp-action" type="button" onClick={() => openWhatsApp(request)}>
                        <MessageCircle size={16} aria-hidden="true" />
                        WhatsApp'tan Yaz
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </article>

          <aside className="side-column">
            <article className="panel">
              <div className="panel-heading compact">
                <div>
                  <p>Yerel Çalışma</p>
                  <h2>Bağlantı</h2>
                </div>
              </div>
              <dl className="info-list">
                <div>
                  <dt>Web modül adresi</dt>
                  <dd>{dashboardData.webModuleUrl}</dd>
                </div>
                <div>
                  <dt>Yerel kayıt dosyası</dt>
                  <dd>{dashboardData.databasePath}</dd>
                </div>
                <div>
                  <dt>Yedek klasörü</dt>
                  <dd>{dashboardData.backupPath}</dd>
                </div>
                <div>
                  <dt>Çalışma şekli</dt>
                  <dd>PC dışarıya açılmaz, talepleri hostingden çeker.</dd>
                </div>
              </dl>
              <div className="local-command-stack">
                <button className="primary-command full-width-command" type="button" onClick={handleCreateManualBackup} disabled={backupState === "loading"}>
                  <Save size={16} aria-hidden="true" />
                  {backupState === "loading" ? "Yedekleniyor" : "Yedek Al"}
                </button>
                <button className="primary-command full-width-command android-publish-command" type="button" onClick={handlePublishAndroidSnapshot} disabled={androidPublishState === "loading"}>
                  <UploadCloud size={16} aria-hidden="true" />
                  {androidPublishState === "loading" ? "Yayınlanıyor" : "Android'e Yayınla"}
                </button>
              </div>
              <p className={`menu-status ${backupState === "error" ? "sync-error" : backupState === "success" ? "sync-success" : ""}`}>{backupMessage}</p>
              <p className={`menu-status ${androidPublishState === "error" ? "sync-error" : androidPublishState === "success" ? "sync-success" : ""}`}>{androidPublishMessage}</p>
            </article>

            <article className="panel">
              <div className="panel-heading compact">
                <div>
                  <p>AI Yardımcı</p>
                  <h2>Cevap Taslağı</h2>
                </div>
                <span className={`status-badge ${aiState === "success" ? "ok" : aiState === "error" ? "wait" : "info"}`}>
                  {aiState === "loading" ? "Hazırlanıyor" : "Taslak"}
                </span>
              </div>
              {aiPreviewRequest ? (
                <>
                  <dl className="info-list compact-info ai-preview-meta">
                    <div>
                      <dt>Müşteri</dt>
                      <dd>{aiPreviewRequest.customer_name}</dd>
                    </div>
                    <div>
                      <dt>Özet</dt>
                      <dd>{aiPreviewRequest.ai_summary || `${formatRequestType(aiPreviewRequest.request_type)} • ${aiPreviewRequest.date_text || aiPreviewRequest.start_date}`}</dd>
                    </div>
                  </dl>
                  <p className="suggestion">{aiPreviewMessage}</p>
                  <p className={`menu-status ${aiState === "error" ? "sync-error" : aiState === "success" ? "sync-success" : ""}`}>{aiMessage}</p>
                </>
              ) : (
                <div className="empty-state compact-empty">
                  <Sparkles size={24} aria-hidden="true" />
                  <strong>Talep yok.</strong>
                  <p>Web talepleri çekildiğinde cevap taslağı burada görünür.</p>
                </div>
              )}
            </article>

            <article className="panel menu-panel">
              <div className="panel-heading compact">
                <div>
                  <p>QR Menü</p>
                  <h2>Web Yayını</h2>
                </div>
                <span className="status-badge info">{dashboardData.menu.items.length} ürün</span>
              </div>

              <div className="menu-summary">
                <div>
                  <strong>{dashboardData.summary.activeMenuCategories}</strong>
                  <span>aktif kategori</span>
                </div>
                <div>
                  <strong>{dashboardData.summary.availableMenuItems}</strong>
                  <span>yayında ürün</span>
                </div>
              </div>

              <div className="mini-menu-list">
                {dashboardData.menu.items.slice(0, 4).map((item) => (
                  <div className="mini-menu-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{findMenuCategoryName(item.category_id, dashboardData.menu.categories)}</span>
                    </div>
                    <span>{formatCurrency(item.price, item.currency)}</span>
                  </div>
                ))}
              </div>

              <p className={`menu-status sync-${menuPublishState}`}>{menuStatusMessage}</p>
              <div className="menu-actions">
                <button type="button" onClick={handlePublishMenu} disabled={menuPublishState === "loading"}>
                  <UploadCloud size={16} aria-hidden="true" />
                  Web'e Yayınla
                </button>
                <button type="button" onClick={openMenuPreview}>
                  <ExternalLink size={16} aria-hidden="true" />
                  Önizle
                </button>
              </div>
            </article>
          </aside>
        </section>
          </>
        ) : activePage === "requests" ? (
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
          />
        ) : activePage === "customers" ? (
          <CustomersWorkspace
            customers={dashboardData.customers}
            requests={dashboardData.requests}
            reservations={dashboardData.reservations}
            onCall={callCustomerRecord}
            onWhatsApp={openCustomerWhatsApp}
          />
        ) : activePage === "reports" ? (
          <ReportsWorkspace dashboardData={dashboardData} />
        ) : activePage === "tasks" ? (
          <DailyTasksWorkspace tasks={dashboardData.dailyTasks} onUpdateStatus={handleUpdateDailyTaskStatus} />
        ) : activePage === "reservations" ? (
          <ReservationsWorkspace
            reservations={dashboardData.reservations}
            onUpdateStatus={handleUpdateReservationStatus}
            onOpenWhatsApp={openReservationWhatsApp}
          />
        ) : activePage === "rooms" ? (
          <RoomsWorkspace rooms={dashboardData.rooms} onUpdateStatus={handleUpdateRoomStatus} />
        ) : activePage === "tables" ? (
          <TablesWorkspace tables={dashboardData.tables} onUpdateStatus={handleUpdateTableStatus} />
        ) : activePage === "ai" ? (
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
        ) : activePage === "menu" ? (
          <MenuManager
            dashboardData={dashboardData}
            categoryForm={categoryForm}
            itemForm={itemForm}
            selectedCategoryId={selectedCategoryId}
            selectedItemId={selectedItemId}
            menuEditState={menuEditState}
            menuEditMessage={menuEditMessage}
            menuPreviewUrl={menuPreviewUrl}
            onCategoryFormChange={setCategoryForm}
            onItemFormChange={setItemForm}
            onSelectCategory={selectCategory}
            onSelectItem={selectItem}
            onNewCategory={startNewCategory}
            onNewItem={startNewItem}
            onSaveCategory={handleSaveCategory}
            onSaveItem={handleSaveItem}
            onPublishMenu={handlePublishMenu}
            onOpenPreview={openMenuPreview}
            isPublishing={menuPublishState === "loading"}
          />
        ) : (
          <WhatsAppWorkspace
            requests={dashboardData.requests}
            selectedRequest={selectedWhatsAppRequest}
            selectedMessage={selectedWhatsAppMessage}
            selectedUrl={selectedWhatsAppUrl}
            onSelectRequest={setSelectedWhatsAppRequestId}
            onOpenExternal={openSelectedWhatsAppExternal}
            onMessageSent={handleWhatsAppMessageSent}
          />
        )}
      </main>
    </div>
  );
}

interface SetupWizardProps {
  form: SetupFormState;
  setupData: DesktopSetupData;
  saveState: SyncState;
  message: string;
  aiConnectionTestState: SyncState;
  aiConnectionTestMessage: string;
  aiModelOptions: Array<{ id: string; label: string }>;
  onFormChange: (form: SetupFormState) => void;
  onTestAiConnection: () => void;
  onSave: () => void;
  onSkip: () => void;
}

function SetupWizard({
  form,
  setupData,
  saveState,
  message,
  aiConnectionTestState,
  aiConnectionTestMessage,
  aiModelOptions,
  onFormChange,
  onTestAiConnection,
  onSave,
  onSkip
}: SetupWizardProps) {
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showGoogleCurl, setShowGoogleCurl] = useState(false);
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

  return (
    <main className="setup-shell">
      <section className="setup-hero" aria-label="İlk kurulum">
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
            <dd>{setupData.setupRequired ? "İlk kayıt sonrası oluşur" : "Yerel SQLite içinde kayıtlı"}</dd>
          </div>
          <div>
            <dt>Yedekleme</dt>
            <dd>Uygulama veri klasöründe backups klasörü ayrıldı</dd>
          </div>
        </dl>
      </section>

      <section className="setup-form-surface">
        <div className="setup-section">
          <div className="setup-section-title">
            <p>Firma Bilgileri</p>
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

        <div className="setup-section">
          <div className="setup-section-title">
            <p>Modüller</p>
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

        <div className="setup-section">
          <div className="setup-section-title">
            <p>Web Bağlantısı</p>
            <h2>Hosting Modülü</h2>
          </div>
          <div className="setup-grid two">
            <label className="setup-field">
              Web modül adresi
              <input value={form.webModuleUrl} onChange={(event) => update("webModuleUrl", event.target.value)} placeholder="https://yardimciasistan.alwaysdata.net/yardimci-asistan" />
              <small>Demo sitenin kurulu web modülü kullanılır; sonuna api/sync.php eklemeyin.</small>
            </label>
            <label>
              Web güvenlik anahtarı
              <input value={form.syncSecret} onChange={(event) => update("syncSecret", event.target.value)} placeholder="uzun-gizli-anahtar" />
            </label>
          </div>
        </div>

        <div className="setup-section setup-ai-section">
          <div className="setup-section-title">
            <p>AI Bağlantısı</p>
            <h2>Masaüstü ve Web İçin Tek Ayar</h2>
          </div>
          <p className="setup-section-description">Seçtiğiniz bağlantı masaüstündeki cevap taslaklarında kullanılır ve kaydettiğinizde web modülüne güvenli biçimde uygulanır.</p>
          <div className="setup-grid two">
            <label className="setup-checkline">
              <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
              AI yardımcı açık
            </label>
            <label>
              Kullanılacak servis
              <select value={form.aiService} onChange={(event) => updateAiService(event.target.value)} disabled={!form.aiEnabled}>
                {aiServicePresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
            {form.aiService === "gemini" ? (
              <>
                <div className="setup-field setup-grid-wide setup-ai-studio-help">
                  <span>Google AI Studio hızlı kurulum</span>
                  <button className="setup-secondary" type="button" onClick={() => void window.yardimciDesktop?.openExternal("https://aistudio.google.com/apikey")} disabled={!form.aiEnabled}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Google AI Studio'yu Aç
                  </button>
                  <small>API anahtarı ayrıntısında “Copy cURL quickstart” seçeneğini kullanın.</small>
                </div>
                <div className="setup-field setup-grid-wide">
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
                  <small>Komut yalnız bağlantı kontrolünde okunur; API adresi, anahtar ve örnek model otomatik ayrıştırılır.</small>
                </div>
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
                <small>{aiModelOptions.length > 0 ? `${aiModelOptions.length} model API üzerinden alındı.` : "Bağlantıyı Dene ile kullanılabilir modeller otomatik alınır."}</small>
              )}
            </label>
            <label>
              Yanıt bekleme süresi (saniye)
              <input value={form.aiTimeoutSeconds} onChange={(event) => update("aiTimeoutSeconds", event.target.value)} inputMode="numeric" min="5" max="120" disabled={!form.aiEnabled} />
            </label>
            {form.aiService !== "gemini" && <div className="setup-field setup-grid-wide">
              <span>Gizli erişim anahtarı</span>
              <div className="setup-secret-input">
                <input
                  aria-label="Gizli erişim anahtarı"
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
          <div className={`setup-ai-actions sync-${aiConnectionTestState}`}>
            <button className="setup-secondary" type="button" onClick={onTestAiConnection} disabled={!form.aiEnabled || aiConnectionTestState === "loading" || (form.aiService === "gemini" && !form.aiGoogleCurl.trim() && !form.aiApiKey.trim() && !setupData.aiApiKeyConfigured)}>
              <RefreshCw size={16} aria-hidden="true" />
              {aiConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Bağlantıyı Dene"}
            </button>
            <span>{aiConnectionTestMessage}</span>
            <small>{setupData.aiLastPublishedAt ? `Web ayarı son yayın: ${formatDateTime(setupData.aiLastPublishedAt)}` : "Web ayarı henüz bu cihazdan yayınlanmadı."}</small>
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-section-title">
            <p>İlk Kayıtlar</p>
            <h2>Oda ve Masa Sayısı</h2>
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
        </div>

        <footer className={`setup-footer sync-${saveState}`}>
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
        </footer>
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
  const serviceLabel = aiServicePresets.find((service) => service.id === setupData.aiService)?.label ?? "Özel servis";
  const generateDisabled = state === "loading" || (needsRequest && !selectedRequest);

  return (
    <section className="ai-workspace" aria-label="AI Yardımcı çalışma alanı">
      <div className="ai-status-grid">
        <article className="ai-status-card">
          <span>Bağlantı</span>
          <strong className={setupData.aiEnabled ? "is-online" : "is-offline"}>{setupData.aiEnabled ? "AI açık" : "AI kapalı"}</strong>
          <small>{serviceLabel}</small>
        </article>
        <article className="ai-status-card">
          <span>Kullanılan model</span>
          <strong>{setupData.aiModel || "Model seçilmedi"}</strong>
          <small>{setupData.aiBaseUrl || "Bağlantı adresi yok"}</small>
        </article>
        <article className="ai-status-card">
          <span>Web yayını</span>
          <strong>{setupData.aiLastPublishedAt ? "Güncel" : "Bekliyor"}</strong>
          <small>{setupData.aiLastPublishedAt ? formatDateTime(setupData.aiLastPublishedAt) : "Henüz yayınlanmadı"}</small>
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
                <span>{entry.model || entry.provider}</span>
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
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  selectedMessage: string;
  selectedUrl: string;
  onSelectRequest: (requestId: string) => void;
  onOpenExternal: () => void;
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

function WhatsAppWorkspace({ requests, selectedRequest, selectedMessage, selectedUrl, onSelectRequest, onOpenExternal, onMessageSent }: WhatsAppWorkspaceProps) {
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const [connectionState, setConnectionState] = useState<WhatsAppConnectionState>("idle");
  const [connectionMessage, setConnectionMessage] = useState("WhatsApp Web yükleniyor.");
  const [copyMessage, setCopyMessage] = useState("Hazır mesaj bekliyor.");
  const [sendState, setSendState] = useState<SyncState>("idle");
  const [sendMessage, setSendMessage] = useState("Müşteri sohbetini açın, metni kontrol edin ve gönderimi onaylayın.");
  const [webViewUrl, setWebViewUrl] = useState(WHATSAPP_WEB_HOME_URL);
  const webViewAction = useMemo(
    () => (selectedRequest ? prepareWhatsAppAction({ phone: selectedRequest.customer_phone, message: selectedMessage, preferredMode: "webview" }) : null),
    [selectedMessage, selectedRequest]
  );
  const webViewPayload = webViewAction?.ok && webViewAction.mode === "webview" ? webViewAction : null;
  const phoneDisplay = webViewPayload?.phoneDisplay ?? selectedRequest?.customer_phone ?? "-";

  useEffect(() => {
    if (!selectedRequest) {
      setConnectionState("idle");
      setConnectionMessage("Talep seçin.");
      setCopyMessage("Hazır mesaj bekliyor.");
      setSendState("idle");
      setSendMessage("Gönderim için talep seçin.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    if (!webViewPayload) {
      setConnectionState("error");
      setConnectionMessage(webViewAction?.message ?? "WhatsApp hedefi hazırlanamadı.");
      setCopyMessage("Mesaj elle kopyalanabilir.");
      setSendState("error");
      setSendMessage("Geçerli telefon ve hazır mesaj olmadan gönderim yapılamaz.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    setConnectionState("loading");
    setConnectionMessage("QR girişi bekliyor.");
    setCopyMessage("Hazır mesaj bekliyor.");
    setSendState("idle");
    setSendMessage("Müşteri sohbetini açın, metni kontrol edin ve gönderimi onaylayın.");
    setWebViewUrl(webViewPayload.homeUrl);
  }, [selectedRequest, webViewAction, webViewPayload]);

  useEffect(() => {
    const webView = webViewRef.current;
    if (!webView || !webViewUrl) {
      return;
    }

    const handleStart = () => {
      setConnectionState("loading");
      setConnectionMessage("WhatsApp Web yükleniyor.");
    };
    const handleStop = () => {
      setConnectionState("ready");
      setConnectionMessage("WhatsApp Web hazır.");
    };
    const handleFail = () => {
      setConnectionState("error");
      setConnectionMessage("WebView bağlantısı kurulamadı.");
    };

    webView.addEventListener("did-start-loading", handleStart);
    webView.addEventListener("did-stop-loading", handleStop);
    webView.addEventListener("did-fail-load", handleFail);

    return () => {
      webView.removeEventListener("did-start-loading", handleStart);
      webView.removeEventListener("did-stop-loading", handleStop);
      webView.removeEventListener("did-fail-load", handleFail);
    };
  }, [webViewUrl]);

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
      setConnectionState("error");
      setConnectionMessage("Geçerli müşteri telefonu gerekiyor.");
      return;
    }

    setConnectionState("loading");
    setConnectionMessage("Müşteri numarası açılıyor.");
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
      setSendMessage("WhatsApp Web DOM denetimi tamamlanamadı. Sohbeti yeniden açıp tekrar deneyin.");
    }
  }

  return (
    <section className="whatsapp-workspace" aria-label="WhatsApp çalışma alanı">
      <aside className="panel whatsapp-request-panel">
        <div className="panel-heading compact">
          <div>
            <p>Talepler</p>
            <h2>{requests.length} kayıt</h2>
          </div>
        </div>

        <div className="manager-list whatsapp-request-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Hazır talep yok.</strong>
              <p>Web talepleri çekildiğinde burada görünür.</p>
            </div>
          ) : (
            requests.map((request) => (
              <button
                className={selectedRequest?.id === request.id ? "manager-row is-active" : "manager-row"}
                key={request.id}
                type="button"
                onClick={() => onSelectRequest(request.id)}
              >
                <span>
                  <strong>{request.customer_name}</strong>
                  <small>{request.customer_phone} · {formatRequestType(request.request_type)}</small>
                </span>
                <span className="dot is-on" />
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="panel whatsapp-live-panel">
        <div className="panel-heading compact">
          <div>
            <p>WhatsApp Web</p>
            <h2>{selectedRequest?.customer_name ?? "Talep Seçin"}</h2>
          </div>
          <span className={`status-badge whatsapp-state-${connectionState}`}>{connectionMessage}</span>
        </div>

        <div className="whatsapp-command-row">
          <button type="button" onClick={goToCustomerNumber} disabled={!webViewPayload}>
            <MessageCircle size={16} aria-hidden="true" />
            Müşteri Numarasına Git
          </button>
          <button type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
            <ExternalLink size={16} aria-hidden="true" />
            Dışarıda Aç
          </button>
          <button className="whatsapp-approved-send" type="button" onClick={approveAndSendMessage} disabled={!webViewPayload || sendState === "loading"}>
            <Send size={16} aria-hidden="true" />
            {sendState === "loading" ? "Doğrulanıyor" : "Onayla ve Gönder"}
          </button>
        </div>

        <p className={`whatsapp-send-status sync-${sendState}`} role="status">{sendMessage}</p>

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
              <strong>WhatsApp hedefi hazır değil.</strong>
              <p>{connectionMessage}</p>
            </div>
          )}
        </div>
      </section>

      <aside className="panel whatsapp-copy-panel">
        <div className="panel-heading compact">
          <div>
            <p>Manuel Kopyalama</p>
            <h2>Hazır Mesaj</h2>
          </div>
        </div>

        <dl className="info-list compact-info">
          <div>
            <dt>Müşteri</dt>
            <dd>{selectedRequest?.customer_name ?? "-"}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>{phoneDisplay}</dd>
          </div>
        </dl>

        <textarea className="prepared-whatsapp-message" readOnly value={selectedMessage} aria-label="Hazır WhatsApp mesajı" />
        <p className={`menu-status whatsapp-copy-status ${copyMessage.includes("kopyalandı") ? "sync-success" : ""}`}>{copyMessage}</p>

        <div className="menu-actions single-column-actions">
          <button type="button" onClick={copyPreparedMessage} disabled={!selectedMessage}>
            <Copy size={16} aria-hidden="true" />
            Hazır Mesajı Kopyala
          </button>
          <button type="button" onClick={onOpenExternal} disabled={!selectedUrl}>
            <ExternalLink size={16} aria-hidden="true" />
            WhatsApp Linkini Aç
          </button>
        </div>
      </aside>
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
  onSelectRequest: (requestId: string) => void;
  onManualRequestFormChange: (form: ManualRequestFormState) => void;
  onCreateManualRequest: () => void;
  onCall: (request: SyncedCustomerRequest) => void;
  onWhatsApp: (request: SyncedCustomerRequest) => void;
  onConvert: (request: SyncedCustomerRequest) => void;
  onSuggest: (request: SyncedCustomerRequest) => void;
  onUpdateStatus: (request: SyncedCustomerRequest, status: string) => void;
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
  onSelectRequest,
  onManualRequestFormChange,
  onCreateManualRequest,
  onCall,
  onWhatsApp,
  onConvert,
  onSuggest,
  onUpdateStatus
}: RequestsWorkspaceProps) {
  const updateManualRequestForm = <Key extends keyof ManualRequestFormState,>(key: Key, value: ManualRequestFormState[Key]) => {
    onManualRequestFormChange({ ...manualRequestForm, [key]: value });
  };

  return (
    <section className="operations-workspace requests-workspace" aria-label="Talep yönetimi">
      <aside className="panel operations-list-panel">
        <div className="panel-heading compact">
          <div>
            <p>Talepler</p>
            <h2>{requests.length} kayıt</h2>
          </div>
        </div>
        <div className="manager-list operations-list">
          {requests.length === 0 ? (
            <div className="empty-state compact-empty">
              <Bell size={24} aria-hidden="true" />
              <strong>Talep yok.</strong>
              <p>Web, AI ve manuel kayıtlar burada listelenir.</p>
            </div>
          ) : (
            requests.map((request) => (
              <button
                className={selectedRequest?.id === request.id ? "manager-row is-active" : "manager-row"}
                key={request.id}
                type="button"
                onClick={() => onSelectRequest(request.id)}
              >
                <span>
                  <strong>{request.customer_name}</strong>
                  <small>{formatRequestType(request.request_type)} · {formatRequestStatus(request.status)}</small>
                </span>
                <span className={request.status === "new" ? "dot is-on" : "dot"} />
              </button>
            ))
          )}
        </div>

        <form
          className="manager-form manual-request-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateManualRequest();
          }}
        >
          <div className="manual-request-heading">
            <p>Manuel Kayıt</p>
            <h3>Yeni talep</h3>
          </div>
          <div className="form-row">
            <label>
              Talep türü
              <select value={manualRequestForm.requestType} onChange={(event) => updateManualRequestForm("requestType", event.target.value)}>
                {manualRequestTypeOptions.map((requestType) => (
                  <option key={requestType} value={requestType}>
                    {formatRequestType(requestType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Öncelik
              <select value={manualRequestForm.priority} onChange={(event) => updateManualRequestForm("priority", event.target.value)}>
                {manualPriorityOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
          <div className="form-row">
            <label>
              Giriş tarihi
              <input type="date" value={manualRequestForm.startDate} onChange={(event) => updateManualRequestForm("startDate", event.target.value)} />
            </label>
            <label>
              Çıkış tarihi
              <input type="date" value={manualRequestForm.endDate} onChange={(event) => updateManualRequestForm("endDate", event.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Saat
              <input type="time" value={manualRequestForm.time} onChange={(event) => updateManualRequestForm("time", event.target.value)} />
            </label>
            <label>
              Kişi
              <input min="1" type="number" value={manualRequestForm.guestCount} onChange={(event) => updateManualRequestForm("guestCount", event.target.value)} />
            </label>
          </div>
          <label>
            Not
            <textarea value={manualRequestForm.message} onChange={(event) => updateManualRequestForm("message", event.target.value)} placeholder="Talep detayı" />
          </label>
          <p className={`menu-status sync-${manualRequestState}`}>{manualRequestMessage}</p>
          <button className="primary-command" type="submit" disabled={manualRequestState === "loading"}>
            <Save size={16} aria-hidden="true" />
            {manualRequestState === "loading" ? "Kaydediliyor" : "Manuel Talep Kaydet"}
          </button>
        </form>
      </aside>

      <section className="panel operations-detail-panel">
        {selectedRequest ? (
          <>
            <div className="panel-heading compact">
              <div>
                <p>{formatRequestType(selectedRequest.request_type)}</p>
                <h2>{selectedRequest.customer_name}</h2>
              </div>
              <span className={`status-badge ${selectedRequest.status === "converted_to_reservation" ? "ok" : selectedRequest.status === "rejected" ? "wait" : "info"}`}>
                {formatRequestStatus(selectedRequest.status)}
              </span>
            </div>
            <dl className="info-list detail-info-grid">
              <div>
                <dt>Telefon</dt>
                <dd>{selectedRequest.customer_phone}</dd>
              </div>
              <div>
                <dt>Tarih</dt>
                <dd>{selectedRequest.date_text || selectedRequest.start_date || "-"}</dd>
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
            <p className="suggestion">{selectedRequest.message}</p>
            {selectedRequest.ai_summary && (
              <p className="suggestion soft-suggestion">{selectedRequest.ai_summary}</p>
            )}
            <div className="operations-command-grid">
              <button type="button" onClick={() => onCall(selectedRequest)}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </button>
              <button type="button" onClick={() => onWhatsApp(selectedRequest)}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </button>
              {aiEnabled && (
                <button type="button" onClick={() => onSuggest(selectedRequest)} disabled={suggestingRequestId === selectedRequest.id}>
                  <Sparkles size={16} aria-hidden="true" />
                  {suggestingRequestId === selectedRequest.id ? "Hazırlanıyor" : "AI Taslak Yenile"}
                </button>
              )}
              {selectedRequest.status !== "converted_to_reservation" && (
                <button type="button" onClick={() => onConvert(selectedRequest)} disabled={convertingRequestId === selectedRequest.id}>
                  <CalendarCheck size={16} aria-hidden="true" />
                  {convertingRequestId === selectedRequest.id ? "Onaylanıyor" : "Rezervasyona Çevir"}
                </button>
              )}
              <button className="secondary-command" type="button" onClick={() => onUpdateStatus(selectedRequest, "answered")}>
                <CheckCircle2 size={16} aria-hidden="true" />
                Cevaplandı İşaretle
              </button>
              <button className="secondary-command" type="button" onClick={() => onUpdateStatus(selectedRequest, "rejected")}>
                <ClipboardList size={16} aria-hidden="true" />
                Reddet
              </button>
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
  onCall: (customer: DesktopDashboardData["customers"][number]) => void;
  onWhatsApp: (customer: DesktopDashboardData["customers"][number]) => void;
}

function CustomersWorkspace({ customers, requests, reservations, onCall, onWhatsApp }: CustomersWorkspaceProps) {
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
          Ara
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Ad, telefon veya etiket" />
        </label>
        <div className="manager-list operations-list">
          {filteredCustomers.length === 0 ? (
            <div className="empty-state compact-empty">
              <Users size={24} aria-hidden="true" />
              <strong>Müşteri bulunamadı.</strong>
              <p>Arama metnini değiştirin.</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <button
                className={selectedCustomer?.id === customer.id ? "manager-row is-active" : "manager-row"}
                key={customer.id}
                type="button"
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <span>
                  <strong>{customer.fullName}</strong>
                  <small>{customer.phone || "-"} · {formatCustomerSource(customer.source)}</small>
                </span>
                <span className={customer.requestCount > 0 ? "dot is-on" : "dot"} />
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="panel operations-detail-panel">
        {selectedCustomer ? (
          <>
            <div className="panel-heading compact">
              <div>
                <p>{formatCustomerSource(selectedCustomer.source)}</p>
                <h2>{selectedCustomer.fullName}</h2>
              </div>
              <span className="status-badge info">{selectedCustomer.requestCount} talep</span>
            </div>
            <dl className="info-list detail-info-grid">
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
            <p className="resource-note">{selectedCustomer.notes || "Müşteri notu yok."}</p>
            {selectedCustomer.tags.length > 0 && (
              <div className="tag-row">
                {selectedCustomer.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="operations-command-grid">
              <button type="button" onClick={() => onCall(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <Phone size={16} aria-hidden="true" />
                Müşteriyi Ara
              </button>
              <button type="button" onClick={() => onWhatsApp(selectedCustomer)} disabled={!selectedCustomer.phone}>
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp'tan Yaz
              </button>
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
        <div className="menu-summary compact-summary">
          <div>
            <strong>{tasks.filter((task) => task.status === "pending").length}</strong>
            <span>bekleyen iş</span>
          </div>
          <div>
            <strong>{tasks.filter((task) => task.status === "done").length}</strong>
            <span>tamamlanan</span>
          </div>
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
          <button className="secondary-command" type="button" onClick={() => setStatusFilter("all")}>
            Tümünü Göster
          </button>
        </div>
      </div>

      <section className="operations-grid" aria-label="Günlük iş kartları">
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
            <article className="panel resource-card" key={task.id}>
              <div className="resource-card-heading">
                <div>
                  <span>{formatTaskType(task.taskType)}</span>
                  <h2>{task.title}</h2>
                </div>
                <span className={`status-badge ${task.status === "done" ? "ok" : task.status === "pending" ? "wait" : "info"}`}>
                  {formatTaskStatus(task.status)}
                </span>
              </div>
              <dl className="info-list compact-info detail-info-grid">
                <div>
                  <dt>Zaman</dt>
                  <dd>{formatTaskDue(task)}</dd>
                </div>
                <div>
                  <dt>Bağlantı</dt>
                  <dd>{formatTaskRelation(task)}</dd>
                </div>
              </dl>
              <p className="resource-note">{task.description || "Açıklama yok."}</p>
              <div className="operations-command-grid compact-actions three-actions">
                <button type="button" onClick={() => onUpdateStatus(task.id, "done")} disabled={task.status === "done"}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Tamamla
                </button>
                <button className="secondary-command" type="button" onClick={() => onUpdateStatus(task.id, "cancelled")} disabled={task.status === "cancelled"}>
                  İptal Et
                </button>
                <button className="secondary-command" type="button" onClick={() => onUpdateStatus(task.id, "pending")} disabled={task.status === "pending"}>
                  Yeniden Aç
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  );
}

interface ReservationsWorkspaceProps {
  reservations: DesktopDashboardData["reservations"];
  onUpdateStatus: (reservationId: string, status: string) => void;
  onOpenWhatsApp: (reservation: DesktopDashboardData["reservations"][number]) => void;
}

function ReservationsWorkspace({ reservations, onUpdateStatus, onOpenWhatsApp }: ReservationsWorkspaceProps) {
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
        <div className="menu-summary compact-summary">
          <div>
            <strong>{filteredReservations.length}</strong>
            <span>görünen kayıt</span>
          </div>
          <div>
            <strong>{reservations.filter((reservation) => reservation.status === "pending").length}</strong>
            <span>onay bekleyen</span>
          </div>
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
            Tarih
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <button className="secondary-command" type="button" onClick={() => { setStatusFilter("all"); setDateFilter(""); }}>
            Filtreyi Temizle
          </button>
        </div>
      </div>

      <section className="operations-grid" aria-label="Rezervasyon kartları">
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
            <article className="panel resource-card" key={reservation.id}>
              <div className="resource-card-heading">
                <div>
                  <span>{formatReservationType(reservation.reservationType)}</span>
                  <h2>{reservation.title}</h2>
                </div>
                <span className={`status-badge ${reservation.status === "approved" ? "ok" : reservation.status === "pending" ? "wait" : "info"}`}>
                  {formatReservationStatus(reservation.status)}
                </span>
              </div>
              <dl className="info-list compact-info detail-info-grid">
                <div>
                  <dt>Müşteri</dt>
                  <dd>{reservation.customerName || "Misafir"}</dd>
                </div>
                <div>
                  <dt>Tarih</dt>
                  <dd>{formatReservationDate(reservation)}</dd>
                </div>
                <div>
                  <dt>Kişi</dt>
                  <dd>{reservation.guestCount} kişi</dd>
                </div>
                <div>
                  <dt>Bağlantı</dt>
                  <dd>{formatResourceLinks(reservation)}</dd>
                </div>
              </dl>
              <p className="resource-note">{reservation.notes || reservation.priceNote || "Not yok."}</p>
              <div className="operations-command-grid compact-actions">
                <button type="button" onClick={() => onUpdateStatus(reservation.id, "approved")}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Onayla
                </button>
                <button className="secondary-command" type="button" onClick={() => onUpdateStatus(reservation.id, "rejected")}>
                  Reddet
                </button>
                <button className="secondary-command" type="button" onClick={() => onUpdateStatus(reservation.id, "cancelled")}>
                  İptal Et
                </button>
                <button className="secondary-command" type="button" onClick={() => onOpenWhatsApp(reservation)} disabled={!reservation.customerPhone}>
                  <MessageCircle size={16} aria-hidden="true" />
                  {formatReservationWhatsAppButton(reservation.status)}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  );
}

interface RoomsWorkspaceProps {
  rooms: DesktopDashboardData["rooms"];
  onUpdateStatus: (roomId: string, status: string) => void;
}

function RoomsWorkspace({ rooms, onUpdateStatus }: RoomsWorkspaceProps) {
  return (
    <section className="operations-grid" aria-label="Oda yönetimi">
      {rooms.map((room) => (
        <article className="panel resource-card" key={room.id}>
          <div className="resource-card-heading">
            <div>
              <span>{room.number ? `Oda ${room.number}` : "Oda"}</span>
              <h2>{room.name}</h2>
            </div>
            <span className={`status-badge ${getResourceStatusTone(room.status)}`}>{formatRoomStatus(room.status)}</span>
          </div>
          <dl className="info-list compact-info detail-info-grid">
            <div>
              <dt>Kapasite</dt>
              <dd>{room.capacity} kişi</dd>
            </div>
            <div>
              <dt>Kat</dt>
              <dd>{room.floor || "-"}</dd>
            </div>
            <div>
              <dt>Yatak</dt>
              <dd>{room.bedInfo || "-"}</dd>
            </div>
            <div>
              <dt>Rezervasyon</dt>
              <dd>{room.activeReservationTitle || "Bağlantı yok"}</dd>
            </div>
          </dl>
          <p className="resource-note">{room.description || room.features.join(", ") || "Açıklama yok."}</p>
          <div className="status-button-row">
            <button type="button" onClick={() => onUpdateStatus(room.id, "available")}>Boş</button>
            <button type="button" onClick={() => onUpdateStatus(room.id, "occupied")}>Dolu</button>
            <button type="button" onClick={() => onUpdateStatus(room.id, "cleaning")}>Temizlik</button>
            <button type="button" onClick={() => onUpdateStatus(room.id, "maintenance")}>Bakım</button>
          </div>
        </article>
      ))}
    </section>
  );
}

interface TablesWorkspaceProps {
  tables: DesktopDashboardData["tables"];
  onUpdateStatus: (tableId: string, status: string) => void;
}

function TablesWorkspace({ tables, onUpdateStatus }: TablesWorkspaceProps) {
  return (
    <section className="operations-grid" aria-label="Masa yönetimi">
      {tables.map((table) => (
        <article className="panel resource-card" key={table.id}>
          <div className="resource-card-heading">
            <div>
              <span>{table.area || "Genel"}</span>
              <h2>{table.name}</h2>
            </div>
            <span className={`status-badge ${getResourceStatusTone(table.status)}`}>{formatTableStatus(table.status)}</span>
          </div>
          <dl className="info-list compact-info detail-info-grid">
            <div>
              <dt>Kapasite</dt>
              <dd>{table.capacity} kişi</dd>
            </div>
            <div>
              <dt>Alan</dt>
              <dd>{table.area || "-"}</dd>
            </div>
            <div>
              <dt>Rezervasyon</dt>
              <dd>{table.activeReservationTitle || table.currentReservationId || "Bağlantı yok"}</dd>
            </div>
            <div>
              <dt>Not</dt>
              <dd>{table.notes || "-"}</dd>
            </div>
          </dl>
          <div className="status-button-row">
            <button type="button" onClick={() => onUpdateStatus(table.id, "available")}>Boş</button>
            <button type="button" onClick={() => onUpdateStatus(table.id, "occupied")}>Dolu</button>
            <button type="button" onClick={() => onUpdateStatus(table.id, "reserved")}>Rezerve</button>
            <button type="button" onClick={() => onUpdateStatus(table.id, "bill_waiting")}>Hesap</button>
          </div>
        </article>
      ))}
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
  menuPreviewUrl: string;
  onCategoryFormChange: (form: CategoryFormState) => void;
  onItemFormChange: (form: ItemFormState) => void;
  onSelectCategory: (category: PublishedMenuCategory) => void;
  onSelectItem: (item: PublishedMenuItem) => void;
  onNewCategory: () => void;
  onNewItem: () => void;
  onSaveCategory: () => void;
  onSaveItem: () => void;
  onPublishMenu: () => void;
  onOpenPreview: () => void;
  isPublishing: boolean;
}

function MenuManager({
  dashboardData,
  categoryForm,
  itemForm,
  selectedCategoryId,
  selectedItemId,
  menuEditState,
  menuEditMessage,
  menuPreviewUrl,
  onCategoryFormChange,
  onItemFormChange,
  onSelectCategory,
  onSelectItem,
  onNewCategory,
  onNewItem,
  onSaveCategory,
  onSaveItem,
  onPublishMenu,
  onOpenPreview,
  isPublishing
}: MenuManagerProps) {
  return (
    <section className="menu-manager" aria-label="QR menü yönetimi">
      <div className="menu-manager-toolbar">
        <div className="menu-summary compact-summary">
          <div>
            <strong>{dashboardData.summary.activeMenuCategories}</strong>
            <span>aktif kategori</span>
          </div>
          <div>
            <strong>{dashboardData.summary.availableMenuItems}</strong>
            <span>yayında ürün</span>
          </div>
        </div>
        <div className="menu-preview-actions">
          <span>{menuPreviewUrl}</span>
          <button type="button" onClick={onOpenPreview}>
            <ExternalLink size={16} aria-hidden="true" />
            Önizle
          </button>
          <button type="button" onClick={onPublishMenu} disabled={isPublishing}>
            <UploadCloud size={16} aria-hidden="true" />
            Yayınla
          </button>
        </div>
      </div>

      <div className="menu-management-grid">
        <section className="panel menu-list-panel">
          <div className="panel-heading compact">
            <div>
              <p>Kategoriler</p>
              <h2>{dashboardData.menu.categories.length} kayıt</h2>
            </div>
            <button className="icon-command" type="button" onClick={onNewCategory} aria-label="Kategori ekle">
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="manager-list">
            {dashboardData.menu.categories.map((category) => (
              <button
                className={selectedCategoryId === category.id ? "manager-row is-active" : "manager-row"}
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category)}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.is_active ? "Aktif" : "Pasif"} · {category.sort_order}</small>
                </span>
                <span className={category.is_active ? "dot is-on" : "dot"} />
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
            <div className="form-row">
              <label>
                Sıra
                <input
                  value={categoryForm.sort_order}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, sort_order: event.target.value })}
                  inputMode="numeric"
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
            </div>
            <button className="primary-command" type="button" onClick={onSaveCategory}>
              <Save size={16} aria-hidden="true" />
              Kategoriyi Kaydet
            </button>
          </div>
        </section>

        <section className="panel menu-list-panel">
          <div className="panel-heading compact">
            <div>
              <p>Ürünler</p>
              <h2>{dashboardData.menu.items.length} kayıt</h2>
            </div>
            <button className="icon-command" type="button" onClick={onNewItem} aria-label="Ürün ekle">
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="manager-list product-list">
            {dashboardData.menu.items.map((item) => (
              <button
                className={selectedItemId === item.id ? "manager-row is-active" : "manager-row"}
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{findMenuCategoryName(item.category_id, dashboardData.menu.categories)} · {formatCurrency(item.price, item.currency)}</small>
                </span>
                <span className={item.is_available ? "dot is-on" : "dot"} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel item-editor-panel">
          <div className="panel-heading compact">
            <div>
              <p>Ürün Detayı</p>
              <h2>{itemForm.id ? "Düzenle" : "Yeni Ürün"}</h2>
            </div>
          </div>

          <div className="manager-form item-form">
            <div className="form-row">
              <label>
                Kategori
                <select value={itemForm.category_id} onChange={(event) => onItemFormChange({ ...itemForm, category_id: event.target.value })}>
                  {dashboardData.menu.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sıra
                <input
                  value={itemForm.sort_order}
                  onChange={(event) => onItemFormChange({ ...itemForm, sort_order: event.target.value })}
                  inputMode="numeric"
                />
              </label>
            </div>
            <label>
              Ürün adı
              <input value={itemForm.name} onChange={(event) => onItemFormChange({ ...itemForm, name: event.target.value })} placeholder="Serpme Kahvaltı" />
            </label>
            <label>
              Açıklama
              <textarea
                value={itemForm.description}
                onChange={(event) => onItemFormChange({ ...itemForm, description: event.target.value })}
                placeholder="Ürün açıklaması"
              />
            </label>
            <div className="form-row">
              <label>
                Fiyat
                <input value={itemForm.price} onChange={(event) => onItemFormChange({ ...itemForm, price: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                Para birimi
                <select value={itemForm.currency} onChange={(event) => onItemFormChange({ ...itemForm, currency: event.target.value })}>
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            <label>
              Görsel yolu
              <input
                value={itemForm.image_url}
                onChange={(event) => onItemFormChange({ ...itemForm, image_url: event.target.value })}
                placeholder="/assets/menu-breakfast.webp"
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
                Öne çıkan
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
            <p className={`menu-status sync-${menuEditState}`}>{menuEditMessage}</p>
            <button className="primary-command" type="button" onClick={onSaveItem}>
              <Save size={16} aria-hidden="true" />
              Ürünü Kaydet
            </button>
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

function formatTaskType(value: string) {
  const labels: Record<string, string> = {
    check_in: "Giriş hazırlığı",
    check_out: "Çıkış takibi",
    reservation_followup: "Rezervasyon takibi",
    customer_call: "Müşteri araması",
    table_reservation: "Masa takibi",
    cleaning: "Temizlik",
    maintenance: "Bakım",
    note: "Not",
    other: "Diğer"
  };

  return labels[value] ?? "Günlük iş";
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
  return [task.dueDate, task.dueTime].filter(Boolean).join(" · ") || "Zaman yok";
}

function formatTaskRelation(task: DesktopDashboardData["dailyTasks"][number]) {
  if (!task.relatedType && !task.relatedId) {
    return "Bağlantı yok";
  }

  return [task.relatedType || "kayıt", task.relatedId].filter(Boolean).join(" · ");
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
    cleaning: "Temizlik"
  };

  return labels[value] ?? "Boş";
}

function getResourceStatusTone(value: string) {
  if (value === "available") {
    return "ok";
  }

  if (value === "reserved" || value === "cleaning" || value === "bill_waiting") {
    return "wait";
  }

  return "info";
}

function formatReservationDate(reservation: DesktopDashboardData["reservations"][number]) {
  const date = reservation.endDate ? `${reservation.startDate} - ${reservation.endDate}` : reservation.startDate;
  return [date, reservation.time].filter(Boolean).join(" · ") || "-";
}

function matchesReservationDate(reservation: DesktopDashboardData["reservations"][number], date: string) {
  const startDate = reservation.startDate || reservation.endDate;
  const endDate = reservation.endDate || reservation.startDate;
  if (!startDate && !endDate) {
    return false;
  }

  return date >= startDate && date <= endDate;
}

function formatResourceLinks(reservation: DesktopDashboardData["reservations"][number]) {
  const roomText = reservation.roomIds.length > 0 ? `Oda: ${reservation.roomIds.join(", ")}` : "";
  const tableText = reservation.tableIds.length > 0 ? `Masa: ${reservation.tableIds.join(", ")}` : "";
  return [roomText, tableText].filter(Boolean).join(" · ") || "Kaynak atanmamış";
}

function formatReservationWhatsAppButton(status: string) {
  const labels: Record<string, string> = {
    approved: "WhatsApp Onay",
    rejected: "WhatsApp Ret",
    cancelled: "WhatsApp İptal",
    completed: "WhatsApp Takip"
  };

  return labels[status] ?? "WhatsApp Taslak";
}

function buildReservationWhatsAppMessage(reservation: DesktopDashboardData["reservations"][number]) {
  const greeting = `Merhaba ${reservation.customerName || "Misafir"},`;
  const dateText = formatReservationDate(reservation);
  const typeText = formatReservationType(reservation.reservationType).toLowerCase();

  if (reservation.status === "approved") {
    return [
      greeting,
      `${dateText} tarihli ${typeText} rezervasyonunuz işletme tarafından onaylandı.`,
      formatResourceLinks(reservation),
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

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function getPageMeta(page: DesktopPage) {
  const pages: Record<DesktopPage, { eyebrow: string; title: string }> = {
    dashboard: {
      eyebrow: "Bugün Ne Var?",
      title: "Ana Ekran"
    },
    requests: {
      eyebrow: "Müşteri Talepleri",
      title: "Talepler"
    },
    customers: {
      eyebrow: "Müşteri Hafızası",
      title: "Müşteriler"
    },
    reports: {
      eyebrow: "İşletme Özeti",
      title: "Raporlar"
    },
    tasks: {
      eyebrow: "Günlük Takip",
      title: "Günlük İşler"
    },
    reservations: {
      eyebrow: "Onay ve Takip",
      title: "Rezervasyonlar"
    },
    rooms: {
      eyebrow: "Pansiyon Durumu",
      title: "Odalar"
    },
    tables: {
      eyebrow: "Servis Durumu",
      title: "Masalar"
    },
    menu: {
      eyebrow: "Menü Yönetimi",
      title: "QR Menü"
    },
    whatsapp: {
      eyebrow: "Müşteri Yanıtları",
      title: "WhatsApp"
    },
    ai: {
      eyebrow: "İşletme Asistanı",
      title: "AI Yardımcı"
    }
  };

  return pages[page];
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
