import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const mode = process.argv[2] ?? "";

const definitions = {
  "automatic-sync": {
    source: "smoke-automatic-sync.mjs",
    // The source smoke covers inactive-device visibility and reactivation directly.
    replacements: []
  },
  renderer: {
    source: "smoke-desktop-renderer.mjs",
    replacements: []
  }
};

const definition = definitions[mode];
if (!definition) {
  console.error("Kullanım: node scripts/run-current-contract-smoke.mjs <automatic-sync|renderer>");
  process.exit(2);
}

const sourcePath = join(process.cwd(), "scripts", definition.source);
const generatedPath = join(process.cwd(), "scripts", `.current-${mode}-${process.pid}.mjs`);
let source = readFileSync(sourcePath, "utf8");

for (const replacement of definition.replacements) {
  const { before, after, replaceAll = false, through = "" } = replacement;
  const first = source.indexOf(before);
  if (first < 0) {
    console.error(`Current-contract patch eşleşmedi: ${basename(sourcePath)}. Eski smoke dosyası değişmiş olabilir.`);
    process.exit(3);
  }

  if (replaceAll) {
    source = source.split(before).join(after);
    continue;
  }

  if (source.indexOf(before, first + before.length) >= 0) {
    console.error(`Current-contract patch birden fazla eşleşti: ${basename(sourcePath)}.`);
    process.exit(4);
  }

  if (through) {
    const end = source.indexOf(through, first + before.length);
    if (end < 0) {
      console.error(`Current-contract patch bitişi eşleşmedi: ${basename(sourcePath)}.`);
      process.exit(5);
    }
    source = `${source.slice(0, first)}${after}${source.slice(end + through.length)}`;
    continue;
  }

  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

try {
  writeFileSync(generatedPath, source);
  const result = spawnSync(process.execPath, [generatedPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = typeof result.status === "number" ? result.status : 1;
  }
} finally {
  unlinkSync(generatedPath);
}
