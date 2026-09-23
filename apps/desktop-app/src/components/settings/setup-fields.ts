import type { SetupFormState } from "../../app/setup-model";
export interface SetupFieldsProps {
  form: SetupFormState;
  onFormChange: (form: SetupFormState) => void;
}
