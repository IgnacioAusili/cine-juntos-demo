import { dom } from "../../../core/dom.js";
import { getPageScrollMax, getPageScrollTop, scrollPageTo } from "./chat-page-scroll.js";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js";
import { easeBottomChatCurtainProgress, easeBottomChatRevealProgress, getWorkspaceRowHeights, getWorkspaceContentHeight } from "./chat-dock-transition-measurements.js";
import { BOTTOM_CHAT_CURTAIN_MS, BOTTOM_CHAT_SCROLL_TIMEOUT_MS } from "./chat-layout-timing.js";
import { clearBottomChatTransitionVisuals, lockBottomChatScrollAnchoring, restoreBottomChatScrollAnchoring } from "./chat-dock-transition-core.js";

export function setMobileBottomTransitionProgress(transition, progress) {
  const easedProgress = transition.collapsed
    ? easeBottomChatCurtainProgress(progress)
    : easeBottomChatRevealProgress(progress);
  const videoHeight = transition.startRows[0]
    + ((transition.targetRows[0] - transition.startRows[0]) * easedProgress);
  const chatHeight = transition.startRows[1]
    + ((transition.targetRows[1] - transition.startRows[1]) * easedProgress);
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${Math.max(0, videoHeight)}px ${Math.max(0, chatHeight)}px`,
  );

  const clipProgress = transition.collapsed ? easedProgress : 1 - easedProgress;
  dom.chatArea?.style.setProperty(
    "clip-path",
    `inset(0 0 ${Math.max(0, Math.min(100, clipProgress * 100))}% 0)`,
  );

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * easedProgress);
  scrollPageTo(Math.round(scrollProgress), "auto");
}

export function completeMobileBottomChatTransition(transition) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const shouldPinExpandedChatToBottom = !transition.collapsed;
  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  chatDockTransitionState.bottomChatTransition = null;
  clearBottomChatTransitionVisuals();
  getChatDockOperations().setCollapseHandleTransitioning(false);
  if (shouldPinExpandedChatToBottom) scrollPageTo(getPageScrollMax(), "auto");
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
}

export function stepMobileBottomChatTransition(transition, force = false) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  const linearProgress = force
    ? 1
    : Math.min(1, Math.max(0, (performance.now() - transition.startedAt) / BOTTOM_CHAT_CURTAIN_MS));
  setMobileBottomTransitionProgress(transition, linearProgress);

  if (linearProgress < 1) {
    transition.frameId = window.requestAnimationFrame(() => {
      stepMobileBottomChatTransition(transition);
    });
    return;
  }

  completeMobileBottomChatTransition(transition);
}

export function animateBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(true);
    return;
  }

  const transition = {
    collapsed: true,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-collapse-visual');
  void dom.workspace?.offsetWidth;
  getChatDockOperations().applyExternalChatCollapsed(true);
  transition.targetRows = [
    getWorkspaceContentHeight(),
    0,
  ];
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  // El viewport acompaña la cortina desde el primer frame: al terminar el
  // reproductor queda alineado en la posición superior de la página.
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-curtain-active');
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function animateBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(false);
    return;
  }

  const transition = {
    collapsed: false,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop: 0,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-expand-visual');
  void dom.workspace?.offsetWidth;
  // Primero se reserva la fila completa con el contenido todavía oculto;
  // después se revela desde la unión superior hacia abajo.
  getChatDockOperations().applyExternalChatCollapsed(false);
  transition.targetRows = getWorkspaceRowHeights();
  transition.targetScrollTop = getPageScrollMax();
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add('session-view--chat-bottom-mobile-curtain-active');
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}
