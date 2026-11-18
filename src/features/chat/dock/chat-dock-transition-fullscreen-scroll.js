import { dom } from "../../../core/dom.js";
import { getPageScrollContainer, getPageScrollMax, getPageScrollTop, isFullscreenPageActive, scrollPageTo } from "./chat-page-scroll.js";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js";
import { BOTTOM_CHAT_SCROLL_TIMEOUT_MS } from "./chat-layout-timing.js";

export function isFullscreenBottomDock() {
  return isFullscreenPageActive() && dom.sessionView?.dataset.chatDock === "bottom";
}

export function restoreFullscreenBottomChatScrollSpace(transition) {
  transition?.scrollSpacer?.remove();
  if (transition) transition.scrollSpacer = null;
}

export function createFullscreenBottomChatTransition(collapsed) {
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  return {
    collapsed,
    frameId: 0,
    timeoutId: 0,
    nativeScrollInProgress: false,
    finished,
    resolveFinished,
    cancelled: false,
  };
}

function finishFullscreenBottomChatScroll(transition, onFinish) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const container = transition.scrollContainer;
  if (transition.scrollEndListener && container) {
    container.removeEventListener("scrollend", transition.scrollEndListener);
  }
  window.clearTimeout(transition.timeoutId);
  transition.nativeScrollInProgress = false;
  onFinish();
  chatDockTransitionState.bottomChatTransition = null;
  getChatDockOperations().setCollapseHandleTransitioning(false);
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
  getChatDockOperations().scheduleMessageTimeAdjustmentAfterLayout();
  transition.resolveFinished?.(true);
}

export function scrollFullscreenBottomChat(transition, targetScrollTop, onFinish) {
  const container = getPageScrollContainer();
  if (!container) {
    onFinish();
    chatDockTransitionState.bottomChatTransition = null;
    transition.resolveFinished?.(true);
    return;
  }

  transition.scrollContainer = container;
  transition.targetScrollTop = targetScrollTop;
  transition.nativeScrollInProgress = true;
  transition.scrollEndListener = () => {
    if (Math.abs(getPageScrollTop() - targetScrollTop) > 1) {
      scrollPageTo(targetScrollTop, "auto");
    }
    finishFullscreenBottomChatScroll(transition, onFinish);
  };
  container.addEventListener("scrollend", transition.scrollEndListener, { once: true });
  transition.timeoutId = window.setTimeout(() => {
    if (Math.abs(getPageScrollTop() - targetScrollTop) > 1) {
      scrollPageTo(targetScrollTop, "auto");
    }
    finishFullscreenBottomChatScroll(transition, onFinish);
  }, BOTTOM_CHAT_SCROLL_TIMEOUT_MS);

  if (Math.abs(getPageScrollTop() - targetScrollTop) <= 1) {
    finishFullscreenBottomChatScroll(transition, onFinish);
    return;
  }

  getChatDockOperations().lockChatScrollSnapDuringProgrammaticScroll(
    BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  scrollPageTo(targetScrollTop, "smooth");
}

export function animateFullscreenBottomChatExpand() {
  const transition = createFullscreenBottomChatTransition(false);
  chatDockTransitionState.bottomChatTransition = transition;
  getChatDockOperations().applyExternalChatCollapsed(false);
  const targetScrollTop = getPageScrollMax();
  getChatDockOperations().setCollapseHandleTransitioning(true, BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80);
  scrollFullscreenBottomChat(transition, targetScrollTop, () => {
    scrollPageTo(targetScrollTop, "auto");
  });
}
