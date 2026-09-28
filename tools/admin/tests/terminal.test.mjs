import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { filterMenuItems, firstSelectableIndex, nextSelectableIndex, viewportFor, createTerminalUI } from "../ui/terminal.mjs";

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


test("terminal UI seçim sonrasında stdin pause durumunu geri yükler ve close'ta stdin'i bırakır", async () => {
  class FakeInput extends EventEmitter {
    constructor() {
      super();
      this.isTTY = true;
      this.isRaw = false;
      this.paused = true;
    }
    setRawMode(value) { this.isRaw = value; }
    resume() { this.paused = false; return this; }
    pause() { this.paused = true; return this; }
    isPaused() { return this.paused; }
  }

  const input = new FakeInput();
  const output = { rows: 24, columns: 100, write() { return true; } };
  const ui = createTerminalUI({ input, output });

  const pending = ui.select({ title: "Test", items: [{ label: "A", value: "a" }] });
  assert.equal(input.isPaused(), false);
  input.emit("keypress", "", { name: "escape" });
  assert.equal((await pending).action, "back");
  assert.equal(input.isPaused(), true);

  input.resume();
  ui.close();
  assert.equal(input.isPaused(), true);
  assert.equal(input.isRaw, false);
});
