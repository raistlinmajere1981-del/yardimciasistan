export interface BusinessConfig {
  id: string;
  name: string;
  display_name: string;
  business_type: "pension" | "restaurant" | "pension_restaurant" | "cafe" | "other";
  logo_url: string;
  colors: {
    primary: string;
    accent: string;
    ink: string;
  };
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  map_url: string;
  description: string;
  working_hours: string[];
  modules: {
    rooms: boolean;
    tables: boolean;
    qr_menu: boolean;
    ai: boolean;
    whatsapp: boolean;
    android: boolean;
  };
  hero: {
    image_url: string;
    eyebrow: string;
    title: string;
    summary: string;
  };
  highlights: Array<{
    label: string;
    description: string;
  }>;
  services: Array<{
    title: string;
    description: string;
    icon: "bed" | "coffee" | "table";
  }>;
  rooms: Array<{
    id: string;
    name: string;
    capacity: number;
    bed_info: string;
    features: string[];
    description: string;
    price_note: string;
    image_url: string;
  }>;
  tables: Array<{
    name: string;
    capacity: number;
    area: string;
  }>;
  menu: {
    categories: Array<{
      id: string;
      name: string;
    }>;
    items: Array<{
      id: string;
      category_id: string;
      name: string;
      description: string;
      price: number;
      currency: string;
      image_url: string;
      is_featured: boolean;
    }>;
  };
  gallery: Array<{
    title: string;
    image_url: string;
  }>;
  social_media: Record<string, string>;
}

export type PageKey =
  | "home"
  | "rooms"
  | "restaurant"
  | "menu"
  | "gallery"
  | "product"
  | "location"
  | "contact"
  | "request"
  | "settings";
