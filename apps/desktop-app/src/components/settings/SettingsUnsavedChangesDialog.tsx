import { ConfirmDialog } from "../ui/ConfirmDialog";
export function SettingsUnsavedChangesDialog(props: {
  open: boolean;
  busy: boolean;
  categoryTitle: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onStay: () => void;
}) {
  if (!props.open) return null;
  return <ConfirmDialog tone="warning" eyebrow="Kaydedilmemiş değişiklikler"
    title={`${props.categoryTitle} değişiklikleri bekliyor`}
    description="Bu ayar alanından ayrılmadan önce değişikliklerle ne yapılacağını seçin."
    busy={props.busy} confirmLabel={props.busy ? "Kaydediliyor…" : "Kaydet ve geç"}
    secondaryLabel="Değişiklikleri geri al ve geç" cancelLabel="Burada kal"
    onConfirm={props.onSaveAndContinue} onSecondary={props.onDiscardAndContinue} onCancel={props.onStay} />;
}
