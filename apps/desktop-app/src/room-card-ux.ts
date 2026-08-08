const ROOM_CARD_SELECTOR = ".compact-resource-grid .resource-compact-card";
const STATUS_ACTIONS_SELECTOR = ".compact-status-actions";

function findAssignButton(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "Müşteri Ata"
  );
}

function syncRoomCard(card: HTMLElement) {
  findAssignButton(card)?.classList.add("room-primary-action");

  let details = card.querySelector<HTMLDetailsElement>(".room-status-details");
  let statusActions = card.querySelector<HTMLElement>(STATUS_ACTIONS_SELECTOR);

  if (!statusActions && details) {
    statusActions = details.querySelector<HTMLElement>(STATUS_ACTIONS_SELECTOR);
  }

  if (!statusActions) {
    return;
  }

  if (!details) {
    details = document.createElement("details");
    details.className = "room-status-details";

    const summary = document.createElement("summary");
    summary.textContent = "Durumu değiştir";
    details.append(summary);

    statusActions.parentElement?.insertBefore(details, statusActions);
    details.append(statusActions);
  }

  const buttons = Array.from(statusActions.querySelectorAll<HTMLButtonElement>("button"));
  const hasAvailableAction = buttons.some((button) => !button.disabled);

  details.hidden = !hasAvailableAction;
  if (!hasAvailableAction) {
    details.open = false;
  }
}

function enhanceRoomCards(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(ROOM_CARD_SELECTOR).forEach(syncRoomCard);
}

export function installRoomCardUx() {
  enhanceRoomCards();

  const observer = new MutationObserver(() => enhanceRoomCards());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "class"]
  });

  return () => observer.disconnect();
}
