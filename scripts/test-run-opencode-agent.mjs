import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(import.meta.dirname, "run-opencode-agent.mjs");
const PASSWORD = "test-password-must-never-leak";
const SESSION_ID = "ses_test123";
const MODEL = {
  providerID: "opencode",
  id: "deepseek-v4.1-flash-free"
};
const FLINT_MODEL = {
  providerID: "opencode",
  id: "deepseek-v4.1-flint"
};

function assistantMessage({ model, text = "test yanıtı", created = 2000, id = "msg_assistant_1" }) {
  return {
    id,
    type: "assistant",
    time: { created, completed: created + 1 },
    agent: "build",
    model,
    content: [{ type: "text", text }]
  };
}

function idleMessage({ outcome = "succeeded", created = 3000, id = "msg_idle_1", error } = {}) {
  return {
    id,
    type: "idle",
    time: { created },
    outcome,
    ...(error ? { error } : {})
  };
}

async function startFakeServer(overrides = {}) {
  const requests = { sessions: [], prompts: [], messages: [], gets: [] };
  let prompted = false;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : null;

    const send = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(payload === undefined ? "" : JSON.stringify(payload));
    };

    if (url.pathname === "/api/session" && request.method === "POST") {
      requests.sessions.push({ body, authorization: request.headers.authorization });
      if (overrides.unauthorized) {
        send(401, { message: "unauthorized" });
        return;
      }
      send(200, { data: { id: SESSION_ID, title: body.title, model: overrides.createdModel ?? body.model } });
      return;
    }

    if (url.pathname === "/api/session/active" && request.method === "GET") {
      send(200, { data: overrides.activeSession ? { [SESSION_ID]: { type: "running" } } : {} });
      return;
    }

    if (url.pathname === `/api/session/${SESSION_ID}` && request.method === "GET") {
      requests.gets.push({ authorization: request.headers.authorization });
      send(200, {
        data: {
          id: SESSION_ID,
          title: overrides.existingTitle ?? "Mevcut oturum",
          model: overrides.existingModel ?? { ...MODEL, variant: "high" }
        }
      });
      return;
    }

    if (url.pathname === `/api/session/${SESSION_ID}/message` && request.method === "GET") {
      requests.messages.push(url.search);
      if (!prompted || overrides.neverIdle) {
        send(200, { data: [], cursor: {} });
        return;
      }
      const messages = overrides.messages ?? [
        idleMessage(),
        assistantMessage({ model: { ...MODEL, variant: overrides.variant ?? "high" } })
      ];
      send(200, { data: messages, cursor: {} });
      return;
    }

    if (url.pathname === `/api/session/${SESSION_ID}/prompt` && request.method === "POST") {
      requests.prompts.push({ body });
      prompted = true;
      send(200, {
        data: { id: "msg_user_1", sessionID: SESSION_ID, type: "user", payload: { text: body.text }, delivery: "queue" }
      });
      return;
    }

    send(404, { message: "not found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, OPENCODE_PASSWORD: PASSWORD, ...env }
    });
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI zamanında bitmedi. stdout=${stdout} stderr=${stderr}`));
    }, 15000);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
  });
}

function argsFor(server, variant, { promptArgs = ["--prompt", "Merhaba"], extra = [] } = {}) {
  return [
    "--title", "Delegasyon testi",
    "--model", "opencode/deepseek-v4.1-flash-free",
    "--reasoning", variant,
    ...promptArgs,
    "--server", server.url,
    "--poll-ms", "25",
    "--timeout-ms", "5000",
    ...extra
  ];
}

function assertNoPassword(result) {
  assert.doesNotMatch(result.stdout, new RegExp(PASSWORD));
  assert.doesNotMatch(result.stderr, new RegExp(PASSWORD));
}

test("high ve max varyantları oturum modeline yazılır; prompt yalnız text taşır", async () => {
  for (const variant of ["high", "max"]) {
    const fake = await startFakeServer({ variant });
    try {
      const result = await runCli(argsFor(fake, variant));
      assert.equal(result.code, 0, result.stderr);
      const output = JSON.parse(result.stdout.trim());
      assert.equal(output.sessionID, SESSION_ID);
      assert.equal(output.outcome, "succeeded");
      assert.equal(output.text, "test yanıtı");
      assert.deepEqual(output.model, { ...MODEL, variant });

      assert.equal(fake.requests.sessions.length, 1);
      assert.equal(fake.requests.sessions[0].body.title, "Delegasyon testi");
      assert.deepEqual(fake.requests.sessions[0].body.model, { ...MODEL, variant });
      assert.match(fake.requests.sessions[0].authorization, /^Basic /);

      assert.equal(fake.requests.prompts.length, 1);
      assert.deepEqual(Object.keys(fake.requests.prompts[0].body), ["text"]);
      assert.equal(fake.requests.prompts[0].body.text, "Merhaba");

      assertNoPassword(result);
    } finally {
      await fake.close();
    }
  }
});

test("prompt dosyası ve --no-wait: model doğrulanır, idle beklenmez, model prompt'a yazılmaz", async () => {
  const fake = await startFakeServer({ variant: "max" });
  const root = mkdtempSync(join(tmpdir(), "yardimci-opencode-prompt-"));
  try {
    const promptFile = join(root, "prompt.txt");
    writeFileSync(promptFile, "Dosyadan gelen görev");
    const args = argsFor(fake, "max", {
      promptArgs: ["--prompt-file", promptFile],
      extra: ["--no-wait"]
    });

    const result = await runCli(args);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.outcome, "queued");
    assert.deepEqual(output.model, { ...MODEL, variant: "max" });
    assert.equal(fake.requests.prompts.length, 1);
    assert.deepEqual(Object.keys(fake.requests.prompts[0].body), ["text"]);
    assert.equal(fake.requests.prompts[0].body.text, "Dosyadan gelen görev");
    assert.equal(fake.requests.messages.length, 0);
    assertNoPassword(result);
  } finally {
    await fake.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("sunucu farklı model döndürürse prompt gönderilmez (sessiz fallback yok)", async () => {
  const fake = await startFakeServer({ createdModel: FLINT_MODEL });
  try {
    const result = await runCli(argsFor(fake, "max"));
    assert.equal(result.code, 4, result.stderr);
    assert.match(result.stderr, /uyuşmazlığı/i);
    assert.match(result.stderr, /fallback/i);
    assert.match(result.stderr, /deepseek-v4\.1-flint/);
    assert.equal(fake.requests.prompts.length, 0);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("asistan farklı model üretirse sonuç reddedilir", async () => {
  const fake = await startFakeServer({
    messages: [idleMessage(), assistantMessage({ model: FLINT_MODEL })]
  });
  try {
    const result = await runCli(argsFor(fake, "max"));
    assert.equal(result.code, 4, result.stderr);
    assert.match(result.stderr, /fallback/i);
    assert.equal(fake.requests.prompts.length, 1);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("mevcut oturumun modeli uyuşmazsa prompt gönderilmez", async () => {
  const fake = await startFakeServer({ existingModel: { ...FLINT_MODEL, variant: "high" } });
  try {
    const result = await runCli(argsFor(fake, "max", { extra: ["--session", SESSION_ID] }));
    assert.equal(result.code, 4, result.stderr);
    assert.match(result.stderr, /uyuşmazlığı/i);
    assert.equal(fake.requests.sessions.length, 0);
    assert.equal(fake.requests.prompts.length, 0);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("mevcut oturum doğru modeldeyse aynı oturuma tek prompt gönderilir", async () => {
  const fake = await startFakeServer({ existingModel: { ...MODEL, variant: "max" }, variant: "max" });
  try {
    const result = await runCli(argsFor(fake, "max", { extra: ["--session", SESSION_ID] }));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(fake.requests.sessions.length, 0);
    assert.equal(fake.requests.prompts.length, 1);
    assert.match(result.stderr, /\(mevcut\)/);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("mevcut oturum çalışıyorsa yeni prompt gönderilmez", async () => {
  const fake = await startFakeServer({ existingModel: { ...MODEL, variant: "max" }, activeSession: true });
  try {
    const result = await runCli(argsFor(fake, "max", { extra: ["--session", SESSION_ID] }));
    assert.equal(result.code, 6, result.stderr);
    assert.match(result.stderr, /çalışıyor/i);
    assert.equal(fake.requests.prompts.length, 0);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("idle gelmezse anlaşılır zaman aşımı hatası verir ve prompt'u yinelemez", async () => {
  const fake = await startFakeServer({ neverIdle: true });
  try {
    const result = await runCli(argsFor(fake, "high", { extra: ["--timeout-ms", "350", "--poll-ms", "25"] }));
    assert.equal(result.code, 5, result.stderr);
    assert.match(result.stderr, /Zaman aşımı/i);
    assert.match(result.stderr, /yeniden gönderilmedi/i);
    assert.equal(fake.requests.prompts.length, 1);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});

test("401 yetki hatası OPENCODE_PASSWORD'ı açıkça işaret eder, parolayı sızdırmaz", async () => {
  const fake = await startFakeServer({ unauthorized: true });
  try {
    const result = await runCli(argsFor(fake, "high"));
    assert.equal(result.code, 3, result.stderr);
    assert.match(result.stderr, /401/);
    assert.match(result.stderr, /OPENCODE_PASSWORD/);
    assert.equal(fake.requests.prompts.length, 0);
    assertNoPassword(result);
  } finally {
    await fake.close();
  }
});
