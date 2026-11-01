#!/usr/bin/env node
/**
 * OpenCode v2 HTTP API delegation helper.
 *
 * Creates (or reuses) one session with an explicit provider/model/variant,
 * verifies the server kept that exact model, then admits exactly one text
 * prompt through /api/session/{id}/prompt. The model never travels in the
 * prompt body: OpenCode ignores it there and may fall back to another model.
 *
 * Credentials come from OPENCODE_PASSWORD (HTTP Basic, user "opencode") and
 * are never printed, logged or committed.
 */
import { readFile } from "node:fs/promises";

const DEFAULT_SERVER = "http://127.0.0.1:4096";
const DEFAULT_MODEL = "opencode/deepseek-v4.1-flash-free";
const DEFAULT_REASONING = "high";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
const REASONING_VARIANTS = new Set(["high", "max"]);

const EXIT = {
  usage: 2,
  auth: 3,
  model: 4,
  timeout: 5,
  server: 6,
  agent: 7
};

const USAGE = `Kullanım:
  node scripts/run-opencode-agent.mjs --title <başlık> --prompt <metin> [seçenekler]
  node scripts/run-opencode-agent.mjs --title <başlık> --prompt-file <dosya> [seçenekler]

Seçenekler:
  --title <metin>        Yeni oturum başlığı (varsayılan: zaman damgalı başlık)
  --model <provider/id>  Model (varsayılan: ${DEFAULT_MODEL})
  --reasoning high|max   Model varyantı (varsayılan: ${DEFAULT_REASONING})
  --prompt <metin>       Gönderilecek metin
  --prompt-file <dosya>  Gönderilecek metni dosyadan oku
  --server <url>         OpenCode sunucusu (varsayılan: ${DEFAULT_SERVER})
  --session <ses_...>    Var olan oturumu kullan; model/variant doğrulanır
  --no-wait              Prompt'u kuyruğa alır ve beklemeden çıkar
  --timeout-ms <ms>      Boşta (idle) bekleme süresi (varsayılan: ${DEFAULT_TIMEOUT_MS})
  --poll-ms <ms>         Mesaj yoklama aralığı (varsayılan: ${DEFAULT_POLL_MS})
  --help                 Bu metni göster

Kimlik doğrulama:
  OPENCODE_PASSWORD ortam değişkeni HTTP Basic Auth parolasıdır (kullanıcı: opencode).
  Parola hiçbir zaman yazdırılmaz. Parola yoksa istek kimlik doğrulamasız denenir;
  sunucu 401 dönerse açık bir yetki hatası verilir.

Çıkış kodları:
  0 başarılı / kuyruğa alındı   2 kullanım hatası    3 yetki hatası
  4 model uyuşmazlığı (fallback yok)                  5 zaman aşımı
  6 sunucu/HTTP hatası          7 ajan sonucu başarısız/kesildi

Başarıda stdout'a tek satır JSON yazılır; ilerleme ve hatalar stderr'e gider.
`;

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

function parseArgs(argv) {
  const options = {
    title: null,
    model: DEFAULT_MODEL,
    reasoning: DEFAULT_REASONING,
    prompt: null,
    promptFile: null,
    server: DEFAULT_SERVER,
    session: null,
    noWait: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    help: false
  };
  const valueFlags = new Set([
    "--title",
    "--model",
    "--reasoning",
    "--prompt",
    "--prompt-file",
    "--server",
    "--session",
    "--timeout-ms",
    "--poll-ms"
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inlineValue] = raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];

    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--no-wait") {
      if (inlineValue !== undefined) throw new CliError(EXIT.usage, "--no-wait değer almaz.");
      options.noWait = true;
      continue;
    }
    if (!valueFlags.has(flag)) {
      throw new CliError(EXIT.usage, `Bilinmeyen seçenek: ${flag}`);
    }
    let value = inlineValue;
    if (value === undefined) {
      index += 1;
      value = argv[index];
    }
    if (value === undefined || value === "") {
      throw new CliError(EXIT.usage, `${flag} bir değer gerektirir.`);
    }
    const key = {
      "--title": "title",
      "--model": "model",
      "--reasoning": "reasoning",
      "--prompt": "prompt",
      "--prompt-file": "promptFile",
      "--server": "server",
      "--session": "session",
      "--timeout-ms": "timeoutMs",
      "--poll-ms": "pollMs"
    }[flag];
    options[key] = value;
  }

  return options;
}

function parsePositiveInt(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new CliError(EXIT.usage, `${flag} pozitif tam sayı olmalıdır.`);
  }
  return number;
}

function parseModelRef(model, variant) {
  const separator = model.indexOf("/");
  if (separator <= 0 || separator === model.length - 1) {
    throw new CliError(EXIT.usage, "--model <providerID>/<modelID> biçiminde olmalıdır.");
  }
  if (!REASONING_VARIANTS.has(variant)) {
    throw new CliError(EXIT.usage, "--reasoning yalnız high veya max olabilir.");
  }
  return {
    providerID: model.slice(0, separator),
    id: model.slice(separator + 1),
    variant
  };
}

function normalizeServer(value) {
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CliError(EXIT.usage, `Geçersiz --server değeri: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(EXIT.usage, "--server yalnız http veya https olabilir.");
  }
  return url.toString().replace(/\/+$/, "");
}

function modelLabel(model) {
  if (!model || typeof model.id !== "string" || typeof model.providerID !== "string") {
    return "model bilgisi yok";
  }
  return `${model.providerID}/${model.id}${model.variant ? ` (variant=${model.variant})` : ""}`;
}

function modelMatches(actual, expected) {
  return Boolean(
    actual &&
      actual.providerID === expected.providerID &&
      actual.id === expected.id &&
      actual.variant === expected.variant
  );
}

function errorMessageFromBody(body) {
  if (!body || typeof body !== "object") return "";
  const candidate = body.message ?? body.error ?? body.data?.message ?? body.data?.error;
  return typeof candidate === "string" ? candidate.slice(0, 300) : "";
}

async function requestJson(server, path, { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { accept: "application/json" };
  const password = process.env.OPENCODE_PASSWORD;
  if (password) {
    headers.authorization = `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`;
  }
  if (body !== undefined) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(`${server}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new CliError(EXIT.timeout, `İstek zaman aşımına uğradı: ${method} ${path} (${timeoutMs} ms).`);
    }
    throw new CliError(EXIT.server, `OpenCode sunucusuna ulaşılamadı (${server}): ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail = errorMessageFromBody(payload);
    if (response.status === 401 || response.status === 403) {
      throw new CliError(
        EXIT.auth,
        `Yetkilendirme başarısız (HTTP ${response.status}). OPENCODE_PASSWORD ortam değişkeninin bu sunucunun parolasıyla eşleştiğini doğrulayın (Basic Auth kullanıcısı: opencode). Parola yazdırılmaz.${detail ? ` Sunucu: ${detail}` : ""}`
      );
    }
    if (response.status === 409) {
      throw new CliError(EXIT.server, `Oturum meşgul (HTTP 409); istek yinelenmedi.${detail ? ` Sunucu: ${detail}` : ""}`);
    }
    if (response.status === 404) {
      throw new CliError(EXIT.server, `Oturum veya uç nokta bulunamadı (HTTP 404): ${path}${detail ? ` — ${detail}` : ""}`);
    }
    throw new CliError(EXIT.server, `OpenCode isteği başarısız (HTTP ${response.status}): ${method} ${path}${detail ? ` — ${detail}` : ""}`);
  }

  return payload;
}

async function createOrLoadSession(server, options, expectedModel) {
  if (options.session) {
    const payload = await requestJson(server, `/api/session/${encodeURIComponent(options.session)}`);
    const info = payload?.data;
    if (!info || typeof info.id !== "string") {
      throw new CliError(EXIT.server, `Oturum yanıtı geçersiz: ${options.session}`);
    }
    if (!modelMatches(info.model, expectedModel)) {
      throw new CliError(
        EXIT.model,
        `Model uyuşmazlığı: istenen ${modelLabel(expectedModel)}; oturum ${modelLabel(info.model)} kullanıyor. Sessiz model fallback yapılmadı ve prompt gönderilmedi. Oturum: ${info.id}`
      );
    }
    return info;
  }

  const payload = await requestJson(server, "/api/session", {
    method: "POST",
    body: {
      title: options.title,
      model: expectedModel
    }
  });
  const info = payload?.data;
  if (!info || typeof info.id !== "string") {
    throw new CliError(EXIT.server, "Oturum oluşturma yanıtı geçersiz (session id yok).");
  }
  if (!modelMatches(info.model, expectedModel)) {
    throw new CliError(
      EXIT.model,
      `Model uyuşmazlığı: istenen ${modelLabel(expectedModel)}; sunucu ${modelLabel(info.model)} döndürdü. Sessiz model fallback yapılmadı ve prompt gönderilmedi. Oturum: ${info.id}`
    );
  }
  return info;
}

async function assertSessionIdle(server, sessionID) {
  const payload = await requestJson(server, "/api/session/active");
  const active = payload?.data;
  if (active && Object.prototype.hasOwnProperty.call(active, sessionID)) {
    throw new CliError(
      EXIT.server,
      `Oturum şu anda çalışıyor; yeni prompt gönderilmedi ve mevcut çalışma yinelenmedi. Oturum: ${sessionID}. Önce /api/session/active ve oturum mesajlarıyla mevcut turun bitmesini doğrulayın.`
    );
  }
}

async function listMessages(server, sessionID, limit = 100) {
  const payload = await requestJson(server, `/api/session/${encodeURIComponent(sessionID)}/message?order=desc&limit=${limit}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

function findIdle(messages, baseline) {
  return (
    messages.find(
      (message) =>
        message?.type === "idle" &&
        !baseline.idleIDs.has(message.id) &&
        (baseline.idleCreated === null || (message.time?.created ?? 0) >= baseline.idleCreated)
    ) ?? null
  );
}

function findAssistant(messages, baselineAssistantIDs, baselineAssistantCreated) {
  return (
    messages.find(
      (message) =>
        message?.type === "assistant" &&
        !baselineAssistantIDs.has(message.id) &&
        (baselineAssistantCreated === null || (message.time?.created ?? 0) >= baselineAssistantCreated)
    ) ?? null
  );
}

function assistantText(message) {
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function sendPrompt(server, sessionID, text) {
  const payload = await requestJson(server, `/api/session/${encodeURIComponent(sessionID)}/prompt`, {
    // Model/variant bilinçli olarak burada YOK: OpenCode bu alanı kabul etmez
    // ve istenmeyen model seçimine yol açabilir.
    method: "POST",
    body: { text }
  });
  const messageID = payload?.data?.id;
  if (typeof messageID !== "string") {
    throw new CliError(EXIT.server, "Prompt kabul yanıtı geçersiz (message id yok).");
  }
  return messageID;
}

async function waitForTurn(server, sessionID, options, baseline) {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const messages = await listMessages(server, sessionID);
    const idle = findIdle(messages, baseline);
    if (idle) return { idle, messages };

    const sleepMs = Math.min(options.pollMs, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  throw new CliError(
    EXIT.timeout,
    `Zaman aşımı: ${options.timeoutMs} ms içinde oturum boşta (idle) duruma gelmedi. Oturum: ${sessionID}. Prompt yeniden gönderilmedi; önce /api/session/active ve oturum mesajlarını kontrol edin.`
  );
}

function structuredErrorLabel(error) {
  if (!error || typeof error !== "object") return "";
  const type = typeof error.type === "string" ? error.type : "error";
  const message = typeof error.message === "string" ? error.message : "";
  return `${type}${message ? `: ${message}` : ""}`;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (options.prompt && options.promptFile) {
    throw new CliError(EXIT.usage, "--prompt ve --prompt-file birlikte kullanılamaz.");
  }
  if (!options.prompt && !options.promptFile) {
    throw new CliError(EXIT.usage, "--prompt veya --prompt-file zorunludur.");
  }
  if (options.promptFile) {
    try {
      options.prompt = await readFile(options.promptFile, "utf8");
    } catch (error) {
      throw new CliError(EXIT.usage, `Prompt dosyası okunamadı (${options.promptFile}): ${error.message}`);
    }
  }
  if (!options.prompt || !options.prompt.trim()) {
    throw new CliError(EXIT.usage, "Prompt metni boş olamaz.");
  }
  if (options.session && !/^ses[A-Za-z0-9_-]*$/.test(options.session)) {
    throw new CliError(EXIT.usage, "--session ses ile başlayan bir oturum kimliği olmalıdır.");
  }

  options.timeoutMs = parsePositiveInt(options.timeoutMs, "--timeout-ms");
  options.pollMs = parsePositiveInt(options.pollMs, "--poll-ms");
  if (options.pollMs > options.timeoutMs) {
    throw new CliError(EXIT.usage, "--poll-ms, --timeout-ms değerinden büyük olamaz.");
  }
  options.title ??= `OpenCode delegation ${new Date().toISOString()}`;

  const server = normalizeServer(options.server);
  const expectedModel = parseModelRef(options.model, options.reasoning);

  const session = await createOrLoadSession(server, options, expectedModel);
  process.stderr.write(
    `[opencode] oturum=${session.id} model=${modelLabel(session.model)}${options.session ? " (mevcut)" : " (yeni)"}\n`
  );

  if (!options.noWait) {
    if (options.session) await assertSessionIdle(server, session.id);
    const baselineMessages = await listMessages(server, session.id, 50);
    const baseline = {
      idleIDs: new Set(baselineMessages.filter((message) => message?.type === "idle").map((message) => message.id)),
      idleCreated: baselineMessages.find((message) => message?.type === "idle")?.time?.created ?? null,
      assistantIDs: new Set(baselineMessages.filter((message) => message?.type === "assistant").map((message) => message.id)),
      assistantCreated: baselineMessages.find((message) => message?.type === "assistant")?.time?.created ?? null
    };

    const promptMessageID = await sendPrompt(server, session.id, options.prompt);
    process.stderr.write(`[opencode] prompt=${promptMessageID}; boşta (idle) bekleniyor\n`);

    const { idle, messages } = await waitForTurn(server, session.id, options, baseline);
    if (idle.outcome !== "succeeded") {
      const detail = structuredErrorLabel(idle.error);
      throw new CliError(
        EXIT.agent,
        `Ajan sonucu ${idle.outcome}: ${detail || "ayrıntı yok"}. Oturum: ${session.id} (prompt yeniden gönderilmedi).`
      );
    }

    const assistant = findAssistant(messages, baseline.assistantIDs, baseline.assistantCreated);
    if (!assistant) {
      throw new CliError(EXIT.server, `Oturum başarılı göründü ancak yeni asistan mesajı bulunamadı. Oturum: ${session.id}`);
    }
    if (!modelMatches(assistant.model, expectedModel)) {
      throw new CliError(
        EXIT.model,
        `Model uyuşmazlığı: istenen ${modelLabel(expectedModel)}; asistan ${modelLabel(assistant.model)} yanıtı üretti. Sessiz model fallback kabul edilmedi. Oturum: ${session.id}`
      );
    }

    const text = assistantText(assistant);
    if (!text) {
      throw new CliError(EXIT.server, `Asistan mesajı boş metin içeriyor. Oturum: ${session.id}`);
    }

    process.stdout.write(
      `${JSON.stringify({
        sessionID: session.id,
        title: session.title ?? options.title,
        model: session.model,
        promptMessageID,
        outcome: idle.outcome,
        assistantMessageID: assistant.id,
        text
      })}\n`
    );
    return;
  }

  const promptMessageID = await sendPrompt(server, session.id, options.prompt);
  process.stdout.write(
    `${JSON.stringify({
      sessionID: session.id,
      title: session.title ?? options.title,
      model: session.model,
      promptMessageID,
      outcome: "queued"
    })}\n`
  );
}

main(process.argv.slice(2)).catch((error) => {
  if (error instanceof CliError) {
    process.stderr.write(`[opencode] hata: ${error.message}\n`);
    process.exitCode = error.code;
    return;
  }
  process.stderr.write(`[opencode] beklenmeyen hata: ${error?.message ?? error}\n`);
  process.exitCode = EXIT.server;
});
