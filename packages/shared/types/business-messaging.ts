/** D-035: a delivery intent, never a Customer/Order state. */
export type BusinessMessagingProviderId = "whatsapp_cloud" | "iletimerkezi";
export type BusinessMessageStatus = "draft" | "queued" | "accepted" | "delivered" | "read" | "failed" | "cancelled";
export interface BusinessMessage {
  id: string; businessId: string; customerId?: string;
  purpose?: "operational" | "marketing"; campaignId?: string; campaignRecipientId?: string;
  relatedEntityType?: string; relatedEntityId?: string;
  providerId: BusinessMessagingProviderId; recipient: string;
  messageKind: "template" | "session" | "text";
  templateName: string; templateLanguage: string; providerMessageId: string;
  status: BusinessMessageStatus; failureCode: string; failureMessage: string;
  createdAt: string; acceptedAt: string; deliveredAt: string; readAt: string; failedAt: string;
}
export interface BusinessTemplateComponent {
  type: "header" | "body" | "button"; index?: number;
  text: string; parameters: string[];
}
export interface BusinessMessageTemplate {
  name: string; language: string; category: string; status: "APPROVED";
  components: BusinessTemplateComponent[]; supported: boolean;
}
export interface BusinessTemplateIntentInput {
  customerId: string; templateName: string; templateLanguage: string;
  /** Ordered by catalog component, then catalog parameter. Never logged. */
  parameters: string[][];
}
export interface BusinessMessagingConnectionResult {
  ok: boolean; providerId: BusinessMessagingProviderId; displayPhoneNumber?: string; message: string; testedAt: string;
}
export interface WhatsAppCloudConfigurationInput {
  enabled: boolean; wabaId: string; phoneNumberId: string; accessToken?: string; clearAccessToken?: boolean;
}
export interface WhatsAppCloudConfiguration {
  providerId: BusinessMessagingProviderId; enabled: boolean; wabaId: string; phoneNumberId: string;
  hasSecret: boolean; configured: boolean;
}
export const emptyWhatsAppCloudConfiguration = (): WhatsAppCloudConfiguration => ({
  providerId: "whatsapp_cloud", enabled: false, wabaId: "", phoneNumberId: "", hasSecret: false, configured: false
});
export interface BusinessMessagingProviderAdapter {
  readonly providerId: BusinessMessagingProviderId;
  testConnection(): Promise<{ displayPhoneNumber?: string }>;
  listTemplates(): Promise<BusinessMessageTemplate[]>;
  sendTemplateMessage(input: { message: BusinessMessage; template: BusinessMessageTemplate; parameters: string[][] }): Promise<{ providerMessageId: string }>;
}
export type BusinessMessagingResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export interface BusinessMessagingBridge {
  getBusinessMessagingConfiguration(): Promise<WhatsAppCloudConfiguration>;
  testBusinessMessagingConnection(input?: WhatsAppCloudConfigurationInput): Promise<BusinessMessagingConnectionResult>;
  listBusinessMessagingTemplates(): Promise<BusinessMessagingResult<BusinessMessageTemplate[]>>;
  prepareBusinessTemplateMessage(input: BusinessTemplateIntentInput): Promise<BusinessMessagingResult<BusinessMessage>>;
  sendBusinessTemplateMessage(id: string, parameters: string[][]): Promise<BusinessMessagingResult<BusinessMessage>>;
  getBusinessMessage(id: string): Promise<BusinessMessagingResult<BusinessMessage>>;
  onBusinessMessagingChanged(listener: () => void): () => void;
}
