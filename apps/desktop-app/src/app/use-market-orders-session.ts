import { useCallback, useEffect, useRef, useState } from "react";
import { emptyArasShippingConfiguration } from "@yardimci-asistan/shared";
import type { CommerceShipment, CommerceShipmentStatus, CommerceOrder, CommerceOrderDetail } from "@yardimci-asistan/shared";
import { useMarketOrderBenefits } from "./use-market-order-benefits";
import type { DesktopCommerceBridge } from "../../electron/commerce-ipc-contract";

export type FulfillmentPaymentChoice = "cash" | "card" | "bank" | "other" | "credit";

/** Controller-owned session survives page/tab unmounts; only the visible panel renders. */
export function useMarketOrdersSession({ enabled, benefitsEnabled = false, onStateChange }: {
  enabled: boolean;
  benefitsEnabled?: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const mutationInFlight = useRef(false);
  const pendingRefund = useRef<Parameters<DesktopCommerceBridge["tryFullRefundOrder"]>[0] | null>(null);
  const [refundPreview, setRefundPreview] = useState<Awaited<ReturnType<DesktopCommerceBridge["getFullRefundOrderPreview"]>> | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [refundUncertain, setRefundUncertain] = useState(false);
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
  const [fulfillmentPayment, setFulfillmentPaymentState] = useState<FulfillmentPaymentChoice>("cash");
  const benefits = useMarketOrderBenefits({ enabled: enabled && benefitsEnabled && !selectedOrder?.order.checkoutSnapshot, detail: selectedOrder, payment: fulfillmentPayment });
  const pendingBenefits = benefits.pending;
  const setFulfillmentPayment = useCallback((value: FulfillmentPaymentChoice) => {
    if (!pendingBenefits.current && !mutationInFlight.current) setFulfillmentPaymentState(value);
  }, [pendingBenefits]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const reloadGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const invalidateOrderGenerations = useCallback(() => { ++reloadGeneration.current; ++detailGeneration.current; }, []);
  const selectedIdRef = useRef("");
  const openingOrderRef = useRef(false);
  const stateChangeRef = useRef(onStateChange);
  stateChangeRef.current = onStateChange;


  // Local mutation results invalidate older reads and update UI without an event round trip.
  const setSelectedOrder = useCallback((detail: CommerceOrderDetail | null) => {
    if (pendingBenefits.current || pendingRefund.current) return;
    ++reloadGeneration.current;
    ++detailGeneration.current;
    openingOrderRef.current = false;
    selectedIdRef.current = detail?.order.id ?? "";
    setSelectedOrderState(detail);
    setLoadingOrders(false);
    if (detail) setOrders((current) => current.some((order) => order.id === detail.order.id)
      ? current.map((order) => order.id === detail.order.id ? detail.order : order)
      : [detail.order, ...current]);
  }, [pendingBenefits]);

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
      if (pendingBenefits.current || pendingRefund.current || mutationInFlight.current || openingOrderRef.current || !selectedId || !next.some((order) => order.id === selectedId)) return;
      detailRequest = ++detailGeneration.current;
      const detail = await bridge.getOrder(selectedId);
      if (!pendingBenefits.current && !pendingRefund.current && !mutationInFlight.current && enabledRef.current && request === reloadGeneration.current && detailRequest === detailGeneration.current && selectedIdRef.current === selectedId) {
        setSelectedOrderState(detail);
      }
    } catch (error) {
      if (enabledRef.current && request === reloadGeneration.current && (detailRequest === undefined || detailRequest === detailGeneration.current)) {
        stateChangeRef.current("error", error instanceof Error ? error.message : "Siparişler yüklenemedi.");
      }
    } finally {
      if (request === reloadGeneration.current) setLoadingOrders(false);
    }
  }, [bridge, pendingBenefits]);

  const openOrder = useCallback(async (orderId: string) => {
    if (!bridge || !enabledRef.current || pendingBenefits.current || pendingRefund.current || mutationInFlight.current) return;
    const request = ++detailGeneration.current;
    openingOrderRef.current = true;
    try {
      const detail = await bridge.getOrder(orderId);
      if (!pendingBenefits.current && !pendingRefund.current && !mutationInFlight.current && enabledRef.current && request === detailGeneration.current) {
        selectedIdRef.current = detail?.order.id ?? "";
        setSelectedOrderState(detail);
        setFulfillmentPaymentState("cash");
        setRefundPreview(null); setRefundReason(""); setRefundConfirmed(false);
      }
    } catch (error) {
      if (enabledRef.current && request === detailGeneration.current) {
        stateChangeRef.current("error", error instanceof Error ? error.message : "Sipariş detayı yüklenemedi.");
      }
    } finally {
      if (request === detailGeneration.current) openingOrderRef.current = false;
    }
  }, [bridge, pendingBenefits]);

  const previewRefund = useCallback(async () => {
    const orderId = selectedIdRef.current;
    if (!bridge || !enabledRef.current || !orderId || mutationInFlight.current || pendingRefund.current) return;
    mutationInFlight.current = true; setSubmitting(true);
    try {
      const preview = await bridge.getFullRefundOrderPreview(orderId);
      if (selectedIdRef.current === orderId) { setRefundPreview(preview); setRefundConfirmed(false); }
    } catch (error) { stateChangeRef.current("error", error instanceof Error ? error.message : "İade önizlemesi alınamadı."); }
    finally { mutationInFlight.current = false; setSubmitting(false); }
  }, [bridge]);

  const submitRefund = useCallback(async () => {
    if (!bridge || !enabledRef.current || mutationInFlight.current || pendingBenefits.current) return;
    if (!pendingRefund.current) {
      if (!refundPreview?.eligible || refundPreview.orderId !== selectedIdRef.current || !refundConfirmed || !refundReason.trim()) return;
      pendingRefund.current = { orderId: refundPreview.orderId, operationId: crypto.randomUUID(), kind: "full", reason: refundReason.trim() };
    }
    const input = pendingRefund.current;
    mutationInFlight.current = true; setSubmitting(true);
    try {
      const response = await bridge.tryFullRefundOrder(input);
      if (response?.ok === false) {
        pendingRefund.current = null; setRefundUncertain(false);
        setRefundPreview(null); setRefundConfirmed(false);
        stateChangeRef.current("error", response.message); return;
      }
      if (!response?.ok || response.value.order?.order.id !== input.orderId || response.value.order.order.paymentStatus !== "refunded")
        throw new Error("İade sonucu doğrulanamadı.");
      pendingRefund.current = null; setRefundUncertain(false); setRefundPreview(null); setRefundReason(""); setRefundConfirmed(false);
      setSelectedOrder(response.value.order);
      stateChangeRef.current("success", "Tam iade kaydedildi. Ürünler stoğa alındı ve banka iadesi finans çıkışına işlendi.");
    } catch {
      setRefundUncertain(true);
      stateChangeRef.current("error", "İade yanıtı alınamadı. Aynı işlemi yeniden sorgulayın; ikinci iade oluşturulmaz.");
    } finally { mutationInFlight.current = false; setSubmitting(false); }
  }, [bridge, pendingBenefits, refundPreview, refundConfirmed, refundReason, setSelectedOrder]);

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
    if (!bridge || !enabledRef.current || !orderId || shipmentMutationRef.current || pendingBenefits.current || mutationInFlight.current) return;
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
  }, [bridge, reloadShipments, pendingBenefits]);

  return { refund: { preview: refundPreview, reason: refundReason, setReason: setRefundReason, confirmed: refundConfirmed,
    setConfirmed: setRefundConfirmed, uncertain: refundUncertain, previewRefund, submit: submitRefund },
    shippingProvider, shipments, loadingShipments, shipmentError, mutatingShipment, mutateShipment, reloadShipments,
    search, setSearch, statusFilter, setStatusFilter, mutationInFlight,
    orders, selectedOrder, setSelectedOrder, loadingOrders, submitting, setSubmitting,
    fulfillmentPayment, setFulfillmentPayment, reloadOrders, openOrder, benefits };
}
export type MarketOrdersSession = ReturnType<typeof useMarketOrdersSession>;
