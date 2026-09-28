import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";

const ANSI = {
  clear: "\x1b[2J\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reverse: "\x1b[7m",
};

function cleanLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function selectable(item) {
  return Boolean(item) && !item.separator && !item.disabled;
}

export function filterMenuItems(items, query = "") {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (!q) return [...items];
  return items.filter((item) => {
    if (!selectable(item)) return false;
    const haystack = [item.label, item.description, item.searchText, item.value]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    return haystack.includes(q);
  });
}

export function firstSelectableIndex(items, preferred = 0) {
  if (!items.length) return -1;
  const start = Math.max(0, Math.min(items.length - 1, preferred));
  for (let i = start; i < items.length; i += 1) if (selectable(items[i])) return i;
  for (let i = start - 1; i >= 0; i -= 1) if (selectable(items[i])) return i;
  return -1;
}

export function nextSelectableIndex(items, current, delta) {
  if (!items.length) return -1;
  const selectableCount = items.filter(selectable).length;
  if (!selectableCount) return -1;
  let index = current < 0 ? (delta >= 0 ? -1 : 0) : current;
  for (let tries = 0; tries < items.length; tries += 1) {
    index = (index + delta + items.length) % items.length;
    if (selectable(items[index])) return index;
  }
  return current;
}

export function viewportFor(index, total, size) {
  if (total <= size) return { start: 0, end: total };
  const safeIndex = Math.max(0, Math.min(total - 1, index));
  const half = Math.floor(size / 2);
  let start = Math.max(0, safeIndex - half);
  let end = Math.min(total, start + size);
  start = Math.max(0, end - size);
  return { start, end };
}

function writeLines(output, lines) {
  output.write(lines.join("\n") + "\n");
}

function terminalRows(output) {
  return Number(output.rows) || 28;
}

function terminalColumns(output) {
  return Number(output.columns) || 100;
}

function truncate(value, width) {
  const text = cleanLine(value);
  if (text.length <= width) return text;
  return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`;
}

function wrapLine(value, width) {
  const text = String(value ?? "");
  if (!text) return [""];
  if (width <= 10 || text.length <= width) return [text];
  const out = [];
  let rest = text;
  while (rest.length > width) {
    let at = rest.lastIndexOf(" ", width);
    if (at < Math.floor(width * 0.5)) at = width;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  out.push(rest);
  return out;
}

function rawSession({ input, output, onKey }) {
  emitKeypressEvents(input);
  const hadRaw = Boolean(input.isRaw);
  if (input.isTTY && typeof input.setRawMode === "function") input.setRawMode(true);
  input.resume();
  output.write(ANSI.hideCursor);

  const handler = (str, key = {}) => onKey(str, key);
  input.on("keypress", handler);

  return () => {
    input.off("keypress", handler);
    if (input.isTTY && typeof input.setRawMode === "function" && !hadRaw) input.setRawMode(false);
    output.write(ANSI.showCursor + ANSI.reset);
  };
}

export function createTerminalUI({ input = defaultInput, output = defaultOutput } = {}) {
  let closed = false;

  async function ask(question) {
    if (closed) throw new Error("UI kapalı");
    if (input.isTTY && typeof input.setRawMode === "function" && input.isRaw) input.setRawMode(false);
    output.write(ANSI.showCursor);
    const rl = createInterface({ input, output, terminal: true });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  }

  async function select({
    title,
    status = "",
    body = [],
    items,
    initialIndex = 0,
    initialValue,
    searchable = true,
    startSearch = false,
    initialQuery = "",
    footer = "↑↓ seç · Enter aç · Esc geri · / filtre",
  }) {
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      throw new Error("Etkileşimli seçim için TTY gerekli.");
    }
    let query = initialQuery;
    let searching = startSearch || Boolean(initialQuery);
    let filtered = filterMenuItems(items, query);
    let selected = initialValue === undefined
      ? firstSelectableIndex(filtered, initialIndex)
      : firstSelectableIndex(filtered, Math.max(0, filtered.findIndex((item) => item.value === initialValue)));

    const render = () => {
      filtered = filterMenuItems(items, query);
      if (selected >= filtered.length || !selectable(filtered[selected])) selected = firstSelectableIndex(filtered, 0);
      const rows = terminalRows(output);
      const cols = terminalColumns(output);
      const wrappedBody = body.flatMap((line) => wrapLine(line, Math.max(30, cols - 4)));
      const bodyLimit = Math.max(0, Math.min(8, wrappedBody.length));
      const visibleBody = wrappedBody.slice(-bodyLimit);
      const reserved = 8 + visibleBody.length + (searching || query ? 2 : 0);
      const viewSize = Math.max(4, Math.min(18, rows - reserved));
      const { start, end } = viewportFor(selected, filtered.length, viewSize);
      const lines = [ANSI.clear + `${ANSI.bold}${title}${ANSI.reset}`];
      if (status) lines.push(status, "");
      if (visibleBody.length) lines.push(...visibleBody, "");
      if (searching || query) lines.push(`Ara: ${query}${searching ? "▌" : ""}`, "");
      if (!filtered.length) {
        lines.push(`${ANSI.dim}(eşleşme yok)${ANSI.reset}`);
      } else {
        if (start > 0) lines.push(`${ANSI.dim}  ↑ ${start} öğe daha${ANSI.reset}`);
        for (let i = start; i < end; i += 1) {
          const item = filtered[i];
          if (item.separator) {
            lines.push(`${ANSI.dim}  ── ${truncate(item.label, cols - 8)} ──${ANSI.reset}`);
            continue;
          }
          const prefix = i === selected ? "›" : " ";
          const marker = item.disabled ? "×" : " ";
          let line = `${prefix} ${marker} ${truncate(item.label, cols - 7)}`;
          if (item.disabled) line = `${ANSI.dim}${line}${ANSI.reset}`;
          else if (i === selected) line = `${ANSI.reverse}${line}${ANSI.reset}`;
          lines.push(line);
        }
        if (end < filtered.length) lines.push(`${ANSI.dim}  ↓ ${filtered.length - end} öğe daha${ANSI.reset}`);
      }
      const current = filtered[selected];
      if (current?.description) {
        lines.push("", `${ANSI.dim}${truncate(current.description, cols - 2)}${ANSI.reset}`);
      }
      lines.push("", `${ANSI.dim}${footer}${ANSI.reset}`);
      writeLines(output, lines);
    };

    return await new Promise((resolve) => {
      let cleanup = () => {};
      const done = (result) => {
        cleanup();
        output.write("\n");
        resolve(result);
      };
      cleanup = rawSession({
        input,
        output,
        onKey: (str, key) => {
          if (key.ctrl && key.name === "c") return done({ action: "exit" });
          if (key.name === "escape") {
            if (searching || query) {
              searching = false;
              query = "";
              filtered = filterMenuItems(items, query);
              selected = firstSelectableIndex(filtered, 0);
              render();
              return;
            }
            return done({ action: "back" });
          }
          if (key.name === "return" || key.name === "enter") {
            const item = filtered[selected];
            if (selectable(item)) return done({ action: "pick", item, index: items.indexOf(item) });
            return;
          }
          if (key.name === "up") { selected = nextSelectableIndex(filtered, selected, -1); render(); return; }
          if (key.name === "down") { selected = nextSelectableIndex(filtered, selected, 1); render(); return; }
          if (key.name === "home") { selected = firstSelectableIndex(filtered, 0); render(); return; }
          if (key.name === "end") { selected = firstSelectableIndex(filtered, filtered.length - 1); render(); return; }
          if (key.name === "pageup") {
            for (let i = 0; i < 6; i += 1) selected = nextSelectableIndex(filtered, selected, -1);
            render(); return;
          }
          if (key.name === "pagedown") {
            for (let I = 0; i < 6; i += 1) selected = nextSelectableIndex(filtered, selected, 1);
            render(); return;
          }
          if (key.name === "backspace" && searching) {
            query = query.slice(0, -1);
            filtered = filterMenuItems(items, query);
            selected = firstSelectableIndex(filtered, 0);
            render(); return;
          }
          if (searchable && str === "/" && !searching) {
            searching = true;
            query = "";
            render(); return;
          }
          if (searchable && searching && str && !key.ctrl && !key.meta && str >= " ") {
            query += str;
            filtered = filterMenuItems(items, query);
            selected = firstSelectableIndex(filtered, 0);
            render();
          }
        },
      });
      render();
    });
  }

  async function viewText({ title, text, footer = "↑↓ kaydır · PgUp/PgDn hızlı · Home/End · Esc geri" }) {
    if (!input.isTTY || typeof input.setRawMode !== "function") return;
    const lines = String(text ?? "").split("\n");
    let offset = 0;

    const render = () => {
      const rows = terminalRows(output);
      const cols = terminalColumns(output);
      const height = Math.max(5, rows - 5);
      const maxOffset = Math.max(0, lines.length - height);
      offset = Math.max(0, Math.min(maxOffset, offset));
      const visible = lines.slice(offset, offset + height).map((line) => truncate(line, cols - 1));
      writeLines(output, [
        ANSI.clear + `${ANSI.bold}${title}${ANSI.reset}`,
        `${ANSI.dim}satır ${lines.length ? offset + 1 : 0}-${Math.min(lines.length, offset + height)} / ${lines.length}${ANSI.reset}`,
        "",
        ...visible,
        "",
        `${ANSI.dim}${footer}${ANSI.reset}`,
      ]);
    };

    await new Promise((resolve) => {
      let cleanup = () => {};
      const done = () => { cleanup(); output.write("\n"); resolve(); };
      cleanup = rawSession({
        input,
        output,
        onKey: (_str, key) => {
          if (key.ctrl && key.name === "c") return done();
          if (key.name === "escape" || key.name === "return") return done();
          if (key.name === "up") offset -= 1;
          else if (key.name === "down") offset += 1;
          else if (key.name === "pageup") offset -= Math.max(5, terminalRows(output) - 8);
          else if (key.name === "pagedown") offset += Math.max(5, terminalRows(output) - 8);
          else if (key.name === "home") offset = 0;
          else if (key.name === "end") offset = lines.length;
          else return;
          render();
        },
      });
      render();
    });
  }

  return {
    ask,
    select,
    viewText,
    clear: () => output.write(ANSI.clear),
    close: () => {
      closed = true;
      if (input.isTTY && typeof input.setRawMode === "function" && input.isRaw) input.setRawMode(false);
      output.write(ANSI.showCursor + ANSI.reset);
    },
  };
}
