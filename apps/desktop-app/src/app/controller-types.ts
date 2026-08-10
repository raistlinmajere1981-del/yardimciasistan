export type AppLockController = ReturnType<(typeof import("./use-app-lock"))["useAppLock"]>;
export type DesktopSyncController = ReturnType<(typeof import("./use-desktop-sync"))["useDesktopSync"]>;
export type MenuController = ReturnType<(typeof import("./use-menu-controller"))["useMenuController"]>;
export type SetupController = ReturnType<(typeof import("./use-setup-controller"))["useSetupController"]>;
export type MessagingController = ReturnType<(typeof import("./use-messaging-controller"))["useMessagingController"]>;
export type CustomerController = ReturnType<(typeof import("./use-customer-controller"))["useCustomerController"]>;
export type OperationController = ReturnType<(typeof import("./use-operation-controller"))["useOperationController"]>;
export type DeviceController = ReturnType<(typeof import("./use-device-controller"))["useDeviceController"]>;
