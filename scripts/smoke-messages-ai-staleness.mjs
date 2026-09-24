import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createDashboardConversionFixture } from "./lib/desktop-renderer-fixtures.mjs";

const baseDashboard = createDashboardConversionFixture();
const firstRequest = {
  ...baseDashboard.requests[0],
  id: "req-a",
  customer_id: "customer-a",
  customer_name: "Talep A",
  customer_phone: "+905551110001",
  ai_suggested_reply: "",
  whatsapp_message: "A hazır mesajı"
};
const secondRequest = {
  ...baseDashboard.requests[0],
  id: "req-b",
  customer_id: "customer-b",
  customer_name: "Talep B",
  customer_phone: "+905551110002",
  ai_suggested_reply: "",
  whatsapp_message: "B hazır mesajı"
};
const dashboard = {
  ...baseDashboard,
  requests: [firstRequest, secondRequest],
  summary: { ...baseDashboard.summary, newRequests: 2, waitingRequests: 2 }
};

const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
let browser;

try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/messages-ai-staleness-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/messages-ai-staleness-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/messages-ai-staleness.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(({ dashboard }) => {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    window.__m8eInitial = { dashboard };
    window.__m8eStats = {
      generateCalls: 0,
      saveCalls: 0,
      suggestionCalls: 0,
      historyCalls: 0,
      birthdayPrepareCalls: 0
    };
    window.__m8ePendingGenerate = [];
    window.__m8ePendingSuggestion = [];
    window.__m8ePendingBirthday = [];

    const createEntry = (input, index) => ({
      id: `ai-entry-${index}`,
      mode: input.mode,
      requestId: input.requestId || "",
      requestLabel: input.requestId || "Günlük",
      instructions: input.instructions || "",
      content: `AI content ${input.requestId || input.mode} #${index}`,
      summary: "AI summary",
      missingFields: [],
      provider: "test",
      model: "test-model",
      fallback: false,
      createdAt: `2026-09-24T09:00:${String(index).padStart(2, "0")}.000Z`
    });

    window.__m8eResolveGenerate = (index, override = {}) => {
      const pending = window.__m8ePendingGenerate[index];
      if (!pending) throw new Error(`Missing generate call ${index}`);
      pending.resolve({
        ok: true,
        message: "AI sonucu hazır.",
        entry: { ...createEntry(pending.input, index), ...override }
      });
    };

    window.__m8eResolveBirthday = (index, result = { ok: false, message: "stale birthday result" }) => {
      const pending = window.__m8ePendingBirthday[index];
      if (!pending) throw new Error(`Missing birthday preparation ${index}`);
      pending.resolve(result);
    };

    window.__m8eResolveSuggestion = (index, label) => {
      const pending = window.__m8ePendingSuggestion[index];
      if (!pending) throw new Error(`Missing suggestion call ${index}`);
      const nextDashboard = clone(dashboard);
      nextDashboard.requests = nextDashboard.requests.map((request) => request.id === pending.requestId
        ? { ...request, ai_suggested_reply: label, whatsapp_message: label }
        : request);
      pending.resolve({
        ok: true,
        message: `${label} hazır.`,
        requestId: pending.requestId,
        summary: label,
        suggestedReply: label,
        missingFields: [],
        dashboardData: nextDashboard
      });
    };

    window.yardimciDesktop = {
      getAiWorkspaceHistory: async () => {
        window.__m8eStats.historyCalls += 1;
        return [];
      },
      generateAiWorkspace: async (input) => {
        const index = window.__m8eStats.generateCalls++;
        return new Promise((resolveGenerate) => {
          window.__m8ePendingGenerate[index] = { input: clone(input), resolve: resolveGenerate };
        });
      },
      saveAiWorkspaceResult: async (input) => {
        window.__m8eStats.saveCalls += 1;
        return { ok: true, message: "AI sonucu kaydedildi.", dashboardData: clone(window.__m8eDashboard || dashboard), input };
      },
      createOwnerReplySuggestion: async (requestId) => {
        const index = window.__m8eStats.suggestionCalls++;
        return new Promise((resolveSuggestion) => {
          window.__m8ePendingSuggestion[index] = { requestId, resolve: resolveSuggestion };
        });
      },
      prepareBirthdayWhatsApp: async (customerId) => {
        const index = window.__m8eStats.birthdayPrepareCalls++;
        return new Promise((resolveBirthday) => {
          window.__m8ePendingBirthday[index] = { customerId, resolve: resolveBirthday };
        });
      },
      getDashboardData: async () => clone(window.__m8eDashboard || dashboard),
      markWhatsAppMessageSent: async () => ({ ok: true, message: "ok", dashboardData: clone(window.__m8eDashboard || dashboard) }),
      deleteWhatsAppMessage: async () => ({ ok: true, message: "ok", dashboardData: clone(window.__m8eDashboard || dashboard) }),
      openExternal: async () => true
    };
  }, { dashboard });

  await page.goto(`${baseUrl}messages-ai-staleness-test`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__m8eController))).toBe(true);

  // A -> B while A is pending: A may persist in backend history, but must not enter the active editor.
  await page.evaluate(() => {
    window.__m8eController.changeAiWorkspaceRequest("req-a");
  });
  await expect(page.getByTestId("workspace-request")).toHaveText("req-a");
  await page.evaluate(() => { void window.__m8eController.handleGenerateAiWorkspace(); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(1);
  await page.evaluate(() => window.__m8eController.changeAiWorkspaceRequest("req-b"));
  await expect(page.getByTestId("workspace-request")).toHaveText("req-b");
  await page.evaluate(() => window.__m8eResolveGenerate(0));
  await page.waitForTimeout(30);
  await expect(page.getByTestId("workspace-content")).toHaveText("");

  // A -> B -> A must still invalidate the old A operation; matching target identity alone is insufficient.
  await page.evaluate(() => window.__m8eController.changeAiWorkspaceRequest("req-a"));
  await page.evaluate(() => { void window.__m8eController.handleGenerateAiWorkspace(); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(2);
  await page.evaluate(() => window.__m8eController.changeAiWorkspaceRequest("req-b"));
  await page.evaluate(() => window.__m8eController.changeAiWorkspaceRequest("req-a"));
  await page.evaluate(() => window.__m8eResolveGenerate(1));
  await page.waitForTimeout(30);
  await expect(page.getByTestId("workspace-content")).toHaveText("");

  // Same-turn duplicate generation is synchronously locked before the first await.
  await page.evaluate(() => {
    void window.__m8eController.handleGenerateAiWorkspace();
    void window.__m8eController.handleGenerateAiWorkspace();
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(3);
  await page.evaluate(() => window.__m8eResolveGenerate(2));
  await expect(page.getByTestId("workspace-content")).toContainText("req-a #2");

  // Rewrite A becomes stale as soon as the WhatsApp selection moves to B; stale generate must not reach save.
  await page.evaluate(() => window.__m8eController.setSelectedWhatsAppRequestId("req-a"));
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-a");
  const savesBeforeRewrite = await page.evaluate(() => window.__m8eStats.saveCalls);
  await page.evaluate(() => { void window.__m8eController.handleRewriteWhatsAppMessage("Daha kısa yaz."); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(4);
  await page.evaluate(() => window.__m8eController.setSelectedWhatsAppRequestId("req-b"));
  await page.evaluate(() => window.__m8eResolveGenerate(3));
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__m8eStats.saveCalls)).toBe(savesBeforeRewrite);
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-b");
  await expect(page.getByTestId("reply-state")).toHaveText("idle");

  // Two owner suggestions on different requests: only the newest renderer snapshot/selection may win.
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-a"));
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-b"));
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(2);
  await page.evaluate(() => window.__m8eResolveSuggestion(1, "B latest"));
  await expect.poll(() => page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B latest");
  await page.evaluate(() => window.__m8eResolveSuggestion(0, "A stale"));
  await page.waitForTimeout(30);
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-b");
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-a")?.ai_suggested_reply || "")).toBe("");
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B latest");

  // AI capability off invalidates a pending generation and clears request-based AI state.
  await page.evaluate(() => {
    window.__m8eController.changeAiWorkspaceRequest("req-a");
    void window.__m8eController.handleGenerateAiWorkspace();
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(5);
  await page.evaluate(() => window.__m8eSetFlags({ aiEnabled: false }));
  await expect(page.getByTestId("workspace-content")).toHaveText("");
  await page.evaluate(() => window.__m8eResolveGenerate(4));
  await page.waitForTimeout(30);
  await expect(page.getByTestId("workspace-content")).toHaveText("");
  await page.evaluate(() => window.__m8eSetFlags({ aiEnabled: true }));

  // CUSTOMERS off normalizes real workspace state to daily and drops request-scoped material.
  await expect.poll(() => page.evaluate(() => window.__m8eFlags.aiEnabled)).toBe(true);
  await page.evaluate(() => window.__m8eController.changeAiWorkspaceRequest("req-a"));
  await page.evaluate(() => { void window.__m8eController.handleGenerateAiWorkspace(); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(6);
  await page.evaluate(() => window.__m8eResolveGenerate(5));
  await expect(page.getByTestId("workspace-content")).toContainText("req-a #5");
  await page.evaluate(() => window.__m8eSetFlags({ customersEnabled: false }));
  await expect(page.getByTestId("workspace-mode")).toHaveText("daily");
  await expect(page.getByTestId("workspace-request")).toHaveText("");
  await expect(page.getByTestId("workspace-content")).toHaveText("");
  expect(await page.evaluate(() => window.__m8eController.aiWorkspaceHistory.every((entry) => !entry.requestId))).toBe(true);

  // A pending rewrite must not overwrite a newer independent Workspace generation.
  await page.evaluate(() => window.__m8eSetFlags({ customersEnabled: true, whatsappEnabled: true, aiEnabled: true }));
  await expect.poll(() => page.evaluate(() => window.__m8eFlags.customersEnabled && window.__m8eFlags.whatsappEnabled && window.__m8eFlags.aiEnabled)).toBe(true);
  await page.evaluate(() => {
    window.__m8eController.setSelectedWhatsAppRequestId("req-a");
    window.__m8eController.changeAiWorkspaceRequest("req-b");
  });
  await page.evaluate(() => { void window.__m8eController.handleRewriteWhatsAppMessage("A rewrite"); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(7);
  await page.evaluate(() => { void window.__m8eController.handleGenerateAiWorkspace(); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.generateCalls)).toBe(8);
  await page.evaluate(() => window.__m8eResolveGenerate(7));
  await expect(page.getByTestId("workspace-request")).toHaveText("req-b");
  await expect(page.getByTestId("workspace-content")).toContainText("req-b #7");
  const savesBeforeLateRewrite = await page.evaluate(() => window.__m8eStats.saveCalls);
  await page.evaluate(() => window.__m8eResolveGenerate(6));
  await expect.poll(() => page.evaluate((before) => window.__m8eStats.saveCalls > before, savesBeforeLateRewrite)).toBe(true);
  await page.waitForTimeout(30);
  await expect(page.getByTestId("workspace-request")).toHaveText("req-b");
  await expect(page.getByTestId("workspace-content")).toContainText("req-b #7");

  // WHATSAPP off/on must release a pending birthday preparation owner and loading UI.
  await page.evaluate(() => { void window.__m8eController.prepareBirthdayWhatsApp("customer-a"); });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.birthdayPrepareCalls)).toBe(1);
  await expect(page.getByTestId("birthday-preparing")).toHaveText("customer-a");
  await expect(page.getByTestId("sync-state")).toHaveText("loading");
  await page.evaluate(() => window.__m8eSetFlags({ whatsappEnabled: false }));
  await expect(page.getByTestId("birthday-preparing")).toHaveText("");
  await expect(page.getByTestId("sync-state")).toHaveText("idle");
  await page.evaluate(() => window.__m8eResolveBirthday(0));
  await page.waitForTimeout(30);
  await page.evaluate(() => window.__m8eSetFlags({ whatsappEnabled: true }));
  await expect(page.getByTestId("birthday-preparing")).toHaveText("");
  await expect(page.getByTestId("sync-state")).toHaveText("idle");

  expect(pageErrors).toEqual([]);
  console.log("messages-ai-staleness-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
