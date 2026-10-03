import { existsSync } from "node:fs";
import { join } from "node:path";
import { BLACKSEA_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { getInstallation } from "../../../scripts/lib/installation-registry.mjs";

/**
 * Site profilleri: BlackSea adı sisteme gömülmez; her deploy hedefi
 * bir profildir. Yetenekler yalnızca ilgili repoda gerçekten varsa sunulur.
 */
export function getSiteProfiles() {
  const ya = getInstallation("ya", REPO_ROOT);
  const support = getInstallation("support", REPO_ROOT);
  const blacksea = getInstallation("blacksea", REPO_ROOT);
  const landing = getInstallation("landing", REPO_ROOT);
  const blackseaPresent = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"));
  const natroEnvPresent = existsSync(join(BLACKSEA_ROOT, ".deploy", "natro.env"));
  return [
    {
      id: "ya",
      title: ya.title,
      publicUrl: ya.webModuleUrl,
      versionEndpoint: ya.versionEndpoint,
      credentialRef: ya.credentialRef,
      host: "Alwaysdata (SSH/rsync)",
      cwd: "repo",
      available: true,
      availabilityNote: "",
      deployReady: true,
      deployReadyNote: "deploy-web.sh varsayılan SSH hedefini kullanır.",
    },
    {
      id: "support",
      title: support.title,
      publicUrl: support.publicUrl,
      credentialRef: support.credentialRef,
      host: "Alwaysdata (SSH, private inbox)",
      cwd: "repo",
      available: true,
      availabilityNote: "",
      deployReady: true,
      deployReadyNote: "Destek endpoint'i /support altında; raporlar web root dışında private dizinde tutulur.",
    },
    {
      id: "blacksea",
      title: blacksea.title,
      publicUrl: blacksea.siteUrl,
      webModuleUrl: blacksea.webModuleUrl,
      versionEndpoint: blacksea.versionEndpoint,
      credentialRef: blacksea.credentialRef,
      host: "Natro (FTP/lftp, /httpdocs)",
      cwd: "blacksea",
      available: blackseaPresent,
      availabilityNote: blackseaPresent
        ? `Bağlı: ${BLACKSEA_ROOT}`
        : `Bulunamadı: ${BLACKSEA_ROOT} (BLACKSEA_REPO ile konum verilebilir)`,
      deployReady: blackseaPresent && natroEnvPresent,
      deployReadyNote: !blackseaPresent
        ? "BlackSea reposu bağlı değil."
        : natroEnvPresent
          ? ".deploy/natro.env mevcut."
          : ".deploy/natro.env yok (örnek: .deploy/natro.env.example).",
    },
    {
      id: "landing",
      title: landing.title,
      publicUrl: landing.siteUrl,
      credentialRef: landing.credentialRef,
      host: "Alwaysdata (test-site/landing)",
      cwd: "repo",
      available: existsSync(join(process.cwd(), "package.json")),
      availabilityNote: "",
      deployReady: true,
      deployReadyNote: "LANDING_DEPLOY_* ortam değişkenleri yoksa varsayılan hedef kullanılır.",
    },
  ];
}
