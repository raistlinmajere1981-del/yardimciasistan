import type { EgmKbsWebviewDriver } from "./egm-kbs-webview-driver.js";
import {
  classifyJandarmaOperationResult,
  prepareJandarmaArrival,
  selectJandarmaOperation,
  type JandarmaOperationResult,
  type KbsDeliveryInput,
  type KbsDeliveryResult,
  type KbsProviderAdapter
} from "./kbs-provider-adapter.js";

export class EgmKbsProviderAdapter implements KbsProviderAdapter {
  readonly provider = "egm" as const;

  constructor(private readonly driver: EgmKbsWebviewDriver) {}

  async send(_input: KbsDeliveryInput): Promise<KbsDeliveryResult> {
    const session = await this.driver.inspect();

    if (session.state === "authenticated") {
      return {
        ok: false,
        state: "waiting",
        provider: this.provider,
        retryable: true,
        code: "egm_submission_contract_unverified",
        message: "EGM KBS oturumu açık. Bildirim formunun son otomasyon adımı gerçek tesis hesabıyla doğrulanmadan gönderim yapılmayacak."
      };
    }

    if (session.state === "login_required" || session.state === "otp_required" || session.state === "credentials_submitted") {
      return {
        ok: false,
        state: "interaction_required",
        provider: this.provider,
        retryable: true,
        code: "egm_login_required",
        message: session.state === "otp_required"
          ? "EGMSEC geçici şifresi gerekli. KBS oturumunu açıp doğrulamayı tamamlayın."
          : "EGM KBS oturumu açık değil. KBS oturumunu açıp giriş işlemini tamamlayın."
      };
    }

    return {
      ok: false,
      state: "interaction_required",
      provider: this.provider,
      retryable: true,
      code: "egm_session_unavailable",
      message: session.message || "EGM KBS web oturumu kullanılamıyor."
    };
  }
}

interface JandarmaKbsTransport {
  send(operation: string, input: KbsDeliveryInput): Promise<JandarmaOperationResult>;
}

export class JandarmaKbsProviderAdapter implements KbsProviderAdapter {
  readonly provider = "jandarma" as const;

  constructor(private readonly transport?: JandarmaKbsTransport) {}

  async send(input: KbsDeliveryInput): Promise<KbsDeliveryResult> {
    const selected = selectJandarmaOperation(input);
    if (!selected.ok) {
      return {
        ok: false,
        state: "waiting",
        provider: this.provider,
        retryable: false,
        code: "jandarma_payload_invalid",
        message: selected.message
      };
    }

    if (selected.selection.operation === "MusteriKimlikNoGiris") {
      const prepared = prepareJandarmaArrival(input);
      if (!prepared.ok) {
        return {
          ok: false,
          state: "waiting",
          provider: this.provider,
          retryable: prepared.path !== "invalid",
          code: prepared.path === "foreign_document"
            ? "jandarma_foreign_document_binding_pending"
            : "jandarma_payload_invalid",
          message: prepared.message
        };
      }
    }

    if (!this.transport) {
      return {
        ok: false,
        state: "waiting",
        provider: this.provider,
        retryable: true,
        code: "jandarma_soap_binding_unverified",
        message: `Jandarma KBS ${selected.selection.operation} verisi hazır. SOAP action/namespace gerçek WSDL ile doğrulanmadan canlı gönderim yapılmayacak.`
      };
    }

    const result = await this.transport.send(selected.selection.operation, input);
    return classifyJandarmaOperationResult(result, input.notificationId);
  }
}
