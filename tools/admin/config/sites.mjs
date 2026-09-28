import { existsSync } from "node:fs";
import { join } from "node:path";
import { BLACKSEA_ROOT } from "../lib/paths.mjs";

/**
 * Site profilleri: BlackSea adı sisteme gömülmez; her deploy hedefi
 * bir profildir. Yetenekler yalnızca ilgili repoda gerçekten varsa sunulur.
 */
export function getSiteProfiles() {
  const blackseaPresent = existsSync(join(BLACKSEA_ROOT, "scripts", "check.sh"));
  const natroEnvPresent = existsSync(join(BLACKSEA_ROOT, ".deploy", "natro.env"));
  return [
    {
      id: "ya",
      title: "Yardımcı Asistan web modülü",
      host: "Alwaysdata (SSH/rsync)",
      cwd: "repo",
      available: true,
      availabilityNote: "",
      deployReady: true,
      deployReadyNote: "deploy-web.sh varsayılan SSH hedefini kullanır.",
    },
    {
      id: "blacksea",
      title: "BlackSea Pansiyon sitesi",
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
      title: "Test landing (www kökü)",
      host: "Alwaysdata (test-site/landing)",
      cwd: "repo",
      available: existsSync(join(process.cwd(), "package.json")),
      availabilityNote: "",
      deployReady: true,
      deployReadyNote: "LANDING_DEPLOY_* ortam değişkenleri yoksa varsayılan hedef kullanılır.",
    },
  ];
}
