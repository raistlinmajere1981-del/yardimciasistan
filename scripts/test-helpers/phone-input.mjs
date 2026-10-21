import { expect } from "@playwright/test";

export async function verifyPhoneInput(page, input) {
  const previous = await input.inputValue();
  await expect(input).toHaveAttribute("type", "tel");
  await input.fill("");
  await input.pressSequentially("abcXYZçğıöşü@#!");
  await expect(input).toHaveValue("");
  await input.fill("05551234567");
  await input.evaluate(element => element.setSelectionRange(2, 2));
  await page.keyboard.insertText("a6ş");
  await expect(input).toHaveValue("056551234567");
  expect(await input.evaluate(element => element.selectionStart)).toBe(3);
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("05551234567");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("+90 (532) 123-45-67abcŞ🙂@"));
  await input.selectText();
  await page.keyboard.press("Control+V");
  await expect(input).toHaveValue("+90 (532) 123-45-67");
  await input.fill("+44 7911 123456");
  await expect(input).toHaveValue("+44 7911 123456");
  await input.fill(previous);
  await expect(input).toHaveValue(previous);
}
