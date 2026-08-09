export interface ManualRequestFormState {
  requestType: string;
  customerName: string;
  customerPhone: string;
  dateText: string;
  startDate: string;
  endDate: string;
  time: string;
  guestCount: string;
  message: string;
  priority: string;
}

export const initialManualRequestForm: ManualRequestFormState = {
  requestType: "general_info",
  customerName: "",
  customerPhone: "",
  dateText: "",
  startDate: "",
  endDate: "",
  time: "",
  guestCount: "1",
  message: "",
  priority: "normal"
};
