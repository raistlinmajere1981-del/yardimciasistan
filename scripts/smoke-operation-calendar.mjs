import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const navigation = read("apps/desktop-app/src/app/navigation.ts");
const router = read("apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx");
const page = read("apps/desktop-app/src/pages/OperationCalendarPage.tsx");

assert.match(navigation, /id: "calendar", label: "Takvim"/);
assert.match(navigation, /setup\.modules\.rooms \|\| setup\.modules\.tables/);
assert.match(router, /activePage === "calendar"/);
assert.match(router, /<OperationCalendarPage/);
assert.match(page, /viewMode === "day"/);
assert.match(page, /viewMode === "week"/);
assert.match(page, /data\.reservations/);
assert.match(page, /data\.dailyTasks/);
assert.match(page, /reservation\.startDate === date/);
assert.match(page, /reservation\.endDate === date/);
assert.match(page, /task\.dueDate !== date/);
assert.match(page, /onCompleteTask\(item\.task\.id\)/);
assert.match(page, /onOpenReservation\(item\.reservation\)/);

console.log("operation-calendar-smoke-ok");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}
