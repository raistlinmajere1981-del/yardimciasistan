import test from "node:test";
import assert from "node:assert/strict";
import { filterMenuItems, firstSelectableIndex, nextSelectableIndex, viewportFor } from "../ui/terminal.mjs";

test("filterMenuItems searches label, description and searchText and drops separators while filtering", () => {
  const items = [
    { label: "Presetler", separator: true },
    { label: "Full Verify", description: "Kontroller", searchText: "pre-main release", value: "full" },
    { label: "Android cihazları", description: "adb devices", value: "android" },
  ];
  assert.deepEqual(filterMenuItems(items, "release").map((x) => x.value), ["full"]);
  assert.deepEqual(filterMenuItems(items, "ADB").map((x) => x.value), ["android"]);
  assert.equal(filterMenuItems(items, "").length, 3);
});

test("firstSelectableIndex skips separators and disabled items", () => {
  const items = [
    { label: "Başlık", separator: true },
    { label: "Kapalı", disabled: true },
    { label: "A", value: "a" },
  ];
  assert.equal(firstSelectableIndex(items, 0), 2);
  assert.equal(firstSelectableIndex(items, 2), 2);
});

test("nextSelectableIndex wraps and skips non-selectable rows", () => {
  const items = [
    { label: "A", value: "a" },
    { label: "Başlık", separator: true },
    { label: "B", value: "b" },
    { label: "Kapalı", disabled: true },
  ];
  assert.equal(nextSelectableIndex(items, 0, 1), 2);
  assert.equal(nextSelectableIndex(items, 2, 1), 0);
  assert.equal(nextSelectableIndex(items, 0, -1), 2);
});

test("viewportFor keeps selection inside a fixed-size window", () => {
  assert.deepEqual(viewportFor(0, 20, 6), { start: 0, end: 6 });
  assert.deepEqual(viewportFor(10, 20, 6), { start: 7, end: 13 });
  assert.deepEqual(viewportFor(19, 20, 6), { start: 14, end: 20 });
  assert.deepEqual(viewportFor(1, 3, 6), { start: 0, end: 3 });
});
