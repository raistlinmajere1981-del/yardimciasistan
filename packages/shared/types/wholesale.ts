export type CustomerDealerStatus = "candidate" | "active" | "inactive";

export interface CustomerCommercialProfile {
  customerId: string;
  businessId: string;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  authorizedPerson: string;
  dealerStatus: CustomerDealerStatus;
  paymentTermDays: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustomerCommercialProfileInput {
  companyName: string;
  taxOffice?: string;
  taxNumber?: string;
  authorizedPerson?: string;
  dealerStatus?: CustomerDealerStatus;
  paymentTermDays?: number;
  notes?: string;
}
