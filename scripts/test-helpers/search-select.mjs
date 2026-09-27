export async function chooseSearchSelect(scope, label, optionName) {
  const trigger = scope.getByLabel(label, { exact: true });
  await trigger.click();
  const picker = scope.getByRole('dialog', { name: `${label} seçici`, exact: true });
  await picker.getByRole('option', { name: optionName }).click();
}

