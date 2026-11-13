import { hideTooltip } from "../icons-tooltips.js";
import { tooltipState } from "./tooltip-state.js";
import { RESTORED_POINTEROVER_SUPPRESSION_MS } from "./tooltip-constants.js";

let suppressRestoredFocusTooltip = false;
let pageWasAway = false;
let pointeroverResumeTimer = 0;

function handlePageLeave() {
  pageWasAway = true;
  suppressRestoredFocusTooltip = true;
  tooltipState.suppressRestoredPointerover = true;
  window.clearTimeout(pointeroverResumeTimer);
  pointeroverResumeTimer = 0;
  hideTooltip(true);
}

function handlePageReturn() {
  if (document.hidden) return;

  if (!pageWasAway) return;

  pageWasAway = false;
  pointeroverResumeTimer = window.setTimeout(() => {
    tooltipState.suppressRestoredPointerover = false;
    pointeroverResumeTimer = 0;
  }, RESTORED_POINTEROVER_SUPPRESSION_MS);
}

function resumeFocusTooltips() {
  suppressRestoredFocusTooltip = false;
}

window.addEventListener("blur", handlePageLeave);
window.addEventListener("pagehide", handlePageLeave);
window.addEventListener("focus", handlePageReturn);
window.addEventListener("pageshow", handlePageReturn);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) handlePageLeave();
  else handlePageReturn();
});

// Algunos navegadores restauran el foco DOM al volver a la pestaña y emiten
// focusin aunque el usuario no haya enfocado el elemento de nuevo. Se marca
// el evento para que el manejador central no abra un tooltip por ese foco.
document.addEventListener("focusin", (event) => {
  if (!suppressRestoredFocusTooltip) return;
  event.__skipTooltipForRestoredFocus = true;
}, true);

document.addEventListener("keydown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);
document.addEventListener("pointerdown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);
