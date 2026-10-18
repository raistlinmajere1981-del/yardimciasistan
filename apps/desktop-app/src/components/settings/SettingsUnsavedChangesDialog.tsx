import { ConfirmDialog } from "../ui/ConfirmDialog";
export function SettingsUnsavedChangesDialog(props: {
  open: boolean;
  busy: boolean;
  categoryTitle: string;
  withinModal?: boolean;
  intent?: "navigate" | "close";
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onStay: () => void;
}) {
  if (!props.open) return null;
  const closing = props.intent === "close";
  return <ConfirmDialog withinModal={props.withinModal ?? false} tone="warning" eyebrow="Kaydedilmemiş değişiklikler"
    title={`${props.categoryTitle} değişiklikleri bekliyor`}
    description={closing ? "Servis penceresini kapatmadan önce değişikliklerle ne yapılacağını seçin." : "Bu ayar alanından ayrılmadan önce değişikliklerle ne yapılacağını seçin."}
    busy={props.busy} confirmLabel={props.busy ? "Kaydediliyor…" : closing ? "Kaydet ve kapat" : "Kaydet ve geç"}
    secondaryLabel={closing ? "Değişiklikleri geri al ve kapat" : "Değişiklikleri geri al ve geç"} cancelLabel="Burada kal"
    onConfirm={props.onSaveAndContinue} onSecondary={props.onDiscardAndContinue} onCancel={props.onStay} />;
}
