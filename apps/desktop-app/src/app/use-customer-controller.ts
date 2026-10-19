import { observeNexaAi } from "./nexa-activity";
import { useConfirmDialog } from "../components/ui/useConfirmDialog";
import { useRequestGeneration } from "../components/workspace/use-request-generation";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type {
  CreateManualRequestInput,
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  SaveCustomerInput
} from "../../electron/database";
import { initialManualRequestForm, type ManualRequestFormState } from "./request-model";
import type { SyncState } from "./runtime-state";

interface UseCustomerControllerOptions {
  dashboardData: DesktopDashboardData;
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  selectedWhatsAppRequestId: string;
  setSelectedWhatsAppRequestId: Dispatch<SetStateAction<string>>;
}

export function useCustomerController({
  dashboardData,
  setDashboardData,
  setSyncState,
  setStatusMessage,
  selectedWhatsAppRequestId,
  setSelectedWhatsAppRequestId
}: UseCustomerControllerOptions) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const beginIdentityAnalysis = useRequestGeneration();
  const [manualRequestForm, setManualRequestForm] = useState<ManualRequestFormState>(initialManualRequestForm);
  const [manualRequestState, setManualRequestState] = useState<SyncState>("idle");
  const [manualRequestMessage, setManualRequestMessage] = useState("Telefonla veya yüz yüze gelen talebi kaydedin.");
  const [selectedRequestId, setSelectedRequestId] = useState(dashboardData.requests[0]?.id ?? "");
  const [convertingRequestId, setConvertingRequestId] = useState("");

  const selectedRequest = useMemo(
    () => dashboardData.requests.find((request) => request.id === selectedRequestId) ?? dashboardData.requests[0],
    [dashboardData.requests, selectedRequestId]
  );

  async function handleCreateManualRequest() {
    setManualRequestState("loading");
    setManualRequestMessage("");
    setSyncState("loading");
    setStatusMessage("Manuel talep kaydediliyor...");

    if (!window.yardimciDesktop) {
      setManualRequestState("error");
      setManualRequestMessage("");
      setSyncState("error");
      setStatusMessage("Talep kaydı hazır değil. Uygulamayı yeniden başlatın.");
      return false;
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
      setManualRequestMessage("");
      setSyncState("error");
      setStatusMessage(result.message);
      return false;
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
    setManualRequestMessage("");
    setSyncState("success");
    setStatusMessage(result.message);
    return true;
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
    if (!window.yardimciDesktop || !(await confirm({ title: "Silme onayı", description: `${request.customer_name} adına kayıtlı talep ve bağlı hazır mesaj silinsin mi?`, tone: "danger", confirmLabel: "Sil" }))) {
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
    if (!window.yardimciDesktop || !(await confirm({ title: "Silme onayı", description: `${customer.fullName} müşteri kaydı silinsin mi?`, tone: "danger", confirmLabel: "Sil" }))) {
      return;
    }

    setSyncState("loading");
    setStatusMessage("Müşteri siliniyor...");
    try {
      const result = await window.yardimciDesktop.deleteCustomer(customer.id);
      if (!result.ok) {
        setSyncState("error");
        setStatusMessage(result.message);
        return result;
      }

      setDashboardData(result.dashboardData);
      setSyncState("success");
      setStatusMessage(result.message);
      return result;
    } catch {
      const result = { ok: false as const, message: "Müşteri silinemedi. Yeniden deneyin." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }
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

  async function handleAnalyzeIdentityImage(file: File, isFormCurrent: () => boolean = () => true): Promise<DesktopIdentityImageAnalyzeResult> {
    const requestIsCurrent = beginIdentityAnalysis();
    const isCurrent = () => requestIsCurrent() && isFormCurrent();
    if (!window.yardimciDesktop) {
      return { ok: false, message: "Kimlik görseli analizi kullanılamıyor." };
    }
    setSyncState("loading");
    setStatusMessage("Kimlik görseli AI ile okunuyor...");
    let result: DesktopIdentityImageAnalyzeResult;
    try {
      result = await observeNexaAi(async () => window.yardimciDesktop!.analyzeIdentityImage({
        fileName: file.name,
        mimeType: file.type,
        bytes: await file.arrayBuffer()
      }), "response", isCurrent);
    } catch {
      result = { ok: false, code: "image_unreadable", message: "Kimlik görseli okunamadı." };
    }
    if (isCurrent()) {
      setSyncState(result.ok ? "success" : "error");
      setStatusMessage(result.message);
    }
    return result;
  }

  return {
    confirmDialog,
    manualRequestForm,
    setManualRequestForm,
    manualRequestState,
    manualRequestMessage,
    selectedRequestId,
    setSelectedRequestId,
    selectedRequest,
    convertingRequestId,
    handleCreateManualRequest,
    handleConvertRequestToReservation,
    handleUpdateRequestStatus,
    handleDeleteRequest,
    handleDeleteCustomer,
    handleSaveCustomer,
    handleAnalyzeIdentityImage
  };
}
