# Messages / WhatsApp Workspace

## Current ownership

Messages is a WhatsApp-specific operational surface.

The current ownership model is:

- `useMessagingController` owns prepared-message, request reply and WhatsApp handoff state.
- `MessagesPage` owns Safe / WhatsApp presentation mode and the user-takeover barrier.
- `WhatsAppWorkspace` owns presentation-local copy/send/webview UI state.
- the Electron WhatsApp driver owns the single persistent WhatsApp guest used by both user and automatic birthday delivery flows.
- request AI belongs to Müşteri İşleri, daily AI belongs to Ana Sayfa, finance AI belongs to Kasa/Raporlar.

There is no generic AI Workspace surface, AI prompt box or AI history browser.

## Navigation capability

The Messages navigation contribution exists only when both:

- `core.customers`
- `service.whatsapp`

are enabled.

Requests do not require Messages. When WhatsApp is disabled, request review and AI reply preparation remain in Müşteri İşleri and the Messages navigation item disappears immediately.

## Contextual AI

AI is attached to the business surface that owns the work:

- Ana Sayfa → daily operational evaluation.
- Müşteri İşleri → request summary + AI reply preparation.
- Mesajlar → structured rewrite actions for an already prepared request reply.
- Kasa → current cash interpretation.
- Detaylı Raporlar → selected-period interpretation.

The user is not expected to write prompts. Structured actions provide the required intent.

Request AI generation writes the summary and suggested reply back to the request record. The request detail shows that reply directly and can copy it or hand it to WhatsApp.

## Shared WhatsApp guest takeover

Automatic birthday delivery and interactive WhatsApp mode share one real Electron guest.

When the user enters WhatsApp mode:

```text
renderer requests takeover
→ main marks userBusy=true
→ active automatic owner is permanently invalidated
→ active automatic run reaches a guarded settle point
→ guest is returned to the WhatsApp home URL
→ takeover Promise resolves
→ only then is the interactive webview surface revealed
```

An old automatic owner cannot become valid again when `userBusy` later returns to false.

Renderer takeover retries use a sequence/disposal guard. Leaving Web mode, navigating away or losing the WhatsApp capability invalidates the retry loop before it can issue a stale takeover IPC.

## Webview lifecycle

The persistent Messages host remains mounted across normal navigation so the WhatsApp guest survives page changes.

The guest uses the existing `persist:yardimci-whatsapp` partition.

Webview registration is tied to the guest element lifecycle rather than URL state. URL changes therefore do not intentionally create a second guest or duplicate registration cycle.

## Request AI ownership

Initial `AI Cevap Hazırla` and structured rewrite operations share request-scoped mutation ownership.

Different requests may run independently. Two AI mutations for the same request cannot own the request concurrently.

Renderer generation/epoch guards prevent stale completions from overwriting a newer request result after capability or selection changes.

AI reply generation is independent from WhatsApp capability. Disabling WhatsApp does not cancel an in-progress request AI operation.

## Capability normalization

### AI

Turning AI off invalidates pending request AI ownership and prevents stale completions from applying.

### Customers

Turning Customers off invalidates customer/request messaging operations, clears prepared customer handoffs and stops pending birthday preparation.

### WhatsApp

Turning WhatsApp off:

- clears selected/prepared WhatsApp presentation state,
- invalidates pending birthday preparation,
- hides the Messages navigation contribution,
- does not clear or cancel request AI work owned by Müşteri İşleri.

### Customer Credit

Turning Customer Credit off clears only credit handoff state.

## User-send policy

Prepared text is never treated as implicit permission to send.

Interactive WhatsApp Web send still requires the existing explicit user confirmation flow. Automatic birthday delivery keeps its separate configured automation lifecycle and ownership guards.
