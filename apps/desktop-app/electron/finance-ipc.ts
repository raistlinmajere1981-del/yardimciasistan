import { ipcMain } from "electron";
import {
  DesktopFinanceService,
  type AddPensionPaymentInput,
  type DesktopFinanceData,
  type DesktopFinanceMutationResult,
  type SaveManualFinanceEntryInput,
  type SetReservationAgreedTotalInput
} from "./finance";

export function registerFinanceIpcHandlers(options: {
  databasePath: () => string;
  assertUnlocked: () => void;
  assertCapability?: () => void;
  assertAccommodationReservationCapability?: () => void;
  assertAccommodationFolioCapability?: () => void;
  onMutation?: () => void;
}) {
  const service = () => new DesktopFinanceService(options.databasePath());
  const finalize = (result: DesktopFinanceMutationResult): DesktopFinanceMutationResult => {
    if (result.ok) {
      options.onMutation?.();
    }
    return result;
  };
  const assertAccess = () => {
    options.assertUnlocked();
    options.assertCapability?.();
  };

  ipcMain.handle("finance:getData", (_event, limit?: number): DesktopFinanceData => {
    assertAccess();
    return service().getData(limit);
  });

  ipcMain.handle(
    "finance:saveManualEntry",
    (_event, input: SaveManualFinanceEntryInput): DesktopFinanceMutationResult => {
      assertAccess();
      return finalize(service().saveManualEntry(input));
    }
  );

  ipcMain.handle("finance:deleteManualEntry", (_event, entryId: string): DesktopFinanceMutationResult => {
    assertAccess();
    return finalize(service().deleteManualEntry(entryId));
  });

  ipcMain.handle(
    "finance:setReservationTotal",
    (_event, input: SetReservationAgreedTotalInput): DesktopFinanceMutationResult => {
      assertAccess();
      options.assertAccommodationReservationCapability?.();
      return finalize(service().setReservationAgreedTotal(input));
    }
  );

  ipcMain.handle(
    "finance:addPensionPayment",
    (_event, input: AddPensionPaymentInput): DesktopFinanceMutationResult => {
      assertAccess();
      options.assertAccommodationFolioCapability?.();
      return finalize(service().addPensionPayment(input));
    }
  );
}
