import { dom } from "../../../core/dom.js";
import { getPageScrollContainer, getPageScrollTop, isFullscreenPageActive, scrollPageTo } from "./chat-page-scroll.js";
import { chatDockTransitionState } from "./chat-layout-transition-state.js";

export function clearBottomChatTransitionVisuals() {
  dom.sessionView?.classList.remove(
    'session-view--chat-bottom-collapse-visual',
    'session-view--chat-bottom-expand-visual',
    'session-view--chat-bottom-mobile-collapse-visual',
    'session-view--chat-bottom-mobile-expand-visual',
    'session-view--chat-bottom-mobile-curtain-active',
    'session-view--chat-bottom-pc-collapse-visual',
    'session-view--chat-bottom-pc-expand-visual',
    'session-view--chat-bottom-pc-expand-controls-transition',
    'session-view--chat-bottom-pc-collapse-controls-transition',
    'session-view--chat-bottom-curtain-active',
  );
  dom.sessionView?.style.removeProperty("--chat-bottom-curtain-clip");
  dom.workspace?.style.removeProperty("grid-template-rows");
  dom.chatArea?.style.removeProperty("clip-path");
  dom.chatArea?.style.removeProperty("opacity");
  const messageForm = dom.chatArea?.querySelector(".message-form");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-left");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-width");
  if (dom.sessionView?.dataset.chatDock === "bottom") {
    messageForm?.style.removeProperty("width");
  }
}

export function lockBottomChatScrollAnchoring(transition) {
  const scrollContainer = isFullscreenPageActive()
    ? getPageScrollContainer()
    : document.scrollingElement || document.documentElement;
  if (!scrollContainer?.style) return;

  transition.scrollAnchorContainer = scrollContainer;
  transition.previousScrollAnchor = scrollContainer.style.getPropertyValue("overflow-anchor");
  transition.previousScrollAnchorPriority = scrollContainer.style.getPropertyPriority("overflow-anchor");
  scrollContainer.style.setProperty("overflow-anchor", "none");
}

export function restoreBottomChatScrollAnchoring(transition) {
  const scrollContainer = transition?.scrollAnchorContainer;
  if (!scrollContainer?.style) return;

  if (transition.previousScrollAnchor) {
    scrollContainer.style.setProperty(
      "overflow-anchor",
      transition.previousScrollAnchor,
      transition.previousScrollAnchorPriority,
    );
  } else {
    scrollContainer.style.removeProperty("overflow-anchor");
  }
  transition.scrollAnchorContainer = null;
}

export function cancelBottomChatTransition() {
  if (chatDockTransitionState.bottomChatTransition) {
    const transition = chatDockTransitionState.bottomChatTransition;
    window.cancelAnimationFrame(transition.frameId);
    window.clearTimeout(transition.timeoutId);
    if (transition.scrollEndListener && transition.scrollContainer) {
      transition.scrollContainer.removeEventListener("scrollend", transition.scrollEndListener);
    }
    if (transition.nativeScrollInProgress) {
      transition.nativeScrollInProgress = false;
      scrollPageTo(getPageScrollTop(), "auto");
    }
    for (const animation of transition.controlsAnimations || []) animation.cancel();
    transition.scrollSpacer?.remove();
    transition.scrollSpacer = null;
    restoreBottomChatScrollAnchoring(transition);
    chatDockTransitionState.bottomChatTransition = null;
    transition.cancelled = true;
    transition.resolveFinished?.(false);
  }
  clearBottomChatTransitionVisuals();
}
