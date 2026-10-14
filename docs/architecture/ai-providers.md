# AI provider profiles

The existing `openai_compatible` family dispatches by saved service: Gemini uses
native Google REST, Cloudflare uses Workers AI REST, and other providers retain
their OpenAI-compatible adapters. Profile switching preserves per-service settings
and OS-encrypted credentials. Renderer execution and a second save path are absent.

## Cloudflare Workers AI

Settings takes Account ID and API Token. The Account ID is stored in the existing
profile `base_url`, at the exact root
`https://api.cloudflare.com/client/v4/accounts/{32-hex-account-id}/ai`.
Desktop and Hosting validate that root before sending credentials. Token uses
safeStorage. Redirects and automatic retries are disabled.

| Capability | Documented candidate | Saved preference |
| --- | --- | --- |
| Text | `@cf/zai-org/glm-4.7-flash` | `model` |
| Image understanding | `@cf/meta/llama-4-scout-17b-16e-instruct` | optional `vision_model` |
| Image generation | `@cf/black-forest-labs/flux-1-schnell` | optional `image_model` |
| Turkish transcription | `@cf/openai/whisper-large-v3-turbo` | optional `stt_model` |

Metadata identifies an installed adapter contract; it never proves account access,
free-plan eligibility or remaining quota. Settings' explicit connection action
makes a text request and optional selected vision/image requests; partial failure
fails the action. Returned model options contain only models actually tested.
STT retains its separate saved-configuration audio test. Tests consume provider
quota and never retry automatically. Turkish transcription quality requires a
real Turkish recording beyond the silent audio access test.

Cloudflare `result.response` and GLM `result.choices` normalize to the existing chat
contract. Vision uses the separate saved model with inline images. Existing stock
and identity authorization, temporary-image cleanup and candidate validation remain
authoritative. Private `ai_settings` publication carries active Cloudflare
`vision_model` and `stt_model` through the existing durable exact acknowledgement
lifecycle. Inactive profiles stay local.

FLUX returns base64 JPEG or PNG. Electron decodes it, bounds dimensions, crops to
the requested aspect and converts to actual PNG before the existing marketing
candidate/media path. JPEG is never labelled PNG. FLUX accepts prompts up to 2048
characters; longer input fails without truncating business authority. Cloudflare
image generation requires an explicitly selected image model.

Cloudflare errors distinguish authentication/account, model permission (including
paid-plan restrictions), daily free quota, capacity, rate limit, timeout, network
and invalid application response. They expose fixed Turkish messages, without raw
provider bodies, prompts, tokens or audio in diagnostics. Cloudflare Turkish TTS
has no verified adapter; local/device speech remains supported.

Current schema only: `ai_service_profiles.vision_model` is canonical. No automatic
migration, backfill or data reset is introduced.

References: [REST](https://developers.cloudflare.com/workers-ai/get-started/rest-api/),
[GLM](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/),
[Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/),
[FLUX](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/),
[Whisper](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/),
[errors](https://developers.cloudflare.com/workers-ai/platform/errors/),
[pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
