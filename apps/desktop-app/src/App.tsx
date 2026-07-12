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
  Settings,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  UtensilsCrossed
} from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem, SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { CreateManualRequestInput, DesktopDashboardData, DesktopSetupData, SaveInitialSetupInput } from "../electron/database";

type SyncState = "idle" | "loading" | "success" | "error";
type DesktopPage = "dashboard" | "requests" | "customers" | "reports" | "tasks" | "reservations" | "rooms" | "tables" | "menu" | "whatsapp";
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
  aiModel: string;
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
  webModuleUrl: "http://127.0.0.1:8080",
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

const modules = {
  rooms: true,
  tables: true,
  qrMenu: true,
  whatsapp: true,
  ai: true
};

const defaultSetupData: DesktopSetupData = {
  setupRequired: false,
  businessName: "Deniz Çiçeği Pansiyon & Kafe",
  businessType: "pension_restaurant",
  phone: "+905321234567",
  whatsapp: "+905321234567",
  email: "merhaba@denizcicegi.example",
  address: "Sahil Yolu No: 18, Akyaka / Muğla",
  webModuleUrl: "http://127.0.0.1:8080",
  syncSecret: "change-this-secret",
  aiEnabled: false,
  aiProvider: "openai_compatible",
  aiModel: "",
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
  const [convertingRequestId, setConvertingRequestId] = useState("");
  const [suggestingRequestId, setSuggestingRequestId] = useState("");
  const [aiState, setAiState] = useState<SyncState>("idle");
  const [aiMessage, setAiMessage] = useState("AI cevap taslağı hazır.");
  const [backupState, setBackupState] = useState<SyncState>("idle");
  const [backupMessage, setBackupMessage] = useState("Yerel yedek bekliyor.");
  const [androidPublishState, setAndroidPublishState] = useState<SyncState>("idle");
  const [androidPublishMessage, setAndroidPublishMessage] = useState("Android özeti henüz yayınlanmadı.");

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
  }, [dashboardData.summary]);

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
      aiModel: setupForm.aiModel,
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
    setSetupSaveState("success");
    setSetupMessage(result.message);
    setSetupMode(false);
  }

  if (setupMode) {
    return (
      <SetupWizard
        form={setupForm}
        setupData={setupData}
        saveState={setupSaveState}
        message={setupMessage}
        onFormChange={setSetupForm}
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
            <button className="nav-item" type="button">
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
                      <button
                        className="ai-action"
                        type="button"
                        onClick={() => handleCreateOwnerReplySuggestion(request)}
                        disabled={suggestingRequestId === request.id}
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        {suggestingRequestId === request.id ? "Hazırlanıyor" : "AI Taslak Yenile"}
                      </button>
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
  onFormChange: (form: SetupFormState) => void;
  onSave: () => void;
  onSkip: () => void;
}

function SetupWizard({ form, setupData, saveState, message, onFormChange, onSave, onSkip }: SetupWizardProps) {
  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
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
            <label>
              Web modül adresi
              <input value={form.webModuleUrl} onChange={(event) => update("webModuleUrl", event.target.value)} placeholder="https://firma.com/yardimci-asistan" />
            </label>
            <label>
              Sync güvenlik anahtarı
              <input value={form.syncSecret} onChange={(event) => update("syncSecret", event.target.value)} placeholder="uzun-gizli-anahtar" />
            </label>
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-section-title">
            <p>AI ve İlk Kayıtlar</p>
            <h2>İsteğe Bağlı</h2>
          </div>
          <div className="setup-grid two">
            <label className="setup-checkline">
              <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
              AI cevap önerileri açık
            </label>
            <label>
              AI provider
              <input value={form.aiProvider} onChange={(event) => update("aiProvider", event.target.value)} placeholder="openai_compatible" disabled={!form.aiEnabled} />
            </label>
            <label>
              AI model
              <input value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder="Model adı" disabled={!form.aiEnabled} />
            </label>
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
              Kurulumu Kaydet
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

interface WhatsAppWorkspaceProps {
  requests: SyncedCustomerRequest[];
  selectedRequest: SyncedCustomerRequest | undefined;
  selectedMessage: string;
  selectedUrl: string;
  onSelectRequest: (requestId: string) => void;
  onOpenExternal: () => void;
}

type WhatsAppWebViewElement = HTMLElement & {
  reload?: () => void;
};

function WhatsAppWorkspace({ requests, selectedRequest, selectedMessage, selectedUrl, onSelectRequest, onOpenExternal }: WhatsAppWorkspaceProps) {
  const webViewRef = useRef<WhatsAppWebViewElement | null>(null);
  const [connectionState, setConnectionState] = useState<WhatsAppConnectionState>("idle");
  const [connectionMessage, setConnectionMessage] = useState("WhatsApp Web yükleniyor.");
  const [copyMessage, setCopyMessage] = useState("Hazır mesaj bekliyor.");
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
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    if (!webViewPayload) {
      setConnectionState("error");
      setConnectionMessage(webViewAction?.message ?? "WhatsApp hedefi hazırlanamadı.");
      setCopyMessage("Mesaj elle kopyalanabilir.");
      setWebViewUrl(WHATSAPP_WEB_HOME_URL);
      return;
    }

    setConnectionState("loading");
    setConnectionMessage("QR girişi bekliyor.");
    setCopyMessage("Hazır mesaj bekliyor.");
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
    setWebViewUrl(webViewPayload.url);
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
              <button type="button" onClick={() => onSuggest(selectedRequest)} disabled={suggestingRequestId === selectedRequest.id}>
                <Sparkles size={16} aria-hidden="true" />
                {suggestingRequestId === selectedRequest.id ? "Hazırlanıyor" : "AI Taslak Yenile"}
              </button>
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
    webModuleUrl: setupData.webModuleUrl || "http://127.0.0.1:8080",
    syncSecret: setupData.syncSecret && setupData.syncSecret !== "change-this-secret" ? setupData.syncSecret : generateSyncSecret(),
    aiEnabled: setupData.aiEnabled,
    aiProvider: setupData.aiProvider || "openai_compatible",
    aiModel: setupData.aiModel,
    roomsEnabled: setupData.modules.rooms,
    tablesEnabled: setupData.modules.tables,
    qrMenuEnabled: setupData.modules.qrMenu,
    whatsappEnabled: setupData.modules.whatsapp,
    androidEnabled: setupData.modules.android,
    roomCount: String(Math.max(0, setupData.initialCounts.rooms || 2)),
    tableCount: String(Math.max(0, setupData.initialCounts.tables || 2))
  };
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
