import { dom } from "../../core/dom.js";
import { showPlayerDialog } from "./player-dialog-position.js";

let errorDialogInitialized = false;
let confirmLoadDialogInitialized = false;
let slowLoadDialogInitialized = false;
let resumeVideoDialogInitialized = false;
let videoDownloadDialogInitialized = false;
let pendingLoadDialogResolver = null;
let pendingSlowLoadDialogResolver = null;
let pendingResumeVideoDialogResolver = null;
let pendingVideoDownloadDialogResolver = null;
let pendingVideoDownloadFilename = "video";
let resumeVideoDialogResizeObserver = null;
let resumeVideoDialogResizeEventsWired = false;

const RESUME_DIALOG_COMPACT_CLASS = "player-inline-dialog--compact";

function getResumeDialogAvailableHeight(popup) {
  const style = getComputedStyle(popup);
  const verticalPadding = (Number.parseFloat(style.paddingTop) || 0)
    + (Number.parseFloat(style.paddingBottom) || 0);
  return Math.max(0, popup.clientHeight - verticalPadding);
}

function syncResumeVideoDialogFit() {
  const popup = dom.resumeVideoPopup;
  const card = popup?.querySelector(".player-inline-dialog__card");
  if (!popup || popup.hidden || !card) return;

  popup.classList.remove(RESUME_DIALOG_COMPACT_CLASS);
  popup.style.removeProperty("--player-inline-dialog-card-max-height");
  if (card.getBoundingClientRect().height <= getResumeDialogAvailableHeight(popup) + 1) return;

  popup.classList.add(RESUME_DIALOG_COMPACT_CLASS);
  const availableHeight = getResumeDialogAvailableHeight(popup);
  popup.style.setProperty("--player-inline-dialog-card-max-height", `${availableHeight}px`);
}

function wireResumeVideoDialogFit() {
  if (resumeVideoDialogResizeEventsWired) return;
  resumeVideoDialogResizeEventsWired = true;

  if ("ResizeObserver" in window) {
    resumeVideoDialogResizeObserver = new ResizeObserver(syncResumeVideoDialogFit);
    [dom.playerFrame, dom.sessionView].filter(Boolean)
      .forEach((element) => resumeVideoDialogResizeObserver.observe(element));
  }

  window.addEventListener("resize", syncResumeVideoDialogFit, { passive: true });
  window.visualViewport?.addEventListener("resize", syncResumeVideoDialogFit, { passive: true });
}

export function showErrorDialog(message) {
  if (!dom.errorDialog) return;

  if (message) {
    const msgEl = dom.errorDialog.querySelector("#dialogMessage");
    if (msgEl) msgEl.textContent = message;
  }

  if (dom.errorDialog.open) return;

  if (!errorDialogInitialized) {
    const closeErrorDialog = () => dom.errorDialog.close();
    dom.closeDialogButton?.addEventListener("click", closeErrorDialog);
    dom.closeDialogActionButton?.addEventListener("click", closeErrorDialog);
    dom.errorDialog.addEventListener("click", (event) => {
      if (event.target === dom.errorDialog) closeErrorDialog();
    });
    errorDialogInitialized = true;
  }

  showPlayerDialog(dom.errorDialog);
}

export function showLoadReplaceDialog(message, options = {}) {
  if (!dom.confirmLoadDialog) {
    return Promise.resolve({ confirmed: true, skipFutureWarnings: false });
  }

  initializeConfirmLoadDialog();
  if (pendingLoadDialogResolver) {
    pendingLoadDialogResolver({ confirmed: false, skipFutureWarnings: false });
    pendingLoadDialogResolver = null;
  }
  if (dom.confirmLoadDialog.open) {
    dom.confirmLoadDialog.close();
  }

  if (dom.confirmLoadDialogMessage && message) {
    dom.confirmLoadDialogMessage.textContent = message;
  }
  const isRemoveAction = options.action === "remove";
  if (dom.confirmLoadDialogTitle) {
    dom.confirmLoadDialogTitle.textContent = isRemoveAction ? "Quitar el video" : "Cargar otro video";
  }
  if (dom.confirmLoadDialogButton) {
    dom.confirmLoadDialogButton.textContent = isRemoveAction ? "Quitar" : "Cargar";
    dom.confirmLoadDialogButton.classList.toggle("button--warning", isRemoveAction);
    dom.confirmLoadDialogButton.classList.toggle("button--primary", !isRemoveAction);
  }
  if (dom.skipLoadConfirmCheckbox) {
    dom.skipLoadConfirmCheckbox.checked = false;
  }

  return new Promise((resolve) => {
    pendingLoadDialogResolver = resolve;
    showPlayerDialog(dom.confirmLoadDialog);
  });
}

export function showSlowLoadDialog(message) {
  if (!dom.slowLoadDialog) {
    return Promise.resolve(false);
  }

  initializeSlowLoadDialog();
  dismissResumeVideoDialog();
  if (pendingSlowLoadDialogResolver) {
    pendingSlowLoadDialogResolver(false);
    pendingSlowLoadDialogResolver = null;
  }
  if (dom.slowLoadDialog.open) {
    dom.slowLoadDialog.close();
  }

  if (dom.slowLoadDialogMessage && message) {
    dom.slowLoadDialogMessage.textContent = message;
  }

  return new Promise((resolve) => {
    pendingSlowLoadDialogResolver = resolve;
    showPlayerDialog(dom.slowLoadDialog);
  });
}

export function showResumeVideoDialog(message) {
  if (!dom.resumeVideoPopup) {
    return Promise.resolve(false);
  }

  initializeResumeVideoDialog();
  wireResumeVideoDialogFit();
  dismissSlowLoadDialog();
  if (pendingResumeVideoDialogResolver) {
    pendingResumeVideoDialogResolver(false);
    pendingResumeVideoDialogResolver = null;
  }
  if (dom.resumeVideoPopup.hidden === false) {
    dismissResumeVideoDialog();
  }

  if (dom.resumeVideoPopupMessage && message) {
    dom.resumeVideoPopupMessage.innerHTML = message;
  }

  return new Promise((resolve) => {
    pendingResumeVideoDialogResolver = resolve;
    dom.resumeVideoPopup.hidden = false;
    syncResumeVideoDialogFit();
    window.setTimeout(() => {
      dom.cancelResumeVideoDialogButton?.focus();
    }, 0);
  });
}

export function showVideoDownloadDialog(filename) {
  if (!dom.videoDownloadDialog) {
    return Promise.resolve({ confirmed: true, saveFileHandlePromise: null });
  }

  initializeVideoDownloadDialog();
  if (pendingVideoDownloadDialogResolver) {
    resolveVideoDownloadDialog({ confirmed: false, saveFileHandlePromise: null });
  }
  pendingVideoDownloadFilename = filename || "video";

  return new Promise((resolve) => {
    pendingVideoDownloadDialogResolver = resolve;
    showPlayerDialog(dom.videoDownloadDialog);
    dom.cancelVideoDownloadButton?.focus();
  });
}

function initializeConfirmLoadDialog() {
  if (confirmLoadDialogInitialized || !dom.confirmLoadDialog) return;

  dom.confirmLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(true);
  });

  dom.cancelLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(false);
  });

  dom.closeConfirmLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(false);
  });

  dom.confirmLoadDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveLoadReplaceDialog(false);
  });

  confirmLoadDialogInitialized = true;
}

function resolveLoadReplaceDialog(confirmed) {
  const skipFutureWarnings = confirmed && Boolean(dom.skipLoadConfirmCheckbox?.checked);
  if (dom.confirmLoadDialog?.open) {
    dom.confirmLoadDialog.close();
  }
  const resolver = pendingLoadDialogResolver;
  pendingLoadDialogResolver = null;
  resolver?.({ confirmed, skipFutureWarnings });
}

function initializeSlowLoadDialog() {
  if (slowLoadDialogInitialized || !dom.slowLoadDialog) return;

  dom.confirmSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(true);
  });

  dom.cancelSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(false);
  });

  dom.closeSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(false);
  });

  dom.slowLoadDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveSlowLoadDialog(false);
  });

  slowLoadDialogInitialized = true;
}

function resolveSlowLoadDialog(confirmed) {
  dismissSlowLoadDialog();
  const resolver = pendingSlowLoadDialogResolver;
  pendingSlowLoadDialogResolver = null;
  resolver?.(confirmed);
}

function initializeResumeVideoDialog() {
  if (resumeVideoDialogInitialized || !dom.resumeVideoPopup) return;

  dom.confirmResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(true);
  });

  dom.cancelResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(false);
  });

  dom.closeResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(false);
  });

  dom.resumeVideoPopup.addEventListener("click", (event) => {
    if (event.target === dom.resumeVideoPopup) {
      resolveResumeVideoDialog(false);
    }
  });

  window.addEventListener("keydown", handleResumePopupKeydown);

  resumeVideoDialogInitialized = true;
}

function initializeVideoDownloadDialog() {
  if (videoDownloadDialogInitialized || !dom.videoDownloadDialog) return;

  dom.confirmVideoDownloadButton?.addEventListener("click", () => {
    let saveFileHandlePromise = null;
    if (typeof window.showSaveFilePicker === "function") {
      try {
        saveFileHandlePromise = window.showSaveFilePicker({ suggestedName: pendingVideoDownloadFilename });
      } catch {
        // Los navegadores sin selector de archivos utilizable descargan mediante Blob.
      }
    }
    resolveVideoDownloadDialog({ confirmed: true, saveFileHandlePromise });
  });

  dom.cancelVideoDownloadButton?.addEventListener("click", () => {
    resolveVideoDownloadDialog({ confirmed: false, saveFileHandlePromise: null });
  });

  dom.closeVideoDownloadDialogButton?.addEventListener("click", () => {
    resolveVideoDownloadDialog({ confirmed: false, saveFileHandlePromise: null });
  });

  dom.videoDownloadDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveVideoDownloadDialog({ confirmed: false, saveFileHandlePromise: null });
  });

  videoDownloadDialogInitialized = true;
}

function resolveVideoDownloadDialog(result) {
  if (dom.videoDownloadDialog?.open) {
    dom.videoDownloadDialog.close();
  }
  const resolver = pendingVideoDownloadDialogResolver;
  pendingVideoDownloadDialogResolver = null;
  resolver?.(result);
}

function resolveResumeVideoDialog(confirmed) {
  dismissResumeVideoDialog();
  const resolver = pendingResumeVideoDialogResolver;
  pendingResumeVideoDialogResolver = null;
  resolver?.(confirmed);
}

function dismissSlowLoadDialog() {
  if (dom.slowLoadDialog?.open) {
    dom.slowLoadDialog.close();
  }
}

function dismissResumeVideoDialog() {
  if (dom.resumeVideoPopup) {
    dom.resumeVideoPopup.hidden = true;
    dom.resumeVideoPopup.classList.remove(RESUME_DIALOG_COMPACT_CLASS);
    dom.resumeVideoPopup.style.removeProperty("--player-inline-dialog-card-max-height");
  }
}

function handleResumePopupKeydown(event) {
  if (event.key !== "Escape") return;
  if (!dom.resumeVideoPopup || dom.resumeVideoPopup.hidden) return;
  resolveResumeVideoDialog(false);
}
