import { createHash, randomUUID } from "node:crypto";
import {
  BIRDESENGOR_EFFECT_DEPLOY_TARGET_ID,
  BIRDESENGOR_EFFECT_SCENE_ID,
  type EffectReadiness
} from "../../shared/contracts";
import { DeploymentRunner } from "./deployment-runner";
import { runEffectStudio } from "./effect-studio-service";

type StudioReply = {
  sourceHash?: string;
  changed?: boolean;
  readiness?: EffectReadiness;
  scene?: unknown;
};
type StudioDispatcher = (action: "prepare" | "load", id: string) => Promise<StudioReply>;
type DeployRunner = Pick<DeploymentRunner, "start" | "subscribe">;
type PreparedRelease = { token: string; sourceHash: string; draftHash: string; expiresAt: number };
function draftHash(scene: unknown) {
  if (!scene || typeof scene !== "object") throw new Error("Güncel efekt taslağı okunamadı.");
  return createHash("sha256").update(JSON.stringify(scene)).digest("hex");
}
const RELEASE_TTL_MS = 10 * 60 * 1000;

/** Await the existing cancellable deployment runner, never spawn a second
 * FTPS transport. Subscribing before start also handles immediate failures. */
function runStage(runner: DeployRunner, action: "preflight" | "deploy") {
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = runner.subscribe(state => {
      if (state.targetId !== BIRDESENGOR_EFFECT_DEPLOY_TARGET_ID ||
          state.action !== action || state.running) return;
      unsubscribe();
      if (state.result === "passed") resolve();
      else reject(new Error(action === "preflight"
        ? "BirDeSenGör ön kontrolü başarısız veya iptal edildi; canlı deploy yapılmadı."
        : "BirDeSenGör deploy veya canlı doğrulama başarısız/iptal. Canlı sürüm ayrıca kontrol edilmeli."));
    });
    const result = runner.start({ targetId: BIRDESENGOR_EFFECT_DEPLOY_TARGET_ID, action });
    if (!result.accepted) {
      unsubscribe();
      reject(new Error(result.message));
    }
  });
}

function requireTarget(id: unknown) {
  if (id !== BIRDESENGOR_EFFECT_SCENE_ID) throw new Error("Yalnız kanonik BirDeSenGör V2 sahnesi yayınlanabilir.");
}

/**
 * Approval is separated from the network preflight. An opaque, one-use token
 * is issued only after the current draft is staged and the dry-run passes.
 * A changed source revision, expired token, concurrent operation or missing
 * live confirmation all fail closed. No token is persisted to disk.
 */
export class BirdesengorEffectRelease {
  private pending: PreparedRelease | null = null;
  constructor(
    private readonly runner: DeployRunner,
    private readonly studio: StudioDispatcher
  ) {}

  invalidate() { this.pending = null; }

  async preflight(id: unknown) {
    requireTarget(id);
    this.invalidate();
    const prepared = await this.studio("prepare", BIRDESENGOR_EFFECT_SCENE_ID);
    if (!prepared.sourceHash || !prepared.readiness?.ready)
      throw new Error("V2 sahnesi henüz siteye hazırlanmaya uygun değil.");
    await runStage(this.runner, "preflight");
    const current = await this.studio("load", BIRDESENGOR_EFFECT_SCENE_ID);
    if (current.sourceHash !== prepared.sourceHash || !current.readiness?.ready)
      throw new Error("Ön kontrol sırasında kaynak değişti. Yeni ön kontrol gerekiyor.");
    const token = randomUUID();
    this.pending = { token, sourceHash: prepared.sourceHash, draftHash: draftHash(current.scene),
      expiresAt: Date.now() + RELEASE_TTL_MS };
    return {
      ok: true as const, token, sourceHash: prepared.sourceHash,
      changed: Boolean(prepared.changed), readiness: prepared.readiness,
      message: "Ön kontrol başarılı. Canlı siteye göndermek için açık onay gerekiyor."
    };
  }

  async deploy(id: unknown, token: unknown) {
    requireTarget(id);
    const approved = this.pending;
    this.invalidate(); // one-use, even on an error or cancellation
    if (!approved || typeof token !== "string" || token !== approved.token ||
        Date.now() > approved.expiresAt)
      throw new Error("Yayın onayı geçersiz veya süresi doldu. Ön kontrolü yeniden çalıştırın.");
    const current = await this.studio("load", BIRDESENGOR_EFFECT_SCENE_ID);
    if (current.sourceHash !== approved.sourceHash || !current.readiness?.ready ||
        draftHash(current.scene) !== approved.draftHash)
      throw new Error("Onaydan sonra site kaynağı veya efekt taslağı değişti; canlı deploy başlatılmadı.");
    await runStage(this.runner, "deploy");
    return {
      ok: true as const,
      message: "BirDeSenGör güncellendi; canlı JavaScript ve site API doğrulamaları başarılı.",
      siteUrl: "https://birdesengorgizlievren.com/"
    };
  }
}

export function createBirdesengorEffectRelease(repoRoot: string, runner: DeployRunner) {
  return new BirdesengorEffectRelease(runner, (action, id) =>
    runEffectStudio(repoRoot, action, { id }) as Promise<StudioReply>);
}
