import { useCallback, useEffect, useRef, useState } from "react";
import { emptyArasShippingConfiguration } from "@yardimci-asistan/shared";
import type { CommerceShipment, CommerceShipmentStatus, CatalogProduct, CommerceOrder, CommerceOrderDetail, CommerceResolvedUnitPrice } from "@yardimci-asistan/shared";

export interface MarketOrderDraftLine {
  product: CatalogProduct;
  pricing: CommerceResolvedUnitPrice;
  quantity: number;
}
export type FulfillmentPaymentChoice = "cash" | "card" | "bank" | "other" | "credit";

function createManualOrderReference() {
  const randomId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `desktop-wholesale:${randomId}`;
}

/** Controller-owned session survives page/tab unmounts; only the visible panel renders. */
export function useMarketOrdersSession({ enabled, onStateChange }: {
  enabled: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<MarketOrderDraftLine[]>([]);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [selectedOrder, setSelectedOrderState] = useState<CommerceOrderDetail | null>(null);
  const [shippingProvider, setShippingProvider] = useState(emptyArasShippingConfiguration);
  const [shipments, setShipments] = useState<CommerceShipment[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [shipmentError, setShipmentError] = useState("");
  const [mutatingShipment, setMutatingShipment] = useState(false);
  const shipmentGeneration = useRef(0);
  const shipmentMutationRef = useRef(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fulfillmentPayment, setFulfillmentPayment] = useState<FulfillmentPaymentChoice>("cash");
  const [resolvingProductId, setResolvingProductId] = useState("");
  const customerIdRef = useRef("");
  const draftReferenceRef = useRef("");
  if (!draftReferenceRef.current) draftReferenceRef.current = createManualOrderReference();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const reloadGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const invalidateOrderGenerations = useCallback(() => { ++reloadGeneration.current; ++detailGeneration.current; }, []);
  const selectedIdRef = useRef("");
  const openingOrderRef = useRef(false);
  const stateChangeRef = useRef(onStateChange);
  stateChangeRef.current = onStateChange;

  const resetDraftReference = useCallback(() => { draftReferenceRef.current = createManualOrderReference(); }, []);

  // Local mutation results invalidate older reads and update UI without an event round trip.
  const setSelectedOrder = useCallback((detail: CommerceOrderDetail | null) => {
    ++reloadGeneration.current;
    ++detailGeneration.current;
    openingOrderRef.current = false;
    selectedIdRef.current = detail?.order.id ?? "";
    setSelectedOrderState(detail);
    setLoadingOrders(false);
    if (detail) setOrders((current) => current.some((order) => order.id === detail.order.id)
      ? current.map((order) => order.id === detail.order.id ? detail.order : order)
      : [detail.order, ...current]);
  }, []);

  const reloadOrders = useCallback(async (quiet = false) => {
    if (!bridge || !enabledRef.current) return;
    const request = ++reloadGeneration.current;
    if (!quiet) setLoadingOrders(true);
    let detailRequest: number | undefined;
    try {
      const next = await bridge.listOrders({ limit: 100 });
      if (!enabledRef.current || request !== reloadGeneration.current) return;
      setOrders(next);
      const selectedId = selectedIdRef.current;
      if (openingOrderRef.current || !selectedId || !next.some((order) => order.id === selectedId)) return;
      detailRequest = ++detailGeneration.current;
      const detail = await bridge.getOrder(selectedId);
      if (enabledRef.current && request === reloadGeneration.current && detailRequest === detailGeneration.current && selectedIdRef.current === selectedId) {
        setSelectedOrderState(detail);
      }
    } catch (error) {
      if (enabledRef.current && request === reloadGeneration.current && (detailRequest === undefined || detailRequest === detailGeneration.current)) {
        stateChangeRef.current("error", error instanceof Error ? error.message : "Siparişler yüklenemedi.");
      }
    } finally {
      if (request === reloadGeneration.current) setLoadingOrders(false);
    }
  }, [bridge]);

  const openOrder = useCallback(async (orderId: string) => {
    if (!bridge || !enabledRef.current) return;
    const request = ++detailGeneration.current;
    openingOrderRef.current = true;
    try {
      const detail = await bridge.getOrder(orderId);
      if (enabledRef.current && request === detailGeneration.current) {
        selectedIdRef.current = detail?.order.id ?? "";
        setSelectedOrderState(detail);
        setFulfillmentPayment("cash");
      }
    } catch (error) {
      if (enabledRef.current && request === detailGeneration.current) {
        stateChangeRef.current("error", error instanceof Error ? error.message : "Sipariş detayı yüklenemedi.");
      }
    } finally {
      if (request === detailGeneration.current) openingOrderRef.current = false;
    }
  }, [bridge]);

  useEffect(() => {
    if (!enabled || !bridge) return;
    enabledRef.current = true;
    void reloadOrders(true);
    const unsubscribe = bridge.onOrdersChanged?.(() => { void reloadOrders(true); });
    return () => {
      enabledRef.current = false;
      invalidateOrderGenerations();
      openingOrderRef.current = false;
      unsubscribe?.();
    };
  }, [bridge, enabled, reloadOrders, invalidateOrderGenerations]);

  const shipmentOrderId = selectedOrder?.order.deliverySnapshot.method === "shipping" ? selectedOrder.order.id : "";
  const shipmentOrderRef = useRef(shipmentOrderId);
  shipmentOrderRef.current = shipmentOrderId;

  const reloadShipments = useCallback(async () => {
    const orderId = shipmentOrderRef.current;
    if (!bridge || !enabledRef.current || !orderId) return;
    const request = ++shipmentGeneration.current;
    setLoadingShipments(true);
    setShipmentError("");
    try {
      const [next, config] = await Promise.all([
        bridge.listShipmentsForOrder(orderId),
        bridge.getShippingProviderConfiguration?.().catch(() => emptyArasShippingConfiguration()) ?? emptyArasShippingConfiguration()
      ]);
      if (enabledRef.current && request === shipmentGeneration.current && shipmentOrderRef.current === orderId) setShippingProvider(config);
      if (enabledRef.current && request === shipmentGeneration.current && shipmentOrderRef.current === orderId) setShipments(next);
    } catch (error) {
      if (enabledRef.current && request === shipmentGeneration.current && shipmentOrderRef.current === orderId) {
        setShipmentError(error instanceof Error ? error.message : "Gönderiler yüklenemedi.");
      }
    } finally {
      if (request === shipmentGeneration.current) setLoadingShipments(false);
    }
  }, [bridge]);

  const invalidateShipments = useCallback(() => { ++shipmentGeneration.current; }, []);

  useEffect(() => {
    invalidateShipments();
    setShipments([]);
    setShipmentError("");
    setLoadingShipments(false);
    if (!enabled || !shipmentOrderId || !bridge) return;
    void reloadShipments();
    const unsubscribe = bridge.onShipmentsChanged?.((orderId) => {
      if (orderId === shipmentOrderRef.current) void reloadShipments();
    });
    const unsubscribeConfig = bridge.onShippingConfigurationChanged?.(() => { void reloadShipments(); });
    return () => { invalidateShipments(); unsubscribe?.(); unsubscribeConfig?.(); };
  }, [bridge, enabled, shipmentOrderId, reloadShipments, invalidateShipments]);

  const mutateShipment = useCallback(async (shipmentId?: string, status?: CommerceShipmentStatus, providerAction?: "register" | "refresh") => {
    const orderId = shipmentOrderRef.current;
    if (!bridge || !enabledRef.current || !orderId || shipmentMutationRef.current) return;
    shipmentMutationRef.current = true;
    setMutatingShipment(true);
    setShipmentError("");
    ++shipmentGeneration.current;
    try {
      const shipment = shipmentId && providerAction
        ? providerAction === "register" ? await bridge.registerShipmentWithProvider(shipmentId) : await bridge.refreshShipmentProviderStatus(shipmentId)
        : shipmentId && status
        ? await bridge.updateShipmentStatus({ shipmentId, status })
        : await bridge.createShipmentForOrder(orderId);
      if (enabledRef.current && shipmentOrderRef.current === orderId && selectedIdRef.current === orderId) {
        ++shipmentGeneration.current;
        setLoadingShipments(false);
        setShipments((current) => current.some((entry) => entry.id === shipment.id)
          ? current.map((entry) => entry.id === shipment.id ? shipment : entry) : [...current, shipment]);
      }
    } catch (error) {
      if (enabledRef.current && shipmentOrderRef.current === orderId && selectedIdRef.current === orderId) {
        const message = error instanceof Error ? error.message : "Gönderi güncellenemedi.";
        // Reconcile a committed mutation whose response was lost before allowing another create.
        await reloadShipments();
        if (enabledRef.current && shipmentOrderRef.current === orderId && selectedIdRef.current === orderId) setShipmentError(message);
      }
    } finally {
      shipmentMutationRef.current = false;
      setMutatingShipment(false);
    }
  }, [bridge, reloadShipments]);

  return { shippingProvider, shipments, loadingShipments, shipmentError, mutatingShipment, mutateShipment, reloadShipments, customerId, setCustomerId, customerIdRef, search, setSearch, note, setNote, lines, setLines,
    orders, selectedOrder, setSelectedOrder, loadingOrders, submitting, setSubmitting,
    fulfillmentPayment, setFulfillmentPayment, resolvingProductId, setResolvingProductId,
    draftReferenceRef, resetDraftReference, reloadOrders, openOrder };
}
export type MarketOrdersSession = ReturnType<typeof useMarketOrdersSession>;
