import { buildCustomerRequestWhatsAppMessage } from "@yardimci-asistan/whatsapp-bridge";
import { locale, ui } from "./site-language";

// Only the site's generated message chrome is localized; submitted values stay intact.
export function requestMessage(input: Parameters<typeof buildCustomerRequestWhatsAppMessage>[0], businessName: string): string {
  if (locale === "tr-TR") return buildCustomerRequestWhatsAppMessage(input, businessName);
  const type = input.request_type === "pension_reservation" ? ui("Rezervasyon talebi")
    : input.request_type === "restaurant_reservation" ? ui("Masa talebi") : ui("Bilgi talebi");
  return [
    ui("Merhaba, {0} için talep oluşturmak istiyorum.", {0: businessName}),
    ui("Talep türü: {0}", {0: type}),
    ui("Ad soyad: {0}", {0: input.customer_name}),
    ui("Telefon: {0}", {0: input.customer_phone}),
    ui("Tarih: {0}", {0: input.date_text}),
    input.time_text ? ui("Saat: {0}", {0: input.time_text}) : "",
    ui("Kişi sayısı: {0}", {0: new Intl.NumberFormat(locale).format(Number(input.guest_count))}),
    input.message ? ui("Not: {0}", {0: input.message}) : "",
    ui("Lütfen bilgileri kontrol edip gönder tuşuna basın.")
  ].filter(Boolean).join("\n");
}
