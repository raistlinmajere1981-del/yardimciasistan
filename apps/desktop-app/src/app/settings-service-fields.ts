import type { SetupFormState } from './setup-model';

/** Persistence owners, independent of page presentation and search grouping. */
export const serviceSettingsFields = {
  'settings-ai': ['aiEnabled', 'aiProvider', 'aiService', 'aiProjectName', 'aiGoogleCurl', 'aiBaseUrl', 'aiModel', 'aiVisionModel', 'aiImageModel', 'aiSttModel', 'aiModelOptions', 'aiApiKey', 'aiStoredApiKeyConfigured', 'clearAiApiKey', 'aiTimeoutSeconds', 'aiServiceDrafts'],
  'settings-whatsapp': ['whatsappEnabled', 'birthdaySettings'],
  'settings-android': ['androidEnabled', 'localNetworkEnabled'],
  'settings-product-data': ['productDataEnabled', 'productDataAutoSearch', 'productDataIncludeImages'],
  'settings-marketing-sms': ['sms'],
  'settings-marketing-instagram': ['instagram'],
  'settings-whatsapp-business': ['whatsappCloud'],
  'settings-dealer-portal': ['dealerPortalEnabled', 'dealerApplicationEnabled'],
  'settings-online-delivery': ['onlineSalesDeliveryEnabled', 'onlineSalesDelivery', 'arasShipping']
} as const satisfies Record<string, readonly (keyof SetupFormState)[]>;
export type SetupServiceId = keyof typeof serviceSettingsFields;
export function isSetupServiceId(id: string): id is SetupServiceId {
  return Object.prototype.hasOwnProperty.call(serviceSettingsFields, id);
}
export function copySettingsFields(target: SetupFormState, source: SetupFormState, fields: readonly (keyof SetupFormState)[]): SetupFormState {
  return { ...target, ...Object.fromEntries(fields.map(key => [key, source[key]])) };
}
export function settingsFieldsDirty(draft: SetupFormState, baseline: SetupFormState, fields: readonly (keyof SetupFormState)[]) {
  return fields.some(key => JSON.stringify(draft[key]) !== JSON.stringify(baseline[key]));
}

export function serviceActivation(form: SetupFormState, id: SetupServiceId): boolean {
  switch (id) {
    case 'settings-ai': return form.aiEnabled;
    case 'settings-whatsapp': return form.whatsappEnabled;
    case 'settings-android': return form.androidEnabled;
    case 'settings-product-data': return form.productDataEnabled;
    case 'settings-marketing-sms': return form.sms.enabled;
    case 'settings-marketing-instagram': return form.instagram.enabled;
    case 'settings-whatsapp-business': return form.whatsappCloud.enabled;
    case 'settings-dealer-portal': return form.dealerPortalEnabled;
    case 'settings-online-delivery': return form.onlineSalesDeliveryEnabled;
  }
}
