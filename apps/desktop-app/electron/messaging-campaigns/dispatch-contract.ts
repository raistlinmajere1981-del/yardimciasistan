import type { BusinessMessage, MessagingCampaign, MessagingOutboxItem } from "@yardimci-asistan/shared";

export type DispatchResult =
  | { kind: "accepted"; businessMessageId: string }
  | { kind: "retry"; category: "transient" | "rate_limit" | "submission_uncertain"; retryAfterMs?: number }
  | { kind: "failed" | "skipped"; category: string }
  | { kind: "deferred"; nextAttemptAt: string };
export interface DispatchClaim { item: MessagingOutboxItem; campaign: MessagingCampaign; message: BusinessMessage | null; submitted: boolean }
export interface CampaignDispatchTransport {
  dispatchCampaignItem(id: string, token: string, intervalMs: number, allowed: () => boolean, now: () => Date): Promise<DispatchResult>;
}

export function reconcile(claim: DispatchClaim): DispatchResult {
  // A webhook failure with provider id is also proof that the original POST was accepted; delivery failure never retries transport.
  if (claim.message?.providerMessageId || claim.message?.acceptedAt || claim.message?.deliveredAt || claim.message?.readAt) return { kind: "accepted", businessMessageId: claim.message!.id };
  return { kind: "retry", category: "submission_uncertain" };
}
