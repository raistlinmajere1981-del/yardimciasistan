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
  onMutation?: () => void;
}) {
  const service = () => new DesktopFinanceService(options.databasePath());
  const finalize = (result: DesktopFinanceMutationResult): DesktopFinanceMutationResult => {
    if (result.ok) {
      options.onMutation?.();
    }
    return result;
  };

  ipcMain.handle("finance:getData", (_event, limit?: number): DesktopFinanceData => {
    options.assertUnlocked();
    return service().getData(limit);
  });

  ipcMain.handle(
    "finance:saveManualEntry",
    (_event, input: SaveManualFinanceEntryInput): DesktopFinanceMutationResult => {
      options.assertUnlocked();
      return finalize(service().saveManualEntry(input));
    }
  );

  ipcMain.handle("finance:deleteManualEntry", (_event, entryId: string): DesktopFinanceMutationResult => {
    options.assertUnlocked();
    return finalize(service().deleteManualEntry(entryId));
  });

  ipcMain.handle(
    "finance:setReservationTotal",
    (_event, input: SetReservationAgreedTotalInput): DesktopFinanceMutationResult => {
      options.assertUnlocked();
      return finalize(service().setReservationAgreedTotal(input));
    }
  );

  ipcMain.handle(
    "finance:addPensionPayment",
    (_event, input: AddPensionPaymentInput): DesktopFinanceMutationResult => {
      options.assertUnlocked();
      return finalize(service().addPensionPayment(input));
    }
  );
}
