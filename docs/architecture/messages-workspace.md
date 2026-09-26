# Customer Messaging Workspace

## Current ownership

Customer communication is owned by **Müşteri İşleri**. There is no standalone Messages page or navigation item.

Müşteri İşleri exposes capability-driven views:

- **Talepler** when `feature.requests` is enabled.
- **Müşteriler** whenever customer management is enabled.
- **Hazır Mesajlar** when WhatsApp is enabled.

The renderer keeps one customer-work tab state. Any WhatsApp handoff switches that state to `Hazır Mesajlar` and navigates to Müşteri İşleri.

## Responsibility split

### Talepler

The request is the owner of request-related communication.

The request detail contains:

- request metadata and note,
- AI summary,
- AI reply draft,
- structured rewrite actions,
- copy,
- WhatsApp handoff,
- reservation conversion and request lifecycle actions.

AI does not own a separate workspace.

### Müşteriler

Customer records, stays, identity and customer-specific operations remain in the customer view.

### Hazır Mesajlar

This is an outbox/delivery surface, not a second request workspace.

It lists request records only when they have prepared message content and can also host the current ephemeral customer-credit or birthday handoff.

The safe view is limited to delivery concerns:

- recipient,
- prepared message,
- copy,
- call,
- WhatsApp link,
- delete prepared request message.

AI rewrite controls do not live here; they belong to the request detail that owns the content.

The WhatsApp view keeps the explicit user-controlled Web flow.

## Navigation capability

Only **Müşteri İşleri** contributes a sidebar item.

- Customers enabled → Müşteri İşleri is visible.
- Requests enabled → Talepler view is visible.
- WhatsApp enabled → Hazır Mesajlar view is visible.
- Disabling Requests does not remove customer records or prepared WhatsApp work.
- Disabling WhatsApp removes Hazır Mesajlar without affecting request AI preparation.

Requests capability kapalıyken request-domain kayıtları renderer yüzeyine taşınmaz;
bu nedenle request'e bağlı prepared mesajlar Hazır Mesajlar'da gösterilmez.
Customer-domain ephemeral WhatsApp handoff'ları (doğum günü / veresiye) çalışmaya
devam edebilir. Prepared listesi sırf dolu diye REQUESTS dışındaki request
entity'leri projection sınırından sızdırılmaz.

This removes the previous Requests/WhatsApp/AI combinations that had to decide whether a separate Messages page should appear.

## Contextual AI

AI remains attached to the business surface that owns the work:

- Ana Sayfa → daily operational evaluation.
- Müşteri İşleri / Talepler → request summary, reply generation and structured rewrites.
- Kasa → current cash interpretation.
- Detaylı Raporlar → selected-period interpretation.

The user is not expected to write prompts.

## WhatsApp guest takeover

Interactive WhatsApp mode still uses the existing Electron WhatsApp guest and `persist:yardimci-whatsapp` partition.

When the user enters WhatsApp mode:

```text
renderer requests takeover
→ main marks userBusy=true
→ active automatic owner is invalidated
→ active automatic run reaches a guarded settle point
→ guest is returned to the WhatsApp home URL
→ takeover Promise resolves
→ the interactive webview is revealed
```

Renderer takeover retries retain their sequence/disposal guard.

The embedded customer-work surface may unmount when leaving Müşteri İşleri; the persistent Electron partition preserves the WhatsApp login session. Automatic birthday delivery remains owned by the Electron-side automation lifecycle rather than the renderer tab.

## Request AI ownership

Initial `AI Cevap Hazırla` and structured rewrite operations share request-scoped mutation ownership.

Different requests may run independently. Two AI mutations for the same request cannot own that request concurrently.

AI generation remains independent from WhatsApp capability. Turning WhatsApp off does not cancel request AI work.

## Capability normalization

### AI

Turning AI off invalidates pending request AI ownership and prevents stale completions from applying.

### Customers

Turning Customers off invalidates customer/request communication operations and clears ephemeral handoffs.

### WhatsApp

Turning WhatsApp off:

- clears selected/prepared WhatsApp presentation state,
- invalidates pending birthday preparation,
- removes the Hazır Mesajlar view,
- does not clear or cancel request AI work.

### Customer Credit

Turning Customer Credit off clears only credit handoff state.

## User-send policy

Prepared text is never treated as permission to send.

Interactive WhatsApp Web send keeps the explicit user confirmation flow. Automatic birthday delivery keeps its separate configured automation lifecycle and ownership guards.
