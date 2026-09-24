import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  const surfacePreparedWhatsAppMessage = customersEnabled
    && whatsappEnabled
    && (preparedWhatsAppMessage?.source === "birthday" || customerCreditEnabled)
    ? preparedWhatsAppMessage
    : null;
  useEffect(() => {
    if (!customersEnabled || !whatsappEnabled || (preparedWhatsAppMessage?.source === "customer_credit" && !customerCreditEnabled)) {
      setPreparedWhatsAppMessage(null);
    }
  }, [customerCreditEnabled, customersEnabled, preparedWhatsAppMessage?.source, whatsappEnabled]);

  function setSelectedWhatsAppRequestId(value: SetStateAction<string>) {
    invalidateWhatsAppSelection();
    setPreparedWhatsAppMessage(null);
    setSelectedWhatsAppRequestIdState(value);
  }

  function openPreparedWhatsApp(message: PreparedWhatsAppMessage) {
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
      throw new Error("WhatsApp bu işletmede etkin değil.");
    }
    invalidateWhatsAppSelection();
    setPreparedWhatsAppMessage(message);
    setSelectedWhatsAppRequestIdState("");
    onOpenMessages();
  }

  function openPreparedCreditWhatsApp(message: PreparedWhatsAppMessage) {
    if (!customerCreditEnabledRef.current) throw new Error("Veresiye WhatsApp paylaşımı şu anda etkin değil.");
    openPreparedWhatsApp(message);
  }

  async function prepareBirthdayWhatsApp(customerId: string) {
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    const generation = ++birthdayOperationGenerationRef.current;
    const whatsappEpoch = whatsappCapabilityEpochRef.current;
    setBirthdayPreparingId(customerId);
    try {
      await prepareBirthdayWhatsAppInternal(customerId, generation, whatsappEpoch);
    } finally {
      if (birthdayOperationGenerationRef.current === generation) setBirthdayPreparingId("");
    }
  }

  async function prepareBirthdayWhatsAppInternal(customerId: string, generation: number, whatsappEpoch: number) {
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
      if (
        generation !== birthdayOperationGenerationRef.current
        || whatsappEpoch !== whatsappCapabilityEpochRef.current
        || !customersEnabledRef.current
        || !whatsappEnabledRef.current
      ) return;
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
      if (
        generation !== birthdayOperationGenerationRef.current
        || whatsappEpoch !== whatsappCapabilityEpochRef.current
        || !customersEnabledRef.current
        || !whatsappEnabledRef.current
      ) return;
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
    if (
      generation === birthdayOperationGenerationRef.current
      && whatsappEpoch === whatsappCapabilityEpochRef.current
      && customersEnabledRef.current
      && whatsappEnabledRef.current
    ) setSyncState("success");
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

  const aiCapabilityValuesRef = useRef({ aiEnabled, customersEnabled });
  const aiCapabilityEpochRef = useRef(0);
  if (
    aiCapabilityValuesRef.current.aiEnabled !== aiEnabled
    || aiCapabilityValuesRef.current.customersEnabled !== customersEnabled
  ) {
    aiCapabilityEpochRef.current += 1;
    aiCapabilityValuesRef.current = { aiEnabled, customersEnabled };
  }

  const whatsappCapabilityValuesRef = useRef({ whatsappEnabled, customersEnabled, customerCreditEnabled });
  const whatsappCapabilityEpochRef = useRef(0);
  if (
    whatsappCapabilityValuesRef.current.whatsappEnabled !== whatsappEnabled
    || whatsappCapabilityValuesRef.current.customersEnabled !== customersEnabled
    || whatsappCapabilityValuesRef.current.customerCreditEnabled !== customerCreditEnabled
  ) {
    whatsappCapabilityEpochRef.current += 1;
    whatsappCapabilityValuesRef.current = { whatsappEnabled, customersEnabled, customerCreditEnabled };
  }

  const aiEnabledRef = useRef(aiEnabled);
  const customersEnabledRef = useRef(customersEnabled);
  const whatsappEnabledRef = useRef(whatsappEnabled);
  const customerCreditEnabledRef = useRef(customerCreditEnabled);
  aiEnabledRef.current = aiEnabled;
  customersEnabledRef.current = customersEnabled;
  whatsappEnabledRef.current = whatsappEnabled;
  customerCreditEnabledRef.current = customerCreditEnabled;

  const workspaceRevisionRef = useRef(0);
  const workspaceGenerateSequenceRef = useRef(0);
  const workspaceGenerateOwnerRef = useRef<number | null>(null);
  const historyLoadGenerationRef = useRef(0);
  const whatsappSelectionRevisionRef = useRef(0);
  const suggestionGenerationRef = useRef(0);
  const rewriteGenerationRef = useRef(0);
  const dashboardAiApplyGenerationRef = useRef(0);
  const replyFeedbackSequenceRef = useRef(0);
  const replyFeedbackOwnerRef = useRef(0);
  const requestAiOperationSequenceRef = useRef(0);
  const requestAiOperationOwnersRef = useRef(new Map<string, { id: number; kind: "suggestion" | "rewrite" }>());
  const birthdayOperationGenerationRef = useRef(0);

  const surfaceAiWorkspaceMode: AiWorkspaceMode = customersEnabled ? aiWorkspaceMode : "daily";

  function invalidateWorkspaceGeneration() {
    workspaceRevisionRef.current += 1;
    if (workspaceGenerateOwnerRef.current !== null) {
      workspaceGenerateOwnerRef.current = null;
      setAiWorkspaceState("idle");
      setAiWorkspaceMessage("Çalışma bağlamı değişti; önceki AI sonucu bu alana uygulanmayacak.");
    }
  }

  function invalidateWhatsAppSelection() {
    whatsappSelectionRevisionRef.current += 1;
    rewriteGenerationRef.current += 1;
    setAiState("idle");
    setAiMessage("AI cevap taslağı hazır.");
  }

  function acquireRequestAiOperation(requestId: string, kind: "suggestion" | "rewrite") {
    if (requestAiOperationOwnersRef.current.has(requestId)) return null;
    const id = ++requestAiOperationSequenceRef.current;
    requestAiOperationOwnersRef.current.set(requestId, { id, kind });
    return id;
  }

  function releaseRequestAiOperation(requestId: string, id: number) {
    if (requestAiOperationOwnersRef.current.get(requestId)?.id === id) {
      requestAiOperationOwnersRef.current.delete(requestId);
    }
  }

  useEffect(() => {
    if (!messagesActive || !messagesAiOpen || !aiEnabled || !window.yardimciDesktop) return;
    const generation = ++historyLoadGenerationRef.current;
    const aiEpoch = aiCapabilityEpochRef.current;
    void window.yardimciDesktop.getAiWorkspaceHistory(16).then((history) => {
      if (
        generation !== historyLoadGenerationRef.current
        || aiEpoch !== aiCapabilityEpochRef.current
        || !aiEnabledRef.current
      ) return;
      setAiWorkspaceHistory(
        customersEnabledRef.current ? history : history.filter((entry) => !entry.requestId)
      );
    }).catch(() => {
      if (
        generation === historyLoadGenerationRef.current
        && aiEpoch === aiCapabilityEpochRef.current
        && aiEnabledRef.current
      ) {
        setAiWorkspaceMessage("AI geçmişi yüklenemedi.");
      }
    });
  }, [aiEnabled, messagesActive, messagesAiOpen]);

  useEffect(() => {
    if (messagesActive && aiEnabled && !whatsappEnabled) {
      setMessagesAiOpen(true);
    }
  }, [aiEnabled, messagesActive, whatsappEnabled]);

  useEffect(() => {
    if (aiEnabled) return;
    workspaceRevisionRef.current += 1;
    workspaceGenerateOwnerRef.current = null;
    historyLoadGenerationRef.current += 1;
    suggestionGenerationRef.current += 1;
    rewriteGenerationRef.current += 1;
    dashboardAiApplyGenerationRef.current += 1;
    replyFeedbackOwnerRef.current = ++replyFeedbackSequenceRef.current;
    requestAiOperationOwnersRef.current.clear();
    setSuggestingRequestId("");
    setAiState("idle");
    setAiMessage("AI bu işletmede etkin değil.");
    setAiWorkspaceMode("reply");
    setAiWorkspaceRequestId("");
    setAiWorkspaceInstructions("");
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceHistory([]);
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("AI bu işletmede etkin değil.");
    setMessagesAiOpen(false);
  }, [aiEnabled]);

  useEffect(() => {
    if (customersEnabled) return;
    workspaceRevisionRef.current += 1;
    workspaceGenerateOwnerRef.current = null;
    historyLoadGenerationRef.current += 1;
    suggestionGenerationRef.current += 1;
    rewriteGenerationRef.current += 1;
    dashboardAiApplyGenerationRef.current += 1;
    whatsappSelectionRevisionRef.current += 1;
    replyFeedbackOwnerRef.current = ++replyFeedbackSequenceRef.current;
    requestAiOperationOwnersRef.current.clear();
    setSelectedWhatsAppRequestIdState("");
    setPreparedWhatsAppMessage(null);
    setSuggestingRequestId("");
    setAiState("idle");
    setAiMessage("AI cevap taslağı hazır.");
    setAiWorkspaceMode("daily");
    setAiWorkspaceRequestId("");
    setAiWorkspaceInstructions("");
    setAiWorkspaceEntry((current) => current?.requestId ? null : current);
    setAiWorkspaceContent("");
    setAiWorkspaceHistory((current) => current.filter((entry) => !entry.requestId));
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Günlük işletme değerlendirmesi hazır.");
  }, [customersEnabled]);

  useEffect(() => {
    if (whatsappEnabled) return;
    whatsappSelectionRevisionRef.current += 1;
    rewriteGenerationRef.current += 1;
    birthdayOperationGenerationRef.current += 1;
    for (const [requestId, owner] of requestAiOperationOwnersRef.current) {
      if (owner.kind === "rewrite") requestAiOperationOwnersRef.current.delete(requestId);
    }
    setSelectedWhatsAppRequestIdState("");
    setPreparedWhatsAppMessage(null);
    setAiState("idle");
    setAiMessage("WhatsApp bu işletmede etkin değil.");
  }, [whatsappEnabled]);

  useEffect(() => {
    if (!customersEnabled) {
      if (aiWorkspaceRequestId) setAiWorkspaceRequestId("");
      return;
    }
    if (aiWorkspaceRequestId && dashboardData.requests.some((request) => request.id === aiWorkspaceRequestId)) {
      return;
    }
    workspaceRevisionRef.current += 1;
    workspaceGenerateOwnerRef.current = null;
    setAiWorkspaceRequestId(dashboardData.requests[0]?.id ?? "");
  }, [aiWorkspaceRequestId, customersEnabled, dashboardData.requests]);

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
    if (!aiEnabledRef.current || !customersEnabledRef.current) {
      setAiState("error");
      setAiMessage("AI bu işletmede etkin değil.");
      return;
    }
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setAiState("error");
      setAiMessage("AI cevabı alınamadı. Uygulamayı yeniden başlatın.");
      return;
    }

    const requestOwner = acquireRequestAiOperation(request.id, "suggestion");
    if (requestOwner === null) {
      setAiState("error");
      setAiMessage("Bu talep için başka bir AI işlemi devam ediyor.");
      return;
    }
    const generation = ++suggestionGenerationRef.current;
    const dashboardGeneration = ++dashboardAiApplyGenerationRef.current;
    const feedbackOwner = ++replyFeedbackSequenceRef.current;
    replyFeedbackOwnerRef.current = feedbackOwner;
    const selectionRevision = whatsappSelectionRevisionRef.current;
    const aiEpoch = aiCapabilityEpochRef.current;

    setSuggestingRequestId(request.id);
    setAiState("loading");
    setAiMessage(`${request.customer_name} için cevap taslağı hazırlanıyor...`);

    try {
      const result = await bridge.createOwnerReplySuggestion(request.id);
      const current = (
        generation === suggestionGenerationRef.current
        && aiEpoch === aiCapabilityEpochRef.current
        && aiEnabledRef.current
        && customersEnabledRef.current
      );
      if (!current) return;

      if (!result.ok) {
        if (replyFeedbackOwnerRef.current === feedbackOwner) {
          setAiState("error");
          setAiMessage(result.message);
        }
        return;
      }

      if (dashboardGeneration === dashboardAiApplyGenerationRef.current) {
        setDashboardData(result.dashboardData);
      }
      if (
        selectionRevision === whatsappSelectionRevisionRef.current
        && whatsappEnabledRef.current
      ) {
        whatsappSelectionRevisionRef.current += 1;
        setPreparedWhatsAppMessage(null);
        setSelectedWhatsAppRequestIdState(request.id);
      }
      if (replyFeedbackOwnerRef.current === feedbackOwner) {
        setAiState("success");
        setAiMessage(result.missingFields.length > 0 ? `${result.message} Eksik: ${result.missingFields.join(", ")}.` : result.message);
      }
    } finally {
      releaseRequestAiOperation(request.id, requestOwner);
      if (generation === suggestionGenerationRef.current) setSuggestingRequestId("");
    }
  }

  async function handleGenerateAiWorkspace() {
    if (!aiEnabledRef.current) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI bu işletmede etkin değil.");
      return;
    }
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI araçları hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }
    if (workspaceGenerateOwnerRef.current !== null) return;

    const generation = ++workspaceGenerateSequenceRef.current;
    const revision = workspaceRevisionRef.current;
    const aiEpoch = aiCapabilityEpochRef.current;
    const mode = customersEnabledRef.current ? aiWorkspaceMode : "daily";
    const requestId = mode === "daily" ? "" : aiWorkspaceRequestId;
    const instructions = aiWorkspaceInstructions;
    workspaceGenerateOwnerRef.current = generation;
    setAiWorkspaceState("loading");
    setAiWorkspaceMessage("AI sonucu hazırlanıyor...");

    try {
      const result = await bridge.generateAiWorkspace({ mode, requestId, instructions });
      const current = (
        workspaceGenerateOwnerRef.current === generation
        && revision === workspaceRevisionRef.current
        && aiEpoch === aiCapabilityEpochRef.current
        && aiEnabledRef.current
        && (mode === "daily" || customersEnabledRef.current)
      );
      if (!current) return;

      if (!result.ok) {
        setAiWorkspaceState("error");
        setAiWorkspaceMessage(result.message);
        return;
      }

      setAiWorkspaceEntry(result.entry);
      setAiWorkspaceContent(result.entry.content);
      setAiWorkspaceHistory((history) => [result.entry, ...history.filter((entry) => entry.id !== result.entry.id)].slice(0, 16));
      setAiWorkspaceState("success");
      setAiWorkspaceMessage(result.message);
    } catch {
      if (
        workspaceGenerateOwnerRef.current === generation
        && revision === workspaceRevisionRef.current
        && aiEpoch === aiCapabilityEpochRef.current
        && aiEnabledRef.current
      ) {
        setAiWorkspaceState("error");
        setAiWorkspaceMessage("AI sonucu hazırlanamadı.");
      }
    } finally {
      if (workspaceGenerateOwnerRef.current === generation) {
        workspaceGenerateOwnerRef.current = null;
      }
    }
  }

  async function persistAiWorkspaceResult() {
    if (!aiEnabledRef.current) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("AI bu işletmede etkin değil.");
      return false;
    }
    const bridge = window.yardimciDesktop;
    const entry = aiWorkspaceEntry;
    if (!bridge || !entry) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Önce bir AI sonucu hazırlayın.");
      return false;
    }

    const revision = workspaceRevisionRef.current;
    const aiEpoch = aiCapabilityEpochRef.current;
    const content = aiWorkspaceContent;
    const result = await bridge.saveAiWorkspaceResult({
      mode: entry.mode,
      requestId: entry.requestId,
      content,
      summary: entry.summary,
      missingFields: entry.missingFields
    });
    const current = (
      revision === workspaceRevisionRef.current
      && aiEpoch === aiCapabilityEpochRef.current
      && aiEnabledRef.current
      && (!entry.requestId || customersEnabledRef.current)
    );
    if (!current) return false;

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
    if (!whatsappEnabledRef.current || !customersEnabledRef.current) {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    const entry = aiWorkspaceEntry;
    if (!entry || entry.mode !== "reply") {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("WhatsApp için cevap taslağı türünde bir sonuç hazırlayın.");
      return;
    }
    const revision = workspaceRevisionRef.current;
    const whatsappEpoch = whatsappCapabilityEpochRef.current;
    if (await persistAiWorkspaceResult()) {
      if (
        revision !== workspaceRevisionRef.current
        || whatsappEpoch !== whatsappCapabilityEpochRef.current
        || !whatsappEnabledRef.current
        || !customersEnabledRef.current
      ) return;
      setSelectedWhatsAppRequestId(entry.requestId);
      onOpenMessages();
    }
  }

  function openAiTools(mode: AiWorkspaceMode, requestId = "", instructions = "") {
    if (!aiEnabledRef.current) {
      setStatusMessage("AI bu işletmede etkin değil.");
      return;
    }
    invalidateWorkspaceGeneration();
    const allowedMode = customersEnabledRef.current ? mode : "daily";
    setAiWorkspaceMode(allowedMode);
    setAiWorkspaceRequestId(customersEnabledRef.current ? requestId : "");
    setAiWorkspaceInstructions(instructions);
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("AI sonucunu hazırlamak için düğmeye basın.");
    setMessagesAiOpen(true);
    onOpenMessages();
  }

  async function handleRewriteWhatsAppMessage(instructions: string) {
    if (!whatsappEnabledRef.current || !aiEnabledRef.current || !customersEnabledRef.current) {
      setAiState("error");
      setAiMessage(!whatsappEnabledRef.current ? "WhatsApp bu işletmede etkin değil." : "AI bu işletmede etkin değil.");
      return;
    }
    const target = selectedWhatsAppRequest;
    const bridge = window.yardimciDesktop;
    if (!target || !bridge) {
      setAiState("error");
      setAiMessage("Mesajı yenilemek için bir müşteri talebi seçin.");
      return;
    }

    const requestOwner = acquireRequestAiOperation(target.id, "rewrite");
    if (requestOwner === null) {
      setAiState("error");
      setAiMessage("Bu talep için başka bir AI işlemi devam ediyor.");
      return;
    }
    const generation = ++rewriteGenerationRef.current;
    const dashboardGeneration = ++dashboardAiApplyGenerationRef.current;
    const feedbackOwner = ++replyFeedbackSequenceRef.current;
    replyFeedbackOwnerRef.current = feedbackOwner;
    const selectionRevision = whatsappSelectionRevisionRef.current;
    const workspaceRevision = workspaceRevisionRef.current;
    const aiEpoch = aiCapabilityEpochRef.current;
    const whatsappEpoch = whatsappCapabilityEpochRef.current;

    const operationCurrent = () => (
      generation === rewriteGenerationRef.current
      && selectionRevision === whatsappSelectionRevisionRef.current
      && aiEpoch === aiCapabilityEpochRef.current
      && whatsappEpoch === whatsappCapabilityEpochRef.current
      && aiEnabledRef.current
      && customersEnabledRef.current
      && whatsappEnabledRef.current
    );

    setAiState("loading");
    setAiMessage("Mesaj yeniden hazırlanıyor...");

    try {
      const result = await bridge.generateAiWorkspace({
        mode: "reply",
        requestId: target.id,
        instructions
      });
      if (!operationCurrent()) return;
      if (!result.ok) {
        if (replyFeedbackOwnerRef.current === feedbackOwner) {
          setAiState("error");
          setAiMessage("AI cevabı alınamadı. Biraz sonra tekrar deneyin.");
        }
        return;
      }

      const saveResult = await bridge.saveAiWorkspaceResult({
        mode: result.entry.mode,
        requestId: result.entry.requestId,
        content: result.entry.content,
        summary: result.entry.summary,
        missingFields: result.entry.missingFields
      });
      if (!operationCurrent()) return;
      if (!saveResult.ok) {
        if (replyFeedbackOwnerRef.current === feedbackOwner) {
          setAiState("error");
          setAiMessage(saveResult.message);
        }
        return;
      }

      if (dashboardGeneration === dashboardAiApplyGenerationRef.current) {
        setDashboardData(saveResult.dashboardData);
      }
      if (workspaceRevision === workspaceRevisionRef.current) {
        setAiWorkspaceMode("reply");
        setAiWorkspaceRequestId(target.id);
        setAiWorkspaceInstructions(instructions);
        setAiWorkspaceEntry(result.entry);
        setAiWorkspaceContent(result.entry.content);
        setAiWorkspaceHistory((history) => [result.entry, ...history.filter((entry) => entry.id !== result.entry.id)].slice(0, 16));
      }
      if (replyFeedbackOwnerRef.current === feedbackOwner) {
        setAiState("success");
        setAiMessage("Hazır mesaj yenilendi. Göndermeden önce kontrol edin.");
      }
    } catch {
      if (operationCurrent() && replyFeedbackOwnerRef.current === feedbackOwner) {
        setAiState("error");
        setAiMessage("AI cevabı alınamadı. Biraz sonra tekrar deneyin.");
      }
    } finally {
      releaseRequestAiOperation(target.id, requestOwner);
    }
  }

  function selectAiWorkspaceHistoryEntry(entry: AiWorkspaceHistoryEntry) {
    if (!customersEnabledRef.current && entry.mode !== "daily") {
      setAiWorkspaceState("error");
      setAiWorkspaceMessage("Müşteri odaklı AI çalışmaları bu işletmede etkin değil.");
      return;
    }
    invalidateWorkspaceGeneration();
    setAiWorkspaceMode(entry.mode);
    setAiWorkspaceRequestId(entry.requestId);
    setAiWorkspaceInstructions(entry.instructions);
    setAiWorkspaceEntry(entry);
    setAiWorkspaceContent(entry.content);
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Geçmiş sonuç açıldı; düzenleyip yeniden kullanabilirsiniz.");
  }

  function changeAiWorkspaceMode(mode: AiWorkspaceMode) {
    invalidateWorkspaceGeneration();
    setAiWorkspaceMode(customersEnabledRef.current ? mode : "daily");
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Yeni çalışma türü seçildi; sonucu hazırlayın.");
  }

  function changeAiWorkspaceRequest(requestId: string) {
    invalidateWorkspaceGeneration();
    setAiWorkspaceRequestId(customersEnabledRef.current ? requestId : "");
    setAiWorkspaceEntry(null);
    setAiWorkspaceContent("");
    setAiWorkspaceState("idle");
    setAiWorkspaceMessage("Talep seçildi; AI sonucunu hazırlayın.");
  }

  function changeAiWorkspaceInstructions(value: string) {
    invalidateWorkspaceGeneration();
    setAiWorkspaceInstructions(value);
  }

  function changeAiWorkspaceContent(value: string) {
    invalidateWorkspaceGeneration();
    setAiWorkspaceContent(value);
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
    setAiWorkspaceInstructions: changeAiWorkspaceInstructions,
    aiWorkspaceEntry,
    aiWorkspaceContent,
    setAiWorkspaceContent: changeAiWorkspaceContent,
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
