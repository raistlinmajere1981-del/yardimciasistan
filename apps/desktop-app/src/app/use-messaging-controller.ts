import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  buildOwnerReplyWhatsAppMessage,
  createWhatsAppUrl,
  createWhatsAppWebUrl,
  type WhatsAppAction
} from "@yardimci-asistan/whatsapp-bridge";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  AiWorkspaceHistoryEntry,
  AiWorkspaceMode,
  DesktopDashboardData
} from "../../electron/database";
import { buildReservationWhatsAppMessage } from "./reservation-messaging";
import type { SyncState } from "./runtime-state";
import type { PreparedWhatsAppMessage } from "./whatsapp-handoff";

interface UseMessagingControllerOptions {
  dashboardData: DesktopDashboardData;
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  messagesActive: boolean;
  aiEnabled: boolean;
  customersEnabled: boolean;
  whatsappEnabled: boolean;
  customerCreditEnabled?: boolean;
  onOpenMessages: () => void;
}

export function useMessagingController({
  dashboardData,
  setDashboardData,
  setSyncState,
  setStatusMessage,
  messagesActive,
  aiEnabled,
  customersEnabled,
  whatsappEnabled,
  customerCreditEnabled = false,
  onOpenMessages
}: UseMessagingControllerOptions) {
  const [selectedWhatsAppRequestId, setSelectedWhatsAppRequestIdState] = useState(dashboardData.requests[0]?.id ?? "");
  const [preparedWhatsAppMessage, setPreparedWhatsAppMessage] = useState<PreparedWhatsAppMessage | null>(null);
  const [birthdayPreparingId, setBirthdayPreparingId] = useState("");
  const surfacePreparedWhatsAppMessage = whatsappEnabled
    && (preparedWhatsAppMessage?.source === "birthday" || customerCreditEnabled)
    ? preparedWhatsAppMessage
    : null;
  useEffect(() => {
    if (!whatsappEnabled || (preparedWhatsAppMessage?.source === "customer_credit" && !customerCreditEnabled)) {
      setPreparedWhatsAppMessage(null);
    }
  }, [customerCreditEnabled, preparedWhatsAppMessage?.source, whatsappEnabled]);

  function setSelectedWhatsAppRequestId(value: SetStateAction<string>) {
    setPreparedWhatsAppMessage(null);
    setSelectedWhatsAppRequestIdState(value);
  }

  function openPreparedWhatsApp(message: PreparedWhatsAppMessage) {
    if (!whatsappEnabled) throw new Error("WhatsApp bu işletmede etkin değil.");
    setPreparedWhatsAppMessage(message);
    setSelectedWhatsAppRequestIdState("");
    onOpenMessages();
  }

  function openPreparedCreditWhatsApp(message: PreparedWhatsAppMessage) {
    if (!customerCreditEnabled) throw new Error("Veresiye WhatsApp paylaşımı şu anda etkin değil.");
    openPreparedWhatsApp(message);
  }

  async function prepareBirthdayWhatsApp(customerId: string) {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    setBirthdayPreparingId(customerId);
    try {
      await prepareBirthdayWhatsAppInternal(customerId);
    } finally {
      setBirthdayPreparingId("");
    }
  }

  async function prepareBirthdayWhatsAppInternal(customerId: string) {
    const bridge = window.yardimciDesktop;
    if (!bridge?.prepareBirthdayWhatsApp) {
      setSyncState("error");
      setStatusMessage("Doğum günü WhatsApp hazırlığı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setSyncState("loading");
    setStatusMessage("Doğum günü mesajı hazırlanıyor...");
    let result;
    try {
      result = await bridge.prepareBirthdayWhatsApp(customerId);
    } catch (error) {
      setSyncState("error");
      setStatusMessage(error instanceof Error ? error.message : "Doğum günü mesajı hazırlanamadı.");
      return;
    }
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    let nextDashboardData: DesktopDashboardData;
    try {
      nextDashboardData = await bridge.getDashboardData();
    } catch {
      setSyncState("error");
      setStatusMessage("Mesaj hazırlandı ancak ekran yenilenemedi. Doğum günü listesini yenileyip tekrar deneyin.");
      return;
    }
    setDashboardData(nextDashboardData);
    if (!result.action.ok) {
      setSyncState("error");
      setStatusMessage(result.action.message);
      return;
    }

    await handleBirthdayAction(result.action, result.candidate);
    setSyncState("success");
  }

  async function handleBirthdayAction(
    action: Extract<WhatsAppAction, { ok: true }>,
    candidate: { customerId: string; customerName: string; phone: string; message: string }
  ) {
    if (action.mode === "webview") {
      openPreparedWhatsApp({
        source: "birthday",
        customerId: candidate.customerId,
        customerName: candidate.customerName,
        phone: candidate.phone,
        message: candidate.message
      });
      setStatusMessage("Mesaj WhatsApp’a hazırlandı; gönderim sizin kontrolünüzde.");
      return;
    }

    if (action.mode === "manual_copy") {
      try {
        await navigator.clipboard.writeText(action.message);
        setStatusMessage("Mesaj hazırlandı ve panoya kopyalandı; gönderim sizin kontrolünüzde.");
      } catch {
        openPreparedWhatsApp({
          source: "birthday",
          customerId: candidate.customerId,
          customerName: candidate.customerName,
          phone: candidate.phone,
          message: candidate.message
        });
        setStatusMessage("Mesaj hazırlandı ancak panoya kopyalanamadı. WhatsApp alanında metni elle kopyalayabilirsiniz.");
      }
      return;
    }

    if (action.mode === "wa_link") {
      const opened = await window.yardimciDesktop?.openExternal(action.url);
      if (opened === false) {
        setStatusMessage("WhatsApp açılamadı. Mesajı kopyalayıp elle paylaşabilirsiniz.");
        return;
      }
      setStatusMessage("WhatsApp bağlantısı açıldı; gönderim sizin kontrolünüzde.");
    }
  }
  const [suggestingRequestId, setSuggestingRequestId] = useState("");
  const [aiState, setAiState] = useState<SyncState>("idle");
  const [aiMessage, setAiMessage] = useState("AI cevap taslağı hazır.");
  const [aiWorkspaceMode, setAiWorkspaceMode] = useState<AiWorkspaceMode>("reply");
  const [aiWorkspaceRequestId, setAiWorkspaceRequestId] = useState(dashboardData.requests[0]?.id ?? "");
  const [aiWorkspaceInstructions, setAiWorkspaceInstructions] = useState("");
  const [aiWorkspaceEntry, setAiWorkspaceEntry] = useState<AiWorkspaceHistoryEntry | null>(null);
  const [aiWorkspaceContent, setAiWorkspaceContent] = useState("");
  const [aiWorkspaceHistory, setAiWorkspaceHistory] = useState<AiWorkspaceHistoryEntry[]>([]);
  const [aiWorkspaceState, setAiWorkspaceState] = useState<SyncState>("idle");
  const [aiWorkspaceMessage, setAiWorkspaceMessage] = useState("Bir araç seçip AI sonucunu hazırlayın.");
  const [messagesAiOpen, setMessagesAiOpen] = useState(false);
  const surfaceAiWorkspaceMode: AiWorkspaceMode = customersEnabled ? aiWorkspaceMode : "daily";

  useEffect(() => {
    if (!messagesActive || !messagesAiOpen || !aiEnabled || !window.yardimciDesktop) {
      return;
    }
    void window.yardimciDesktop.getAiWorkspaceHistory(16).then(setAiWorkspaceHistory);
  }, [aiEnabled, messagesActive, messagesAiOpen]);

  useEffect(() => {
    if (messagesActive && aiEnabled && !whatsappEnabled) {
      setMessagesAiOpen(true);
    }
  }, [aiEnabled, messagesActive, whatsappEnabled]);

  useEffect(() => {
    if (aiWorkspaceRequestId && dashboardData.requests.some((request) => request.id === aiWorkspaceRequestId)) {
      return;
    }
    setAiWorkspaceRequestId(dashboardData.requests[0]?.id ?? "");
  }, [aiWorkspaceRequestId, dashboardData.requests]);

  const selectedWhatsAppRequest = useMemo(
    () => surfacePreparedWhatsAppMessage ? undefined : dashboardData.requests.find((request) => request.id === selectedWhatsAppRequestId) ?? dashboardData.requests[0],
    [dashboardData.requests, selectedWhatsAppRequestId, surfacePreparedWhatsAppMessage]
  );

  const selectedWhatsAppMessage = useMemo(
    () => surfacePreparedWhatsAppMessage ? surfacePreparedWhatsAppMessage.message : whatsappEnabled && selectedWhatsAppRequest
      ? buildOwnerReplyWhatsAppMessage(
          (aiEnabled ? selectedWhatsAppRequest.ai_suggested_reply : "")
          || selectedWhatsAppRequest.whatsapp_message
        )
      : "",
    [aiEnabled, selectedWhatsAppRequest, whatsappEnabled, surfacePreparedWhatsAppMessage]
  );

  const selectedWhatsAppUrl = useMemo(
    () => surfacePreparedWhatsAppMessage ? createWhatsAppWebUrl(surfacePreparedWhatsAppMessage.phone, surfacePreparedWhatsAppMessage.message) : whatsappEnabled && selectedWhatsAppRequest
      ? createWhatsAppWebUrl(selectedWhatsAppRequest.customer_phone, selectedWhatsAppMessage)
      : "",
    [selectedWhatsAppMessage, selectedWhatsAppRequest, whatsappEnabled, surfacePreparedWhatsAppMessage]
  );

  function openWhatsApp(request: SyncedCustomerRequest) {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    setSelectedWhatsAppRequestId(request.id);
    onOpenMessages();
  }

  function callCustomer(request: SyncedCustomerRequest) {
    void window.yardimciDesktop?.openExternal(`tel:${request.customer_phone}`);
  }

  function callCustomerRecord(customer: DesktopDashboardData["customers"][number]) {
    void window.yardimciDesktop?.openExternal(`tel:${customer.phone}`);
  }

  function openCustomerWhatsApp(customer: DesktopDashboardData["customers"][number]) {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    if (!customer.phone) {
      setStatusMessage("WhatsApp bağlantısı için müşteri telefonu gerekiyor.");
      return;
    }

    const message = `Merhaba ${customer.fullName || "Misafir"}, Yardımcı Asistan üzerinden sizinle iletişime geçiyoruz.`;
    void window.yardimciDesktop?.openExternal(createWhatsAppUrl(customer.phone, message));
  }

  function openReservationWhatsApp(reservation: DesktopDashboardData["reservations"][number]) {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    if (!reservation.customerPhone) {
      setStatusMessage("WhatsApp bağlantısı için rezervasyonda müşteri telefonu gerekiyor.");
      return;
    }

    const message = buildReservationWhatsAppMessage(reservation, dashboardData.rooms, dashboardData.tables);
    void window.yardimciDesktop?.openExternal(createWhatsAppUrl(reservation.customerPhone, message));
  }

  function openSelectedWhatsAppExternal() {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    if (!selectedWhatsAppUrl) {
      setStatusMessage("WhatsApp bağlantısı için geçerli müşteri telefonu ve mesaj gerekiyor.");
      return;
    }

    void window.yardimciDesktop?.openExternal(selectedWhatsAppUrl);
  }

  async function handleWhatsAppMessageSent(requestId: string, message: string) {
    if (preparedWhatsAppMessage) return { ok: false as const, message: "Veresiye paylaşımı için gönderim kaydı tutulmaz." };
    if (!whatsappEnabled) {
      return { ok: false as const, message: "WhatsApp bu işletmede etkin değil." };
    }
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

  async function handleDeleteWhatsAppMessage(request: SyncedCustomerRequest) {
    if (!whatsappEnabled) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
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

  async function handleCreateOwnerReplySuggestion(request: SyncedCustomerRequest) {
    if (!aiEnabled) {
      setAiState("error");
      setAiMessage("AI bu işletmede etkin değil.");
      return;
    }
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
    if (!aiEnabled) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI bu işletmede etkin değil.");
      return;
    }
    if (!window.yardimciDesktop) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI araçları hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    setAiWorkspaceState("loading");
    setAiWorkspaceMessage("AI sonucu hazırlanıyor...");
    const result = await window.yardimciDesktop.generateAiWorkspace({
      mode: surfaceAiWorkspaceMode,
      requestId: surfaceAiWorkspaceMode === "daily" ? "" : aiWorkspaceRequestId,
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
    if (!aiEnabled) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI bu işletmede etkin değil.");
      return false;
    }
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
    if (!whatsappEnabled) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    if (!aiWorkspaceEntry || aiWorkspaceEntry.mode !== "reply") {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("WhatsApp için cevap taslağı türünde bir sonuç hazırlayın.");
      return;
    }
    if (await persistAiWorkspaceResult()) {
      setSelectedWhatsAppRequestId(aiWorkspaceEntry.requestId);
      onOpenMessages();
    }
  }

  function openAiTools(mode: AiWorkspaceMode, requestId = "", instructions = "") {
    if (!aiEnabled) {
      setStatusMessage("AI bu işletmede etkin değil.");
      return;
    }
    const allowedMode = customersEnabled ? mode : "daily";
    setAiWorkspaceMode(allowedMode);
    if (customersEnabled && requestId) {
      setAiWorkspaceRequestId(requestId);
    }
    setAiWorkspaceInstructions(instructions);
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("AI sonucunu hazırlamak için düğmeye basın.");
    setMessagesAiOpen(true);
    onOpenMessages();
  }

  async function handleRewriteWhatsAppMessage(instructions: string) {
    if (!whatsappEnabled || !aiEnabled) {
      setAiState("error");
      setAiMessage(!whatsappEnabled ? "WhatsApp bu işletmede etkin değil." : "AI bu işletmede etkin değil.");
      return;
    }
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
    if (!customersEnabled && entry.mode !== "daily") {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Müşteri odaklı AI çalışmaları bu işletmede etkin değil.");
      return;
    }
    setAiWorkspaceMode(entry.mode);
    setAiWorkspaceRequestId(entry.requestId);
    setAiWorkspaceInstructions(entry.instructions);
    setAiWorkspaceEntry(entry);
    setAiWorkspaceContent(entry.content);
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Geçmiş sonuç açıldı; düzenleyip yeniden kullanabilirsiniz.");
  }

  function changeAiWorkspaceMode(mode: AiWorkspaceMode) {
    setAiWorkspaceMode(customersEnabled ? mode : "daily");
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

  return {
    preparedWhatsAppMessage: surfacePreparedWhatsAppMessage,
    openPreparedCreditWhatsApp,
    prepareBirthdayWhatsApp,
    birthdayPreparingId,
    selectedWhatsAppRequestId,
    setSelectedWhatsAppRequestId,
    selectedWhatsAppRequest,
    selectedWhatsAppMessage,
    selectedWhatsAppUrl,
    suggestingRequestId,
    aiState,
    aiMessage,
    aiWorkspaceMode: surfaceAiWorkspaceMode,
    aiWorkspaceRequestId,
    aiWorkspaceInstructions,
    setAiWorkspaceInstructions,
    aiWorkspaceEntry,
    aiWorkspaceContent,
    setAiWorkspaceContent,
    aiWorkspaceHistory,
    aiWorkspaceState,
    aiWorkspaceMessage,
    messagesAiOpen,
    openWhatsApp,
    callCustomer,
    callCustomerRecord,
    openCustomerWhatsApp,
    openReservationWhatsApp,
    openSelectedWhatsAppExternal,
    handleWhatsAppMessageSent,
    handleDeleteWhatsAppMessage,
    handleCreateOwnerReplySuggestion,
    handleGenerateAiWorkspace,
    handleSaveAiWorkspace,
    handleCopyAiWorkspace,
    handlePrepareAiWorkspaceWhatsApp,
    openAiTools,
    handleRewriteWhatsAppMessage,
    selectAiWorkspaceHistoryEntry,
    changeAiWorkspaceMode,
    changeAiWorkspaceRequest
  };
}
