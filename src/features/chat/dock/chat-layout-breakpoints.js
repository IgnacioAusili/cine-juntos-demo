import { dom } from "../../../core/dom.js";
import { isFullscreenPageActive } from "./chat-page-scroll.js";
import { isStackedSessionLayout } from "./chat-responsive-layout.js";

export function isMobilePortraitChatViewport() {
  if (isFullscreenPageActive()) {
    return window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches;
  }
  return window.matchMedia("(max-width: 680px)").matches
    && !document.documentElement.classList.contains("page-context--viewport-landscape");
}

export function isMobileLandscapeRightDock() {
  const isLandscape = isFullscreenPageActive()
    ? window.matchMedia("(orientation: landscape)").matches
    : document.documentElement.classList.contains("page-context--viewport-landscape");
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isStackedSessionLayout()
    && isLandscape;
}

export function isMobileLandscapeFullscreenBottomDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "bottom"
    && isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
}

export function isMobilePortraitRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isMobilePortraitChatViewport();
}

export function isRightChatViewportOverlay() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && window.matchMedia("(max-width: 680px)").matches;
}
