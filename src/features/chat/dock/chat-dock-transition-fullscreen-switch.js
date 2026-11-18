import { dom } from "../../../core/dom.js";
import { focusFullscreenWorkspace } from "../../session/session-ui.js";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js";
import { cancelBottomChatTransition } from "./chat-dock-transition-core.js";
import { animateDesktopBottomChatExpand } from "./chat-dock-transition-bottom-desktop.js";
import { isDesktopBottomDock } from "./chat-dock-transition-measurements.js";
import { BOTTOM_CHAT_CURTAIN_MS, FULLSCREEN_DOCK_OUT_MS, FULLSCREEN_DOCK_IN_MS } from "./chat-layout-timing.js";

export function animateFullscreenDockSwitch(nextDock) {
  cancelBottomChatTransition();
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
    return;
  }

  const sessionView = dom.sessionView;
  const chatArea = dom.chatArea;
  const previousTransition = chatDockTransitionState.pendingChatDockSwitch;
  if (previousTransition) {
    window.clearTimeout(previousTransition.outTimerId);
    window.clearTimeout(previousTransition.inTimerId);
    previousTransition.animation?.cancel();
    chatDockTransitionState.pendingChatDockSwitch = null;
  }
  sessionView.classList.remove(
    'session-view--chat-dock-mobile-transition-out',
    'session-view--chat-dock-mobile-transition-out-active',
    'session-view--chat-dock-mobile-transition-in',
    'session-view--chat-dock-mobile-transition-in-active',
  );

  const transitionDuration = FULLSCREEN_DOCK_OUT_MS + FULLSCREEN_DOCK_IN_MS + 80;
  const transition = {
    nextDock,
    outTimerId: 0,
    inTimerId: 0,
  };
  chatDockTransitionState.pendingChatDockSwitch = transition;
  getChatDockOperations().lockChatScrollSnapDuringProgrammaticScroll(transitionDuration);
  getChatDockOperations().keepChatDockHandlesHidden();
  getChatDockOperations().setCollapseHandleTransitioning(true, transitionDuration);

  const finishTransition = () => {
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    window.clearTimeout(transition.inTimerId);
    chatDockTransitionState.pendingChatDockSwitch = null;
    getChatDockOperations().scheduleChatDockHandlesReveal(FULLSCREEN_DOCK_IN_MS + 80);
    sessionView.classList.remove(
      'session-view--chat-dock-mobile-transition-out',
      'session-view--chat-dock-mobile-transition-out-active',
      'session-view--chat-dock-mobile-transition-in',
      'session-view--chat-dock-mobile-transition-in-active',
    );
    getChatDockOperations().setCollapseHandleTransitioning(false);
    getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
    getChatDockOperations().scheduleMessageTimeAdjustmentAfterLayout();
  };

  const switchDockAndReveal = () => {
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    sessionView.classList.remove(
      'session-view--chat-dock-mobile-transition-out',
      'session-view--chat-dock-mobile-transition-out-active',
    );
    getChatDockOperations().setChatDock(nextDock, {
      skipTransition: true,
      preserveScroll: true,
      skipFullscreenFocus: true,
    });
    // Al volver al dock inferior en fullscreen, la expansión mueve el shell
    // hasta el chat mientras el reproductor sale de la vista.
    if (nextDock === "bottom" && isDesktopBottomDock()) {
      chatDockTransitionState.pendingChatDockSwitch = null;
      animateDesktopBottomChatExpand();
      getChatDockOperations().scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
      return;
    }
    if (nextDock === "bottom") {
      getChatDockOperations().revealBottomDockUnion("auto");
    } else {
      focusFullscreenWorkspace();
    }

    sessionView.classList.add('session-view--chat-dock-mobile-transition-in');
    void chatArea.offsetWidth;
    window.requestAnimationFrame(() => {
      if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
      sessionView.classList.add('session-view--chat-dock-mobile-transition-in-active');
      transition.inTimerId = window.setTimeout(finishTransition, FULLSCREEN_DOCK_IN_MS);
    });
  };

  sessionView.classList.add('session-view--chat-dock-mobile-transition-out');
  void chatArea.offsetWidth;
  window.requestAnimationFrame(() => {
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    sessionView.classList.add('session-view--chat-dock-mobile-transition-out-active');
    transition.outTimerId = window.setTimeout(switchDockAndReveal, FULLSCREEN_DOCK_OUT_MS);
  });
}