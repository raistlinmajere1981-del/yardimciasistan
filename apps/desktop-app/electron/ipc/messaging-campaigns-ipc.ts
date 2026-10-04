import { ipcMain } from "electron";
import type { BusinessMessagingResult, MessagingCampaignInput, MessagingChannel, SaveMessagingPreferenceInput, SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import type { MessagingCampaignService } from "../messaging-campaigns/service";
import { MessagingCampaignError } from "../messaging-campaigns/validation";

export function registerMessagingCampaignsIpc(options: { service: MessagingCampaignService; assertUnlocked: () => void }) {
  async function operation<T>(action: () => Promise<T> | T): Promise<BusinessMessagingResult<T>> {
    options.assertUnlocked();
    try { return { ok: true, value: await action() }; }
    catch (error) { return { ok: false, code: error instanceof MessagingCampaignError ? error.code : "operation_failed",
      message: error instanceof MessagingCampaignError ? error.message : "Kampanya işlemi tamamlanamadı." }; }
  }
  const service = options.service;
  ipcMain.handle("messagingCampaigns:preference", (_event, customerId: string, channel: MessagingChannel, purpose: "marketing") => operation(() => service.getPreference(customerId, channel, purpose)));
  ipcMain.handle("messagingCampaigns:savePreference", (_event, input: SaveMessagingPreferenceInput) => operation(() => service.savePreference(input)));
  ipcMain.handle("messagingCampaigns:segments", () => operation(() => service.listSegments()));
  ipcMain.handle("messagingCampaigns:saveSegment", (_event, input: SaveMessagingSegmentInput) => operation(() => service.saveSegment(input)));
  ipcMain.handle("messagingCampaigns:previewSegment", (_event, id: string, channel: MessagingChannel) => operation(() => service.previewSegment(id, channel)));
  ipcMain.handle("messagingCampaigns:campaigns", () => operation(() => service.listCampaigns()));
  ipcMain.handle("messagingCampaigns:create", (_event, input: MessagingCampaignInput) => operation(() => service.createCampaign(input)));
  ipcMain.handle("messagingCampaigns:campaign", (_event, id: string) => operation(() => service.getCampaign(id)));
  ipcMain.handle("messagingCampaigns:preview", (_event, id: string) => operation(() => service.previewCampaign(id)));
  ipcMain.handle("messagingCampaigns:prepare", (_event, id: string) => operation(() => service.prepareCampaign(id)));
  ipcMain.handle("messagingCampaigns:cancel", (_event, id: string) => operation(() => service.cancelCampaign(id)));
}
