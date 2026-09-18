export function createSmokeSetupInput(overrides) {
  return {
    profileId: "pension_restaurant",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    autoSyncEnabled: false,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    ...overrides
  };
}
