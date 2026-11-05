import { effectSiteDeployTarget } from "../../shared/contracts";
import { DeploymentRunner, getDeploymentTargets } from "./deployment-runner";
import { runEffectStudio } from "./effect-studio-service";

type StudioAction = "inspect" | "prepare" | "activate" | "publish";
type Inspector = { siteId: string; canPublish: boolean; canPrepare: boolean };
type EffectDispatch = (action: StudioAction, id: string) => Promise<unknown>;
type DeployRunner = Pick<DeploymentRunner, "start" | "subscribe">;

function runDeployStage(runner: DeployRunner, targetId: string, action: "preflight" | "deploy") {
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = runner.subscribe(state => {
      if (state.targetId !== targetId || state.action !== action || state.running) return;
      unsubscribe();
      if (state.result === "passed") resolve();
      else reject(new Error(
        action === "preflight"
          ? "Efekt ilk yayını: site ön kontrolü başarısız veya iptal edildi."
          : "Efekt ilk yayını: site deploy işlemi başarısız veya iptal edildi."
      ));
    });
    const result = runner.start({ targetId, action });
    if (!result.accepted) {
      unsubscribe();
      reject(new Error(result.message));
    }
  });
}

/**
 * The renderer issues one approved publish command. Only a verified scene
 * binding may take the lightweight route; first activation must pass the
 * existing site-only preflight/deploy and HTTPS scene/manifest checks.
 */
export async function publishManagedEffect(
  repoRoot: string,
  imageId: string,
  runner: DeployRunner,
  dispatch: EffectDispatch = (action, id) =>
    runEffectStudio(repoRoot, action, { id })
): Promise<unknown> {
  if (!/^[a-z0-9_-]+:[a-z0-9_-]+$/.test(imageId)) throw new Error("Geçersiz efekt görseli.");
  const inspected = await dispatch("inspect", imageId) as Inspector;
  if (inspected.canPublish) return dispatch("publish", imageId);
  if (!inspected.canPrepare) throw new Error("Bu görsel için güvenli site yayın yolu henüz tanımlı değil.");

  const targetId = effectSiteDeployTarget(inspected.siteId);
  const target = getDeploymentTargets(repoRoot).find(item =>
    item.id === targetId && item.installationId === inspected.siteId
  );
  if (!target?.available) throw new Error(
    target?.availabilityNote || "Bu sitenin tam site deploy hedefi mevcut değil."
  );

  await dispatch("prepare", imageId);
  await runDeployStage(runner, target.id, "preflight");
  await runDeployStage(runner, target.id, "deploy");
  return dispatch("activate", imageId);
}
