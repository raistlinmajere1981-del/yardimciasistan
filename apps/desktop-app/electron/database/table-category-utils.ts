import type { SaveTableCategoryInput } from "../database-types.js";

export interface NormalizedTableCategoryInput {
  sourceName: string;
  sourceKey: string;
  name: string;
  nameKey: string;
  tableCount: number;
}

export function normalizeTableCategoryInputs(
  input: SaveTableCategoryInput[] | undefined
):
  | { ok: true; categories: NormalizedTableCategoryInput[] | undefined }
  | { ok: false; message: string } {
  if (input === undefined) {
    return { ok: true, categories: undefined };
  }
  if (!Array.isArray(input)) {
    return { ok: false, message: "Masa kategorileri geçerli bir liste olmalı." };
  }
  if (input.length > 30) {
    return { ok: false, message: "En fazla 30 masa kategorisi tanımlanabilir." };
  }

  const categories: NormalizedTableCategoryInput[] = [];
  const categoryNames = new Set<string>();
  const sourceNames = new Set<string>();
  let totalTableCount = 0;

  for (const item of input) {
    const name = normalizeTableCategoryLabel(item?.name);
    const sourceName = normalizeTableCategoryLabel(item?.sourceName);
    const tableCount = Number(item?.tableCount);
    if (!name) {
      return { ok: false, message: "Her masa kategorisinin bir adı olmalı." };
    }
    if (name.length > 50 || /[\x00-\x1F\x7F]/.test(name)) {
      return { ok: false, message: `"${name.slice(0, 30)}" masa kategorisi adı geçersiz.` };
    }
    if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 200) {
      return { ok: false, message: `"${name}" kategorisindeki masa sayısı 1 ile 200 arasında olmalı.` };
    }

    const nameKey = tableCategoryKey(name);
    const sourceKey = sourceName ? tableCategoryKey(sourceName) : "";
    if (categoryNames.has(nameKey)) {
      return { ok: false, message: `"${name}" masa kategorisi birden fazla kez kullanılamaz.` };
    }
    if (sourceKey && sourceNames.has(sourceKey)) {
      return { ok: false, message: "Aynı mevcut masa kategorisi birden fazla satırda düzenlenemez." };
    }

    categoryNames.add(nameKey);
    if (sourceKey) {
      sourceNames.add(sourceKey);
    }
    totalTableCount += tableCount;
    categories.push({ sourceName, sourceKey, name, nameKey, tableCount });
  }

  if (totalTableCount > 500) {
    return { ok: false, message: "Toplam masa sayısı 500'ü aşamaz." };
  }

  return { ok: true, categories };
}

export function normalizeTableCategoryLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeTableCategoryName(value: unknown): string {
  return normalizeTableCategoryLabel(value) || "Genel";
}

export function tableCategoryKey(value: string): string {
  return value.toLocaleLowerCase("tr-TR");
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
