export type BirthdayMode = "manual" | "automatic";

export type BirthdayDeliveryStatus = "pending" | "prepared" | "sent" | "skipped" | "failed";

export type BirthdayEligibilityStatus =
  | "due"
  | "already_sent"
  | "prepared"
  | "excluded"
  | "invalid_phone"
  | "invalid_birth_date"
  | "not_birthday";

export interface BirthdaySettings {
  enabled: boolean;
  mode: BirthdayMode;
  sendTime: string;
  messageTemplate: string;
}

export interface BirthdayCustomerLike {
  id: string;
  fullName: string;
  phone: string;
  birthDate: string;
  birthdayMessageEnabled?: boolean;
  deletedAt?: string;
}

export interface BirthdayDeliveryLike {
  customerId: string;
  birthdayYear: number;
  status: BirthdayDeliveryStatus;
}

export const DEFAULT_BIRTHDAY_MESSAGE_TEMPLATE =
  "Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz.";

export const DEFAULT_BIRTHDAY_SETTINGS: BirthdaySettings = {
  enabled: true,
  mode: "manual",
  sendTime: "10:00",
  messageTemplate: DEFAULT_BIRTHDAY_MESSAGE_TEMPLATE
};
