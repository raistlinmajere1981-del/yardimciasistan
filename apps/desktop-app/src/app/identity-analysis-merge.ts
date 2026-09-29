import type { IdentityDocumentFields, IdentityImageAnalysis } from "@yardimci-asistan/shared";

const FIELD_LABELS: Record<keyof IdentityDocumentFields, string> = {
  full_name: "ad soyad",
  identity_type: "belge türü",
  identity_number: "kimlik / pasaport no",
  nationality: "uyruk",
  birth_date: "doğum tarihi",
  gender: "cinsiyet",
  document_serial_number: "seri / belge no",
  document_expiry_date: "son geçerlilik",
  birth_place: "doğum yeri",
  mother_name: "anne adı",
  father_name: "baba adı",
  issuing_authority: "veren makam",
  address: "adres"
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as Array<keyof IdentityDocumentFields>;

export interface MergedIdentityAnalysis {
  fields: IdentityDocumentFields;
  warnings: string[];
}

export function mergeIdentityImageAnalyses(analyses: readonly IdentityImageAnalysis[]): MergedIdentityAnalysis {
  const warnings = new Set<string>();
  for (const analysis of analyses) {
    for (const warning of analysis.warnings) {
      const trimmed = warning.trim();
      if (trimmed) warnings.add(trimmed);
    }
  }

  const pick = <K extends keyof IdentityDocumentFields>(key: K): IdentityDocumentFields[K] => {
    let selected: IdentityDocumentFields[K] | "" = "";
    let normalizedSelected = "";

    for (const analysis of analyses) {
      const value = analysis.fields[key];
      const normalized = normalizeComparable(value);
      if (!normalized) continue;
      if (!normalizedSelected) {
        selected = value;
        normalizedSelected = normalized;
        continue;
      }
      if (normalized !== normalizedSelected) {
        warnings.add(
          `Kimliğin ön ve arka yüzünde ${FIELD_LABELS[key]} farklı okundu; ilk güvenilir değer korundu.`
        );
      }
    }

    return selected as IdentityDocumentFields[K];
  };

  const fields: IdentityDocumentFields = {
    full_name: pick("full_name"),
    identity_type: pick("identity_type"),
    identity_number: pick("identity_number"),
    nationality: pick("nationality"),
    birth_date: pick("birth_date"),
    gender: pick("gender"),
    document_serial_number: pick("document_serial_number"),
    document_expiry_date: pick("document_expiry_date"),
    birth_place: pick("birth_place"),
    mother_name: pick("mother_name"),
    father_name: pick("father_name"),
    issuing_authority: pick("issuing_authority"),
    address: pick("address")
  };

  return { fields, warnings: [...warnings] };
}

function normalizeComparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR");
}
