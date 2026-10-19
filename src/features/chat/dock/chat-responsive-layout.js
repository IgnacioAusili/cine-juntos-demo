import { dom } from "../../../core/dom.js";
import { resolveRightChatComposition } from "./right-chat-composition.js";

const CHAT_COMPOSITIONS = new Set(["parallel", "stacked", "overlay"]);

let responsiveSessionLayoutObserver = null;
let responsiveSessionLayoutFrame = 0;
let syncCollapseHandleOffset = () => {};

export function getVideoAreaRect() {
  if (!dom.videoArea) return null;
  const rect = dom.videoArea.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

export function getChatComposition() {
  if (!dom.sessionView) return "parallel";

  if (dom.sessionView.dataset.chatDock === "right") {
    const composition = dom.sessionView.dataset.chatComposition;
    if (CHAT_COMPOSITIONS.has(composition)) return composition;
    return dom.sessionView.classList.contains("session-view--layout-stacked")
      ? "stacked"
      : "parallel";
  }

  return getComputedStyle(dom.sessionView)
    .getPropertyValue("--session-layout-mode")
    .trim() === "stacked"
    ? "stacked"
    : "parallel";
}

export function isStackedSessionLayout() {
  const composition = getChatComposition();
  return composition === "stacked"
    || (composition === "overlay" && isCoarsePointer());
}

function isCoarsePointer() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function setBottomDockResponsiveLayout(stacked) {
  if (!dom.sessionView) return;
  dom.sessionView.classList.toggle("session-view--layout-stacked", stacked);
  dom.sessionView.style.setProperty(
    "--session-layout-mode",
    stacked ? "stacked" : "side-by-side",
  );
}

function setRightDockComposition(composition) {
  if (!dom.sessionView) return;
  dom.sessionView.dataset.chatComposition = composition;
  CHAT_COMPOSITIONS.forEach((state) => {
    dom.sessionView.classList.toggle(`session-view--chat-${state}`, state === composition);
  });
  dom.sessionView.classList.toggle(
    "session-view--layout-stacked",
    composition === "stacked" || (composition === "overlay" && isCoarsePointer()),
  );
  dom.sessionView.style.setProperty("--session-layout-mode", composition);
}

export function clearRightDockComposition() {
  if (!dom.sessionView) return;
  dom.sessionView.removeAttribute("data-chat-composition");
  CHAT_COMPOSITIONS.forEach((state) => {
    dom.sessionView.classList.remove(`session-view--chat-${state}`);
  });
  setBottomDockResponsiveLayout(false);
}

function readCssPixels(element, property) {
  if (!element) return 0;
  const value = Number.parseFloat(
    getComputedStyle(element).getPropertyValue(property),
  );
  return Number.isFinite(value) ? value : 0;
}

export function syncResponsiveSessionLayout({ allowTransition = false } = {}) {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) return;

  if (dom.sessionView.dataset.chatDock !== "right") {
    // D3 owns the bottom-dock composition. Input type only adapts controls;
    // the component layout resolver decides whether both panels fit together.
    syncCollapseHandleOffset();
    return;
  }

  if (
    document.body.classList.contains("page-context--fullscreen")
    || document.fullscreenElement
    || (
      !allowTransition
      && (
        dom.sessionView.classList.contains("session-view--chat-layout-transitioning")
        || dom.sessionView.classList.contains("session-view--chat-dock-switching")
      )
    )
  ) return;

  const workspaceWidth = dom.workspace.getBoundingClientRect().width;

  const workspaceStyles = getComputedStyle(dom.workspace);
  const minChatWidth = readCssPixels(
    dom.sessionView,
    "--right-chat-min-width",
  ) || readCssPixels(dom.sessionView, "--chat-panel-width");
  const minPlayerWidth = readCssPixels(
    dom.sessionView,
    "--right-chat-min-player-width",
  ) || minChatWidth;
  const overlayMaxWidth = readCssPixels(
    dom.sessionView,
    "--right-chat-overlay-max-width",
  );
  const composition = resolveRightChatComposition({
    availableWidth: workspaceWidth,
    viewportWidth: window.innerWidth,
    minChatWidth,
    minPlayerWidth,
    columnGap: Number.parseFloat(workspaceStyles.columnGap) || 0,
    overlayMaxWidth,
  });

  setRightDockComposition(composition);
  syncCollapseHandleOffset();
}

export function scheduleResponsiveSessionLayoutMeasure() {
  if (responsiveSessionLayoutFrame) return;
  responsiveSessionLayoutFrame = window.requestAnimationFrame(() => {
    responsiveSessionLayoutFrame = 0;
    syncResponsiveSessionLayout();
  });
}

export function wireResponsiveSessionLayout(syncHandleOffset = () => {}) {
  syncCollapseHandleOffset = syncHandleOffset;
  if (!dom.sessionView || !dom.workspace) return;

  scheduleResponsiveSessionLayoutMeasure();
  if ("ResizeObserver" in window && !responsiveSessionLayoutObserver) {
    responsiveSessionLayoutObserver = new ResizeObserver(
      scheduleResponsiveSessionLayoutMeasure,
    );
    responsiveSessionLayoutObserver.observe(dom.workspace);
  }
  window.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.visualViewport?.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.addEventListener(
    "chat-layout-settled",
    scheduleResponsiveSessionLayoutMeasure,
    { passive: true },
  );
}
