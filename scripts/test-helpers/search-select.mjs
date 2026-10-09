export async function chooseSearchSelect(scope, label, optionName) {
  const trigger = scope.getByLabel(label, { exact: true });
  await trigger.click();
  // Page-level RecordPicker dialogs render into document.body via a portal.
  // Resolve the picker from the page root while retaining the trigger's local scope.
  const pickerRoot = typeof scope.goto === 'function' ? scope : scope.locator('xpath=ancestor-or-self::body');
  const picker = pickerRoot.getByRole('dialog', { name: `${label} seçici`, exact: true });
  const descriptor = typeof optionName === 'object' && !(optionName instanceof RegExp);
  if (descriptor && optionName.search) await picker.getByRole('combobox').fill(optionName.search);
  const option = descriptor && optionName?.value !== undefined
    ? picker.locator(`[role="option"][data-value=${JSON.stringify(optionName.value)}]`)
    : picker.getByRole('option', { name: descriptor ? optionName.label : optionName });
  await option.click();
}
