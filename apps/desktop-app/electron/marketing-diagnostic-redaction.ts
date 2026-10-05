/** Defense in depth for D5 diagnostics and support export, never provider transport. */
export function isMarketingDiagnosticSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[_ -]/g, "").toLowerCase();
  return /^(?:key|hash|apihash|recipient|recipients|receipents|caption|text|smstext|messagebody|body|request|requestbody|response|responsebody|rawresponse|providerresponse|rawproviderresponse|imageurl|mediaurl|stagedurl|stageurl|stagepath|query|querystring)$/.test(normalized);
}

export function redactMarketingDiagnosticText(value: string): string {
  return value
    .replace(/(?:https?(?::|%253a|%3a)(?:[\\/]|%252f|%2f){2,}|\/|%252f|%2f)[^\s"'<>]+/gi, candidate => {
      let decoded = candidate.replace(/\\\//g, "/");
      for (let i = 0; i < 2; i++) { try { decoded = decodeURIComponent(decoded); } catch { break; } }
      return /\/(?:instagram-media\.php|(?:data\/)?instagram-staging)/i.test(decoded) ? "[instagram-staging:redacted]" : candidate;
    })
    .replace(/("(?:key|hash|api[_ -]?hash|access[_ -]?token|caption|recipient|text|body|number)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"')
    .replace(/(\b(?:key|hash|api[_ -]?(?:key|hash)|access[_ -]?token|caption|recipient|sms[_ -]?(?:text|body)|(?:raw[_ -]?)?provider[_ -]?response)\s*[:=]\s*)[^\r\n]+/gi, "$1[redacted]")
    .replace(/(?:\+?90\s*)?0?5\d{2}[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g, "[phone]");
}
