import type { DatabaseSync } from "node:sqlite";
import type { SaveCustomerCommercialProfileInput } from "@yardimci-asistan/shared";

export type CommercialPayloadResult =
  | { ok: true; commercialProfile: SaveCustomerCommercialProfileInput | null | undefined }
  | { ok: false; message: string };

const fields = new Set([
  "company_name", "tax_office", "tax_number", "authorized_person",
  "dealer_status", "price_group", "payment_term_days"
]);
const textField = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : null;

/** An absent field preserves the existing profile. Explicit null removes it.
 * Dealer privileges are server-owned and cannot be forged from a mobile form. */
export function parseAndroidCustomerCommercial(
  db: DatabaseSync,
  payload: Record<string, unknown>,
  customerId: string,
  wholesaleEnabled: boolean
): CommercialPayloadResult {
  if (!Object.hasOwn(payload, "commercial_profile"))
    return {ok:true,commercialProfile:undefined};
  const raw = payload.commercial_profile;
  if (raw === null) return {ok:true,commercialProfile:null};
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return {ok:false,message:"Ticari müşteri bilgisi geçersiz."};
  const record = raw as Record<string,unknown>;
  if (Object.keys(record).some(key => !fields.has(key)))
    return {ok:false,message:"Ticari müşteri bilgisi desteklenmeyen alan içeriyor."};
  const companyName = textField(record.company_name,180);
  const taxOffice = textField(record.tax_office ?? "",120);
  const taxNumber = textField(record.tax_number ?? "",32);
  const authorizedPerson = textField(record.authorized_person ?? "",160);
  if (!companyName || taxOffice === null || taxNumber === null || authorizedPerson === null)
    return {ok:false,message:"Firma, vergi dairesi veya yetkili kişi bilgisi geçersiz."};
  if (!wholesaleEnabled && ["dealer_status","price_group","payment_term_days"].some(key=>Object.hasOwn(record,key)))
    return {ok:false,message:"Bayi yetkisi ve fiyat grubu için Toptan Satış etkin olmalı."};
  const existing = customerId ? db.prepare(
    "SELECT dealer_status,price_group,payment_term_days FROM customer_commercial_profiles WHERE customer_id=? LIMIT 1"
  ).get(customerId) as {dealer_status?:string;price_group?:string;payment_term_days?:number}|undefined : undefined;
  const dealerStatus = record.dealer_status ?? existing?.dealer_status ?? "inactive";
  const priceGroup = record.price_group ?? existing?.price_group ?? "retail";
  const paymentTermDays = record.payment_term_days ?? existing?.payment_term_days ?? 0;
  if (dealerStatus !== "inactive" && dealerStatus !== "active"
      || !["retail","dealer_a","dealer_b"].includes(String(priceGroup))
      || typeof paymentTermDays !== "number" || !Number.isInteger(paymentTermDays)
      || paymentTermDays < 0 || paymentTermDays > 3650)
    return {ok:false,message:"Bayi durumu, fiyat grubu veya ödeme vadesi geçersiz."};
  return {ok:true,commercialProfile:{
    companyName,taxOffice,taxNumber,authorizedPerson,
    dealerStatus,priceGroup,paymentTermDays
  } as SaveCustomerCommercialProfileInput};
}
