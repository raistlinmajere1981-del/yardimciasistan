export async function chooseDate(scope, label, value) {
  const trigger = scope.getByRole("button", { name: label, exact: true });
  await trigger.click();
  const picker = trigger.locator("xpath=..");
  const dialog = picker.getByRole("dialog", { name: `${label} seçici` });
  const target = parseDateKey(value);
  if (!target) throw new Error(`Invalid date picker value: ${value}`);

  const visibleMonth = await dialog.getAttribute("data-picker-month");
  const current = parseMonthKey(visibleMonth);
  if (!current) throw new Error(`Date picker month is unavailable for ${label}.`);

  const monthDelta = (target.year - current.year) * 12 + (target.month - current.month);
  const direction = monthDelta < 0 ? "Önceki ay" : "Sonraki ay";
  for (let index = 0; index < Math.abs(monthDelta); index += 1) {
    await dialog.getByRole("button", { name: direction, exact: true }).click();
  }
  await dialog.locator(`[data-date="${value}"]`).click();
}

export async function chooseTime(scope, label, value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time picker value: ${value}`);
  const trigger = scope.getByRole("button", { name: label, exact: true });
  await trigger.click();
  const picker = trigger.locator("xpath=..");
  const dialog = picker.getByRole("dialog", { name: `${label} seçici` });
  await dialog.getByRole("listbox", { name: "Saat", exact: true }).getByRole("option", { name: match[1], exact: true }).click();
  await dialog.getByRole("listbox", { name: "Dakika", exact: true }).getByRole("option", { name: match[2], exact: true }).click();
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseMonthKey(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}
