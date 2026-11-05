import type { SetupFormState } from "../../app/setup-model";

type AiPrerequisites = Pick<SetupFormState, "aiEnabled" | "aiModel" | "aiSttModel" | "aiApiKey" | "aiStoredApiKeyConfigured" | "aiGoogleCurl" | "clearAiApiKey">;

export function aiServiceBlockedReason(form: AiPrerequisites, aiCapability: boolean, model: "aiModel" | "aiSttModel" = "aiModel"): string | undefined {
  if (!aiCapability || !form.aiEnabled) return "AI Yardımcı kapalı";
  const credential = !form.clearAiApiKey && (form.aiStoredApiKeyConfigured || form.aiApiKey.trim() || form.aiGoogleCurl.trim());
  if (!form[model].trim() || !credential) return "AI modeli/bağlantısı eksik";
  return undefined;
}

export function translationBlockedReason(form: AiPrerequisites, canonical: AiPrerequisites, aiCapability: boolean): string | undefined {
  return aiServiceBlockedReason(form, aiCapability)
    ?? (aiServiceBlockedReason(canonical, aiCapability) ? "AI ayarlarını kaydedin" : undefined);
}

export function dictationBlockedReason(form: SetupFormState, canonical: SetupFormState, aiCapability: boolean,
  status: { ready: boolean; canTest: boolean } | null): string | undefined {
  const missing = aiServiceBlockedReason(form, aiCapability, "aiSttModel");
  if (missing) return missing;
  const fields = ["aiEnabled", "aiProvider", "aiService", "aiBaseUrl", "aiSttModel", "aiTimeoutSeconds"] as const;
  if (fields.some(key => form[key] !== canonical[key]) || form.aiApiKey.trim() || form.aiGoogleCurl.trim() || form.clearAiApiKey) return "AI konuşma ayarlarını kaydedin";
  // Verification belongs inside this dialog: an untested, testable config must open.
  if (!status) return "AI durumu bekleniyor";
  if (!status.ready && !status.canTest) return "AI modeli/bağlantısı eksik";
  return undefined;
}

export function whatsappBlockedReason(phone: string, savedPhone = phone): string | undefined {
  if (!/\d/.test(phone.trim())) return "WhatsApp numarası eksik";
  return /\d/.test(savedPhone.trim()) ? undefined : "WhatsApp numarasını kaydedin";
}

export function whatsappBusinessConfigured(draft: SetupFormState["whatsappCloud"]): boolean {
  return Boolean(draft.wabaId.trim() && draft.phoneNumberId.trim()
    && !draft.clearAccessToken && (draft.accessToken?.trim() || draft.hasSecret));
}
