import type { DesktopBridge } from "../electron/preload";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  interface Window {
    yardimciDesktop?: DesktopBridge;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        allowpopups?: boolean;
        partition?: string;
        src?: string;
        webpreferences?: string;
      };
    }
  }
}

export {};
