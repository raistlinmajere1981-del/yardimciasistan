import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { saveBusinessLayout } = require("../../apps/desktop-app/dist-electron/business-layout.js");

export function seedSmokeBusinessLayout(databasePath, options = {}) {
  const {
    roomCount = 0,
    tableCategories = [],
    roomNamePrefix = "Test Oda",
    roomNumberStart = 101,
    roomCapacity = 2,
    nightlyPriceMinor = 0,
    currency = "TRY"
  } = options;

  const rooms = Array.from({ length: roomCount }, (_, index) => ({
    clientKey: `smoke-room-${index + 1}`,
    name: `${roomNamePrefix} ${index + 1}`,
    number: String(roomNumberStart + index),
    capacity: roomCapacity,
    bedInfo: "1 çift kişilik yatak",
    floor: "",
    features: [],
    description: "",
    priceNote: "",
    nightlyPriceMinor,
    currency
  }));

  const result = saveBusinessLayout(databasePath, {
    rooms,
    tableCategories
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.layout;
}

export function saveSmokeBusinessLayout(databasePath, input) {
  return saveBusinessLayout(databasePath, input);
}
