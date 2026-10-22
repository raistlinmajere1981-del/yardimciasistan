import type { Dispatch, SetStateAction } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../../electron/database";
import type { CustomerWorkTab, DesktopPage } from "../../../app/navigation";
import type {
  CustomerController,
  MessagingController
} from "../../../app/controller-types";
import type { DesktopWorkspaceFeatures } from "../../../app/desktop-workspace-features";
import type { useKbsNotificationController } from "../../../app/use-kbs-notification-controller";
import { CustomerMessagesWorkspace } from "../../customers/CustomerMessagesWorkspace";
import { CustomersWorkspace } from "../../customers/CustomersWorkspace";
import { KbsAutomationWorkspace } from "../../customers/KbsAutomationWorkspace";
import { RequestsWorkspace, getRequestStatusTone } from "../../customers/RequestsWorkspace";
import { WhatsAppWorkspace } from "../../messages/MessageWorkspaces";
import { CustomerWorkPage } from "../../../pages/CustomerWorkPage";

interface CustomerWorkRouteProps {
  activePage: DesktopPage;
  activeTab: CustomerWorkTab;
  onTabChange: Dispatch<SetStateAction<CustomerWorkTab>>;
  surfaceData: DesktopDashboardData;
  enabledCapabilities: BusinessCapability[];
  features: DesktopWorkspaceFeatures;
  customerController: CustomerController;
  messagingController: MessagingController;
  selectedKbsCustomerId: string;
  kbsEgmSessionRequest: number;
  kbsSessionRetryNotificationId: string;
  onSessionRetryConsumed: () => void;
  kbsController: ReturnType<typeof useKbsNotificationController>;
  onSendKbs: (notificationId: string, customerId: string) => Promise<void>;
  onOpenRequestReservation: (request: SyncedCustomerRequest) => void;
}

export function CustomerWorkRoute({
  activePage,
  activeTab,
  onTabChange,
  surfaceData,
  enabledCapabilities,
  features,
  customerController,
  messagingController,
  selectedKbsCustomerId,
  kbsEgmSessionRequest,
  kbsSessionRetryNotificationId,
  onSessionRetryConsumed,
  kbsController,
  onSendKbs,
  onOpenRequestReservation
}: CustomerWorkRouteProps) {
  const {
    manualRequestForm,
    setManualRequestForm,
    manualRequestState,
    setSelectedRequestId,
    selectedRequest,
    convertingRequestId,
    handleCreateManualRequest,
    handleConvertRequestToReservation,
    handleUpdateRequestStatus,
    handleDeleteRequest,
    handleDeleteCustomer,
    handleSaveCustomer,
    handleAnalyzeIdentityImage
  } = customerController;
  const {
    setSelectedWhatsAppRequestId,
    readyWhatsAppRequests,
    selectedWhatsAppRequest,
    selectedWhatsAppMessage,
    selectedWhatsAppUrl,
    suggestingRequestId,
    aiState,
    aiMessage,
    openWhatsApp,
    openSelectedWhatsAppExternal,
    handleWhatsAppMessageSent,
    handleDeleteWhatsAppMessage,
    handleCreateOwnerReplySuggestion,
    handleRewriteRequestReply
  } = messagingController;

  const selectedSurfaceRequest = surfaceData.requests.find((request) => request.id === selectedRequest?.id)
    ?? surfaceData.requests[0];
  const preparedActive = activePage === "customerWork" && activeTab === "prepared";

  return (
    <>
      {activePage === "customerWork" && !preparedActive ? (
        <CustomerWorkPage
          requestsEnabled={features.requests}
          whatsappEnabled={features.customerMessaging}
          kbsEnabled={surfaceData.kbsOverview.enabled}
          activeTab={activeTab}
          onTabChange={onTabChange}
          requests={(
            <RequestsWorkspace
              onApproveDealer={customerController.handleApproveDealerApplication}
              requests={surfaceData.requests}
              selectedRequest={selectedSurfaceRequest}
              aiEnabled={features.ai}
              whatsappEnabled={features.whatsapp}
              enabledCapabilities={enabledCapabilities}
              convertingRequestId={convertingRequestId}
              suggestingRequestId={suggestingRequestId}
              aiState={aiState}
              aiMessage={aiMessage}
              manualRequestForm={manualRequestForm}
              manualRequestState={manualRequestState}
              onSelectRequest={setSelectedRequestId}
              onManualRequestFormChange={setManualRequestForm}
              onCreateManualRequest={handleCreateManualRequest}
              onWhatsApp={openWhatsApp}
              onConvert={(request) => void handleConvertRequestToReservation(request)}
              onSuggest={(request) => void handleCreateOwnerReplySuggestion(request)}
              onRewrite={(request, instructions) => void handleRewriteRequestReply(request, instructions)}
              onUpdateStatus={(request, status) => void handleUpdateRequestStatus(request, status)}
              onOpenReservation={onOpenRequestReservation}
              onDelete={(request) => void handleDeleteRequest(request)}
            />
          )}
          customers={(
            <CustomersWorkspace
              customers={surfaceData.customers}
              stays={surfaceData.customerRoomStays}
              reservations={surfaceData.reservations}
              notifications={surfaceData.hospitalityNotifications}
              kbsOverview={surfaceData.kbsOverview}
              aiEnabled={features.ai}
              wholesaleEnabled={features.wholesale}
              staysEnabled={features.accommodation.stays}
              reservationsEnabled={features.accommodation.reservations || features.food.reservations}
              onSave={handleSaveCustomer}
              onAnalyzeIdentity={handleAnalyzeIdentityImage}
              onDelete={handleDeleteCustomer}
              onSendKbs={onSendKbs}
            />
          )}
          kbs={(
            <KbsAutomationWorkspace
              data={surfaceData}
              selectedCustomerId={selectedKbsCustomerId}
              controller={kbsController}
              egmSessionRequest={kbsEgmSessionRequest}
              sessionRetryNotificationId={kbsSessionRetryNotificationId}
              onSessionRetryConsumed={onSessionRetryConsumed}
            />
          )}
          messages={null}
        />
      ) : null}

      {features.customerMessaging && (
        <div
          className={`persistent-customer-messages-page${preparedActive ? " is-active" : ""}`}
          aria-hidden={preparedActive ? undefined : true}
        >
          <CustomerWorkPage
            requestsEnabled={features.requests}
            whatsappEnabled
            kbsEnabled={surfaceData.kbsOverview.enabled}
            activeTab="prepared"
            onTabChange={onTabChange}
            requests={null}
            customers={null}
            kbs={null}
            messages={(
              <CustomerMessagesWorkspace
                whatsappEnabled
                prewarmWebview
                active={preparedActive}
                safeMode={(onOpenWeb) => (
                  <WhatsAppWorkspace
                    view="safe"
                    preparedMessage={messagingController.preparedWhatsAppMessage}
                    requests={readyWhatsAppRequests}
                    selectedRequest={selectedWhatsAppRequest}
                    selectedMessage={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
                    selectedUrl={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
                    getRequestStatusTone={getRequestStatusTone}
                    onSelectRequest={setSelectedWhatsAppRequestId}
                    onOpenExternal={openSelectedWhatsAppExternal}
                    onOpenWeb={onOpenWeb}
                    onMessageSent={handleWhatsAppMessageSent}
                    onDeleteMessage={(request) => void handleDeleteWhatsAppMessage(request)}
                  />
                )}
                webMode={(onReturnToSafe) => (
                  <WhatsAppWorkspace
                    view="web"
                    preparedMessage={messagingController.preparedWhatsAppMessage}
                    requests={readyWhatsAppRequests}
                    selectedRequest={selectedWhatsAppRequest}
                    selectedMessage={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
                    selectedUrl={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
                    getRequestStatusTone={getRequestStatusTone}
                    onSelectRequest={setSelectedWhatsAppRequestId}
                    onOpenExternal={openSelectedWhatsAppExternal}
                    onReturnToSafe={onReturnToSafe}
                    onMessageSent={handleWhatsAppMessageSent}
                    onDeleteMessage={(request) => void handleDeleteWhatsAppMessage(request)}
                  />
                )}
              />
            )}
          />
        </div>
      )}
    </>
  );
}
