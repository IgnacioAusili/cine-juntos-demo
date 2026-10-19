import { dom } from "../../core/dom.js";

const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

// Margen para separar cambios menores del viewport (incluidas las barras del
// navegador) de una reducción que pueda corresponder al teclado virtual.
export const CHAT_KEYBOARD_VIEWPORT_TOLERANCE_PX = 80;

export function isViewportReducedForKeyboard(referenceHeight, visibleHeight) {
  return referenceHeight > 0
    && visibleHeight > 0
    && referenceHeight - visibleHeight > CHAT_KEYBOARD_VIEWPORT_TOLERANCE_PX;
}

export function isMobileLayout() {
  return window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches === true;
}

export function isFullscreenActive() {
  return Boolean(document.fullscreenElement)
    || document.body.classList.contains('page-context--fullscreen');
}

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

export function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

export function isBottomChatKeyboardTarget(target) {
  return (target === dom.messageInput || target === dom.nameInput)
    && dom.sessionView?.dataset.chatDock === "bottom";
}

export function isBottomChatNameEditorFocused() {
  return Boolean(
    dom.nameInput
      && dom.chatNameField?.dataset.editing === "true"
      && document.activeElement === dom.nameInput,
  );
}

export function isBottomChatInputFocused() {
  return isBottomChatKeyboardTarget(document.activeElement);
}

export function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains('page-context--bottom-chat-keyboard-open');
}

export function isRightChatInputFocused() {
  return document.activeElement === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "right";
}
