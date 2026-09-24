import { useDialogFocus } from "../ui/useDialogFocus";
import { ActionButton } from "../ui/ActionButton";

export function SettingsUnsavedChangesDialog(props: {
  open: boolean;
  busy: boolean;
  categoryTitle: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onStay: () => void;
}) {
  const dialogRef = useDialogFocus(props.open);

  if (!props.open) return null;

  return (
    <div
      className="manual-request-backdrop overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.busy) props.onStay();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog dialog--compact settings-unsaved-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-unsaved-title"
        aria-describedby="settings-unsaved-description"
      >
        <div className="overlay-heading">
          <p>Kaydedilmemiş değişiklikler</p>
          <h2 id="settings-unsaved-title">{props.categoryTitle} değişiklikleri bekliyor</h2>
        </div>
        <p id="settings-unsaved-description">
          Bu ayar alanından ayrılmadan önce değişikliklerle ne yapılacağını seçin.
        </p>
        <div className="form-actions settings-unsaved-actions">
          <ActionButton type="button" disabled={props.busy} onClick={props.onSaveAndContinue}>
            {props.busy ? "Kaydediliyor…" : "Kaydet ve geç"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            type="button"
            disabled={props.busy}
            onClick={props.onDiscardAndContinue}
          >
            Değişiklikleri geri al ve geç
          </ActionButton>
          <ActionButton variant="ghost" type="button" disabled={props.busy} onClick={props.onStay}>
            Burada kal
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
