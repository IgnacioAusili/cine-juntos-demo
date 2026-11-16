import { dom } from "../../core/dom.js";
import { hideTooltip } from "../icons-tooltips.js";
import { tooltipState } from "../tooltip/tooltip-state.js";
import { RESTORED_POINTEROVER_SUPPRESSION_MS } from "../tooltip/tooltip-constants.js";

const PAGE_SCROLL_LOCK_CLASS = "video-hosting-dialog-open";
let pageScrollTop = 0;
let tooltipResumeTimer = 0;

export function wireVideoHostingDialog() {
  const dialog = dom.videoHostingDialog;
  if (!dialog || !dom.videoHostingHelpButton) return;

  dom.videoHostingHelpButton.addEventListener("click", (event) => {
    event.stopPropagation();
    hideTooltip(true);
    if (dialog.open) return;
    suppressFocusTooltip();
    lockPageScroll();
    dialog.showModal();
    dom.closeVideoHostingDialogButton?.focus();
  });

  const closeDialog = (event) => {
    event?.stopPropagation();
    if (!dialog.open) return;
    suppressDialogExitTooltips();
    dialog.close();
  };

  dom.closeVideoHostingDialogButton?.addEventListener("click", closeDialog);
  dom.closeVideoHostingDialogActionButton?.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", suppressDialogExitTooltips);
  dialog.addEventListener("close", () => {
    hideTooltip(true);
    unlockPageScroll();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
}

function suppressFocusTooltip() {
  tooltipState.suppressFocusTooltipUntil =
    performance.now() + RESTORED_POINTEROVER_SUPPRESSION_MS;
}

function suppressDialogExitTooltips() {
  hideTooltip(true);
  suppressFocusTooltip();
  tooltipState.suppressRestoredPointerover = true;
  window.clearTimeout(tooltipResumeTimer);
  tooltipResumeTimer = window.setTimeout(() => {
    tooltipState.suppressRestoredPointerover = false;
    tooltipResumeTimer = 0;
  }, RESTORED_POINTEROVER_SUPPRESSION_MS);
}

function lockPageScroll() {
  const root = document.documentElement;
  pageScrollTop = window.scrollY;
  root.style.setProperty(
    "--video-hosting-dialog-scroll-offset",
    `-${pageScrollTop}px`,
  );
  root.classList.add(PAGE_SCROLL_LOCK_CLASS);
}

function unlockPageScroll() {
  const root = document.documentElement;
  root.classList.remove(PAGE_SCROLL_LOCK_CLASS);
  root.style.removeProperty("--video-hosting-dialog-scroll-offset");
  window.requestAnimationFrame(() => window.scrollTo(0, pageScrollTop));
}
