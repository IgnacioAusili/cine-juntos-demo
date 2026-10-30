import { hideTooltip } from "../icons-tooltips.js";
import { tooltipState } from "./tooltip-state.js";
import { RESTORED_POINTEROVER_SUPPRESSION_MS } from "./tooltip-constants.js";

let suppressRestoredFocusTooltip = false;
let pageWasAway = false;
let pointeroverResumeTimer = 0;

function logPointerGuard(action, details = {}) {
  console.log("[tooltip-pointer-guard]", action, {
    timeMs: Math.round(performance.now()),
    pageHidden: document.hidden,
    pageWasAway,
    pointeroverSuppressed: tooltipState.suppressRestoredPointerover,
    focusSuppressed: suppressRestoredFocusTooltip,
    ...details,
  });
}

function handlePageLeave(reason) {
  const alreadyAway = pageWasAway;
  pageWasAway = true;
  suppressRestoredFocusTooltip = true;
  tooltipState.suppressRestoredPointerover = true;
  window.clearTimeout(pointeroverResumeTimer);
  pointeroverResumeTimer = 0;
  logPointerGuard("page-left", { reason, alreadyAway });
  hideTooltip(true);
}

function handlePageReturn(reason) {
  if (document.hidden) {
    logPointerGuard("return-event-deferred-hidden", { reason });
    return;
  }

  if (!pageWasAway) {
    logPointerGuard("return-event-without-prior-leave", { reason });
    return;
  }

  pageWasAway = false;
  logPointerGuard("pointerover-suppression-start", {
    reason,
    durationMs: RESTORED_POINTEROVER_SUPPRESSION_MS,
  });
  pointeroverResumeTimer = window.setTimeout(() => {
    tooltipState.suppressRestoredPointerover = false;
    pointeroverResumeTimer = 0;
    logPointerGuard("pointerover-suppression-end", { reason: "timeout" });
  }, RESTORED_POINTEROVER_SUPPRESSION_MS);
}

function resumeFocusTooltips(reason) {
  const wasSuppressed = suppressRestoredFocusTooltip;
  suppressRestoredFocusTooltip = false;
  if (wasSuppressed) logPointerGuard("focus-suppression-end", { reason });
}

window.addEventListener("blur", () => handlePageLeave("window-blur"));
window.addEventListener("pagehide", () => handlePageLeave("pagehide"));
window.addEventListener("focus", () => handlePageReturn("window-focus"));
window.addEventListener("pageshow", () => handlePageReturn("pageshow"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) handlePageLeave("visibility-hidden");
  else handlePageReturn("visibility-visible");
});

// Algunos navegadores restauran el foco DOM al volver a la pestaña y emiten
// focusin aunque el usuario no haya enfocado el elemento de nuevo. Se marca
// el evento para que el manejador central no abra un tooltip por ese foco.
document.addEventListener("focusin", (event) => {
  if (!suppressRestoredFocusTooltip) return;
  event.__skipTooltipForRestoredFocus = true;
}, true);

document.addEventListener("keydown", (event) => {
  if (event.isTrusted) resumeFocusTooltips("keydown");
}, true);
document.addEventListener("pointerdown", (event) => {
  if (event.isTrusted) resumeFocusTooltips("pointerdown");
}, true);
