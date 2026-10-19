import { installAvailabilityFlow } from "./availability-flow";
import { installDirectRequestFlow } from "./direct-request-flow";
import "./index";

export * from "./index";

installDirectRequestFlow();
installAvailabilityFlow();
