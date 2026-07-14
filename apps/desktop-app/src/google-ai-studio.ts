export type GoogleAiStudioCurlParseResult =
  | { ok: true; baseUrl: string; model: string; apiKey: string }
  | { ok: false; message: string };

export function parseGoogleAiStudioCurl(value: string): GoogleAiStudioCurlParseResult {
  const command = value.trim();
  if (!command) {
    return { ok: false, message: "Google AI Studio cURL komutunu yapıştırın." };
  }

  const urlMatch = command.match(/https:\/\/generativelanguage\.googleapis\.com\/v1(?:beta)?\/models\/([^\s"'\\:]+):generateContent/i);
  const keyMatch = command.match(/x-goog-api-key\s*:\s*["']?([^\s"'\\]+)/i);
  if (!urlMatch) {
    return { ok: false, message: "cURL komutunda geçerli Google generateContent adresi bulunamadı." };
  }
  if (!keyMatch?.[1]) {
    return { ok: false, message: "cURL komutunda X-goog-api-key başlığı bulunamadı." };
  }

  const endpoint = new URL(urlMatch[0]);
  const modelsIndex = endpoint.pathname.indexOf("/models/");
  return {
    ok: true,
    baseUrl: `${endpoint.origin}${endpoint.pathname.slice(0, modelsIndex)}`,
    model: decodeURIComponent(urlMatch[1]),
    apiKey: keyMatch[1].trim()
  };
}
