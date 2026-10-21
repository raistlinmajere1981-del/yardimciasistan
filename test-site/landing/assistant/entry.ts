import { installAvailabilityFlow } from "./availability-flow";
import { installDirectRequestFlow } from "./direct-request-flow";
import { installShowcaseAvatar } from "./showcase-avatar";
import "./index";

export * from "./index";

installDirectRequestFlow();
installAvailabilityFlow();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installShowcaseAvatar, { once: true });
else installShowcaseAvatar();
