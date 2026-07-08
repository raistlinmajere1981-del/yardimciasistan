export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldError[];
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function requiredField(field: string, value: unknown, label: string = field): FieldError | null {
  if (isNonEmptyString(value)) {
    return null;
  }

  return {
    field,
    message: `${label} alanı gerekli.`
  };
}

export function validateRequiredFields(record: Record<string, unknown>, requiredFields: Array<{ field: string; label?: string }>): ValidationResult {
  const errors = requiredFields
    .map(({ field, label }) => requiredField(field, record[field], label))
    .filter((error): error is FieldError => error !== null);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => result.errors);
  return {
    ok: errors.length === 0,
    errors
  };
}
