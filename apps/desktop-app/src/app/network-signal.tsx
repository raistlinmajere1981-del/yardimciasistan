import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { NetworkSignal } from "./connection-status";

const NetworkSignalContext = createContext<NetworkSignal>("unknown");

function readNetworkSignal(): NetworkSignal {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return "unknown";
  return navigator.onLine ? "onlineHint" : "offlineHint";
}

// One renderer subscription. Native events are hints, never provider reachability checks.
function useNativeNetworkSignal(): NetworkSignal {
  const [signal, setSignal] = useState(readNetworkSignal);
  useEffect(() => {
    const update = () => setSignal(readNetworkSignal());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return signal;
}

export function NetworkSignalProvider({ children }: { children: ReactNode }) {
  const signal = useNativeNetworkSignal();
  return <NetworkSignalContext.Provider value={signal}>{children}</NetworkSignalContext.Provider>;
}

export function useNetworkSignal(): NetworkSignal {
  return useContext(NetworkSignalContext);
}
