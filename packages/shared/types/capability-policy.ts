import { BUSINESS_CAPABILITIES, type BusinessCapability } from "./business-capabilities";
import type { RequestType } from "./request";
import type { ReservationType } from "./reservation";

const C = BUSINESS_CAPABILITIES;

export type ReservationDomain = "accommodation" | "food_service" | "mixed" | "generic";
export type OperationalTaskDomain = "accommodation" | "food_service" | "mixed" | "core";
export type ConvertibleReservationType = Extract<ReservationType, "room" | "table">;

export interface ReservationDomainContext {
  roomIds?: readonly unknown[];
  tableIds?: readonly unknown[];
}

const REQUEST_TYPE_CAPABILITY_REQUIREMENTS: Partial<Record<RequestType, BusinessCapability>> = {
  pension_reservation: C.ACCOMMODATION_RESERVATIONS,
  restaurant_reservation: C.FOOD_RESERVATIONS,
  breakfast_request: C.FOOD_RESERVATIONS,
  qr_menu_question: C.QR_MENU
};

const REQUEST_RESERVATION_TARGETS: Partial<Record<RequestType, ConvertibleReservationType>> = {
  pension_reservation: "room",
  restaurant_reservation: "table",
  breakfast_request: "table"
};

const ACCOMMODATION_TASK_TYPES = new Set([
  "check_in",
  "check_out",
  "room_cleaning",
  "room_maintenance",
  "reservation",
  "manual_pension"
]);
const FOOD_SERVICE_TASK_TYPES = new Set([
  "table_reservation",
  "breakfast",
  "service",
  "table_service",
  "restaurant",
  "table_check",
  "payment",
  "manual_restaurant"
]);

/**
 * Returns the capability that makes a domain-specific request type meaningful.
 * Generic customer request types deliberately have no capability requirement.
 */
export function getRequestTypeRequiredCapability(requestType: string): BusinessCapability | null {
  return REQUEST_TYPE_CAPABILITY_REQUIREMENTS[requestType as RequestType] ?? null;
}

/** Returns the reservation target for convertible request types only. */
export function getRequestReservationType(requestType: string): ConvertibleReservationType | null {
  return REQUEST_RESERVATION_TARGETS[requestType as RequestType] ?? null;
}

export function getRequestReservationCapability(requestType: string): BusinessCapability | null {
  const reservationType = getRequestReservationType(requestType);
  if (reservationType === "room") return C.ACCOMMODATION_RESERVATIONS;
  if (reservationType === "table") return C.FOOD_RESERVATIONS;
  return null;
}

export function isRequestTypeAvailable(
  capabilities: Iterable<BusinessCapability>,
  requestType: string
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!enabled.has(C.REQUESTS) || !enabled.has(C.CUSTOMERS)) return false;
  const requiredCapability = getRequestTypeRequiredCapability(requestType);
  return requiredCapability === null || enabled.has(requiredCapability);
}

export function canConvertRequestToReservation(
  capabilities: Iterable<BusinessCapability>,
  requestType: string
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const requiredCapability = getRequestReservationCapability(requestType);
  return enabled.has(C.REQUESTS)
    && enabled.has(C.CUSTOMERS)
    && requiredCapability !== null
    && enabled.has(requiredCapability);
}

export function getReservationDomain(
  reservationType: string,
  context: ReservationDomainContext = {}
): ReservationDomain {
  const explicitDomain = reservationType === "room"
    ? "accommodation"
    : reservationType === "table" || reservationType === "breakfast"
      ? "food_service"
      : reservationType === "room_and_table" || reservationType === "mixed"
        ? "mixed"
        : "generic";
  const hasRooms = explicitDomain === "accommodation" || explicitDomain === "mixed"
    || Boolean(context.roomIds?.length);
  const hasTables = explicitDomain === "food_service" || explicitDomain === "mixed"
    || Boolean(context.tableIds?.length);
  if (hasRooms && hasTables) return "mixed";
  if (hasRooms) return "accommodation";
  if (hasTables) return "food_service";
  return "generic";
}

/**
 * Existing generic/event reservations remain visible when at least one
 * reservation domain is enabled. Mixed reservations require both domains.
 */
export function isReservationTypeAvailable(
  capabilities: Iterable<BusinessCapability>,
  reservationType: string,
  context: ReservationDomainContext = {}
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const accommodation = enabled.has(C.ACCOMMODATION_RESERVATIONS);
  const foodService = enabled.has(C.FOOD_RESERVATIONS);

  switch (getReservationDomain(reservationType, context)) {
    case "accommodation":
      return accommodation;
    case "food_service":
      return foodService;
    case "mixed":
      return accommodation && foodService;
    case "generic":
      return accommodation || foodService;
  }
}

export function getOperationalTaskDomain(
  taskType: string,
  relatedType = "",
  relatedReservationType = "",
  relatedReservationContext: ReservationDomainContext = {}
): OperationalTaskDomain {
  if (relatedType === "reservation" && (
    relatedReservationType || relatedReservationContext.roomIds?.length || relatedReservationContext.tableIds?.length
  )) {
    const reservationDomain = getReservationDomain(relatedReservationType, relatedReservationContext);
    if (reservationDomain === "accommodation" || reservationDomain === "food_service" || reservationDomain === "mixed") {
      return reservationDomain;
    }
  }
  if (ACCOMMODATION_TASK_TYPES.has(taskType) || relatedType === "room") {
    return "accommodation";
  }
  if (FOOD_SERVICE_TASK_TYPES.has(taskType) || relatedType === "table") {
    return "food_service";
  }
  return "core";
}

export function isOperationalTaskAvailable(
  capabilities: Iterable<BusinessCapability>,
  taskType: string,
  relatedType = "",
  relatedReservationType = "",
  relatedReservationContext: ReservationDomainContext = {}
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!enabled.has(C.TASKS)) return false;
  switch (getOperationalTaskDomain(taskType, relatedType, relatedReservationType, relatedReservationContext)) {
    case "accommodation":
      return enabled.has(C.ACCOMMODATION_ROOMS);
    case "food_service":
      return enabled.has(C.FOOD_TABLES);
    case "mixed":
      return enabled.has(C.ACCOMMODATION_ROOMS) && enabled.has(C.FOOD_TABLES);
    case "core":
      return true;
  }
}
