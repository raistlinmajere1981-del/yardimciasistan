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
  preparedWhatsAppMessages: [],
  summary: { ...baseDashboard.summary, newRequests: 2, waitingRequests: 2, preparedWhatsAppMessages: 0 }
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
      suggestionCalls: 0,
      rewriteCalls: 0,
      birthdayPrepareCalls: 0
    };
    window.__m8ePendingSuggestion = [];
    window.__m8ePendingRewrite = [];
    window.__m8ePendingBirthday = [];

    const resolveWithDashboard = (pending, label) => {
      const nextDashboard = clone(window.__m8eDashboard || dashboard);
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

    window.__m8eResolveSuggestion = (index, label) => {
      const pending = window.__m8ePendingSuggestion[index];
      if (!pending) throw new Error(`Missing suggestion call ${index}`);
      resolveWithDashboard(pending, label);
    };

    window.__m8eResolveRewrite = (index, label) => {
      const pending = window.__m8ePendingRewrite[index];
      if (!pending) throw new Error(`Missing rewrite call ${index}`);
      resolveWithDashboard(pending, label);
    };

    window.__m8eResolveBirthday = (index, result = { ok: false, message: "stale birthday result" }) => {
      const pending = window.__m8ePendingBirthday[index];
      if (!pending) throw new Error(`Missing birthday preparation ${index}`);
      pending.resolve(result);
    };

    window.yardimciDesktop = {
      createOwnerReplySuggestion: async (requestId) => {
        const index = window.__m8eStats.suggestionCalls++;
        return new Promise((resolveSuggestion) => {
          window.__m8ePendingSuggestion[index] = { requestId, resolve: resolveSuggestion };
        });
      },
      rewriteOwnerReplySuggestion: async (input) => {
        const index = window.__m8eStats.rewriteCalls++;
        return new Promise((resolveRewrite) => {
          window.__m8ePendingRewrite[index] = { requestId: input.requestId, resolve: resolveRewrite };
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

  // Two owner suggestions on different requests: only the newest generation may win.
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-a"));
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-b"));
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(2);
  await expect(page.getByTestId("suggesting-request")).toHaveText("req-b");
  await page.evaluate(() => window.__m8eResolveSuggestion(1, "B latest"));
  await expect.poll(() => page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B latest");
  await page.evaluate(() => window.__m8eResolveSuggestion(0, "A stale"));
  await page.waitForTimeout(30);
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-b");
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-a")?.ai_suggested_reply || "")).toBe("");
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B latest");

  // Same-request concurrent suggestion is blocked by request-scoped ownership.
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-a"));
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(3);
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-a"));
  });
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(3);
  await expect(page.getByTestId("reply-state")).toHaveText("error");
  await expect(page.getByTestId("reply-message")).toContainText("başka bir AI işlemi");
  await page.evaluate(() => window.__m8eResolveSuggestion(2, "A single"));
  await expect.poll(() => page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-a")?.ai_suggested_reply)).toBe("A single");

  // Rewrite and suggestion share request ownership: a pending rewrite blocks a suggestion.
  await page.evaluate(() => {
    void window.__m8eController.handleRewriteRequestReply(window.__m8eDashboard.requests.find((request) => request.id === "req-b"), "Daha kısa yaz.");
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.rewriteCalls)).toBe(1);
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-b"));
  });
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(3);
  await expect(page.getByTestId("reply-state")).toHaveText("error");
  await page.evaluate(() => window.__m8eResolveRewrite(0, "B rewritten"));
  await expect.poll(() => page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B rewritten");

  // A pending rewrite becomes stale as soon as the WhatsApp selection moves.
  await page.evaluate(() => window.__m8eController.setSelectedWhatsAppRequestId("req-a"));
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-a");
  await page.evaluate(() => {
    void window.__m8eController.handleRewriteRequestReply(window.__m8eDashboard.requests.find((request) => request.id === "req-a"), "Daha kısa yaz.");
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.rewriteCalls)).toBe(2);
  await page.evaluate(() => window.__m8eController.setSelectedWhatsAppRequestId("req-b"));
  await page.evaluate(() => window.__m8eResolveRewrite(1, "A stale rewrite"));
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-a")?.ai_suggested_reply)).toBe("A single");
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-b");
  await expect(page.getByTestId("reply-state")).toHaveText("idle");

  // WhatsApp capability off must NOT cancel a pending request AI suggestion.
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-a"));
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(4);
  await page.evaluate(() => window.__m8eSetFlags({ whatsappEnabled: false }));
  await expect.poll(() => page.evaluate(() => window.__m8eFlags.whatsappEnabled)).toBe(false);
  await page.evaluate(() => window.__m8eResolveSuggestion(3, "A survives"));
  await expect.poll(() => page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-a")?.ai_suggested_reply)).toBe("A survives");
  await expect(page.getByTestId("reply-state")).toHaveText("success");
  await page.evaluate(() => window.__m8eSetFlags({ whatsappEnabled: true }));

  // AI capability off invalidates a pending suggestion and clears request AI feedback.
  await page.evaluate(() => {
    void window.__m8eController.handleCreateOwnerReplySuggestion(window.__m8eDashboard.requests.find((request) => request.id === "req-b"));
  });
  await expect.poll(() => page.evaluate(() => window.__m8eStats.suggestionCalls)).toBe(5);
  await page.evaluate(() => window.__m8eSetFlags({ aiEnabled: false }));
  await expect(page.getByTestId("suggesting-request")).toHaveText("");
  await expect(page.getByTestId("reply-message")).toContainText("AI bu işletmede etkin değil");
  await page.evaluate(() => window.__m8eResolveSuggestion(4, "B stale ai-off"));
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__m8eDashboard.requests.find((request) => request.id === "req-b")?.ai_suggested_reply)).toBe("B rewritten");
  await page.evaluate(() => window.__m8eSetFlags({ aiEnabled: true }));

  // CUSTOMERS off clears selection, pending AI ownership and prepared handoff state.
  await expect.poll(() => page.evaluate(() => window.__m8eFlags.aiEnabled)).toBe(true);
  await page.evaluate(() => window.__m8eController.setSelectedWhatsAppRequestId("req-a"));
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("req-a");
  await page.evaluate(() => window.__m8eSetFlags({ customersEnabled: false }));
  await expect(page.getByTestId("selected-whatsapp")).toHaveText("");
  await expect(page.getByTestId("suggesting-request")).toHaveText("");
  await expect(page.getByTestId("reply-state")).toHaveText("idle");
  await page.evaluate(() => window.__m8eSetFlags({ customersEnabled: true }));

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
