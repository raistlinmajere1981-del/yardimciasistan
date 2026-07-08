import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const mode = process.argv[2] ?? "apply";
const root = process.cwd();
const fixtureFile = join(root, "demo-data", "web-module-requests.json");
const requestsFile = join(root, "firm-template", "web-module", "data", "requests.json");
const syncStateFile = join(root, "firm-template", "web-module", "data", "sync-state.json");
const conversationsFile = join(root, "firm-template", "web-module", "data", "ai-conversations.json");
const androidSnapshotFile = join(root, "firm-template", "web-module", "data", "android-snapshot.json");
const emptyAndroidSnapshot = {
  summary: {
    pending_daily_tasks: 0,
    available_rooms: 0,
    total_rooms: 0,
    available_tables: 0,
    pending_reservations: 0,
    prepared_whatsapp_messages: 0,
    active_menu_categories: 0,
    available_menu_items: 0,
    customer_count: 0
  },
  daily_tasks: [],
  updated_at: ""
};

if (mode === "apply") {
  const requests = JSON.parse(readFileSync(fixtureFile, "utf8"));
  writeJson(requestsFile, requests);
  writeJson(syncStateFile, {
    demo_seeded_at: new Date().toISOString(),
    last_request_pull_at: "",
    last_request_mark_at: "",
    last_menu_publish_at: "",
    last_android_snapshot_at: "",
    updated_at: new Date().toISOString()
  });
  writeJson(androidSnapshotFile, emptyAndroidSnapshot);
  console.log(`demo-data-applied: ${requests.length} web request records`);
} else if (mode === "clear") {
  writeJson(requestsFile, []);
  writeJson(conversationsFile, []);
  writeJson(androidSnapshotFile, emptyAndroidSnapshot);
  writeJson(syncStateFile, {
    last_request_pull_at: "",
    last_request_mark_at: "",
    last_menu_publish_at: "",
    last_android_snapshot_at: "",
    updated_at: new Date().toISOString()
  });
  console.log("demo-data-cleared: web requests and conversations reset");
} else if (mode === "print") {
  const requests = JSON.parse(readFileSync(fixtureFile, "utf8"));
  console.log(`demo-data-fixture: ${requests.length} web request records`);
} else {
  console.error("Usage: node scripts/seed-demo-data.mjs [apply|clear|print]");
  process.exit(1);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
