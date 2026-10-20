export type CustomerDealerStatus = "active" | "inactive";
export type CommercePriceGroup = "retail" | "dealer_a" | "dealer_b";

export interface CustomerCommercialProfile {
  customerId: string;
  businessId: string;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  authorizedPerson: string;
  dealerStatus: CustomerDealerStatus;
  priceGroup: CommercePriceGroup;
  paymentTermDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustomerCommercialProfileInput {
  companyName: string;
  taxOffice?: string;
  taxNumber?: string;
  authorizedPerson?: string;
  dealerStatus?: CustomerDealerStatus;
  priceGroup?: CommercePriceGroup;
  paymentTermDays?: number;
}


export interface CommerceResolvedUnitPrice {
  productId: string;
  customerId: string;
  requestedGroup: CommercePriceGroup;
  appliedGroup: CommercePriceGroup;
  unitPrice: number;
  currency: string;
  fallbackToRetail: boolean;
  dealerEligible: boolean;
}
