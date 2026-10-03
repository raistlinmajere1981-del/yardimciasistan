#!/usr/bin/env node
import { getInstallation, getInstallationValue, readInstallationRegistry, validateInstallationRegistry } from "./lib/installation-registry.mjs";

const [command = "show", id, path] = process.argv.slice(2);

try {
  if (command === "show") {
    if (id) {
      console.log(JSON.stringify(getInstallation(id), null, 2));
    } else {
      console.log(JSON.stringify(readInstallationRegistry(), null, 2));
    }
  } else if (command === "get") {
    if (!id || !path) throw new Error("Kullanım: node scripts/installation-config.mjs get <installation-id> <alan.yolu>");
    process.stdout.write(getInstallationValue(id, path));
  } else if (command === "check") {
    const errors = validateInstallationRegistry();
    if (errors.length > 0) throw new Error(errors.join("\n"));
    console.log("installation-registry-ok");
  } else {
    throw new Error("Komut: show [id] | get <id> <alan.yolu> | check");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
