export async function chooseSearchSelect(scope, label, optionName) {
  const trigger = scope.getByLabel(label, { exact: true });
  await trigger.click();
  const picker = scope.getByRole('dialog', { name: `${label} seçici`, exact: true });
  const descriptor = typeof optionName === 'object' && !(optionName instanceof RegExp);
  if (descriptor && optionName.search) await picker.getByRole('combobox').fill(optionName.search);
  const option = descriptor && optionName?.value !== undefined
    ? picker.locator(`[role="option"][data-value=${JSON.stringify(optionName.value)}]`)
    : picker.getByRole('option', { name: descriptor ? optionName.label : optionName });
  await option.click();
}
