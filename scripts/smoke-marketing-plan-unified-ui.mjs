import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { scheduleFixture } from "./test-helpers/marketing-schedule-fixtures.mjs";
import { openMarketingWorkspaceBrowser, assertMarketingDialog } from "./test-helpers/marketing-workspace-browser.mjs";
import { chooseDate, chooseTime } from "./test-helpers/date-time-picker.mjs";

const f = scheduleFixture();
let ui;
try {
  const prepared = (await f.smsCampaign()).campaign;
  ui = await openMarketingWorkspaceBrowser(f);
  const {page} = ui;
  const recent = page.getByLabel("Son paylaşımlar", {exact:true});
  await recent.getByRole("button").filter({hasText:"SMS Fixture"}).click();
  const delivery = page.getByRole("dialog", {name:"SMS Fixture"});
  await expect(delivery).toBeVisible();
  await delivery.getByRole("button", {name:"Gönderimi planla"}).click();

  // The old standalone plan editor is removed: create within the same share detail.
  const detail = page.getByRole("dialog", {name:"Paylaşım detayı"});
  await expect(detail).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(detail.getByRole("region", {name:"İçerik", exact:true})).toBeVisible();
  const panel = detail.getByRole("region", {name:"Yayın planı", exact:true});
  await expect(panel.getByRole("region", {name:"Yeni yayın planı"})).toBeVisible();
  await expect(panel.getByRole("button", {name:"Plan oluştur"})).toBeVisible();
  await expect(detail.getByLabel("Plan türü")).toHaveValue("once");
  await expect(detail.getByLabel("Plan türü").locator("option[value='recurring']")).toHaveAttribute("disabled", "");
  await chooseDate(page, "Tarih", "2032-04-16");
  await chooseTime(page, "Saat", "10:30");
  await detail.getByRole("button", {name:"Plan oluştur"}).click();
  await expect(panel.getByRole("button", {name:"Planı düzenle"})).toBeVisible();
  const plans = f.db.listMarketingSchedules();
  assert.equal(plans.length, 1);
  assert.equal(plans[0].schedule.targetId, prepared.id);
  assert.equal(plans[0].schedule.channel, "sms");
  assert.equal(plans[0].schedule.scheduleType, "once");
  assert.equal(plans[0].schedule.startsLocal, "2032-04-16T10:30");
  await expect(detail.getByRole("region", {name:"Geçmiş"})).toBeVisible();
  await assertMarketingDialog(page, detail);
  await detail.getByRole("button", {name:"Gönderimi yönet"}).click();

  // Existing plan reopens in the same shared surface, without creating a second plan.
  await expect(page.getByRole("dialog", {name:"SMS Fixture"})).toBeVisible();
  await page.getByRole("button", {name:"Gönderimi planla"}).click();
  const reopened = page.getByRole("dialog", {name:"Paylaşım detayı"});
  await expect(reopened.getByRole("region", {name:"Yayın planı", exact:true})).toContainText("SMS Fixture");
  await expect(reopened.getByRole("button", {name:"Plan oluştur"})).toHaveCount(0);
  await reopened.getByRole("region", {name:"Yayın planı", exact:true}).getByRole("button", {name:"Planı duraklat"}).click();
  await expect(reopened.getByRole("region", {name:"Yayın planı", exact:true}).getByRole("button", {name:"Planı devam ettir"})).toBeVisible();
  assert.equal(f.db.listMarketingSchedules().length, 1);
  assert.equal(f.db.getMarketingSchedule(plans[0].schedule.id).status, "paused");
  await reopened.getByRole("button", {name:"Çalışma alanını kapat"}).click();
  assert.deepEqual(ui.errors, []);
  console.log("marketing-plan-unified-ui-ok: campaign create/reopen/pause all use the shared detail");
} finally {
  await ui?.close();
  await f.dispose();
}
