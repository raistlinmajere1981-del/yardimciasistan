import assert from "node:assert/strict";

const NOTIFICATION_ROW_IDS = new Set([
  "com.android.systemui:id/expandableNotificationRow",
  "com.android.systemui:id/expandable_notification_row",
  "com.android.systemui:id/notification_main_column",
  "com.android.systemui:id/notification_content"
]);

const NOTIFICATION_EXPAND_IDS = new Set([
  "android:id/expand_button",
  "com.android.systemui:id/expand_button",
  "com.android.systemui:id/expand",
  "com.android.systemui:id/notification_expand_button"
]);

export function findBoundsByText(xml, text) {
  const bounds = findBoundsByTextIfPresent(xml, text);
  if (!bounds) {
    throw new Error(`UI node bulunamadı: ${text}`);
  }
  return bounds;
}

export function findBoundsByResourceId(xml, resourceId) {
  const node = flattenUiNodes(parseUiNodes(xml)).find((candidate) => candidate.resourceId === resourceId);
  if (!node?.bounds) {
    throw new Error(`UI resource node bulunamadı: ${resourceId}`);
  }
  return node.bounds;
}

export function findNotificationGroupExpandBounds(xml, text, anchor = "") {
  const nodes = flattenUiNodes(parseUiNodes(xml));
  const target = nodes.find((node) => node.text === text || (node.text && node.text.includes(text)))
    ?? (anchor
      ? nodes.find((node) => (node.text && node.text.includes(anchor))
        || (node.contentDesc && node.contentDesc.includes(anchor)))
      : null);
  if (!target) {
    return null;
  }

  let scope = target;
  let ancestor = target.parent;
  let depth = 0;
  while (ancestor && depth < 10) {
    if (isNotificationRow(ancestor)) {
      scope = ancestor;
    }
    ancestor = ancestor.parent;
    depth += 1;
  }
  const expandButton = findUiDescendant(
    scope,
    (node) => node.clickable && node.bounds && isExpandAffordance(node)
  );
  if (!expandButton || isCollapseAffordance(expandButton)) {
    return null;
  }
  return expandButton.bounds;
}

export function findNotificationClickBounds(xml, text, anchor = "") {
  const nodes = flattenUiNodes(parseUiNodes(xml));
  const exact = nodes.filter((node) => node.text === text);
  const candidates = exact.length > 0
    ? exact
    : (anchor
      ? nodes.filter((node) => (node.text && node.text.includes(anchor))
        || (node.contentDesc && node.contentDesc.includes(anchor)))
      : []);
  if (candidates.length === 0) {
    throw new Error(`Bildirim UI node'u bulunamadı: ${text}`);
  }

  let best = null;
  let bestArea = -1;
  for (const candidate of candidates) {
    const bounds = candidate.bounds ?? nearestClickableAncestor(candidate)?.bounds;
    if (!bounds) {
      continue;
    }
    const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    if (area > bestArea) {
      bestArea = area;
      best = bounds;
    }
  }
  if (!best) {
    throw new Error(`Bildirim tıklama sınırı bulunamadı: ${text}`);
  }
  return best;
}

export function findClickableBoundsByText(xml, text) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`text="${escapeXmlAttribute(text)}"`)
    && candidate.includes('clickable="true"'));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    throw new Error(`Tıklanabilir UI node bulunamadı: ${text}`);
  }
  return toBounds(match);
}

export function findClickableBoundsByDescription(xml, description) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapeXmlAttribute(description)}"`)
    && candidate.includes('clickable="true"'));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    throw new Error(`Tıklanabilir açıklamalı UI node bulunamadı: ${description}`);
  }
  return toBounds(match);
}

export function findBoundsByTextIfPresent(xml, text) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`text="${escapeXmlAttribute(text)}"`));
  if (!node) {
    return null;
  }
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return match ? toBounds(match) : null;
}

export function findBoundsByContentDescriptionPrefix(xml, prefix) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const escapedPrefix = escapeXmlAttribute(prefix);
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapedPrefix}`));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return match ? toBounds(match) : null;
}

export function centerOf(bounds) {
  return {
    x: Math.trunc((bounds.left + bounds.right) / 2),
    y: Math.trunc((bounds.top + bounds.bottom) / 2)
  };
}

export function assertContains(xml, texts) {
  const missing = texts.filter((text) => !xml.includes(text));
  if (missing.length > 0) {
    throw new Error(`Android UI beklenen metinleri içermiyor: ${missing.join(", ")}`);
  }
}

export function assertNotContains(xml, texts) {
  const present = texts.filter((text) => xml.includes(text));
  if (present.length > 0) {
    throw new Error(`Android UI beklenmeyen metinleri içeriyor: ${present.join(", ")}`);
  }
}

export function assertCounterStripFits(xml, labels) {
  const bounds = labels.map((label) => findBoundsByText(xml, label));
  const firstTop = bounds[0].top;
  assert.ok(bounds.every((item) => Math.abs(item.top - firstTop) <= 2), "Sayaç chip'leri tek satırda değil.");
  assert.ok(bounds.every((item) => item.left >= 20 && item.right <= 680 && item.right > item.left), "Sayaç chip satırı yatay görünüm sınırını aşıyor.");
}

export function assertSquareTouchTarget(xml, description) {
  const bounds = findClickableBoundsByDescription(xml, description);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  assert.ok(width >= 84 && width <= 100, `${description} ikon genişliği 44–48dp aralığında değil: ${width}px`);
  assert.ok(height >= 84 && height <= 100, `${description} ikon yüksekliği 44–48dp aralığında değil: ${height}px`);
  assert.ok(Math.abs(width - height) <= 2, `${description} ikon butonu kare değil: ${width}x${height}px`);
}

export function assertIconOnly(xml, description) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapeXmlAttribute(description)}"`)
    && candidate.includes('clickable="true"'));
  assert.ok(node, `${description} ikon butonu bulunamadı.`);
  const text = node.match(/\btext="([^"]*)"/)?.[1] ?? "";
  assert.equal(text, "", `${description} tema butonunda görünür metin var: ${text}`);
  assert.ok(node.includes('class="android.widget.ImageButton"'), `${description} vektör ikon butonu değil.`);
}

export function assertHeaderActionOrder(xml, themeDescription) {
  const refresh = findClickableBoundsByDescription(xml, "Yenile");
  const theme = findClickableBoundsByDescription(xml, themeDescription);
  const settings = findClickableBoundsByDescription(xml, "Ayarlar");
  assert.ok(refresh.right <= theme.left, "Tema butonu Yenile butonunun sağında değil.");
  assert.ok(theme.right <= settings.left, "Tema butonu Ayarlar butonunun solunda değil.");
}

export function assertBottomNavClearance(xml, contentText, navText, minimumPixels) {
  const contentBounds = findBoundsByText(xml, contentText);
  const navBounds = findClickableBoundsByText(xml, navText);
  const clearance = navBounds.top - contentBounds.bottom;
  assert.ok(clearance >= minimumPixels, `Son içerik bottom nav'a fazla yakın: ${clearance}px (${contentText})`);
}

export function assertOrderActionGrid(xml, includePaid) {
  const preparing = findBoundsByText(xml, "Hazırlanıyor");
  const served = findBoundsByText(xml, "Servis Edildi");
  const payment = findBoundsByText(xml, "Hesap Bekliyor");
  const actions = [preparing, served, payment];
  let paid = null;
  if (includePaid) {
    paid = findBoundsByText(xml, "Ödendi / Kapat");
    actions.push(paid);
  }
  assert.ok(actions.every((item) => item.left >= 20 && item.right <= 700 && item.right > item.left), "Sipariş alt aksiyonları ekran sınırını aşıyor.");
  assert.ok(Math.abs(preparing.top - served.top) <= 2, "Hazırlanıyor ve Servis Edildi aynı üst satırda değil.");
  assert.ok(payment.top > preparing.bottom, "Hesap Bekliyor alt aksiyon satırına taşınmadı.");
  if (paid) {
    assert.ok(Math.abs(payment.top - paid.top) <= 2, "Hesap Bekliyor ve Ödendi / Kapat aynı alt satırda değil.");
  }
}

export function assertNodeHeightAtMost(xml, text, maximumPixels) {
  const bounds = findBoundsByText(xml, text);
  const height = bounds.bottom - bounds.top;
  assert.ok(height <= maximumPixels, `Kart önizlemesi gereğinden yüksek: ${height}px (${text})`);
}

function isNotificationRow(node) {
  return !!node && NOTIFICATION_ROW_IDS.has(node.resourceId);
}

function isExpandAffordance(node) {
  if (!node) return false;
  if (NOTIFICATION_EXPAND_IDS.has(node.resourceId)) return true;
  const description = (node.contentDesc ?? "").toLowerCase();
  return description.includes("expand") || description.includes("genişlet");
}

function isCollapseAffordance(node) {
  const description = (node?.contentDesc ?? "").toLowerCase();
  return description.includes("collapse") || description.includes("daralt");
}

function nearestClickableAncestor(node) {
  let current = node.parent;
  while (current) {
    if (current.clickable && current.bounds && !isExpandAffordance(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function findUiDescendant(node, predicate) {
  for (const child of node.children) {
    if (predicate(child)) {
      return child;
    }
    const nested = findUiDescendant(child, predicate);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function flattenUiNodes(nodes) {
  const flattened = [];
  for (const node of nodes) {
    flattened.push(node, ...flattenUiNodes(node.children));
  }
  return flattened;
}

function parseUiNodes(xml) {
  const roots = [];
  const stack = [];
  const tokens = xml.match(/<node\b[^>]*\/?\s*>|<\/node>/g) ?? [];
  for (const token of tokens) {
    if (token === "</node>") {
      stack.pop();
      continue;
    }
    const node = {
      text: readXmlAttribute(token, "text"),
      contentDesc: readXmlAttribute(token, "content-desc"),
      resourceId: readXmlAttribute(token, "resource-id"),
      clickable: readXmlAttribute(token, "clickable") === "true",
      bounds: readBounds(token),
      children: [],
      parent: stack.at(-1) ?? null
    };
    if (node.parent) {
      node.parent.children.push(node);
    } else {
      roots.push(node);
    }
    if (!/\/\s*>$/.test(token)) {
      stack.push(node);
    }
  }
  return roots;
}

function readXmlAttribute(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`));
  return match ? unescapeXmlAttribute(match[1]) : "";
}

function unescapeXmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readBounds(node) {
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return match ? toBounds(match) : null;
}

function toBounds(match) {
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function escapeXmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
