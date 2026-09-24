import { normalizeTableCategoryName, tableCategoryKey } from "@yardimci-asistan/shared";
export { normalizeTableCategoryName, tableCategoryKey, type NormalizedTableCategoryInput } from "@yardimci-asistan/shared";

function normalizeTableCategoryLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function reconcileTableName(currentNameValue: unknown, currentAreaValue: unknown, nextArea: string, position: number): string {
  const currentName = normalizeTableCategoryLabel(currentNameValue);
  if (!currentName) {
    return `${nextArea} ${position}`;
  }

  const currentArea = normalizeTableCategoryName(currentAreaValue);
  const numberedName = /^(.*\S)\s+(\d+)$/.exec(currentName);
  if (!numberedName) {
    return currentName;
  }

  const prefixKey = tableCategoryKey(normalizeTableCategoryLabel(numberedName[1]));
  const currentAreaKey = tableCategoryKey(currentArea);
  const isGenericTableName = currentAreaKey === tableCategoryKey("Genel") && prefixKey === tableCategoryKey("Masa");
  return prefixKey === currentAreaKey || isGenericTableName
    ? `${nextArea} ${position}`
    : currentName;
}
