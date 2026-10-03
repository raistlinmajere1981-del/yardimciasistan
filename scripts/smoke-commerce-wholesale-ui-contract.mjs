import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const capabilitySource = read("packages/shared/types/business-capabilities.ts");
const settingsSource = read("apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx");
const fieldsSource = read("apps/desktop-app/src/components/customers/CustomerFormFields.tsx");
const commercialFieldsSource = read("apps/desktop-app/src/components/customers/CustomerCommercialProfileFields.tsx");
const modelSource = read("apps/desktop-app/src/app/customer-model.ts");
const workspaceSource = read("apps/desktop-app/src/components/customers/CustomerWorkspace.tsx");
const createSource = read("apps/desktop-app/src/components/customers/CustomerCreateEditor.tsx");
const listSource = read("apps/desktop-app/src/components/customers/CustomersWorkspace.tsx");
const frameSource = read("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const routeSource = read("apps/desktop-app/src/components/app/routes/CustomerWorkRoute.tsx");
const customerIpcSource = read("apps/desktop-app/electron/ipc/customer-ipc.ts");

assert.match(capabilitySource, /WHOLESALE:\s*"commerce\.wholesale"/);
assert.match(capabilitySource, /\[C\.WHOLESALE\]:\s*\[C\.CUSTOMERS, C\.ORDERS\]/);
assert.match(capabilitySource, /RETAIL_OPTIONAL_CAPABILITIES[\s\S]*C\.WHOLESALE/);
assert.match(settingsSource, /\[C\.WHOLESALE\]:\s*"Bayi \/ Toptan Satış"/);

assert.match(fieldsSource, /wholesaleEnabled\s*&&[\s\S]*CustomerCommercialProfileFields/);
for (const label of [
  "Ticari / bayi müşterisi",
  "Firma / unvan",
  "Yetkili kişi",
  "Vergi dairesi",
  "Vergi no",
  "Bayi durumu",
  "Ödeme vadesi \(gün\)",
  "Ticari not"
]) {
  assert.match(commercialFieldsSource, new RegExp(label));
}

assert.match(modelSource, /commercialProfileEnabled:\s*boolean/);
assert.match(modelSource, /customerFormToInput\(form: CustomerFormState, wholesaleEnabled = false\)/);
assert.match(modelSource, /commercialProfile:\s*form\.commercialProfileEnabled/);
assert.match(workspaceSource, /customerFormToInput\(form, wholesaleEnabled\)/);
assert.match(createSource, /customerFormToInput\(form, wholesaleEnabled\)/);
assert.match(listSource, /customer\.commercialProfile\.companyName/);
assert.match(listSource, /Aktif bayi/);
assert.match(listSource, /label:\s*"Bayiler"/);
assert.match(listSource, /!wholesaleEnabled\s*&&\s*filter === "dealers"[\s\S]*setFilter\("all"\)/);
assert.match(routeSource, /wholesaleEnabled=\{features\.wholesale\}/);
assert.match(
  frameSource,
  /wholesaleEnabled:\s*runtimeHasCapability\(businessCapabilities, BUSINESS_CAPABILITIES\.WHOLESALE\)/
);
assert.match(
  customerIpcSource,
  /input\.commercialProfile !== undefined[\s\S]*BUSINESS_CAPABILITIES\.WHOLESALE/
);

console.log("commerce-wholesale-ui-contract-smoke-ok");
