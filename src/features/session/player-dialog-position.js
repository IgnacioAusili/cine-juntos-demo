import { dom } from "../../core/dom.js";

const openPlayerDialogs = new Set();
const COMPACT_PLAYER_DIALOG_CLASS = "player-dialog--compact";
let positionTrackingInitialized = false;
let positionUpdateQueued = false;

function getPlayerBounds() {
  const playerRect = dom.playerFrame?.getBoundingClientRect();
  if (playerRect?.width && playerRect.height) return playerRect;

  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  };
}

function positionDialog(dialog) {
  const bounds = getPlayerBounds();
  const cardInset = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--player-dialog-card-inset"),
  ) || 0;
  const totalCardInset = cardInset * 2;
  dialog.style.setProperty("--player-dialog-left", `${bounds.left}px`);
  dialog.style.setProperty("--player-dialog-top", `${bounds.top}px`);
  dialog.style.setProperty("--player-dialog-width", `${bounds.width}px`);
  dialog.style.setProperty("--player-dialog-height", `${bounds.height}px`);
  dialog.style.setProperty(
    "--player-dialog-card-max-width",
    `${Math.max(0, bounds.width - totalCardInset)}px`,
  );
  dialog.style.setProperty(
    "--player-dialog-card-max-height",
    `${Math.max(0, bounds.height - totalCardInset)}px`,
  );
}

function syncDialogCardFit(dialog) {
  if (!dialog.open) return;

  const card = dialog.querySelector(".player-dialog__card");
  const availableHeight = Number.parseFloat(
    dialog.style.getPropertyValue("--player-dialog-card-max-height"),
  );
  if (!card || !Number.isFinite(availableHeight)) return;

  dialog.classList.remove(COMPACT_PLAYER_DIALOG_CLASS);
  const previousMaxHeight = card.style.maxHeight;
  card.style.maxHeight = "none";
  const naturalHeight = card.getBoundingClientRect().height;
  if (previousMaxHeight) {
    card.style.maxHeight = previousMaxHeight;
  } else {
    card.style.removeProperty("max-height");
  }

  if (naturalHeight > availableHeight + 1) {
    dialog.classList.add(COMPACT_PLAYER_DIALOG_CLASS);
  }
}

function syncOpenPlayerDialogs() {
  for (const dialog of openPlayerDialogs) {
    if (!dialog.open) {
      openPlayerDialogs.delete(dialog);
      continue;
    }
    positionDialog(dialog);
    syncDialogCardFit(dialog);
  }
}

function schedulePositionUpdate() {
  if (positionUpdateQueued) return;
  positionUpdateQueued = true;
  window.requestAnimationFrame(() => {
    positionUpdateQueued = false;
    syncOpenPlayerDialogs();
  });
}

function initializePositionTracking() {
  if (positionTrackingInitialized) return;
  positionTrackingInitialized = true;

  window.addEventListener("resize", schedulePositionUpdate, { passive: true });
  window.addEventListener("scroll", schedulePositionUpdate, { capture: true, passive: true });
  document.addEventListener("fullscreenchange", schedulePositionUpdate);
  window.visualViewport?.addEventListener("resize", schedulePositionUpdate, { passive: true });
  window.visualViewport?.addEventListener("scroll", schedulePositionUpdate, { passive: true });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(schedulePositionUpdate);
    [dom.playerFrame, dom.workspace, dom.sessionView].filter(Boolean)
      .forEach((element) => resizeObserver.observe(element));
  }

  if ("MutationObserver" in window) {
    const layoutObserver = new MutationObserver(schedulePositionUpdate);
    [dom.playerFrame, dom.sessionView].filter(Boolean).forEach((element) => {
      layoutObserver.observe(element, {
        attributes: true,
        attributeFilter: ["class", "style", "data-chat-dock"],
      });
    });
  }
}

export function showPlayerDialog(dialog) {
  if (!dialog || dialog.open) return;

  initializePositionTracking();
  positionDialog(dialog);
  openPlayerDialogs.add(dialog);
  dialog.addEventListener("close", () => openPlayerDialogs.delete(dialog), { once: true });
  dialog.showModal();
  positionDialog(dialog);
  syncDialogCardFit(dialog);
}
