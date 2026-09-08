import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerCreditAccountDetail } from "@yardimci-asistan/shared";
import { customerCreditError, onCustomerCreditChanged } from "./customer-credit-ui";

/** Mount only inside a customer-credit capability boundary. */
export function useCustomerCreditAccount(customerId: string) {
  const bridge = window.yardimciDesktop?.commerce;
  const [account, setAccount] = useState<CustomerCreditAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);

  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      if (!bridge) throw new Error("Müşteri hesabı kullanılamıyor. Uygulamayı yeniden başlatın.");
      const next = await bridge.getCustomerCreditAccount(customerId);
      if (current === request.current) setAccount(next);
    } catch (cause) {
      if (current === request.current) {
        setAccount(null);
        setError(customerCreditError(cause, "Hesap bilgileri alınamadı. Yeniden deneyin."));
      }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [bridge, customerId]);

  useEffect(() => {
    void reload();
    const unsubscribe = onCustomerCreditChanged(customerId, () => { void reload(); });
    return () => { request.current += 1; unsubscribe(); };
  }, [customerId, reload]);

  return { account, loading, error, reload };
}
