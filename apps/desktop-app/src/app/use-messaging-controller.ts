import { useConfirmDialog } from "../components/ui/useConfirmDialog";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  createWhatsAppUrl,
  createWhatsAppWebUrl,
  type WhatsAppAction
} from "@yardimci-asistan/whatsapp-bridge";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../electron/database";
import { buildReservationWhatsAppMessage } from "./reservation-messaging";
import type { SyncState } from "./runtime-state";
import type { PreparedWhatsAppMessage } from "./whatsapp-handoff";

interface UseMessagingControllerOptions {
  dashboardData: DesktopDashboardData;
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  aiEnabled: boolean;
  customersEnabled: boolean;
  whatsappEnabled: boolean;
  customerCreditEnabled?: boolean;
  onOpenCustomerMessages: () => void;
}

export function useMessagingController({
  dashboardData,
  setDashboardData,
  setSyncState,
  setStatusMessage,
  aiEnabled,
  customersEnabled,
  whatsappEnabled,
  customerCreditEnabled = false,
  onOpenCustomerMessages
}: UseMessagingControllerOptions) {
  const { confirm, confirmDialog } = useConfirmDialog();
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
    onOpenCustomerMessages();
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
    birthdayOperationOwnerRef.current = generation;
    setBirthdayPreparingId(customerId);
    try {
      await prepareBirthdayWhatsAppInternal(customerId, generation, whatsappEpoch);
    } finally {
      if (birthdayOperationOwnerRef.current === generation) {
        birthdayOperationOwnerRef.current = null;
        setBirthdayPreparingId("");
      }
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
      if (
        generation !== birthdayOperationGenerationRef.current
        || whatsappEpoch !== whatsappCapabilityEpochRef.current
        || !customersEnabledRef.current
        || !whatsappEnabledRef.current
      ) return;
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
      if (
        generation !== birthdayOperationGenerationRef.current
        || whatsappEpoch !== whatsappCapabilityEpochRef.current
        || !customersEnabledRef.current
        || !whatsappEnabledRef.current
      ) return;
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

    await handleBirthdayAction(
      result.action,
      result.candidate,
      () => generation === birthdayOperationGenerationRef.current
        && whatsappEpoch === whatsappCapabilityEpochRef.current
        && customersEnabledRef.current
        && whatsappEnabledRef.current
    );
    if (
      generation === birthdayOperationGenerationRef.current
      && whatsappEpoch === whatsappCapabilityEpochRef.current
      && customersEnabledRef.current
      && whatsappEnabledRef.current
    ) setSyncState("success");
  }

  async function handleBirthdayAction(
    action: Extract<WhatsAppAction, { ok: true }>,
    candidate: { customerId: string; customerName: string; phone: string; message: string },
    canContinue: () => boolean
  ) {
    if (!canContinue()) return;
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
        if (!canContinue()) return;
        setStatusMessage("Mesaj hazırlandı ve panoya kopyalandı; gönderim sizin kontrolünüzde.");
      } catch {
        if (!canContinue()) return;
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
      if (!canContinue()) return;
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

  const aiCapabilityValuesRef = useRef({ aiEnabled, customersEnabled });
  const aiCapabilityEpochRef = useRef(0);
  if (
    aiCapabilityValuesRef.current.aiEnabled !== aiEnabled
    || aiCapabilityValuesRef.current.customersEnabled !== customersEnabled
  ) {
    aiCapabilityEpochRef.current += 1;
    aiCapabilityValuesRef.current = { aiEnabled, customersEnabled };
  }

  const whatsappCapabilityValuesRef = useRef({ whatsappEnabled, customersEnabled });
  const whatsappCapabilityEpochRef = useRef(0);
  if (
    whatsappCapabilityValuesRef.current.whatsappEnabled !== whatsappEnabled
    || whatsappCapabilityValuesRef.current.customersEnabled !== customersEnabled
  ) {
    whatsappCapabilityEpochRef.current += 1;
    whatsappCapabilityValuesRef.current = { whatsappEnabled, customersEnabled };
  }

  const aiEnabledRef = useRef(aiEnabled);
  const customersEnabledRef = useRef(customersEnabled);
  const whatsappEnabledRef = useRef(whatsappEnabled);
  const customerCreditEnabledRef = useRef(customerCreditEnabled);
  aiEnabledRef.current = aiEnabled;
  customersEnabledRef.current = customersEnabled;
  whatsappEnabledRef.current = whatsappEnabled;
  customerCreditEnabledRef.current = customerCreditEnabled;

  const whatsappSelectionRevisionRef = useRef(0);
  const suggestionGenerationRef = useRef(0);
  const rewriteGenerationRef = useRef(0);
  const dashboardAiApplyGenerationRef = useRef(0);
  const replyFeedbackSequenceRef = useRef(0);
  const replyFeedbackOwnerRef = useRef(0);
  const requestAiOperationSequenceRef = useRef(0);
  const requestAiOperationOwnersRef = useRef(new Map<string, { id: number; kind: "suggestion" | "rewrite" }>());
  const birthdayOperationGenerationRef = useRef(0);
  const birthdayOperationOwnerRef = useRef<number | null>(null);

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
    if (aiEnabled) return;
    suggestionGenerationRef.current += 1;
    rewriteGenerationRef.current += 1;
    dashboardAiApplyGenerationRef.current += 1;
    replyFeedbackOwnerRef.current = ++replyFeedbackSequenceRef.current;
    requestAiOperationOwnersRef.current.clear();
    setSuggestingRequestId("");
    setAiState("idle");
    setAiMessage("AI bu işletmede etkin değil.");
  }, [aiEnabled]);

  useEffect(() => {
    if (customersEnabled) return;
    const birthdayWasActive = birthdayOperationOwnerRef.current !== null;
    birthdayOperationGenerationRef.current += 1;
    birthdayOperationOwnerRef.current = null;
    if (birthdayWasActive) {
      setBirthdayPreparingId("");
      setSyncState("idle");
      setStatusMessage("Müşteri yönetimi kapatıldığı için doğum günü mesajı hazırlığı durduruldu.");
    }
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
  }, [customersEnabled]);

  useEffect(() => {
    if (whatsappEnabled) return;
    const birthdayWasActive = birthdayOperationOwnerRef.current !== null;
    whatsappSelectionRevisionRef.current += 1;
    birthdayOperationGenerationRef.current += 1;
    birthdayOperationOwnerRef.current = null;
    if (birthdayWasActive) {
      setBirthdayPreparingId("");
      setSyncState("idle");
      setStatusMessage("WhatsApp kapatıldığı için doğum günü mesajı hazırlığı durduruldu.");
    }
    setSelectedWhatsAppRequestIdState("");
    setPreparedWhatsAppMessage(null);
  }, [whatsappEnabled]);

  const preparedWhatsAppRecords = dashboardData.preparedWhatsAppMessages ?? [];

  const readyWhatsAppRequestIds = useMemo(
    () => new Set(
      customersEnabled && whatsappEnabled
        ? preparedWhatsAppRecords
          .map((message) => message.requestId)
          .filter(Boolean)
        : []
    ),
    [customersEnabled, preparedWhatsAppRecords, whatsappEnabled]
  );

  const readyWhatsAppRequests = useMemo(
    () => dashboardData.requests.filter((request) => readyWhatsAppRequestIds.has(request.id)),
    [dashboardData.requests, readyWhatsAppRequestIds]
  );

  const selectedWhatsAppRequest = useMemo(
    () => {
      if (!customersEnabled || surfacePreparedWhatsAppMessage) return undefined;
      const explicitlySelected = readyWhatsAppRequestIds.has(selectedWhatsAppRequestId)
        ? dashboardData.requests.find((request) => request.id === selectedWhatsAppRequestId)
        : undefined;
      return explicitlySelected ?? readyWhatsAppRequests[0];
    },
    [customersEnabled, dashboardData.requests, readyWhatsAppRequestIds, readyWhatsAppRequests, selectedWhatsAppRequestId, surfacePreparedWhatsAppMessage]
  );

  const selectedPreparedWhatsAppRecord = useMemo(
    () => selectedWhatsAppRequest
      ? preparedWhatsAppRecords.find((message) => message.requestId === selectedWhatsAppRequest.id)
      : undefined,
    [preparedWhatsAppRecords, selectedWhatsAppRequest]
  );

  const selectedWhatsAppMessage = useMemo(
    () => surfacePreparedWhatsAppMessage
      ? surfacePreparedWhatsAppMessage.message
      : selectedPreparedWhatsAppRecord?.message ?? "",
    [selectedPreparedWhatsAppRecord, surfacePreparedWhatsAppMessage]
  );

  const selectedWhatsAppUrl = useMemo(
    () => surfacePreparedWhatsAppMessage ? createWhatsAppWebUrl(surfacePreparedWhatsAppMessage.phone, surfacePreparedWhatsAppMessage.message) : customersEnabled && whatsappEnabled && selectedWhatsAppRequest
      ? createWhatsAppWebUrl(selectedWhatsAppRequest.customer_phone, selectedWhatsAppMessage)
      : "",
    [customersEnabled, selectedWhatsAppMessage, selectedWhatsAppRequest, whatsappEnabled, surfacePreparedWhatsAppMessage]
  );

  function openWhatsApp(request: SyncedCustomerRequest) {
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    setSelectedWhatsAppRequestId(request.id);
    onOpenCustomerMessages();
  }

  function callCustomer(request: SyncedCustomerRequest) {
    void window.yardimciDesktop?.openExternal(`tel:${request.customer_phone}`);
  }

  function callCustomerRecord(customer: DesktopDashboardData["customers"][number]) {
    void window.yardimciDesktop?.openExternal(`tel:${customer.phone}`);
  }

  function openCustomerWhatsApp(customer: DesktopDashboardData["customers"][number]) {
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
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
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
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
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
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
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
      return { ok: false as const, message: "WhatsApp bu işletmede etkin değil." };
    }
    if (!window.yardimciDesktop) {
      return {
        ok: false as const,
        message: "Gönderim kaydı hazır değil. Uygulamayı yeniden başlatın."
      };
    }

    const whatsappEpoch = whatsappCapabilityEpochRef.current;
    const result = await window.yardimciDesktop.markWhatsAppMessageSent({ requestId, message });
    if (
      result.ok
      && whatsappEpoch === whatsappCapabilityEpochRef.current
      && customersEnabledRef.current
      && whatsappEnabledRef.current
    ) {
      setDashboardData(result.dashboardData);
    }
    return result;
  }

  async function handleDeleteWhatsAppMessage(request: SyncedCustomerRequest) {
    if (!customersEnabledRef.current || !whatsappEnabledRef.current) {
      setStatusMessage("WhatsApp bu işletmede etkin değil.");
      return;
    }
    if (!window.yardimciDesktop || !(await confirm({ title: "Silme onayı", description: `${request.customer_name} için hazırlanmış mesaj silinsin mi? Talep kaydı korunur.`, tone: "danger", confirmLabel: "Sil" }))) {
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

  async function handleRewriteRequestReply(request: SyncedCustomerRequest, instructions: string) {
    if (!aiEnabledRef.current || !customersEnabledRef.current) {
      setAiState("error");
      setAiMessage("AI bu işletmede etkin değil.");
      return;
    }
    const bridge = window.yardimciDesktop;
    if (!bridge?.rewriteOwnerReplySuggestion) {
      setAiState("error");
      setAiMessage("Mesajı yenileme aracı hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const requestOwner = acquireRequestAiOperation(request.id, "rewrite");
    if (requestOwner === null) {
      setAiState("error");
      setAiMessage("Bu talep için başka bir AI işlemi devam ediyor.");
      return;
    }

    const generation = ++rewriteGenerationRef.current;
    const dashboardGeneration = ++dashboardAiApplyGenerationRef.current;
    const feedbackOwner = ++replyFeedbackSequenceRef.current;
    replyFeedbackOwnerRef.current = feedbackOwner;
    const aiEpoch = aiCapabilityEpochRef.current;

    const operationCurrent = () => (
      generation === rewriteGenerationRef.current
      && aiEpoch === aiCapabilityEpochRef.current
      && aiEnabledRef.current
      && customersEnabledRef.current
    );

    setAiState("loading");
    setAiMessage("Mesaj yeniden hazırlanıyor...");

    try {
      const result = await bridge.rewriteOwnerReplySuggestion({
        requestId: request.id,
        instructions
      });
      if (!operationCurrent()) return;
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
      if (replyFeedbackOwnerRef.current === feedbackOwner) {
        setAiState("success");
        setAiMessage(result.missingFields.length > 0
          ? `${result.message} Eksik: ${result.missingFields.join(", ")}.`
          : "Cevap taslağı yenilendi. Göndermeden önce kontrol edin.");
      }
    } catch {
      if (operationCurrent() && replyFeedbackOwnerRef.current === feedbackOwner) {
        setAiState("error");
        setAiMessage("AI cevabı alınamadı. Biraz sonra tekrar deneyin.");
      }
    } finally {
      releaseRequestAiOperation(request.id, requestOwner);
    }
  }

  return {
    confirmDialog,
    preparedWhatsAppMessage: surfacePreparedWhatsAppMessage,
    openPreparedCreditWhatsApp,
    prepareBirthdayWhatsApp,
    birthdayPreparingId,
    selectedWhatsAppRequestId,
    setSelectedWhatsAppRequestId,
    readyWhatsAppRequests,
    selectedWhatsAppRequest,
    selectedWhatsAppMessage,
    selectedWhatsAppUrl,
    suggestingRequestId,
    aiState,
    aiMessage,
    openWhatsApp,
    callCustomer,
    callCustomerRecord,
    openCustomerWhatsApp,
    openReservationWhatsApp,
    openSelectedWhatsAppExternal,
    handleWhatsAppMessageSent,
    handleDeleteWhatsAppMessage,
    handleCreateOwnerReplySuggestion,
    handleRewriteRequestReply,
  };
}
