export type GoogleAiStudioCurlParseResult =
  | { ok: true; baseUrl: string; model: string; apiKey: string }
  | { ok: false; message: string };

const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function parseGoogleAiStudioCurl(value: string): GoogleAiStudioCurlParseResult {
  const candidate = value.trim();
  if (!candidate) {
    return { ok: false, message: "Google AI Studio API anahtarını veya cURL komutunu yapıştırın." };
  }

  if (!/\bcurl\b/i.test(candidate)) {
    if (isApiKeyPlaceholder(candidate)) {
      return placeholderError();
    }
    if (/\s/.test(candidate) || candidate.length < 16) {
      return { ok: false, message: "Geçerli bir Google AI Studio API anahtarı veya cURL komutu girin." };
    }
    return {
      ok: true,
      baseUrl: GOOGLE_AI_STUDIO_BASE_URL,
      model: "",
      apiKey: candidate
    };
  }

  const urlMatch = candidate.match(
    /https:\/\/generativelanguage\.googleapis\.com\/v1(?:beta)?\/(?:models\/([^\s"'\\:]+):generateContent|interactions)\b/i
  );
  if (!urlMatch) {
    return { ok: false, message: "cURL komutunda geçerli Google Gemini API adresi bulunamadı." };
  }

  const headerKey = candidate.match(/x-goog-api-key\s*:\s*["']?([^\s"'\\]+)/i)?.[1]?.trim() ?? "";
  const queryKey = candidate.match(/[?&]key=([^\s"'\\&]+)/i)?.[1]?.trim() ?? "";
  const envKey = candidate.match(/(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*["']?([^\s"'\\;]+)/i)?.[1]?.trim() ?? "";
  const apiKey = envKey || headerKey || queryKey;

  if (!apiKey) {
    return { ok: false, message: "cURL komutunda Google AI Studio API anahtarı bulunamadı." };
  }
  if (isApiKeyPlaceholder(apiKey)) {
    return placeholderError();
  }

  const endpoint = new URL(urlMatch[0]);
  const modelsIndex = endpoint.pathname.indexOf("/models/");
  const interactionsIndex = endpoint.pathname.lastIndexOf("/interactions");
  const basePath = modelsIndex >= 0
    ? endpoint.pathname.slice(0, modelsIndex)
    : interactionsIndex >= 0
      ? endpoint.pathname.slice(0, interactionsIndex)
      : "/v1beta";
  const bodyModel = candidate.match(/["']model["']\s*:\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";

  return {
    ok: true,
    baseUrl: `${endpoint.origin}${basePath}`,
    model: decodeURIComponent(urlMatch[1] ?? bodyModel).replace(/^models\//, ""),
    apiKey
  };
}

function isApiKeyPlaceholder(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/^\$\{?|\}$/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .toUpperCase();
  return normalized === "GEMINI_API_KEY"
    || normalized === "GOOGLE_API_KEY"
    || normalized === "YOUR_API_KEY"
    || normalized === "YOUR_API_KEY_HERE"
    || normalized === "API_KEY";
}

function placeholderError(): GoogleAiStudioCurlParseResult {
  return {
    ok: false,
    message: "Yapıştırılan cURL gerçek anahtar yerine GEMINI_API_KEY gibi bir yer tutucu içeriyor. Google AI Studio → API Keys ekranından anahtarın kendisini kopyalayıp bu alana yapıştırın."
  };
}
